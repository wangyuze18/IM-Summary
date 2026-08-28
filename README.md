# 企业 IM 智能摘要平台 (IM-Summary)

面向企业 IM 的双任务分析平台：同时生成结构化智能摘要，并按相关人员抽取原始重要消息。支持双模型并行直出的基础模式，以及共享事实链和双审核闭环的团队模式。

## 项目结构

```
IM-Summary/
├── backend/               # Java 后端（Spring Boot，待开发）
├── frontend/              # 桌面端前端（技术栈不限，待开发）
├── docs/
│   ├── design/            # 前后端最终设计文档
│   ├── prompt-strategy/   # 团队工作流 Prompt 设计策略 + 单模型基线
│   ├── evaluation/        # 评测方案与质量验收标准
│   └── data-spec/         # 数据规范（待补充）
├── prompts/               # 各 Agent 的 Prompt 模板文件（待落地）
├── CONTRIBUTING.md        # GitHub 开发提交规范
└── README.md
```

## 核心架构

- **双分析模式**：
  - `agent-workflow`：团队模式（事件/状态事实链 → 摘要与重要消息并行 → 双 Auditor 并行 → 定向修订）
  - `single-model`：基础模式（摘要模型与重要消息模型并行直出），作为 baseline
- **事实主线**: Event Ledger（消息证据驱动）
- **个性化主线**: User Context Card（画像/关系驱动）
- **双审核闭环**: Factual + Personalization Auditor → 定向修订
- **模型可配置**: 支持 OpenAI 兼容 / Anthropic / 自定义协议，前端配置 + 状态检测

## 技术栈

- **后端**: Java（Spring Boot 3.x + JDK 17+）
- **前端**: 不限制（Electron/Tauri + Web 框架，或纯 Web）

## 设计文档索引

| 文档 | 说明 |
|------|------|
| `docs/design/后端设计文档_V5_最终版.md` | Web 后台架构、模型配置、双模式、评测 |
| `docs/design/前端设计文档_V4_最终版.md` | 桌面端界面、模式切换、模型设置、评测历史 |
| `docs/prompt-strategy/00_Prompt设计总纲.md` | 团队工作流 Prompt 设计原则与模板 |
| `docs/prompt-strategy/02_单模型基础模式Prompt.md` | 基线模式 Prompt（含参考实现） |
| `docs/prompt-strategy/03_Markdown渲染规范.md` | 摘要 JSON → Markdown 渲染标准 |
| `docs/evaluation/01_评测方案.md` | 质量指标、评测流程、人工对比与导出 |

## 版本

- V0.2 设计文档定稿 + 开发规范（2026-08-26）
- V0.1 初始化（2026-08-26）
