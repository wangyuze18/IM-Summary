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
   ├─ App.tsx                        # DesktopAppShell：全局状态与双数据源接入（在线 REST / 离线 mock）
   ├─ api/                           # 请求层：httpClient（传输）/ services（端点）/ mappers（契约转换）/ useRequest（状态）
   ├─ mockData.ts                    # 原型 Mock 数据（离线回退数据源）
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

- **双数据源**：启动时探测后端（默认 `http://localhost:8080`，可用环境变量 `VITE_API_BASE_URL` 覆盖）；在线时会话、摘要、评测历史、模型配置均来自 REST API，导入走后端预检查 + 确认，Run 进度通过轮询 `GET /api/runs/{runId}` 获取；后端不可达时静默回退本地 mock，原型行为不变。
- **请求错误处理**：后端统一错误体 `{ errorCode, message }` 解析为 `ApiError`，网络/超时/解析失败分类处理，错误经界面 Toast 提示。
- 黄金摘要仅来自导入文件 `goldenSummary` 字段；未携带时黄金摘要区与评测区整体隐藏。
- 模型配置：在线时以后端为准（凭据由后端加密保管，响应仅含掩码）；离线原型持久化在 `localStorage`。
- 评测/摘要导出：界面按钮当前仍为前端本地导出，请求层已提供后端导出接口客户端（`downloadSummary` / `downloadEvaluationExport`），待后续界面接入。

## 开发要求

- 桌面宽屏工作台布局（1440×900 基准，1280 最低；低于阈值右侧辅助区折叠）
- 系统文件选择器 + 拖拽导入（通过主进程原生对话框），支持多选批量导入
- Run 进度当前采用 REST 轮询（WebSocket 的 HTTP 兜底通道）；WebSocket 订阅待接入，断线重连后可恢复
- API Key 不落地渲染进程明文存储，仅掩码展示

## 设计依据

详见 `docs/design/前端设计文档_V4_最终版.md`
