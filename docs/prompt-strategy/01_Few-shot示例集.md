# Few-shot 示例集

## 版本: V1.0
## 用途: 为各 Agent Prompt 提供 Few-shot 参考示例

---

## 1. Context & Event Agent 示例

### 示例 1: 版本发布讨论

**输入消息**:
```
m01 | 2026-08-25 09:00 | @刘文强: 1.0.4版本今天能发布吗？
m02 | 2026-08-25 09:02 | @郭志远: 语音模块还有个bug没修完
m03 | 2026-08-25 09:03 | @刘文强: 那先修完语音的问题再发
m04 | 2026-08-25 09:05 | @郭志远: 好的，我下午修完
m05 | 2026-08-25 09:10 | @刘文强: 👍
```

**期望输出**:
```json
{
  "topics": [
    {
      "topicId": "T1",
      "title": "1.0.4版本发布计划",
      "startTime": "2026-08-25T09:00:00",
      "endTime": "2026-08-25T09:10:00",
      "participants": ["@刘文强", "@郭志远"]
    }
  ],
  "events": [
    {
      "eventId": "E1",
      "topicId": "T1",
      "eventType": "proposal",
      "content": "1.0.4版本今天发布",
      "participants": ["@刘文强", "@郭志远"],
      "owner": null,
      "dueDate": "2026-08-25",
      "state": "proposed",
      "evidenceMessageIds": ["m01", "m02", "m03"],
      "relatedEventIds": ["E2"],
      "supersedes": null,
      "confidence": 0.9
    },
    {
      "eventId": "E2",
      "topicId": "T1",
      "eventType": "task",
      "content": "修复语音模块bug后发布1.0.4版本",
      "participants": ["@郭志远", "@刘文强"],
      "owner": "@郭志远",
      "dueDate": "2026-08-25",
      "state": "proposed",
      "evidenceMessageIds": ["m02", "m03", "m04"],
      "relatedEventIds": ["E1"],
      "supersedes": "E1",
      "confidence": 0.92
    }
  ]
}
```

**分析要点**:
- m01 是提议，m02 指出问题，m03 修改方案 → E1 被 E2 覆盖
- m04 中"我下午修完"是明确认领 → owner = @郭志远
- m05 "👍" 是确认，作为证据补充但不单独成为事件
- "今天"转换为具体日期 2026-08-25

---

### 示例 2: 多话题跳跃

**输入消息**:
```
m01 | 2026-08-25 10:00 | @王五: 登录接口字段变了，增加了 deviceId 参数
m02 | 2026-08-25 10:01 | @李明: 收到，我这边适配一下
m03 | 2026-08-25 10:05 | @张三: 对了，明天团建大家别忘了
m04 | 2026-08-25 10:06 | @王五: 哈哈好的
m05 | 2026-08-25 10:10 | @王五: @李明 接口文档更新了，你看下这个链接 docs.internal.com/api/v2
m06 | 2026-08-25 10:12 | @李明: 好的我看下
```

**期望输出**:
```json
{
  "topics": [
    {
      "topicId": "T1",
      "title": "登录接口变更",
      "startTime": "2026-08-25T10:00:00",
      "endTime": "2026-08-25T10:12:00",
      "participants": ["@王五", "@李明"]
    },
    {
      "topicId": "T2",
      "title": "团建提醒",
      "startTime": "2026-08-25T10:05:00",
      "endTime": "2026-08-25T10:06:00",
      "participants": ["@张三", "@王五"]
    }
  ],
  "events": [
    {
      "eventId": "E1",
      "topicId": "T1",
      "eventType": "information",
      "content": "登录接口字段变更，增加 deviceId 参数",
      "participants": ["@王五", "@李明"],
      "owner": null,
      "dueDate": null,
      "state": "proposed",
      "evidenceMessageIds": ["m01"],
      "relatedEventIds": ["E2"],
      "supersedes": null,
      "confidence": 0.95
    },
    {
      "eventId": "E2",
      "topicId": "T1",
      "eventType": "task",
      "content": "@李明 适配登录接口新增的 deviceId 参数",
      "participants": ["@李明", "@王五"],
      "owner": "@李明",
      "dueDate": null,
      "state": "proposed",
      "evidenceMessageIds": ["m02", "m05", "m06"],
      "relatedEventIds": ["E1"],
      "supersedes": null,
      "confidence": 0.88
    },
    {
      "eventId": "E3",
      "topicId": "T1",
      "eventType": "information",
      "content": "接口文档已更新：docs.internal.com/api/v2",
      "participants": ["@王五", "@李明"],
      "owner": null,
      "dueDate": null,
      "state": "proposed",
      "evidenceMessageIds": ["m05"],
      "relatedEventIds": ["E1"],
      "supersedes": null,
      "confidence": 0.95
    }
  ]
}
```

**分析要点**:
- m03-m04 是团建闲聊，不产生事件（但保留 Topic 记录）
- m02 "收到，我这边适配"是明确认领 → owner = @李明
- m05 包含链接，作为 keyInfo 类事件
- 多话题交叉：m03 插入在 T1 的讨论中间

---

## 2. State Agent 示例

### 示例: 提议与决议区分

**输入事件**:
```
E1: "1.0.4版本今天发布" (participants: @刘文强, @郭志远)
E2: "修复语音问题后发布1.0.4" (participants: @刘文强, @郭志远)
```

**相关消息**:
```
m01 | @刘文强: 1.0.4版本今天能发布吗？
m02 | @郭志远: 语音模块还有个bug没修完
m03 | @刘文强: 那先修完语音的问题再发
m04 | @郭志远: 好的，我下午修完
```

**期望输出**:
```json
{
  "events": [
    {
      "eventId": "E1",
      "state": "superseded",
      "supersedes": null,
      "stateEvidence": "被E2覆盖，因语音问题无法今天发布",
      "confidence": 0.95
    },
    {
      "eventId": "E2",
      "state": "confirmed",
      "owner": "@郭志远",
      "dueDate": "2026-08-25",
      "supersedes": "E1",
      "stateEvidence": "m03明确方案变更，m04郭志远确认认领",
      "confidence": 0.93
    }
  ]
}
```

---

## 3. Personalized Relevance Agent 示例

### 示例: 同一事件对不同用户的重要性差异

**事件**: "登录接口字段变更，增加 deviceId 参数"

**用户A (登录模块负责人)**:
```json
{
  "eventId": "E1",
  "importance": "high",
  "relevance": {
    "role": 0.7,
    "responsibility": 0.95,
    "relationship": 0.6,
    "directMention": 0.0
  },
  "reasonCodes": ["RESPONSIBILITY_MATCH"],
  "explanation": "该事件直接涉及用户负责的登录模块，接口变更需要用户关注和适配"
}
```

**用户B (推荐算法负责人)**:
```json
{
  "eventId": "E1",
  "importance": "low",
  "relevance": {
    "role": 0.3,
    "responsibility": 0.1,
    "relationship": 0.4,
    "directMention": 0.0
  },
  "reasonCodes": ["ROLE_PRIOR"],
  "explanation": "该事件涉及系统接口变更，作为开发人员可能需要了解，但与用户职责无直接关联"
}
```

---

## 4. Summary Agent 示例

### 示例: 完整摘要输出

**输入上下文**: 上述版本发布讨论 + 接口变更讨论

**期望 Markdown 输出**:
```markdown
## 群聊摘要

### 核心要点
- 1.0.4版本因语音模块bug推迟发布，郭志远已认领修复任务
- 登录接口新增 deviceId 参数，李明负责适配

### 决议
- 1.0.4版本修复语音问题后发布（已确认）

### 待办
| 优先级 | 任务 | 负责人 | 截止 | 状态 |
|--------|------|--------|------|------|
| 高 | 修复语音模块bug | @郭志远 | 2026-08-25 | 进行中 |
| 高 | 适配登录接口 deviceId 参数 | @李明 | 未明确 | 待处理 |

### 关键信息
- 接口文档：docs.internal.com/api/v2
```

---

## 5. Factual Auditor 示例

### 示例: 发现决议状态错误

**摘要中**:
```
决议: "1.0.4版本今天发布"（已达成）
```

**审核输出**:
```json
{
  "passed": false,
  "issues": [
    {
      "issueId": "FA-001",
      "checkType": "StateConsistency",
      "severity": "error",
      "fieldPath": "structured.decisions[0]",
      "relatedEventId": "E1",
      "evidenceMessageIds": ["m02", "m03"],
      "description": "事件E1已被E2覆盖（superseded），不应作为当前决议。正确决议应为E2：修复语音问题后发布",
      "suggestion": "将decisions[0]替换为E2的内容，或移除该条目"
    }
  ],
  "summary": "发现1个状态一致性错误：引用了已被覆盖的旧事件作为决议"
}
```

---

## 6. 边界案例示例

### 6.1 无法确定指代

**消息**: "这个方案不行，换另一个吧"

**处理**: 如果上下文无法确定"这个方案"和"另一个"指什么，输出：
```json
{
  "eventId": "E5",
  "content": "某方案被否决，需换用另一方案（具体方案未明确）",
  "confidence": 0.5
}
```

### 6.2 模糊指派

**消息**: "这个bug谁有空看一下？"

**处理**: 不构成指派，不填写 owner
```json
{
  "eventId": "E6",
  "eventType": "problem",
  "content": "存在一个bug需要人处理",
  "owner": null,
  "confidence": 0.85
}
```

### 6.3 纯表情/确认回复

**消息**: "👍" / "好的" / "收到"

**处理**: 不独立成为事件，但如果有上下文事件，作为证据补充：
```
将 "m05" 添加到相关事件的 evidenceMessageIds 中
```
