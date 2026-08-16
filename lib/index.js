/**
 * dsh-anchored-subagent host plugin: installs the `dsh-anchored-subagent`
 * agent preset into the user preset root when a profile boots.
 *
 * Installation is idempotent: when the preset already exists, the row logs a
 * note and returns unless `force: true` is configured.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-anchored-subagent'

const PRESET_ID = 'dsh-anchored-subagent'

/** Package-local preset source directory. */
const SOURCE_DIR = fileURLToPath(new URL('../agent-presets/dsh-anchored-subagent/', import.meta.url))

/** The user preset root: ${DSH_HOME:-~/.dsh}/.agent-presets. */
function userPresetRoot() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, '.agent-presets')
}

/** Install the packaged preset (idempotent unless force). */
export function apply(ctx, config = {}) {
  const force = config.force === true
  const targetDir = join(userPresetRoot(), PRESET_ID)
  const marker = join(targetDir, 'agent.cordis.yml')
  const alreadyInstalled = existsSync(marker)

  if (alreadyInstalled && !force) {
    console.log(`[${name}] preset "${PRESET_ID}" already installed at ${targetDir} (set force: true to overwrite)`)
  } else {
    mkdirSync(targetDir, { recursive: true })
    cpSync(SOURCE_DIR, targetDir, { recursive: true, force: true })
    console.log(`[${name}] installed preset "${PRESET_ID}" -> ${targetDir}`)
  }

  installSubagentPersonaStripper(ctx)
}

/**
 * Intercept one-shot subagent starts and strip the caller-provided `persona`.
 *
 * The stripped persona is stored in a global map keyed by child session id.
 * The agent-plane `tool-bootstrap.mjs` reads it after the child's first
 * promotion and re-registers the persona in the child scope, so every
 * subagent starts with the pure Minimal persona and gets its role back later.
 */
function installSubagentPersonaStripper(ctx) {
  const subagents = ctx.subagents
  if (!subagents || typeof subagents.start !== 'function') return

  const originalStart = subagents.start.bind(subagents)
  subagents.start = async (name, request) => {
    const persona = request?.persona
    const stripped = persona === undefined
      ? request
      : { ...request, persona: undefined }
    const run = await originalStart(name, stripped)
    if (persona !== undefined && run?.id) {
      const store = (globalThis.__dshAnchoredSubagentPersonas ??= new Map())
      store.set(String(run.id), persona)
    }
    return run
  }
}
