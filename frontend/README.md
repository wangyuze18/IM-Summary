# IM-Summary Frontend

Electron + React + TypeScript 桌面端，用于导入群聊、配置模型、运行基础/团队模式、查看结构化简报和比较评测历史。

## 开发

```powershell
npm install
npm run dev
```

浏览器渲染预览：

```powershell
npm run preview:renderer
```

生产构建：

```powershell
npm run build
```

## 页面行为

- 业务数据只来自后端 REST API；没有 mock 会话、mock 摘要、mock 评测或离线模拟运行。
- 后端不可达时显示连接提示，导入、分析、评测及模型写操作不会伪造成功。
- 基础模式展示同一行的“摘要生成”和“重要消息”机器人，两项并行运行。
- 团队模式使用紧凑的双轨编辑台：共同理解后分入摘要与重要消息泳道，每条泳道独立完成生成、审核和定向返工，再汇入工作简报。
- 两种模式素材统一使用 ACL 论文主图衍生的机器人 sprite。
- 生成结果在 Markdown 末尾以“重要消息”三级标题展示，并按说话人本名分组；条目只展示原文与重要原因。
- 导入预览会分别提示黄金摘要是否携带，以及黄金重要消息是否标注和标注条数。
- 评测历史会在当前筛选范围内加粗各指标最优值；遗漏率取最低值，其余指标取最高值，并列最优同时加粗。
- 1600px 与 2200px 以上宽屏会逐级放大工作流画布，主要区域尺寸与间距通过流式规则连续适配。
- 评测区同一行展示六项指标，下方提供历史表格、模式筛选和 CSV/JSON/Markdown 导出。
- 模型设置保留统一入口，并用“可用模型”和“工作分配”两块界面直接表达配置意图。
- 添加模型时，填写服务地址与访问密钥后只请求一次模型目录；目录成功即确认服务和凭据可访问，并同步识别各模型的思考能力，用户可直接选择是否开启。
- 完整生成验证只在用户主动点击“验证连接”时执行，自动选择模型不再串行等待第二次生成请求。
- OpenAI-compatible 服务可填根地址或完整 `/v1` 地址；根地址的模型列表和对话路径不兼容时，网关自动回退到 `/v1`。
- 分析完成后先展示摘要，有黄金标注时评测在后台继续；评测区用轻量状态点和细进度线反馈运行状态，完成后直接更新六项指标与历史。
- 审核未通过会点亮对应回退箭头；审核已通过但留有非阻断问题时显示“有提醒”，不伪装成返工。
- 页面不展示账户个人、目标用户或个人关注项，也不显示解释性状态口号。
- 所有视觉滚动条保持隐藏，滚轮、触控板、键盘和横向滚动能力不受影响。

## 关键目录

```text
src/renderer/src/
├─ App.tsx                         全局数据与运行状态
├─ agentDefinitions.ts            团队角色视觉定义
├─ assets/acl-robot-agents-sprite.png
├─ api/                            REST 类型、映射与服务
├─ components/
│  ├─ AgentWorkflowPanel.tsx       团队模式动画流程
│  ├─ SingleModelProgressPanel.tsx 基础模式并行动画
│  ├─ SummaryComparisonPanel.tsx   生成结果、黄金结果、质量详情
│  ├─ EvaluationPanel.tsx          六指标与历史表格
│  └─ LocalModelSettingsDialog.tsx 模型与 Agent 绑定
└─ styles.css
```

后端地址默认 `http://localhost:8080`，可通过 `VITE_API_BASE_URL` 覆盖。
