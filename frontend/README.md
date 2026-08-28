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
- 工作简报在摘要小节下展示按角色/人员分组的重要消息。
- 评测区同一行展示六项指标，下方提供历史表格、模式筛选和 CSV/JSON/Markdown 导出。
- 模型设置保留统一入口，并用“可用模型”和“工作分配”两块界面直接表达配置意图。
- 添加模型时，填写服务地址与访问密钥后自动加载模型下拉列表；选择模型后自动识别思考模式能力，再由用户决定是否开启。
- 模型配置保存后立即可用，连接验证在后台完成；慢速兼容接口最长等待 120 秒。
- 分析完成后先展示摘要，有黄金标注时评测在后台继续，完成后自动刷新六项指标与历史。
- 审核未通过会点亮对应回退箭头；审核已通过但留有非阻断问题时显示“有提醒”，不伪装成返工。
- 页面不展示账户个人、目标用户或个人关注项，也不显示解释性状态口号。
- 滚动条默认低对比显示，仅在悬停或聚焦滚动区域时增强可见度。

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
