/**
 * tool-bootstrap — the agent-plane bootstrap filter for dsh-anchored-subagent.
 *
 * This plugin runs inside an agent preset scope. It keeps the FIRST model
 * request on the DSH Minimal condition:
 *
 *   - tools: `bash` + `str_replace_editor`
 *   - context: no AGENTS.md digest, no skill-catalog reminder
 *   - budget: optional `bootstrapMaxTokens`
 *
 * After the first durable `tool/call` or `assistant/message`, the subagent (or
 * main agent) is promoted and the FULL assembled tool catalog is restored.
 *
 * Because this file is mounted through `agent.cordis.yml`, its
 * `system-prompt/assemble` listener is scoped to agents using this preset.
 * The persona itself is supplied by the `@deepseek-ai/dsh-persona` row in the
 * same preset, which is how DSH actually overrides the complete system prompt
 * (a root-bundle listener cannot do that reliably).
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-anchored-tool-bootstrap'

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
])

const DEFAULT_BOOTSTRAP_TOOLS = ['bash', 'str_replace_editor']
const DEFAULT_SUPPRESSED_SOURCES = ['agent-instructions', 'skill-catalog']

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

  return {
    bootstrapTools,
    promoteOn,
    suppressedSources: new Set(suppressedSources),
    bootstrapMaxTokens,
  }
}

/** True once the session has a durable promotion signal. */
function isPromoted(agent, promoteOn) {
  const types = PROMOTE_EVENTS[promoteOn] ?? PROMOTE_EVENTS.either
  const events = agent?.session?.events
  if (!Array.isArray(events)) return false
  return events.some((event) => types.includes(event?.type))
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

  // Tool catalog control. `prepend` keeps this the OUTERMOST waterfall
  // transform within the preset scope.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context?.agent
    try {
      if (isPromoted(agent, config.promoteOn)) return assembled
      const available = new Set(assembled.tools.map((tool) => tool?.name))
      const missing = config.bootstrapTools.filter((toolName) => !available.has(toolName))
      if (missing.length > 0) {
        warnOnce(
          `bootstrap tools missing from catalog: ${JSON.stringify(missing)}; ` +
            'keeping the full catalog to avoid bricking the agent',
        )
        return assembled
      }
      const keep = new Set(config.bootstrapTools)
      return {
        ...assembled,
        tools: assembled.tools.filter((tool) => keep.has(tool?.name)),
      }
    } catch (error) {
      warnOnce(`bootstrap filter failed, exposing full catalog: ${String((error && error.message) || error)}`)
      return assembled
    }
  }, { prepend: true })

  // Strip auto-injected context during bootstrap.
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (decision?.kind === 'reject') return decision
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
