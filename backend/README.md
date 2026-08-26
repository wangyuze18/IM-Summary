# 后端 (backend) — Java

企业 IM 智能摘要平台 Web 后台服务。

## 技术栈（确定）

- **语言**: Java 17+
- **框架**: Spring Boot 3.x
- **实时通信**: Spring WebSocket（Agent 进度推送）
- **持久化**: Spring Data JPA + 嵌入式数据库（Demo 级，如 H2/SQLite）
- **构建工具**: Maven 或 Gradle
- **HTTP 客户端**: 用于调用外部模型 API（Spring WebClient / OkHttp）

## 模块划分（对应设计文档）

```
backend/
└── src/main/java/com/imsummary/
    ├── api/              # REST Controller + WebSocket 端点
    ├── service/          # Session / Analysis / Evaluation / Model 服务
    ├── agent/            # Agent Orchestrator + 7-Agent 执行器 + 单模型运行器
    ├── gateway/          # Model Gateway + 协议 Adapter (OpenAI/Anthropic)
    ├── domain/           # 领域对象与实体
    ├── repository/       # 数据访问
    └── config/           # 配置与安全
```

## 关键实现约束

1. Demo 级别，不考虑高并发与分布式扩展
2. API Key 只存加密/引用，不明文返回
3. AgentRun 状态持久化，支持桌面端断线恢复
4. 双分析模式：`agent-workflow`（7-Agent）与 `single-model`（基线）

## 设计依据

详见 `docs/design/后端设计文档_V5_最终版.md`

> 当前阶段仅建立目录，暂不进行代码开发。
