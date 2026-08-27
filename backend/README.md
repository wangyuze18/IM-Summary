# 后端 (backend) — Java / Spring Boot

企业 IM 智能摘要平台 Web 后台服务（Demo 级，不考虑高并发）。

## 技术栈

- **Java 17 + Spring Boot 3.3**
- **Spring Data JPA + H2**（文件模式持久化，数据位于 `backend/data/`）
- **Spring WebSocket (STOMP)**：Agent 进度推送，HTTP 查询兜底
- **Model Gateway**：协议适配器（openai-compatible / anthropic / custom），统一超时/重试/错误标准化
- **凭据安全**：API Key AES-GCM 加密存储，接口仅返回掩码

## 快速开始

```bash
cd backend
mvn spring-boot:run        # 启动 http://localhost:8080
mvn compile                # 仅编译验证
mvn package                # 打包为 target/im-summary-backend-*.jar
```

## 模块结构

```
backend/src/main/java/com/imsummary/
├── api/              # REST Controller（imports/sessions/runs/summaries/evaluations/model-profiles）
├── agent/            # AgentOrchestrator（8-Agent 双任务 DAG + 单模型双任务基线）、PromptTemplates
├── gateway/          # ModelGateway + 协议适配器（OpenAI兼容/Anthropic/Custom）
├── service/          # Import / Session / Analysis / Evaluation / ModelProfile / MarkdownRenderer
├── domain/           # JPA 实体（会话、运行、摘要/重要消息、黄金标注、评测记录、模型配置）
├── repository/       # Spring Data JPA
├── security/         # CredentialStore（凭据加密）
└── config/           # WebSocket 配置、全局异常映射
```

## 关键 API

| 能力 | 接口 |
|------|------|
| 导入预检查 | `POST /api/imports/validate`（multipart） |
| 确认导入 | `POST /api/imports/{importId}/confirm` |
| 会话列表/详情 | `GET /api/sessions` / `GET /api/sessions/{id}` |
| 组织关系 | `GET /api/sessions/{id}/organization` |
| 启动分析 | `POST /api/sessions/{id}/runs`（body: `{"mode":"agent-workflow\|single-model","targetUserId":"?"}`） |
| 运行状态 | `GET /api/runs/{runId}`（HTTP 兜底） |
| 进度订阅 | STOMP `/topic/runs/{runId}`（endpoint `/ws`） |
| 摘要/导出 | `GET /api/sessions/{id}/summary`、`GET /api/summaries/{id}/export?type=markdown\|json` |
| 黄金摘要 | 仅随导入携带，无手动接口；未携带时评测返回 `409 NOT_EVALUABLE` |
| 评测 | `POST /api/sessions/{id}/evaluations`、`GET .../evaluations`、`GET .../evaluations/export?format=csv\|json\|markdown` |
| 模型配置 | `GET/POST/DELETE /api/model-profiles`、`POST /api/model-profiles/test`、`GET/PUT /api/model-profiles/bindings` |

## 设计约束实现说明

- **双分析模式**：`agent-workflow`（8-Agent 双任务 DAG，摘要与重要消息进入 Auditor 闭环）；`single-model`（摘要生成与重要消息直接抽取，不审核，`auditStatus=not_audited`）
- **Run 配置快照**：启动前解析"默认档案 + Agent 覆盖"，无效则阻断；运行中修改配置不影响当前 Run
- **评测**：Accuracy/Recall/遗漏率由判官模型计算，ROUGE-L 本地计算；历史记录含 `mode` 字段，无自动对比
- **评测过期**：新摘要产生后旧评测记录自动标记 `outdated`
- **导入校验分级**：ERROR 阻断 / WARNING 允许 / INFO 提示；messageId 唯一性校验
- 详细契约见 `docs/design/后端设计文档_V5_最终版.md`

## 示例数据

`backend/samples/sample-session.json` 符合导入数据规范（含用户画像、关系与黄金摘要），可用于冒烟测试：

```bash
curl -F "file=@backend/samples/sample-session.json" http://localhost:8080/api/imports/validate
```
