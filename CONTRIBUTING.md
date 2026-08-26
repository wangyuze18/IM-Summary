# 开发规范与提交约定 (CONTRIBUTING)

本项目为 Demo 级项目，采用 **GitHub Flow 简化版** + **Conventional Commits**，支持多人/多 Agent 并行开发。

---

## 1. 分支模型

| 分支 | 用途 | 规则 |
|------|------|------|
| `main` | 主干，始终保持可运行 | 只接受 PR 合入，不直接 push |
| `feat/*` | 新功能 | 如 `feat/agent-orchestrator` |
| `fix/*` | 缺陷修复 | 如 `fix/import-validation` |
| `docs/*` | 文档 | 如 `docs/prompt-strategy` |
| `refactor/*` | 重构 | 不改变外部行为 |

### 分支命名

```
<type>/<scope>-<short-description>

示例：
feat/backend-model-gateway
feat/frontend-evaluation-history
docs/evaluation-plan-v2
```

---

## 2. 并行开发分工边界

为避免冲突，按目录划分所有权：

| 目录 | 负责范围 |
|------|----------|
| `backend/` | Java 后端（Spring Boot） |
| `frontend/` | 桌面端前端 |
| `docs/` | 设计与规范文档 |
| `prompts/` | Prompt 模板文件 |

**跨目录修改**必须在 PR 描述中说明原因。接口契约变更（API/数据结构）需先改 `docs/` 再动代码。

---

## 3. 提交信息规范 (Conventional Commits)

```
<type>(<scope>): <subject>

[body 可选]

[footer 可选]
```

### type 枚举

| type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档变更 |
| `style` | 格式调整（不影响逻辑） |
| `refactor` | 重构 |
| `test` | 测试相关 |
| `chore` | 构建/依赖/工具链 |
| `perf` | 性能优化 |

### scope 建议值

`backend` / `frontend` / `agent` / `gateway` / `evaluation` / `import` / `model-config` / `prompt` / `docs`

### 示例

```
feat(agent): 实现 State Agent 与 User Context Agent 并行执行
fix(import): 修复 messageId 冲突时未阻断导入的问题
docs(evaluation): 补充双模式人工对比流程说明
feat(frontend): 评测历史列表支持按模式筛选与 CSV 导出
```

### 规则

- subject 使用中文或英文均可，不超过 72 字符，结尾不加句号
- 一次提交只做一件事；大功能拆分为多个原子提交
- 禁止无意义的提交信息（如 "update"、"修改"）

---

## 4. Pull Request 规范

### PR 标题

与提交信息同格式：`<type>(<scope>): <subject>`

### PR 描述模板

```
## 变更说明
（做了什么，为什么）

## 关联设计文档
（对应的 docs/ 文档章节）

## 测试方式
（如何验证）

## 影响范围
（涉及哪些模块/接口）
```

### 合入要求

- 提交前必须完成《提交前自审清单》（见下节）
- 至少 1 人（或 1 个独立 Agent）Review
- 无未解决的阻塞性评论
- 合入方式：**Squash Merge**（保持 main 历史整洁）

---

## 5. 提交前自审清单（强制）

每次提交/提 PR 前，提交者（人或 Agent）必须自行审查所有变更的开发文档与代码，逐项确认：

### 5.1 文档一致性
- [ ] 变更的设计文档之间无矛盾（前后端接口、字段名、状态枚举一致）
- [ ] 新增/变更的能力已同步到所有相关文档（设计文档 + README + 评测方案）
- [ ] 文档版本号与日期已更新；无残留的重复段落、未闭合的代码块、错乱的表格/列表序号

### 5.2 设计合规性
- [ ] 变更符合设计文档核心约束（四类数据边界、事实/个性化双主线、Agent 硬性边界）
- [ ] 模式、评测指标、评测历史行为与评测方案一致（无自动对比；黄金摘要仅导入携带）
- [ ] 模型配置行为符合约束（凭据仅引用、状态检测、Run 快照不可变）

### 5.3 代码与安全
- [ ] API Key/凭据不出现在代码、日志、文档或提交信息中
- [ ] 未提交大文件（数据集、模型文件）
- [ ] 有代码变更时本地构建/编译通过

自审未通过的项目必须先修复再提交；自审结论建议在 PR 描述中简要说明。

---

## 6. 代码与文件约定

### Java 后端
- 遵循 Google Java Style（简化）
- 类名与领域对象命名保持一致（如 `EventLedger`、`SummaryResult`）
- API Key 相关字段禁止出现在日志与 toString 中

### 前端
- 组件命名与《前端设计文档》组件结构保持一致
- 界面文案使用中文

### 文档
- 使用 Markdown
- 设计文档变更需更新版本号与日期

### Prompt 文件
- 存放于 `prompts/` 目录，按 Agent 分目录
- 修改 Prompt 必须同步更新 `docs/prompt-strategy/` 说明
- 提交信息中标注 `scope=prompt`

---

## 7. 禁止事项

1. 禁止向 `main` 直接 push
2. 禁止提交 API Key、密钥或敏感凭据（.gitignore 已覆盖常见格式）
3. 禁止提交大文件（数据集、模型文件），数据由外部提供，不入库
4. 禁止在未更新设计文档的情况下单方面变更接口契约

---

## 8. 版本与标签

- 阶段性成果打 tag：`v0.1`、`v0.2` ...
- tag 命名：`v<major>.<minor>`
- 每个 tag 附 Release Notes，说明该阶段完成的功能
