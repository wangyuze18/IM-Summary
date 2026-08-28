// 前端数据视图契约 —— 对齐 docs/design/前端设计文档_V4_最终版.md 第 14 节
// 字段命名与后端 WorkspaceView / EvaluationRecord / ModelApiSettingsView 保持一致

export type AnalysisMode = 'agent-workflow' | 'single-model'

export type SessionStatus = 'pending' | 'analyzing' | 'completed' | 'failed'

export interface ConversationSession {
  sessionId: string
  groupName: string
  importedAt: string
  messageCount: number
  memberCount: number
  timeRange: string
  status: SessionStatus
  /** 黄金摘要仅来自导入文件携带，无手动补充入口 */
  hasGoldenSummary: boolean
}

export interface ChatMessage {
  messageId: string
  senderId: string
  senderName: string
  senderRole: string
  sentAt: string
  content: string
  mentions: string[]
}

export type RoleCategory = '产品' | '研发' | '测试' | '其他'

export interface UserProfile {
  userId: string
  name: string
  role: string
  employeeId: string
  roleCategory: RoleCategory
}

export interface OrganizationRelation {
  fromUserId: string
  toUserId: string
  /** 关系名称（如“上下级”），统一实线展示并标注在连线上 */
  label: string
  /** 关系作用域（可选），悬停展示 */
  scope?: string
}

export type AgentKey =
  | 'context-event'
  | 'state'
  | 'summary'
  | 'importance-extractor'
  | 'importance-auditor'
  | 'factual-auditor'
  // 以下两键非团队工作流步骤，仅参与基础模式与评测模型绑定
  | 'single-model'
  | 'evaluation-judge'

export type AgentStatus = 'waiting' | 'running' | 'completed' | 'warning' | 'failed' | 'revising'

export interface AgentStepProgress {
  agentKey: AgentKey
  status: AgentStatus
  elapsedMs?: number
  warnings: string[]
  error?: string
}

export interface AgentRun {
  runId: string
  mode: AnalysisMode
  startedAt: number
  elapsedSeconds: number
  /** 0-100，来自后端 overallProgress，前端不自行推算。 */
  overallProgress: number
}

export interface EvidenceLink {
  summaryPoint: string
  messageIds: string[]
}

export interface WorkflowEvent {
  eventId: string
  content: string
  state?: string
  evidenceMessageIds: string[]
}

export interface AuditIssue {
  type: string
  severity: 'error' | 'warning' | string
  description: string
  fieldPath?: string
  messageId?: string
  eventId?: string
  suggestion?: string
}

export interface AuditReport {
  passed: boolean
  issues: AuditIssue[]
}

export interface SummaryResult {
  summaryId: string
  runId: string
  mode: AnalysisMode
  version: number
  markdown: string
  generatedAt: string
  evidenceLinks: EvidenceLink[]
  /** 基础模式为 not_audited；团队模式为 passed / warning */
  auditStatus: string
  /** 团队模式的可追溯中间产物，基础模式为空 */
  eventLedger: WorkflowEvent[]
  summaryAudit: AuditReport | null
  importanceAudit: AuditReport | null
}

export interface GoldenSummary {
  goldenVersion: number
  markdown: string
}

export interface EvaluationMetrics {
  accuracy: number
  keyInformationOmissionRate: number
  rougeL: number
  /** 判分模型综合质量评分（0-100，越高越好）；旧评测记录可能缺失 */
  llmScore?: number
  importantMessagePrecision?: number | null
  importantMessageRecall?: number | null
  importantMessagesEvaluable?: boolean
}

export interface EvaluationRecord {
  evaluationId: string
  mode: AnalysisMode
  summaryVersion: number
  goldenVersion: number
  metrics: EvaluationMetrics
  evaluatedAt: string
  outdated: boolean
}

export type ProviderType = 'openai-compatible' | 'anthropic' | 'custom'

export type ConnectionStatus = 'untested' | 'testing' | 'available' | 'failed'

export interface ModelProfile {
  profileId: string
  displayName: string
  providerType: ProviderType
  baseUrl: string
  /** 仅编辑草稿中存在，保存后清除，只保留 apiKeyMasked */
  apiKey?: string
  apiKeyMasked?: string
  modelName: string
  connectionStatus: ConnectionStatus
  thinkingModeSupported: boolean | null
  thinkingModeEnabled: boolean
  lastTestedAt?: string
  lastError?: string
}

export interface AgentModelBinding {
  agentKey: AgentKey
  /** 为空表示继承默认配置 */
  profileId?: string
}

export interface ImportPreview {
  groupName: string
  messageCount: number
  memberCount: number
  profileCount: number
  relationCount: number
  hasGoldenSummary: boolean
}

export type ImportFileStatus = 'checking' | 'ok' | 'warning' | 'failed'

export interface ImportFileItem {
  id: string
  name: string
  status: ImportFileStatus
  warnings: string[]
  error?: string
  preview?: ImportPreview
  /** 后端预检查返回的导入标识，确认导入时携带（仅后端导入流程） */
  importId?: string
  /** 解析出的黄金摘要 Markdown（仅导入携带场景） */
  goldenMarkdown?: string
  messages?: ChatMessage[]
}
