> Unofficial project, independently developed and maintained by community members.
> 非官方项目，由社区成员独立开发和维护。

**Project URL / 项目地址：** https://github.com/GY-Bai/dsh-anchored-subagent

---

## English

**NO more "Let me…".**

Your DeepSeek V4 main agent and subagents can start at full HP — the problem is what they see on request #1.

25 tools + a fat Standard prompt → `Let me...` tool-churn mode.
Minimal condition (`bash + str_replace_editor` + one-line persona) → `We need...` mode, the RL-trained sweet spot (Project2: Minimal 99/96 vs Standard 91).

**dsh-anchored-subagent is the secret handshake:**

- Main agent: Minimal first, full tools from round two
- Subagents: Minimal first, full tools from round two
- Custom subagent personas are stripped first, restored from round two
- No whitelist — works for any role
- Full multi-tool capability stays intact — this is not "Minimal forever", it's "start at full HP, then hand you the whole toolbox"

**Proof it works (real E2E):**

- Subagent first system prompt: `You are a helpful software engineer assistant.`
- First reasoning line: `We need list files current dir. Need tool call.`
- First tool call: `bash` only — no `read/edit/glob` noise
- From round two, a configured persona like `You are a terse kernel engineer.` comes back automatically

**Install:**
```sh
dsh plugin add github:GY-Bai/dsh-anchored-subagent
```

Then select the **`dsh-anchored-subagent`** agent preset in DSH.

Every penny you spend on tokens should buy the model's best trajectory — not a `Let me...` warm-up round.

---

## 中文

**NO more "Let me…".**

你的 DeepSeek V4 主 agent 和子代理，本可以一开局就满血。

问题不在模型，而在“首轮看到的条件”：

- 25 个工具 + 一大坨 Standard prompt → `Let me...` 工具轮换模式
- Minimal 条件（`bash + str_replace_editor` + 一句话 persona）→ `We need...` 模式，也就是 RL 训练时的高分区间（Project2：Minimal 99/96 vs Standard 91）

**dsh-anchored-subagent 就是那个暗号：**

- 主 agent：先 Minimal 开局，第二轮之后完整工具恢复
- 子代理：同样先 Minimal 开局，第二轮之后完整工具恢复
- 自定义子代理 persona：首轮自动剥离，第二轮之后自动恢复
- 不需要白名单，任何角色都生效
- 多工具照常用——不是“极简到底”，而是“先满血开局，第二轮之后把整个工具箱交给你”

**真机 E2E 证据：**

- 子代理首轮 system prompt：`You are a helpful software engineer assistant.`
- 首段推理：`We need list files current dir. Need tool call.`
- 首轮工具调用：只有 `bash`，没有 `read/edit/glob` 噪音
- 第二轮之后，配置的 persona（如 `You are a terse kernel engineer.`）会自动回来

**安装：**
```sh
dsh plugin add github:GY-Bai/dsh-anchored-subagent
```

然后在 DSH 里选择 **`dsh-anchored-subagent`** preset。

你花的每一分 token / 每一分钱，都应该买到模型的满血性能，而不是先让它空转一轮 `Let me...`。

---

*Unofficial community plugin — please review the source before use.*
*非官方社区插件，使用前请自行审查源码。*
