import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply as applyInstaller } from '../lib/index.js'
import { apply as applyBootstrap } from '../agent-presets/dsh-anchored-subagent/tool-bootstrap.mjs'

test('host installer strips subagent persona and stores it for later restore', async () => {
  const dshHome = mkdtempSync(join(tmpdir(), 'dsh-anchored-test-'))
  const oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = dshHome

  const seen = []
  const subagents = {
    async start(name, request) {
      seen.push({ name, request })
      return { id: 'child-1' }
    },
  }
  const ctx = { subagents }
  applyInstaller(ctx, { force: true })

  await ctx.subagents.start('spawn', { persona: 'You are a terse kernel engineer.', prompt: 'Task' })

  assert.equal(seen.length, 1)
  assert.equal(seen[0].request.persona, undefined)
  assert.equal(seen[0].request.prompt, 'Task')
  assert.equal(globalThis.__dshAnchoredSubagentPersonas.get('child-1'), 'You are a terse kernel engineer.')

  delete globalThis.__dshAnchoredSubagentPersonas
  if (oldHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = oldHome
  rmSync(dshHome, { recursive: true, force: true })
})

test('after promotion the child persona is re-registered in the child scope', async () => {
  const listeners = {}
  const registered = []
  const ctx = {
    on(event, callback) {
      listeners[event] = callback
    },
    logger: {
      warn() {},
    },
  }
  applyBootstrap(ctx, {
    bootstrapTools: ['bash', 'str_replace_editor'],
    promoteOn: 'either',
    suppressedContextSources: ['agent-instructions', 'skill-catalog'],
    bootstrapMaxTokens: null,
  })

  globalThis.__dshAnchoredSubagentPersonas = new Map([['child-1', 'You are a terse kernel engineer.']])

  const agent = {
    session: {
      id: 'child-1',
      header: { delegationDepth: 1 },
      events: [{ type: 'tool/call', data: { name: 'bash' } }],
    },
    ctx: {
      systemPrompt: {
        section(section) {
          registered.push(section)
        },
      },
    },
  }

  const assembled = {
    sections: [],
    contexts: [],
    tools: [{ name: 'bash' }, { name: 'read' }],
    variables: {},
  }

  const result = await listeners['system-prompt/assemble'](
    undefined,
    { agent },
    async () => assembled,
  )

  assert.equal(result, assembled) // promoted: full catalog
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'deployment:persona')
  assert.equal(registered[0].text, 'You are a terse kernel engineer.')

  delete globalThis.__dshAnchoredSubagentPersonas
})
