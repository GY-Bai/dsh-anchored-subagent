/**
 * dsh-anchored-subagent host plugin: installs the `dsh-anchored-subagent`
 * agent preset into the user preset root when a profile boots.
 *
 * Installation is idempotent: when the preset already exists, the row logs a
 * note and returns unless `force: true` is configured.
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-anchored-subagent'

const PRESET_ID = 'dsh-anchored-subagent'

/** The packaged preset files that define the preset. */
const PRESET_FILES = ['agent.cordis.yml', 'tool-bootstrap.mjs', 'preset.yml']

/** Package-local preset source directory. */
const SOURCE_DIR = fileURLToPath(new URL('../agent-presets/dsh-anchored-subagent/', import.meta.url))

/** The user preset root: ${DSH_HOME:-~/.dsh}/.agent-presets. */
function userPresetRoot() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, '.agent-presets')
}

/** Byte-compare two files; false when either is unreadable. */
function filesEqual(a, b) {
  try {
    return readFileSync(a).equals(readFileSync(b))
  } catch {
    return false
  }
}

/** Install the packaged preset (idempotent unless force). */
export function apply(ctx, config = {}) {
  const force = config.force === true
  const targetDir = join(userPresetRoot(), PRESET_ID)
  const alreadyInstalled = PRESET_FILES.every((file) => existsSync(join(targetDir, file)))

  if (alreadyInstalled && !force) {
    const outOfDate = PRESET_FILES.some((file) => !filesEqual(join(SOURCE_DIR, file), join(targetDir, file)))
    console.log(
      `[${name}] preset "${PRESET_ID}" already installed at ${targetDir}`
      + (outOfDate
        ? '; packaged files differ — set force: true in the plugin config to overwrite'
        : ''),
    )
    return
  }

  mkdirSync(targetDir, { recursive: true })
  for (const file of PRESET_FILES) {
    cpSync(join(SOURCE_DIR, file), join(targetDir, file), { force: true })
  }
  console.log(`[${name}] installed preset "${PRESET_ID}" -> ${targetDir}`)
}
