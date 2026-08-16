import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, name } from '../agent-presets/dsh-anchored-subagent/tool-bootstrap.mjs'

const DEFAULT_CONFIG = {
  bootstrapTools: ['bash', 'str_replace_editor'],
  promoteOn: 'either',
  suppressedContextSources: ['agent-instructions', 'skill-catalog'],
  bootstrapMaxTokens: null,
}

function register(cfg = DEFAULT_CONFIG) {
  const listeners = {}
  const hookOptions = {}
  const warns = []
  const ctx = {
    on(event, callback, options) {
      listeners[event] = callback
      hookOptions[event] = options
    },
    logger: {
      warn(message) {
        warns.push(message)
      },
    },
  }
  apply(ctx, cfg)
  return { listeners, hookOptions, warns }
}

function agent(events = [], id = 's') {
  return { session: { id, events } }
}

function assemble(listener, events, tools, id = 's') {
  return listener(
    undefined,
    { agent: agent(events, id) },
    async () => ({ sections: [], contexts: [], tools, variables: {} }),
  )
}

function prestep(listener, events, messages, id = 's') {
  return listener(
    { agent: agent(events, id) },
    async () => ({ kind: 'enter', messages }),
  )
}

function request(listener, events, resolved, id = 's') {
  return listener(
    { agent: agent(events, id) },
    async () => resolved,
  )
}

const TOOLS = [
  { name: 'bash' },
  { name: 'str_replace_editor' },
  { name: 'read' },
  { name: 'edit' },
  { name: 'write' },
  { name: 'grep' },
]

test('exports a diagnostic plugin name', () => {
  assert.equal(name, 'dsh-anchored-tool-bootstrap')
})

test('first request exposes exactly the Minimal tool pair', async () => {
  const { listeners } = register()
  const result = await assemble(listeners['system-prompt/assemble'], [], TOOLS)
  assert.deepEqual(result.tools.map((t) => t.name), ['bash', 'str_replace_editor'])
})

test('a durable tool call promotes to the full catalog', async () => {
  const { listeners } = register()
  const events = [{ type: 'tool/call', data: { name: 'bash' } }]
  const result = await assemble(listeners['system-prompt/assemble'], events, TOOLS)
  assert.deepEqual(result.tools.map((t) => t.name), TOOLS.map((t) => t.name))
})

test('a first assistant message promotes to the full catalog', async () => {
  const { listeners } = register()
  const events = [{ type: 'assistant/message', data: {} }]
  const result = await assemble(listeners['system-prompt/assemble'], events, TOOLS)
  assert.deepEqual(result.tools.map((t) => t.name), TOOLS.map((t) => t.name))
})

test('promoteOn tool-call does not promote on assistant message', async () => {
  const { listeners } = register({ ...DEFAULT_CONFIG, promoteOn: 'tool-call' })
  const events = [{ type: 'assistant/message', data: {} }]
  const result = await assemble(listeners['system-prompt/assemble'], events, TOOLS)
  assert.deepEqual(result.tools.map((t) => t.name), ['bash', 'str_replace_editor'])
})

test('pre-step strips injected context during bootstrap', async () => {
  const { listeners } = register()
  const messages = [
    { id: 'u', source: { kind: 'user' } },
    { id: 'i', source: { kind: 'agent-instructions' } },
    { id: 'c', source: { kind: 'skill-catalog' } },
    { id: 'g', source: { kind: 'skill-invocation' } },
  ]
  const result = await prestep(listeners['agent/pre-step'], [], messages)
  assert.deepEqual(result.messages.map((m) => m.id), ['u', 'g'])
})

test('pre-step keeps injected context after promotion', async () => {
  const { listeners } = register()
  const messages = [
    { id: 'i', source: { kind: 'agent-instructions' } },
    { id: 'c', source: { kind: 'skill-catalog' } },
  ]
  const events = [{ type: 'tool/call', data: { name: 'bash' } }]
  const result = await prestep(listeners['agent/pre-step'], events, messages)
  assert.deepEqual(result.messages.map((m) => m.id), ['i', 'c'])
})

test('missing bootstrap tool degrades to full catalog with a warning', async () => {
  const { listeners, warns } = register()
  const tools = [{ name: 'bash' }, { name: 'read' }, { name: 'edit' }]
  const result = await assemble(listeners['system-prompt/assemble'], [], tools)
  assert.deepEqual(result.tools.map((t) => t.name), ['bash', 'read', 'edit'])
  assert.ok(warns.some((w) => w.includes('bootstrap tools missing')))
})

test('bootstrapMaxTokens caps the first request and is stripped after promotion', async () => {
  const { listeners } = register({ ...DEFAULT_CONFIG, bootstrapMaxTokens: 1024 })
  const boot = await request(listeners['agent/request'], [], { maxTokens: 256000 })
  assert.equal(boot.maxTokens, 1024)

  const promoted = await request(
    listeners['agent/request'],
    [{ type: 'tool/call', data: { name: 'bash' } }],
    { maxTokens: 1024 },
  )
  assert.equal(promoted.maxTokens, undefined)
})

test('resume with history starts promoted', async () => {
  const { listeners } = register()
  const events = [{ type: 'assistant/message', data: {} }]
  const result = await assemble(listeners['system-prompt/assemble'], events, TOOLS)
  assert.deepEqual(result.tools.map((t) => t.name), TOOLS.map((t) => t.name))
})
