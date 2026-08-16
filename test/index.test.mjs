import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, name } from '../src/index.mjs'

const DEFAULT_CONFIG = {
  bootstrapTools: ['bash', 'str_replace_editor'],
  promoteOn: 'either',
  suppressedContextSources: ['agent-instructions', 'skill-catalog'],
  bootstrapMaxTokens: null,
  bootstrapPersona: 'You are a helpful software engineer assistant.',
  preserveCustomPrompt: true,
  personaMode: 'session',
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

function agent(events = [], delegationDepth = 0, id = 's') {
  return {
    session: {
      id,
      header: { delegationDepth },
      events,
    },
  }
}

function assemble(listener, events, tools, delegationDepth = 1, id = 's') {
  return listener(
    undefined,
    { agent: agent(events, delegationDepth, id) },
    async () => ({ system: 'Custom subagent role prompt.', tools }),
  )
}

function prestep(listener, events, messages, delegationDepth = 1, id = 's') {
  return listener(
    { agent: agent(events, delegationDepth, id) },
    async () => ({ kind: 'enter', messages }),
  )
}

function request(listener, events, resolved, delegationDepth = 1, id = 's') {
  return listener(
    { agent: agent(events, delegationDepth, id) },
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
  assert.equal(name, 'dsh-anchored-subagent')
})

test('main agent is untouched', async () => {
  const { listeners } = register()
  const full = await assemble(listeners['system-prompt/assemble'], [], TOOLS, 0)
  assert.deepEqual(full.tools.map((t) => t.name), TOOLS.map((t) => t.name))
  assert.ok(full.system.includes('Custom subagent role prompt.'))
})

test('subagent first request exposes exactly the Minimal tool pair', async () => {
  const { listeners } = register()
  const result = await assemble(listeners['system-prompt/assemble'], [], TOOLS, 1)
  assert.deepEqual(result.tools.map((t) => t.name), ['bash', 'str_replace_editor'])
})

test('subagent first request prepends Minimal persona and keeps custom role', async () => {
  const { listeners } = register()
  const result = await assemble(listeners['system-prompt/assemble'], [], TOOLS, 1)
  assert.ok(result.system.startsWith('You are a helpful software engineer assistant.'))
  assert.ok(result.system.includes('Custom subagent role prompt.'))
})

test('subagent persona can replace the custom prompt when disabled', async () => {
  const { listeners } = register({ ...DEFAULT_CONFIG, preserveCustomPrompt: false })
  const result = await assemble(listeners['system-prompt/assemble'], [], TOOLS, 1)
  assert.equal(result.system, 'You are a helpful software engineer assistant.')
  assert.ok(!result.system.includes('Custom subagent role prompt.'))
})

test('a durable tool call promotes the subagent to the full catalog', async () => {
  const { listeners } = register()
  const events = [{ type: 'tool/call', data: { name: 'bash' } }]
  const result = await assemble(listeners['system-prompt/assemble'], events, TOOLS, 1)
  assert.deepEqual(result.tools.map((t) => t.name), TOOLS.map((t) => t.name))
})

test('a first assistant message promotes the subagent to the full catalog', async () => {
  const { listeners } = register()
  const events = [{ type: 'assistant/message', data: {} }]
  const result = await assemble(listeners['system-prompt/assemble'], events, TOOLS, 1)
  assert.deepEqual(result.tools.map((t) => t.name), TOOLS.map((t) => t.name))
})

test('promoteOn tool-call does not promote on assistant message', async () => {
  const { listeners } = register({ ...DEFAULT_CONFIG, promoteOn: 'tool-call' })
  const events = [{ type: 'assistant/message', data: {} }]
  const result = await assemble(listeners['system-prompt/assemble'], events, TOOLS, 1)
  assert.deepEqual(result.tools.map((t) => t.name), ['bash', 'str_replace_editor'])
})

test('pre-step strips injected context during subagent bootstrap', async () => {
  const { listeners } = register()
  const messages = [
    { id: 'u', source: { kind: 'user' } },
    { id: 'i', source: { kind: 'agent-instructions' } },
    { id: 'c', source: { kind: 'skill-catalog' } },
    { id: 'g', source: { kind: 'skill-invocation' } },
  ]
  const result = await prestep(listeners['agent/pre-step'], [], messages, 1)
  assert.deepEqual(result.messages.map((m) => m.id), ['u', 'g'])
})

test('pre-step keeps injected context after promotion', async () => {
  const { listeners } = register()
  const messages = [
    { id: 'i', source: { kind: 'agent-instructions' } },
    { id: 'c', source: { kind: 'skill-catalog' } },
  ]
  const events = [{ type: 'tool/call', data: { name: 'bash' } }]
  const result = await prestep(listeners['agent/pre-step'], events, messages, 1)
  assert.deepEqual(result.messages.map((m) => m.id), ['i', 'c'])
})

test('missing bootstrap tool degrades to full catalog with a warning', async () => {
  const { listeners, warns } = register()
  const tools = [{ name: 'bash' }, { name: 'read' }, { name: 'edit' }]
  const result = await assemble(listeners['system-prompt/assemble'], [], tools, 1)
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
  const result = await assemble(listeners['system-prompt/assemble'], events, TOOLS, 1)
  assert.deepEqual(result.tools.map((t) => t.name), TOOLS.map((t) => t.name))
})

test('main agent pre-step is untouched', async () => {
  const { listeners } = register()
  const messages = [
    { id: 'i', source: { kind: 'agent-instructions' } },
    { id: 'c', source: { kind: 'skill-catalog' } },
  ]
  const result = await prestep(listeners['agent/pre-step'], [], messages, 0)
  assert.deepEqual(result.messages.map((m) => m.id), ['i', 'c'])
})
