// 原型 Mock 数据 —— 仅用于无后端的可交互演示，正式环境由 Web 后台提供
import type {
  AgentKey,
  ChatMessage,
  ConversationSession,
  EvaluationRecord,
  GoldenSummary,
  OrganizationRelation,
  SummaryResult,
  UserProfile
} from '../../shared/types'

export type MascotProp = 'search' | 'check' | 'book' | 'star' | 'pencil' | 'shield' | 'heart'

export interface AgentDef {
  key: AgentKey
  name: string
  short: string
  /** 吉祥物主色 / 高光色 / 暗部色（径向渐变 3D 感） */
  color: string
  light: string
  dark: string
  /** 手持道具 */
  prop: MascotProp
}

export const AGENT_DEFS: AgentDef[] = [
  { key: 'context-event', name: 'Context & Event Agent', short: '主题与事件抽取', color: '#5b8def', light: '#93b5f6', dark: '#3a63c4', prop: 'search' },
  { key: 'state', name: 'State Agent', short: '决议/待办/状态判断', color: '#3dbb7d', light: '#7ad7a8', dark: '#2a8f5c', prop: 'check' },
  { key: 'user-context', name: 'User Context Agent', short: '职位/职责/关系上下文', color: '#8f6fd8', light: '#b8a0ea', dark: '#6a4cb0', prop: 'book' },
  { key: 'personalized-relevance', name: 'Personalized Relevance Agent', short: '用户相关性与重要性', color: '#e8934a', light: '#f3ba84', dark: '#c06f2a', prop: 'star' },
  { key: 'summary', name: 'Summary Agent', short: '结构化摘要生成', color: '#4aa8e8', light: '#83c9f3', dark: '#2f7fbb', prop: 'pencil' },
  { key: 'factual-auditor', name: 'Factual Auditor', short: '事实/遗漏/状态审核', color: '#e86a92', light: '#f39bb8', dark: '#c04468', prop: 'shield' },
  { key: 'personalization-auditor', name: 'Personalization Auditor', short: '个性化合理性审核', color: '#42b8a6', light: '#79d4c4', dark: '#2a8a7b', prop: 'heart' }
]

export const MOCK_SESSIONS: ConversationSession[] = [
  {
    sessionId: 's-001',
    groupName: '产品规划讨论群',
    importedAt: '2025-06-12 09:32',
    messageCount: 128,
    memberCount: 8,
    timeRange: '2025-06-12 09:00 ~ 11:32',
    status: 'completed',
    hasGoldenSummary: true
  },
  {
    sessionId: 's-002',
    groupName: '季度经营复盘会议',
    importedAt: '2025-06-10 16:45',
    messageCount: 96,
    memberCount: 6,
    timeRange: '2025-06-10 14:00 ~ 16:30',
    status: 'pending',
    hasGoldenSummary: false
  },
  {
    sessionId: 's-003',
    groupName: '研发需求评审群',
    importedAt: '2025-06-08 11:23',
    messageCount: 84,
    memberCount: 7,
    timeRange: '2025-06-08 09:30 ~ 11:20',
    status: 'pending',
    hasGoldenSummary: false
  },
  {
    sessionId: 's-004',
    groupName: '市场活动讨论',
    importedAt: '2025-06-05 14:02',
    messageCount: 62,
    memberCount: 5,
    timeRange: '2025-06-05 13:00 ~ 14:00',
    status: 'failed',
    hasGoldenSummary: false
  },
  {
    sessionId: 's-005',
    groupName: '技术方案讨论群',
    importedAt: '2025-06-03 10:15',
    messageCount: 73,
    memberCount: 6,
    timeRange: '2025-06-03 09:00 ~ 10:10',
    status: 'pending',
    hasGoldenSummary: false
  }
]

export const MOCK_MEMBERS: UserProfile[] = [
  { userId: 'u-zhangsan', name: '张三', role: '产品经理', employeeId: '10088', roleCategory: '产品', isTargetUser: true },
  { userId: 'u-lisi', name: '李四', role: '研发负责人', employeeId: '10021', roleCategory: '研发' },
  { userId: 'u-wangwu', name: '王五', role: '后端开发', employeeId: '10035', roleCategory: '研发' },
  { userId: 'u-zhaoliu', name: '赵六', role: '测试负责人', employeeId: '10052', roleCategory: '测试' },
  { userId: 'u-sunqi', name: '孙七', role: '测试工程师', employeeId: '10077', roleCategory: '测试' },
  { userId: 'u-chenba', name: '陈八', role: '前端开发', employeeId: '10018', roleCategory: '研发' },
  { userId: 'u-zhoujiu', name: '周九', role: '产品助理', employeeId: '10093', roleCategory: '产品' },
  { userId: 'u-wushi', name: '吴十', role: 'UI设计师', employeeId: '10104', roleCategory: '其他' }
]

export const MOCK_RELATIONS: OrganizationRelation[] = [
  { fromUserId: 'u-lisi', toUserId: 'u-zhangsan', line: 'solid' },
  { fromUserId: 'u-zhangsan', toUserId: 'u-wangwu', line: 'solid' },
  { fromUserId: 'u-zhangsan', toUserId: 'u-zhaoliu', line: 'solid' },
  { fromUserId: 'u-zhangsan', toUserId: 'u-chenba', line: 'dashed' },
  { fromUserId: 'u-zhangsan', toUserId: 'u-sunqi', line: 'dashed' },
  { fromUserId: 'u-zhoujiu', toUserId: 'u-zhangsan', line: 'solid' },
  { fromUserId: 'u-lisi', toUserId: 'u-wangwu', line: 'solid' },
  { fromUserId: 'u-lisi', toUserId: 'u-chenba', line: 'solid' },
  { fromUserId: 'u-zhaoliu', toUserId: 'u-sunqi', line: 'solid' },
  { fromUserId: 'u-wangwu', toUserId: 'u-chenba', line: 'dashed' }
]

export const MOCK_MESSAGES: ChatMessage[] = [
  { messageId: 'm-0905', senderId: 'u-zhangsan', senderName: '张三', senderRole: '产品经理', sentAt: '09:05', content: '大家看一下新版本的功能清单，优先级我们今天确认下。', mentions: [] },
  { messageId: 'm-0906', senderId: 'u-lisi', senderName: '李四', senderRole: '研发负责人', sentAt: '09:06', content: '@王五 后端接口排期没问题的话，我们可以提前一周联调。', mentions: ['u-wangwu'] },
  { messageId: 'm-0907', senderId: 'u-wangwu', senderName: '王五', senderRole: '后端开发', sentAt: '09:07', content: '目前评估需要 3 天开发 + 2 天测试，预计下周三完成。', mentions: [] },
  { messageId: 'm-0908', senderId: 'u-zhaoliu', senderName: '赵六', senderRole: '测试负责人', sentAt: '09:08', content: '测试用例我这边同步准备，需要产品今天给到明确的验收标准。', mentions: [] },
  { messageId: 'm-0912', senderId: 'u-zhangsan', senderName: '张三', senderRole: '产品经理', sentAt: '09:12', content: '好的，我下午整理一下验收标准文档发群里。', mentions: [] },
  { messageId: 'm-0918', senderId: 'u-chenba', senderName: '陈八', senderRole: '前端开发', sentAt: '09:18', content: '前端页面结构这周能出初稿，等接口定义确认后联调。', mentions: [] },
  { messageId: 'm-0924', senderId: 'u-lisi', senderName: '李四', senderRole: '研发负责人', sentAt: '09:24', content: '决议一下：核心功能 A、B 优先进迭代，功能 C 延后到下版本。', mentions: [] },
  { messageId: 'm-0931', senderId: 'u-zhangsan', senderName: '张三', senderRole: '产品经理', sentAt: '09:31', content: '同意。功能 C 依赖的数据口径还没对齐，先不排期。', mentions: [] },
  { messageId: 'm-0940', senderId: 'u-sunqi', senderName: '孙七', senderRole: '测试工程师', sentAt: '09:40', content: '@张三 上次提到的兼容性测试环境，麻烦帮忙确认下申请进度。', mentions: ['u-zhangsan'] },
  { messageId: 'm-0952', senderId: 'u-zhangsan', senderName: '张三', senderRole: '产品经理', sentAt: '09:52', content: '环境申请昨天已提交 IT 审批，预计明天有结果，有进展我同步你。', mentions: [] },
  { messageId: 'm-1015', senderId: 'u-wangwu', senderName: '王五', senderRole: '后端开发', sentAt: '10:15', content: '补充一个风险：消息历史迁移如果数据量超预期，联调时间可能要顺延 1 天。', mentions: [] },
  { messageId: 'm-1022', senderId: 'u-zhaoliu', senderName: '赵六', senderRole: '测试负责人', sentAt: '10:22', content: '那测试侧把回归窗口预留出缓冲，按周四完成来兜底。', mentions: [] }
]

const AGENT_SUMMARY_MD = `# 工作群聊分析简报
**群组名称:** 产品规划讨论群
**报告周期:** 2025-06-12 09:00 ~ 11:32
**分析模式:** Agent 团队模式

---

### 摘要
* 确定新版本功能清单及优先级，重点推进核心功能 A、B。
* 后端接口预计"下周三"完成开发与联调，测试按周四兜底。
* 功能 C 因数据口径未对齐，决议延后至下一版本。

---

### ❗ 决议事项
* **决议1:** 新版本功能优先级确认
  * **背景/上下文:** 迭代容量有限，需聚焦核心价值
  * **状态:** 已确认，核心功能 A、B 优先进迭代
* **决议2:** 功能 C 延后
  * **背景/上下文:** 依赖的数据口径尚未对齐
  * **状态:** 延至下一版本，暂不排期

---

### 📋 待办事项

| 优先级 | 任务内容 | 负责人 | 截止日期 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| 高 | 整理并发布新版本验收标准文档 | 张三（产品） | 今天下午 | 进行中 |
| 高 | 后端接口开发与联调 | 王五（研发） | 下周三 | 未开始 |
| 中 | 准备测试用例并预留回归缓冲 | 赵六（测试） | 下周四 | 进行中 |
| 中 | 前端页面结构初稿 | 陈八（研发） | 本周 | 进行中 |

---

### 💬 主要议题讨论
**议题 1: 新版本功能优先级**
* **时间段:** 09:05 ~ 09:31
* **主要参与者:** 张三、李四、王五
* **过程概述:** 产品提出功能清单，研发评估排期后共同确认取舍
* **核心结论:** 核心功能 A、B 优先，功能 C 延后

**议题 2: 联调排期与风险**
* **时间段:** 09:06 ~ 10:22
* **主要参与者:** 李四、王五、赵六
* **过程概述:** 后端给出 3+2 天排期，提出消息历史迁移风险
* **核心结论:** 下周三完成联调，测试预留缓冲按周四兜底

---

### ❓ 待解决问题与关键信息
* **待解决问题:**
  1. 功能 C 依赖的数据口径尚未对齐，需另行拉会确认
  2. 消息历史迁移数据量存在超预期风险，可能顺延联调 1 天
* **关键信息/文件:**
  1. 验收标准文档（张三下午发群）
  2. 兼容性测试环境申请（IT 审批中，预计明天出结果）

---

### 🎯 与你的相关重点
* **【高】今天下午前需发布验收标准文档**
  * **相关原因:** 你是产品负责人，测试用例准备依赖该文档
* **【中】兼容性测试环境申请需跟进审批结果**
  * **相关原因:** 孙七 @ 你确认进度，预计明天出结果`

const SINGLE_SUMMARY_MD = `# 工作群聊分析简报
**群组名称:** 产品规划讨论群
**报告周期:** 2025-06-12 09:00 ~ 11:32
**分析模式:** 单模型基础模式

---

### 摘要
* 群内确认了新版本功能优先级，核心功能 A、B 先做。
* 后端接口下周三完成，测试周四兜底。
* 功能 C 延后到下个版本。

---

### ❗ 决议事项
* **决议1:** 功能优先级确认
  * **状态:** 核心功能 A、B 优先

---

### 📋 待办事项

| 优先级 | 任务内容 | 负责人 | 截止日期 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| 高 | 整理验收标准文档 | 张三 | 今天 | 进行中 |
| 高 | 后端接口开发 | 王五 | 下周三 | 未开始 |
| 中 | 准备测试用例 | 赵六 | 待明确 | 进行中 |

---

### 💬 主要议题讨论
**议题 1: 功能优先级与排期**
* **时间段:** 09:05 ~ 10:22
* **主要参与者:** 张三、李四、王五、赵六
* **过程概述:** 围绕新版本功能清单讨论优先级和开发排期
* **核心结论:** 核心功能优先，下周三联调

---

### ❓ 待解决问题与关键信息
* **待解决问题:**
  1. 功能 C 数据口径未对齐
* **关键信息/文件:**
  1. 验收标准文档待发布

---

### 🎯 与你的相关重点
* **【高】验收标准文档需今天发布**
  * **相关原因:** 你是该任务负责人`

export const MOCK_GOLDEN: GoldenSummary = {
  goldenVersion: 1,
  markdown: `# 工作群聊分析简报（黄金摘要）
**群组名称:** 产品规划讨论群
**报告周期:** 2025-06-12 09:00 ~ 11:32

---

### 摘要
* 会议确认新版本功能清单与优先级：核心功能 A、B 进入本迭代，功能 C 延后。
* 后端接口排期 3 天开发 + 2 天测试，下周三完成联调，测试按周四兜底。
* 识别消息历史迁移数据量风险，可能顺延联调 1 天。

---

### 📋 待办事项

| 优先级 | 任务内容 | 负责人 | 截止日期 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| 高 | 整理并发布验收标准文档 | 张三 | 2025-06-12 下午 | 进行中 |
| 高 | 后端接口开发与联调 | 王五 | 下周三 | 未开始 |
| 中 | 测试用例准备与回归缓冲 | 赵六 | 下周四 | 进行中 |
| 中 | 兼容性测试环境申请跟进 | 张三 | 明天 | 进行中 |`
}

export function buildMockSummaries(mode: 'agent-workflow' | 'single-model', version: number): SummaryResult {
  const isAgent = mode === 'agent-workflow'
  return {
    summaryId: `sum-${mode}-v${version}`,
    runId: `run-${Date.now()}`,
    mode,
    version,
    markdown: isAgent ? AGENT_SUMMARY_MD : SINGLE_SUMMARY_MD,
    generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    evidenceLinks: isAgent
      ? [
          { summaryPoint: '功能优先级决议', messageIds: ['m-0924', 'm-0931'] },
          { summaryPoint: '后端排期结论', messageIds: ['m-0906', 'm-0907'] },
          { summaryPoint: '验收标准待办', messageIds: ['m-0908', 'm-0912'] },
          { summaryPoint: '迁移风险提示', messageIds: ['m-1015', 'm-1022'] }
        ]
      : []
  }
}

export const MOCK_EVALUATION_HISTORY: EvaluationRecord[] = [
  {
    evaluationId: 'ev-001',
    mode: 'agent-workflow',
    summaryVersion: 1,
    goldenVersion: 1,
    metrics: { accuracy: 0.92, recall: 0.88, keyInformationOmissionRate: 0.07, rougeL: 0.81 },
    evaluatedAt: '2025-06-12 12:05',
    outdated: true
  },
  {
    evaluationId: 'ev-002',
    mode: 'agent-workflow',
    summaryVersion: 2,
    goldenVersion: 1,
    metrics: { accuracy: 0.95, recall: 0.91, keyInformationOmissionRate: 0.04, rougeL: 0.85 },
    evaluatedAt: '2025-06-12 14:20',
    outdated: false
  },
  {
    evaluationId: 'ev-003',
    mode: 'single-model',
    summaryVersion: 3,
    goldenVersion: 1,
    metrics: { accuracy: 0.78, recall: 0.7, keyInformationOmissionRate: 0.18, rougeL: 0.66 },
    evaluatedAt: '2025-06-12 14:35',
    outdated: false
  }
]
