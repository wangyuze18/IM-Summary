# Prompt 设计总纲：证据共享、任务解耦、定向纠错

## 1. 设计目标

系统同时优化结构化摘要与重要消息抽取。两项任务共享事实，却不能共享输出偏好：摘要允许压缩和归纳；重要消息要求逐条保留原文。Prompt 设计因此采用“共享证据层 + 独立生成规范 + 独立审核”的结构。

## 2. 全局硬规则

所有团队 Agent 继承以下约束：

1. 聊天消息是唯一事实来源；画像、职位和关系不能补造事实。
2. 不创造决议、任务、负责人、日期、人名、版本号或系统名。
3. `@` 提及、实体、链接和命令必须保真。
4. 不明确时输出“未明确”或谨慎状态，不得猜测。
5. 旧状态被更新、取消或否决时，不能作为当前结论。
6. 只返回指定 JSON，不输出解释或思维过程。

账户个人、目标用户和个人关注不属于任何 Agent 的输入或输出。

## 3. 基础模式 Prompt

基础模式包含两个相互独立的系统提示词：摘要生成 Prompt 和重要消息 Prompt。两者同时接收相同群名和原始对话，不接收团队模式的事件账本。

摘要生成强调固定结构、短句、决议/待办边界和实体保真。重要消息强调选择单条原始消息、类型判定、stakeholder 依据、去重和状态更新。完整要求见 [基础模式 Prompt](02_单模型模式Prompt.md)。

## 4. 团队模式 Prompt 链

### 4.1 Context & Event Agent

目的：将碎片化对话转化为原子事件，保留 `evidenceMessageIds`。

输出：

```json
{
  "topics": [{"topicId":"T1","title":"版本发布","participants":["@甲"]}],
  "events": [{
    "eventId":"E1",
    "topicId":"T1",
    "eventType":"proposal|decision|task|risk|problem|information|status_update",
    "content":"一句话事件描述",
    "participants":["@甲"],
    "evidenceMessageIds":["m01"],
    "confidence":0.9
  }]
}
```

这里不做最终状态裁决，避免事件抽取与决议判断纠缠。

### 4.2 State Agent

目的：根据原始证据判断事件生命周期并处理覆盖关系。

```json
{
  "events": [{
    "eventId":"E1",
    "state":"proposed|confirmed|active|in_progress|resolved|superseded|cancelled|rejected|unknown",
    "owner":"@甲或null",
    "dueDate":"原文时间或null",
    "supersedes":null,
    "statusReason":"判断依据"
  }]
}
```

职位高低不能把提议升级为决议；“有人看看”不能推断负责人。

### 4.3 Summary Agent

输入共享证据账本和相关原始消息，输出：

- `abstractPoints`：3 条核心进展；
- `decisions`：2–4 条明确共识，证据不足允许少于目标而不补造；
- `todos`：3–5 条明确指派任务，证据不足允许少于目标；
- `topics`：2–4 个议题；
- `openIssues`、`keyInfo`：各 1–3 条。

摘要不得包含 `importantMessages`，后者由独立模型生成后在编排层合并。

### 4.4 Importance Extractor

纳入类型：待办、决议、风险、审批、进度、阻断、其他。每一条必须对应一个原始 `messageId`，`content` 只能去 HTML/首尾空白，不可摘要改写。

高价值判定要求有明确业务影响。收到、感谢、表情、无结论提议、重复转述和普通过程闲聊排除。状态发生变化时保留最新有效消息。

```json
{
  "importantMessages": [{
    "messageId":"m01",
    "speaker":"@说话者",
    "content":"原始消息",
    "type":"待办|决议|风险|审批|进度|阻断|其他",
    "priority":"高|中|低",
    "stakeholders":["角色-@人员"],
    "reason":"业务影响，不超过25字"
  }]
}
```

stakeholders 只来自明确提及、指派或结构化职责字段；无法确定使用 `未明确`。

### 4.5 Factual Auditor

审核摘要的 Faithfulness、Coverage、Decision Validity、Todo Validity、State Consistency、Entity Fidelity 与 Schema。问题必须指出 `fieldPath`、`eventId` 和路由目标。

### 4.6 Importance Auditor

审核重要消息的假阳性、遗漏、来源保真、过时状态和 stakeholder 推断。问题类型为 `false_positive`、`omission`、`source`、`state`、`stakeholder` 或 `schema`。

## 5. 定向修订 Prompt

修订输入由三部分组成：当前分支结果、该分支审核问题、原始证据/共享账本。系统明确要求只修复列出的问题并返回完整 JSON。

摘要审核失败时不把摘要问题发给重要消息模型；重要消息审核失败时也不重写摘要。这能把审校增益归因到对应任务，并控制调用成本。

## 6. 评测 Prompt 隔离

摘要判官只接收生成摘要主体和黄金摘要，输出：

```json
{"accuracy":0.9,"keyInformationOmissionRate":0.1,"llm_score":85}
```

重要消息判官只接收两组 importantMessages，输出：

```json
{"importantMessagePrecision":0.8,"importantMessageRecall":0.75}
```

`llm_score` 只表示摘要的忠实性、完整性、结构和语言质量。文本相似度不调用模型，由后端在摘要 Markdown 规范化后计算 ROUGE-L。

## 7. 防止 Prompt 泄漏与评测污染

- 生成阶段不知道黄金答案；
- 摘要模型不读取黄金重要消息；
- 重要消息模型不从生成摘要反推原文；
- 审核器读取候选输出但不读取评测分数；
- 团队模式和基础模式共用重要消息模型绑定；
- 同一实验固定模型、温度和输入会话，仅改变工作流。

## 8. 失败与降级

- JSON 缺字段：审核器标记 schema 问题；
- 证据不足：空数组优于编造内容；
- 无重要消息：返回空数组；
- 审核器异常：记录失败并进入受限修订/警告，不默认为通过；
- 超过修订上限：保存结果和问题，运行状态为 warning。

## 9. 预期贡献与消融

推荐报告以下消融：

| 设置 | 共享事件 | 状态判断 | 摘要审核 | 消息审核 |
| :--- | :---: | :---: | :---: | :---: |
| 基础模式 | 否 | 否 | 否 | 否 |
| + Evidence | 是 | 否 | 否 | 否 |
| + State | 是 | 是 | 否 | 否 |
| + Summary Audit | 是 | 是 | 是 | 否 |
| 团队模式 | 是 | 是 | 是 | 是 |

预期机制：Evidence/State 主要降低摘要遗漏与状态错误，并提高重要消息召回；Summary Audit 主要提高摘要准确率与 LLM 分；Importance Audit 主要清除假阳性并补回遗漏，改善精确率与召回率。最终结论必须由同一评测集的结果支持，不能只依据架构宣称提升。
