# dsh-anchored-subagent

> **Say the secret handshake first.** Every DSH subagent starts in Minimal mode
> to coax out DeepSeek's full RL-trained strength, then gets the whole toolbox.

🌐 **English** | [中文](./README.zh-CN.md)

A DeepSeek Harness (DSH) plugin that makes **subagents** start like the official
**Minimal** preset — two tools (`bash` + `str_replace_editor`), the one-line
Minimal persona, and no auto-injected workspace/skill context — then restores
the full tool catalog after the subagent's first durable `tool/call` or
`assistant/message`.

Think of it as an **暗号 / secret handshake**: the subagent's first request uses
the exact Minimal condition DeepSeek was RL-trained on, so the model starts in
its strongest `We need...` trajectory — then we hand it the full tool catalog.

This is the DSH companion to [`pi-dsv4-booster`](https://github.com/GY-Bai/pi-dsv4-booster),
ported to DSH's native subagent seam.

## Why

DeepSeek V4 models strongly condition their first-request trajectory on the
API-visible tool catalog and system prompt. DSH's own Minimal preset produces
the `We need...` trajectory (Project2 99/96), while a fat Standard catalog
tends to produce `Let me...` tool-churn (91/92).

DSH already has subagents built in (`ctx.subagents` + `spawn`/`fork`
providers). This plugin fills a gap: by default, DSH's `dsh-anchored-standard`
base mode treats subagents as **always promoted**. This plugin gives subagents
their own Minimal bootstrap phase without touching the main agent.

## How it works

For every subagent (`delegationDepth > 0`):

```
subagent's first model request
        │
        ▼
┌ bootstrap phase ────────────────────────────────────────────┐
│ tools   : bash + str_replace_editor                         │
│ persona : Minimal persona                                   │
│           "You are a helpful software engineer assistant."  │
│           (prepended to the subagent's custom role prompt)  │
│ context : AGENTS.md digest + skill-catalog reminder stripped│
│ budget  : bootstrapMaxTokens (optional)                    │
└─────────────────────────────────────────────────────────────┘
        │ first durable tool/call OR assistant/message
        ▼
┌ promoted phase ─────────────────────────────────────────────┐
│ tools   : full tool catalog restored                        │
│ persona : Minimal persona prefix stays (session mode)       │
└─────────────────────────────────────────────────────────────┘
```

Main agents (`delegationDepth == 0`) are never modified.

### Custom subagent roles are preserved

When `preserveCustomPrompt` is `true` (default), the plugin **prepends** the
Minimal persona to the subagent's existing system prompt instead of replacing
it. Specialized agents such as a read-only `Reviewer` keep their role
instructions while still receiving the Minimal trajectory anchor.

## Installation

```sh
dsh plugin add github:GY-Bai/dsh-anchored-subagent
```

Restart DSH (or reload the profile), then spawn a subagent as usual.

## Configuration

The plugin is configured through the row config in `cordis.patch.yml` (or by
overriding the row in a later patch layer).

| Key | Default | Meaning |
|---|---|---|
| `bootstrapTools` | `["bash","str_replace_editor"]` | Tools visible on the subagent's first request. |
| `promoteOn` | `"either"` | Promotion trigger: `either`, `tool-call`, or `assistant-message`. |
| `suppressedContextSources` | `["agent-instructions","skill-catalog"]` | Auto-injected context stripped during bootstrap; `[]` disables. |
| `bootstrapMaxTokens` | `null` | Optional first-request output cap. |
| `bootstrapPersona` | `"You are a helpful software engineer assistant."` | Minimal persona (DSH original text). `null` disables persona rewriting. |
| `preserveCustomPrompt` | `true` | Keep the subagent's custom prompt and prepend the Minimal persona instead of replacing it. |
| `personaMode` | `"session"` | `session` keeps the persona prefix for the whole subagent lifetime; `bootstrap-only` would restore the original prompt after promotion (currently `session` is the implemented default). |

Example `cordis.patch.yml` row:

```yaml
- insert:
    - id: dsh-anchored-subagent
      name: 'dsh-anchored-subagent'
      config:
        bootstrapTools:
          - bash
          - str_replace_editor
        promoteOn: either
        suppressedContextSources:
          - agent-instructions
          - skill-catalog
        bootstrapMaxTokens: null
        bootstrapPersona: You are a helpful software engineer assistant.
        preserveCustomPrompt: true
        personaMode: session
```

## Development

```sh
npm test
```

The test suite uses zero dependencies (`node --test`) and covers:

- main agent untouched;
- subagent bootstrap tool filtering;
- Minimal persona prepend/replace;
- promotion via `tool/call` and `assistant/message`;
- `promoteOn: tool-call` behavior;
- context stripping;
- fail-safe when a bootstrap tool is missing;
- optional `bootstrapMaxTokens` cap and release;
- resume with history starts promoted.

## Relationship to existing projects

- Concept: [`pi-dsv4-booster`](https://github.com/GY-Bai/pi-dsv4-booster)
  (MIT)
- DSH preset/hook patterns: [`xiaobright/dsh-anchored-standard`](https://github.com/xiaobright/dsh-anchored-standard)
  (MIT)
- DSH subagent seam: [`@deepseek-ai/dsh-subagent`](https://www.npmjs.com/package/@deepseek-ai/dsh-subagent)

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

This project is a community plugin. It is not affiliated with or endorsed by
DeepSeek.
