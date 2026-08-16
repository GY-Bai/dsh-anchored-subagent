# dsh-anchored-subagent

<p align="center">
  <img src="docs/social-preview.jpg" alt="dsh-anchored-subagent banner" width="100%">
</p>

> **给 DS 模型对上暗号。** 这个 DSH 插件会安装一个 agent preset，让每个会话（主 agent **和** 子代理）先以 Minimal 开局，再解锁完整工具库。

[English](./README.md) | **中文**

你可以把它理解成一种**暗号 / secret handshake**：首轮模型请求使用 DeepSeek 在
RL 训练时见过的 Minimal 条件（`bash` + `str_replace_editor` + 一句话 Minimal
persona），让模型一开局就进入最强的 `We need...` 轨迹；之后我们再把完整工具库交给它。

## 为什么做成 agent preset？

DSH 的子代理会自动 **join 父会话的 agent preset composition**。所以让子代理吃到
红利最可靠的方式，就是给会话安装一个 agent preset：主 agent 和所有继承的子代理
都会自动走同样的 Minimal bootstrap，而且 DSH 的 complete persona 机制能正确生效
（root bundle 钩子无法可靠覆盖 DSH 的 complete system prompt）。

## 机制

```
第一次模型请求（主 agent 或子代理）
        │
        ▼
┌ bootstrap 阶段 ─────────────────────────────────────────────┐
│ 工具   : bash + str_replace_editor                          │
│ persona: "You are a helpful software engineer assistant."   │
│          （complete Minimal persona）                        │
│ 上下文 : 剥离 AGENTS.md 摘要 + 技能目录提醒                  │
│ 预算   : bootstrapMaxTokens（可选）                         │
└─────────────────────────────────────────────────────────────┘
        │ 首次持久 tool/call 或 assistant/message
        ▼
┌ promoted 阶段 ──────────────────────────────────────────────┐
│ 工具   : 恢复完整工具目录                                    │
└─────────────────────────────────────────────────────────────┘
```

子代理自动继承 preset，因为 DSH 会用父 agent 的 preset composition 来组合子代理。

### 任何子代理 persona 都会先被剥离，晋升后再恢复

如果子代理 spawn 时带了自定义 `persona`，本插件会在创建前把它剥离。因此子代理首轮使用**纯 Minimal persona**；在子代理首次持久 `tool/call` 或 `assistant/message` 后，原始 persona 会被重新注册回子代理作用域，角色从后续轮次恢复。

## 安装

```sh
dsh plugin add github:GY-Bai/dsh-anchored-subagent
```

重启 DSH 后，在 agent preset 选择器里选择 **`dsh-anchored-subagent`**（或设为默认 preset）。

插件会在启动时把 preset 复制到 `~/.dsh/.agent-presets/dsh-anchored-subagent/`。

## 配置

preset 定义在 `agent-presets/dsh-anchored-subagent/agent.cordis.yml`。你也可以直接改已安装的
`~/.dsh/.agent-presets/dsh-anchored-subagent/agent.cordis.yml`。

| 键 | 默认 | 含义 |
|---|---|---|
| `bootstrapTools` | `["bash","str_replace_editor"]` | 首轮可见工具。 |
| `promoteOn` | `"either"` | 晋升触发：`either` / `tool-call` / `assistant-message`。 |
| `suppressedContextSources` | `["agent-instructions","skill-catalog"]` | bootstrap 阶段剥离的自动注入上下文；`[]` 关闭。 |
| `bootstrapMaxTokens` | `null` | 可选的首轮输出封顶。 |

示例 `agent.cordis.yml`：

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

## 已验证

已在 DSH web profile 上完成端到端验证：

- 主 agent 以 Minimal persona + `bash + str_replace_editor` 开局；
- 首次持久 `tool/call` 后恢复完整工具目录；
- spawn 出的子代理（`delegationDepth: 1`）同样以 Minimal persona 开局，首段推理以 `We need...` 开头，首轮只调用 `bash`。

## 开发

```sh
npm test
```

测试零依赖（`node --test`），覆盖：

- 首轮工具过滤；
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
- Installer 模式：[`liceses/dsh-gitbash-preset`](https://github.com/liceses/dsh-gitbash-preset)

## License

MIT。见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。

本项目是社区插件，与 DeepSeek 官方无隶属或背书关系。
