# IM-Summary Backend

Spring Boot 后端负责导入、模型配置、两种分析工作流、结构化结果渲染、运行进度和六指标评测。后端不提供 mock 回退。

## 运行

要求 Java 17 与 Maven 3.9+。

```powershell
mvn spring-boot:run
```

默认地址为 `http://localhost:8080`，H2 文件数据库位于 `backend/data/`。凭据使用 `IMSUMMARY_SECRET` 加密；模型超时可通过 `IMSUMMARY_MODEL_TIMEOUT_SECONDS` 调整。

## 分析工作流

### 基础模式

`single_model` 与 `importance_extractor` 同时读取原始群聊并并行执行。前者生成摘要，后者逐条抽取重要消息。它们不共享中间产物，不调用审核器，是实验 baseline。

### 团队模式

1. `context_event` 从原始消息重建议题并抽取带证据 ID 的原子事件。
2. `state` 判断确认、进行中、覆盖、取消等状态，形成共享证据账本。
3. `summary` 与 `importance_extractor` 基于相同有效事实并行生成。
4. `factual_auditor` 与 `importance_auditor` 分别检查摘要和重要消息。
5. 任一分支不通过时，只携带该分支的问题进行定向修订和复审，最多执行配置的修订次数。

最终结构化结果包含 `importantMessages`；团队模式还保存 `eventLedgerJson`、`summaryAuditJson`、`importanceAuditJson` 和证据关联，供前端质量详情展示。

## 主要接口

| 功能 | 接口 |
| :--- | :--- |
| 导入预检 | `POST /api/imports/validate` |
| 确认导入 | `POST /api/imports/{importId}/confirm` |
| 会话列表/详情 | `GET /api/sessions`、`GET /api/sessions/{id}` |
| 会话组织/黄金摘要 | `GET /api/sessions/{id}/organization`、`GET /api/sessions/{id}/golden-summary` |
| 删除会话 | `DELETE /api/sessions/{id}` |
| 启动分析 | `POST /api/sessions/{id}/runs`，body 为 `{"mode":"agent-workflow"}` 或 `{"mode":"single-model"}` |
| 运行状态/历史 | `GET /api/runs/{runId}`、`GET /api/sessions/{id}/runs` |
| 摘要结果/历史 | `GET /api/sessions/{id}/summary`、`GET /api/sessions/{id}/summaries` |
| 摘要导出 | `GET /api/summaries/{summaryId}/export?type=markdown\|json` |
| 启动评测 | `POST /api/sessions/{id}/evaluations` |
| 评测历史/导出 | `GET /api/sessions/{id}/evaluations`、`GET /api/sessions/{id}/evaluations/export?format=csv\|json\|markdown` |
| 模型配置 | `GET/POST /api/model-profiles`、`DELETE /api/model-profiles/{profileId}`、`POST /api/model-profiles/test`、`POST /api/model-profiles/models`、`GET /api/model-profiles/{profileId}/api-key` |
| 模型绑定 | `GET/PUT /api/model-profiles/bindings` |

后端无独立健康检查端点；前端连通性探测复用 `GET /api/sessions`（短超时）。

分析接口不接收账户或目标用户字段。组织关系里的 `targetUserId` 仅表示一条图边的目标端点，与个人关注无关。

## 数据与评测约束

- 摘要模型输出结构化摘要；重要消息模型输出可追溯到单条原消息的数组。
- Markdown 渲染器去除装饰性 Unicode 表情，不渲染个人关注字段。
- 摘要评测输入会剥离重要消息，产出准确率、遗漏率、文本相似度与 `llm_score`。
- 重要消息使用独立判分提示词，只产出精确率和召回率。
- 导入样例未提供黄金重要消息时，两项重要消息指标为空值。

## 测试

```powershell
mvn test
```
