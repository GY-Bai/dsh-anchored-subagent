# dsh-anchored-subagent

> **给 DS 模型对上暗号。** 每个 DSH 子代理先用 Minimal 开局，诱出 RL 训练出的满血实力，再解锁完整工具库。

[English](./README.md) | **中文**

这是一个 DeepSeek Harness (DSH) 插件：让**子代理**像官方 **Minimal** preset 一样开局——
只有两个工具（`bash` + `str_replace_editor`）、一句话 Minimal persona、不注入
AGENTS.md/技能目录；在子代理首次持久 `tool/call` 或 `assistant/message` 后恢复完整工具目录。

你可以把它理解成一种**暗号 / secret handshake**：子代理首轮请求使用 DeepSeek 在
RL 训练时见过的 Minimal 条件，让模型一开局就进入最强的 `We need...` 轨迹；
之后我们再把完整工具库交给它。

它是 [`pi-dsv4-booster`](https://github.com/GY-Bai/pi-dsv4-booster) 的 DSH 版本，
基于 DSH 原生 subagent 能力实现。

## 为什么

DeepSeek V4 模型会强烈依赖首轮 API 可见的工具目录和 system prompt 选择轨迹。
DSH 官方 Minimal preset 能产生 `We need...` 轨迹（Project2 99/96），而完整的
Standard 工具目录容易产生 `Let me...` 工具轮换（91/92）。

DSH 自带 subagent（`ctx.subagents` + `spawn`/`fork` providers）。现有
`dsh-anchored-standard` 基础模式默认把子代理当作“已晋升”处理；本插件补上这个缺口，
让子代理也有自己的 Minimal bootstrap 阶段，同时完全不碰主 agent。

## 机制

对所有子代理（`delegationDepth > 0`）：

```
子代理第一次模型请求
        │
        ▼
┌ bootstrap 阶段 ─────────────────────────────────────────────┐
│ 工具   : bash + str_replace_editor                          │
│ persona: Minimal persona                                    │
│          "You are a helpful software engineer assistant."   │
│          （前置到子代理自己的角色 prompt 之前）              │
│ 上下文 : 剥离 AGENTS.md 摘要 + 技能目录提醒                  │
│ 预算   : bootstrapMaxTokens（可选）                         │
└─────────────────────────────────────────────────────────────┘
        │ 首次持久 tool/call 或 assistant/message
        ▼
┌ promoted 阶段 ──────────────────────────────────────────────┐
│ 工具   : 恢复完整工具目录                                    │
│ persona: Minimal persona 前缀继续保留（session 模式）        │
└─────────────────────────────────────────────────────────────┘
```

主 agent（`delegationDepth == 0`）完全不受影响。

### 保留自定义子代理角色

`preserveCustomPrompt` 默认为 `true`：插件把 Minimal persona **前置**到子代理已有
system prompt 前面，而不是整体替换。这样像只读 `Reviewer` 这类专业角色子代理，
既能保留自己的角色指令，又能吃到 Minimal 轨迹锚定。

## 安装

```sh
dsh plugin add github:GY-Bai/dsh-anchored-subagent
```

重启 DSH（或 reload profile），然后正常 spawn 子代理即可。

## 配置

通过 `cordis.patch.yml` 中的行配置（或后续 patch 层覆盖）。

| 键 | 默认 | 含义 |
|---|---|---|
| `bootstrapTools` | `["bash","str_replace_editor"]` | 子代理首轮可见工具。 |
| `promoteOn` | `"either"` | 晋升触发：`either` / `tool-call` / `assistant-message`。 |
| `suppressedContextSources` | `["agent-instructions","skill-catalog"]` | bootstrap 阶段剥离的自动注入上下文；`[]` 关闭。 |
| `bootstrapMaxTokens` | `null` | 可选的首轮输出封顶。 |
| `bootstrapPersona` | `"You are a helpful software engineer assistant."` | Minimal persona（DSH 原文）。`null` 关闭 persona 改写。 |
| `preserveCustomPrompt` | `true` | 保留子代理自定义 prompt，并把 Minimal persona 前置而不是替换。 |
| `personaMode` | `"session"` | `session` 全程保留 persona 前缀；`bootstrap-only` 预留为晋升后恢复原 prompt（当前默认实现为 `session`）。 |

示例 `cordis.patch.yml`：

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

## 开发

```sh
npm test
```

测试零依赖（`node --test`），覆盖：

- 主 agent 不受影响；
- 子代理 bootstrap 工具过滤；
- Minimal persona 前置/替换；
- `tool/call` 与 `assistant/message` 晋升；
- `promoteOn: tool-call` 行为；
- 上下文剥离；
- bootstrap 工具缺失时 fail-safe；
- 可选 `bootstrapMaxTokens` 封顶与释放；
- 带历史 resume 直接 promoted。

## 与现有项目的关系

- 概念来源：[`pi-dsv4-booster`](https://github.com/GY-Bai/pi-dsv4-booster) (MIT)
- DSH preset/hook 模式：[`xiaobright/dsh-anchored-standard`](https://github.com/xiaobright/dsh-anchored-standard) (MIT)
- DSH subagent seam：[`@deepseek-ai/dsh-subagent`](https://www.npmjs.com/package/@deepseek-ai/dsh-subagent)

## License

MIT。见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。

本项目是社区插件，与 DeepSeek 官方无隶属或背书关系。
