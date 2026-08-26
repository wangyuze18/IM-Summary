# 前端 (frontend) — TypeScript + Electron

企业 IM 智能摘要平台桌面端应用。

## 技术栈（确定）

- **桌面框架**: Electron
- **语言**: TypeScript
- **渲染框架**: React（开发启动时二选一，已确定为 React）
- **构建工具**: Vite + electron-vite
- **进程间通信**: Electron IPC（主进程 ↔ 渲染进程）
- **实时通信**: WebSocket 客户端（订阅后端 Agent 进度，待接入）
- **Markdown 渲染**: react-markdown + remark-gfm（含表格、任务列表支持）

## 快速开始

```bash
cd frontend
npm install
npm run dev        # 启动 Electron 桌面窗口（开发模式，热更新）
npm run build      # 类型检查 + 构建产物到 out/
npm run preview:renderer  # 构建后以 http://localhost:5173 预览渲染层（无需启动 Electron）
```

## 架构说明

```
src/
├─ main/index.ts        # Electron 主进程：窗口管理、系统文件选择器（多选批量导入）、本地文件读取
├─ preload/index.ts     # contextBridge 暴露最小文件能力（contextIsolation 开启）
├─ shared/types.ts      # 前端数据视图契约（对齐设计文档 §14）
└─ renderer/src/
   ├─ App.tsx                        # DesktopAppShell：全局状态与 Run 模拟
   ├─ mockData.ts                    # 原型 Mock 数据（未接后端）
   ├─ download.ts                    # 导出工具（Blob 下载）
   └─ components/                    # 组件命名对齐设计文档 §15
      ├─ WindowHeader.tsx
      ├─ OfflineSessionSidebar.tsx   # NativeFileImportButton / FileDropZone / SessionSearch / LocalSessionList
      ├─ AnalysisModeSwitcher.tsx    # 模式切换器（Agent 团队 / 单模型基础）
      ├─ AgentWorkflowPanel.tsx      # 7-Agent 工作流（两组并行）+ ElapsedTime
      ├─ SingleModelProgressPanel.tsx
      ├─ RawConversationPanel.tsx    # 原始群聊（证据高亮定位、@提及联动）
      ├─ SummaryComparisonPanel.tsx  # FinalSummaryViewer（模式徽标/版本切换/复制/导出）+ GoldenSummaryViewer
      ├─ EvaluationPanel.tsx         # MetricsCards / EvaluationHistoryList（筛选）/ EvaluationExportButton
      ├─ CompactContextSidebar.tsx   # GroupOverviewCard / CompactOrganizationGraphCard
      ├─ LocalModelSettingsDialog.tsx# ApiProfileEditor / ConnectionTest / ThinkingModeToggle / AgentModelBinding
      └─ ImportPreviewDialog.tsx     # 批量导入逐文件校验状态 + 预览
examples/
└─ sample-session.json  # 导入功能演示文件（携带黄金摘要）
```

## 当前阶段说明

- **可交互原型**：不连接 Web 后台；Run 执行进度、评测指标、模型连接探测均为前端本地模拟，数据契约与《前端设计文档 V4.1》§14 保持一致，便于后续平滑替换为 HTTP/WebSocket 真实数据源。
- 黄金摘要仅来自导入文件 `goldenSummary` 字段；未携带时黄金摘要区与评测区整体隐藏。
- 模型配置持久化在 `localStorage`（原型），API Key 仅掩码展示，正式环境由后端保管凭据。
- 评测导出（CSV/JSON/Markdown）当前为前端本地导出，正式环境走后端导出接口。

## 开发要求

- 桌面宽屏工作台布局（1440×900 基准，1280 最低；低于阈值右侧辅助区折叠）
- 系统文件选择器 + 拖拽导入（通过主进程原生对话框），支持多选批量导入
- WebSocket 订阅 Agent 进度，断线重连后通过 HTTP 兜底恢复（待接入）
- API Key 不落地渲染进程明文存储，仅掩码展示

## 设计依据

详见 `docs/design/前端设计文档_V4_最终版.md`
