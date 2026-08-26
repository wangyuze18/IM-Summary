# 前端 (frontend)

企业 IM 智能摘要平台桌面端应用。

## 技术栈

**不限制**。候选方向：

- **Electron / Tauri + React/Vue**：标准桌面壳 + Web 框架，生态成熟
- **纯 Web 应用**：浏览器直接访问后端服务，部署最简单（Demo 推荐）

技术选型在开发启动时确定，需满足：
- 桌面宽屏工作台布局（1440×900 基准，1280 最低）
- 系统文件选择器 + 拖拽导入
- WebSocket 订阅 Agent 进度
- Markdown 渲染（摘要展示）

## 目录规划（技术栈确定后落地）

```
frontend/
├── src/
│   ├── components/       # WindowHeader / Sidebar / Workspace / SettingsDialog
│   ├── panels/           # AgentWorkflow / RawConversation / Summary / Evaluation
│   ├── services/         # HTTP/WebSocket API 客户端
│   ├── stores/           # 状态管理
│   └── assets/           # Agent 形象素材等
└── package.json
```

## 关键界面约束

1. 分析模式切换器（Agent 团队 / 单模型基础）
2. 模型设置支持协议选择（OpenAI 兼容/Anthropic/自定义）+ 连接状态 + 思考模式状态
3. 评测历史列表（按模式筛选）+ 导出（CSV/JSON/Markdown），无自动对比组件
4. 黄金摘要支持导入携带与单独提供两种来源

## 设计依据

详见 `docs/design/前端设计文档_V4_最终版.md`

> 当前阶段仅建立目录，暂不进行代码开发。
