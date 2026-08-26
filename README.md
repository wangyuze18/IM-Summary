# 企业 IM 智能摘要平台 (IM-Summary)

基于 7-Agent 协同工作流的企业 IM 消息智能摘要与重要消息自动提取系统。

## 项目结构

```
IM-Summary/
├── docs/
│   ├── prompt-strategy/     # 7-Agent Prompt 设计策略
│   ├── data-spec/           # 数据规范与导入格式
│   └── evaluation/          # 评测方案与标注指南
├── prompts/                 # 各 Agent 的 Prompt 模板文件
├── src/                     # 源代码 (后续补充)
└── README.md
```

## 核心架构

- **7-Agent 协同工作流**: Context & Event → State ∥ User Context → Personalized Relevance → Summary → Factual Auditor ∥ Personalization Auditor
- **事实主线**: Event Ledger (消息证据驱动)
- **个性化主线**: User Context Card (画像/关系驱动)
- **双审核闭环**: Factual + Personalization Auditor → 定向修订

## 相关设计文档

- 《企业IM Agent数据与工作流设计规范》
- 《企业IM智能摘要平台_前端设计文档_桌面端最新版》
- 《企业IM智能摘要平台_后端设计文档_Web后台最新版》

## 版本

- V0.1 初始化 (2026-08-26)
