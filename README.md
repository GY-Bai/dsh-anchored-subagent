# dsh-anchored-subagent

<p align="center">
  <img src="docs/social-preview.jpg" alt="dsh-anchored-subagent banner" width="100%">
</p>

> **Say the secret handshake first.** This DSH plugin installs an agent preset
> that starts every session (main agent **and** subagents) on the Minimal
> condition, then unlocks the full tool catalog.

🌐 **English** | [中文](./README.zh-CN.md)

Think of it as an **暗号 / secret handshake**: the first model request uses the
exact Minimal condition DeepSeek was RL-trained on (`bash` +
`str_replace_editor` + one-line Minimal persona), so the model starts in its
strongest `We need...` trajectory — then we hand it the whole toolbox.

## Why an agent preset?

DSH's subagents automatically **join the parent session's agent preset
composition**. So the most reliable way to make subagents benefit is to install
an agent preset on the session: both the main agent and every inherited
subagent get the same Minimal bootstrap, and DSH's complete-persona mechanism
works correctly (a root-bundle hook cannot reliably override DSH's complete
system prompt).

## How it works

```
first model request (main agent or subagent)
        │
        ▼
┌ bootstrap phase ────────────────────────────────────────────┐
│ tools   : bash + str_replace_editor                         │
│ persona : "You are a helpful software engineer assistant."  │
│           (complete Minimal persona)                        │
│ context : AGENTS.md digest + skill-catalog reminder stripped│
│ budget  : bootstrapMaxTokens (optional)                    │
└─────────────────────────────────────────────────────────────┘
        │ first durable tool/call OR assistant/message
        ▼
┌ promoted phase ─────────────────────────────────────────────┐
│ tools   : full assembled tool catalog restored              │
└─────────────────────────────────────────────────────────────┘
```

Subagents inherit the preset automatically because DSH composes child agents
from the parent's agent preset.

### Any subagent persona is stripped first, restored after promotion

If a subagent is spawned with a custom `persona`, this plugin strips it before
the child is created. The child therefore starts with the **pure Minimal
persona** on request #1. After the child's first durable `tool/call` or
`assistant/message`, the original persona is re-registered in the child scope,
so the role comes back for subsequent turns.

## Installation

```sh
dsh plugin add github:GY-Bai/dsh-anchored-subagent
```

Restart DSH, then select the **`dsh-anchored-subagent`** agent preset (or set
it as the default preset) for your session.

The plugin copies the preset to `~/.dsh/.agent-presets/dsh-anchored-subagent/`
on boot.

## Configuration

The preset is defined in
`agent-presets/dsh-anchored-subagent/agent.cordis.yml`. You can edit the
installed copy at `~/.dsh/.agent-presets/dsh-anchored-subagent/agent.cordis.yml`.

| Key | Default | Meaning |
|---|---|---|
| `bootstrapTools` | `["bash","str_replace_editor"]` | Tools visible on the first request. |
| `promoteOn` | `"either"` | Promotion trigger: `either`, `tool-call`, or `assistant-message`. |
| `suppressedContextSources` | `["agent-instructions","skill-catalog"]` | Auto-injected context stripped during bootstrap; `[]` disables. |
| `bootstrapMaxTokens` | `null` | Optional first-request output cap. |

Example `agent.cordis.yml`:

```yaml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: You are a helpful software engineer assistant.
    complete: true
    includeRuntimeContext: false

- id: tool-bootstrap
  name: ./tool-bootstrap.mjs
  config:
    bootstrapTools:
      - bash
      - str_replace_editor
    promoteOn: either
    suppressedContextSources:
      - agent-instructions
      - skill-catalog
    bootstrapMaxTokens: null
```

## Verified

End-to-end verified on the DSH web profile:

- main agent starts with the Minimal persona and `bash + str_replace_editor`;
- after the first durable `tool/call`, the full tool catalog is restored;
- a spawned subagent (`delegationDepth: 1`) also starts with the Minimal
  persona, its first reasoning begins with `We need...`, and its first tool
  call is `bash` only.

## Development

```sh
npm test
```

The test suite uses zero dependencies (`node --test`) and covers:

- first-request tool filtering;
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
- Installer pattern: [`liceses/dsh-gitbash-preset`](https://github.com/liceses/dsh-gitbash-preset)

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

This project is a community plugin. It is not affiliated with or endorsed by
DeepSeek.
