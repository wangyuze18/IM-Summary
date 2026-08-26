# 前端 (frontend) — TypeScript + Electron

企业 IM 智能摘要平台桌面端应用。

## 技术栈（确定）

- **桌面框架**: Electron
- **语言**: TypeScript
- **渲染框架**: React 或 Vue（开发启动时二选一确定）
- **构建工具**: Vite + electron-vite（或 electron-forge）
- **进程间通信**: Electron IPC（主进程 ↔ 渲染进程）
- **实时通信**: WebSocket 客户端（订阅后端 Agent 进度）
- **Markdown 渲染**: react-markdown / markdown-it（含表格、任务列表支持）

## 架构说明

```
Electron 主进程 (main)
├─ 窗口管理、系统文件选择器、拖拽、本地文件读取
├─ 文件上传至 Web 后台
└─ 应用级配置缓存（非敏感）

渲染进程 (renderer) — TypeScript + React/Vue
├─ components/       # WindowHeader / Sidebar / Workspace / SettingsDialog
├─ panels/           # AgentWorkflow / RawConversation / Summary / Evaluation
├─ services/         # HTTP/WebSocket API 客户端
├─ stores/           # 状态管理
└─ assets/           # Agent 形象素材等
```

## 开发要求

- 桌面宽屏工作台布局（1440×900 基准，1280 最低）
- 系统文件选择器 + 拖拽导入（通过主进程原生对话框），支持多选批量导入
- WebSocket 订阅 Agent 进度，断线重连后通过 HTTP 兜底恢复
- API Key 不落地渲染进程明文存储，仅掩码展示

## 关键界面约束

1. 分析模式切换器（Agent 团队 / 单模型基础）
2. 模型设置支持协议选择（OpenAI 兼容/Anthropic/自定义）+ 连接状态 + 思考模式状态
3. 评测历史列表（按模式筛选）+ 导出（CSV/JSON/Markdown），无自动对比组件
4. 黄金摘要仅来自导入文件携带；未携带时黄金摘要区与评测区整体隐藏
5. 摘要 Markdown 渲染遵循 `docs/prompt-strategy/03_Markdown渲染规范.md`

## 设计依据

详见 `docs/design/前端设计文档_V4_最终版.md`

> 当前阶段仅建立目录，暂不进行代码开发。
