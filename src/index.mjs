/**
 * dsh-anchored-subagent
 *
 * Anchors SUBAGENTS on the DeepSeek Harness Minimal condition for their first
 * model request, then promotes them to the full tool catalog after the first
 * durable signal.
 *
 * Why only subagents:
 *   - DSH's built-in subagent composition joins the parent's agent preset and
 *     applies the child's own persona/tool filter. A fresh subagent is a new
 *     empty session, so it is the ideal place to re-apply the Minimal
 *     first-request trajectory (the same idea as pi-dsv4-booster).
 *   - The main agent is intentionally left untouched: this plugin is a
 *     subagent-focused companion, not another top-level preset.
 *
 * Mechanism (modeled on xiaobright/dsh-anchored-standard's tool-bootstrap):
 *   - `system-prompt/assemble` narrows the subagent's first catalog to
 *     `bootstrapTools` and prepends/replaces the system prompt with the
 *     Minimal persona.
 *   - `agent/pre-step` strips auto-injected context (AGENTS.md digest,
 *     skill-catalog reminder) during bootstrap.
 *   - `agent/request` optionally caps the first request's max_tokens.
 *   - Phase is derived from durable session events, so /resume and /reload
 *     preserve it.
 *
 * Custom subagent roles are preserved: when `preserveCustomPrompt` is true
 * (default), the Minimal persona is PREPENDED to the subagent's existing
 * system prompt instead of replacing it. This lets specialized agents (e.g. a
 * read-only Reviewer) keep their role instructions while still getting the
 * Minimal trajectory anchor.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-anchored-subagent'

/** Default first-request catalog: the official DSH Minimal pair. */
const DEFAULT_BOOTSTRAP_TOOLS = ['bash', 'str_replace_editor']

/** Default Minimal persona, byte-identical to the DSH Minimal preset. */
const DEFAULT_BOOTSTRAP_PERSONA = 'You are a helpful software engineer assistant.'

/** Default auto-injected context sources stripped during bootstrap. */
const DEFAULT_SUPPRESSED_SOURCES = ['agent-instructions', 'skill-catalog']

/** Durable session event types that count as a promotion signal. */
const PROMOTE_EVENTS = {
  'tool-call': ['tool/call'],
  'assistant-message': ['assistant/message'],
  either: ['tool/call', 'assistant/message'],
}

const ALLOWED_KEYS = new Set([
  'bootstrapTools',
  'promoteOn',
  'suppressedContextSources',
  'bootstrapMaxTokens',
  'bootstrapPersona',
  'preserveCustomPrompt',
  'personaMode',
])

function fail(message) {
  throw new TypeError(`${name}: ${message}`)
}

function stringList(value, field, { allowEmpty = false } = {}) {
  if (value === undefined) return allowEmpty ? [] : undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    fail(`${field} must be an array of non-empty strings`)
  }
  return [...new Set(value)]
}

function parseConfig(source) {
  if (source === undefined || source === null) source = {}
  if (typeof source !== 'object' || Array.isArray(source)) {
    fail('config must be an object')
  }
  const unknown = Object.keys(source).filter((key) => !ALLOWED_KEYS.has(key))
  if (unknown.length > 0) {
    fail(`unknown config key(s) ${unknown.join(', ')} — allowed keys: ${[...ALLOWED_KEYS].sort().join(', ')}`)
  }

  const bootstrapTools = stringList(source.bootstrapTools, 'bootstrapTools') ?? DEFAULT_BOOTSTRAP_TOOLS
  const promoteOn = source.promoteOn ?? 'either'
  if (!(promoteOn in PROMOTE_EVENTS)) {
    fail(`promoteOn must be one of ${Object.keys(PROMOTE_EVENTS).join(', ')}`)
  }

  const suppressedSources = stringList(source.suppressedContextSources, 'suppressedContextSources', { allowEmpty: true })
    ?? DEFAULT_SUPPRESSED_SOURCES

  let bootstrapMaxTokens = source.bootstrapMaxTokens
  if (bootstrapMaxTokens !== undefined && bootstrapMaxTokens !== null) {
    if (!Number.isSafeInteger(bootstrapMaxTokens) || bootstrapMaxTokens <= 0) {
      fail('bootstrapMaxTokens must be a positive safe integer or null')
    }
  } else {
    bootstrapMaxTokens = null
  }

  const bootstrapPersona = source.bootstrapPersona === undefined
    ? DEFAULT_BOOTSTRAP_PERSONA
    : source.bootstrapPersona
  if (bootstrapPersona !== null && (typeof bootstrapPersona !== 'string' || bootstrapPersona.trim().length === 0)) {
    fail('bootstrapPersona must be a non-empty string or null')
  }

  const preserveCustomPrompt = source.preserveCustomPrompt !== false
  const personaMode = source.personaMode ?? 'session'
  if (personaMode !== 'session' && personaMode !== 'bootstrap-only') {
    fail('personaMode must be "session" or "bootstrap-only"')
  }

  return {
    bootstrapTools,
    promoteOn,
    suppressedSources: new Set(suppressedSources),
    bootstrapMaxTokens,
    bootstrapPersona,
    preserveCustomPrompt,
    personaMode,
  }
}

/** True only for subagents (delegationDepth > 0). Main agent is untouched. */
function isSubagent(agent) {
  return Boolean(agent?.session?.header?.delegationDepth)
}

/** Derive phase from durable session events (resume/reload safe). */
function isPromoted(agent, promoteOn) {
  const types = PROMOTE_EVENTS[promoteOn] ?? PROMOTE_EVENTS.either
  const events = agent?.session?.events
  if (!Array.isArray(events)) return false
  return events.some((event) => types.includes(event?.type))
}

/** Apply the persona strategy to the assembled system prompt. */
function applyPersona(assembled, config) {
  if (!config.bootstrapPersona) return assembled
  const persona = config.bootstrapPersona.trim()
  const current = typeof assembled.system === 'string' ? assembled.system : ''
  if (config.preserveCustomPrompt) {
    if (current.startsWith(persona)) return assembled
    return { ...assembled, system: `${persona}\n\n${current}` }
  }
  if (current === persona) return assembled
  return { ...assembled, system: persona }
}

/** Narrow the assembled catalog to the bootstrap set (fail-safe). */
function applyToolBootstrap(assembled, config, warnOnce) {
  const available = new Set(assembled.tools.map((tool) => tool?.name))
  const missing = config.bootstrapTools.filter((toolName) => !available.has(toolName))
  if (missing.length > 0) {
    warnOnce(
      `bootstrap tools missing from catalog: ${JSON.stringify(missing)}; ` +
        'keeping the full catalog to avoid bricking the subagent',
    )
    return assembled
  }
  const keep = new Set(config.bootstrapTools)
  return {
    ...assembled,
    tools: assembled.tools.filter((tool) => keep.has(tool?.name)),
  }
}

export function apply(ctx, sourceConfig) {
  const config = parseConfig(sourceConfig)
  let warned = false
  const warnOnce = (message) => {
    if (warned) return
    warned = true
    try {
      ctx.logger.warn(`[${name}] ${message}`)
    } catch {
      // Logger unavailable; the guard only prevents spam.
    }
  }

  // Tool catalog + persona control.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context?.agent
    try {
      if (!isSubagent(agent)) return assembled
      if (isPromoted(agent, config.promoteOn)) {
        // Promoted: full catalog. In bootstrap-only persona mode, we could
        // remove the prefix here, but because the original prompt is not
        // stored per-session in this simple implementation, session mode
        // (keep the prefix) is the default and safest.
        return assembled
      }
      let nextAssembled = applyToolBootstrap(assembled, config, warnOnce)
      nextAssembled = applyPersona(nextAssembled, config)
      return nextAssembled
    } catch (error) {
      warnOnce(`bootstrap filter failed, exposing full catalog: ${String((error && error.message) || error)}`)
      return assembled
    }
  })

  // Strip auto-injected context during bootstrap.
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (!isSubagent(agent) || decision?.kind === 'reject') return decision
    try {
      if (isPromoted(agent, config.promoteOn) || config.suppressedSources.size === 0) return decision
      if (!Array.isArray(decision.messages)) return decision
      const kept = decision.messages.filter((message) => {
        const kind = message?.source?.kind
        return typeof kind !== 'string' || !config.suppressedSources.has(kind)
      })
      return kept.length === decision.messages.length ? decision : { ...decision, messages: kept }
    } catch (error) {
      warnOnce(`pre-step context filter failed, keeping injected context: ${String((error && error.message) || error)}`)
      return decision
    }
  }, { prepend: true })

  // Optional first-request output cap.
  if (config.bootstrapMaxTokens) {
    ctx.on('agent/request', async (payload, next) => {
      const resolved = await next()
      const agent = payload?.agent
      try {
        if (!isSubagent(agent)) return resolved
        if (isPromoted(agent, config.promoteOn)) {
          if (resolved?.maxTokens === config.bootstrapMaxTokens) {
            const { maxTokens: _cap, ...rest } = resolved
            return rest
          }
          return resolved
        }
        return { ...resolved, maxTokens: config.bootstrapMaxTokens }
      } catch (error) {
        warnOnce(`max_tokens filter failed: ${String((error && error.message) || error)}`)
        return resolved
      }
    }, { prepend: true })
  }
}
