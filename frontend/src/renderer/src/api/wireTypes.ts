// 后端 REST 线路类型（wire types）
// 依据 main 分支后端 Controller/Service 实际返回结构定义：
// - SessionService.toListItem / getSessionDetail / getOrganizationGraph
// - AnalysisService.startRun / getRunStatus / listRuns
// - SummaryController.toView、EvaluationService.toView
// - ModelProfileService.toMaskedView / getBindings、ImportService.validate / confirm
// 与前端视图契约（shared/types.ts）的差异由 mappers.ts 转换

import type { AnalysisMode, EvaluationMetrics, ProviderType } from '../../../shared/types'

// ---------- 会话 ----------

/** GET /api/sessions 列表项 */
export interface SessionListItemView {
  sessionId: string
  title: string
  messageCount: number
  memberCount: number
  goldenProvided: boolean
  /** ISO-8601 时间串 */
  importedAt: string
  hasSummary: boolean
}

/** 导入文件中的原始消息结构（sample-session.json 数据规范） */
export interface RawImportMessage {
  messageId: string
  timestamp?: string
  sender?: string
  content?: string
  [key: string]: unknown
}

/** 导入文件中的成员画像结构 */
export interface RawImportUser {
  userId?: string
  name?: string
  employeeNo?: string
  position?: string
  department?: string
  [key: string]: unknown
}

/** GET /api/sessions/{id} 详情 */
export interface SessionDetailView {
  sessionId: string
  title: string
  group: unknown
  messages: RawImportMessage[] | null
  users: RawImportUser[] | null
  relationships: unknown
  goldenProvided: boolean
  importFileName: string | null
  createdAt: string
}

/** GET /api/sessions/{id}/organization */
export interface OrganizationGraphView {
  nodes: Array<{
    userId: string
    displayName: string
    employeeNo: string | null
    positionCode: string | null
    positionName: string | null
  }>
  edges: Array<{
    sourceUserId: string
    targetUserId: string
    relationType: string
    direction: string
    label: string
    scope: string
  }>
}

/** GET /api/sessions/{id}/golden-summary（V5.4）：未携带时 goldenProvided=false、content 为 null */
export interface GoldenSummaryView {
  goldenProvided: boolean
  goldenVersion: number | null
  content: string | null
}

/** GET /api/model-profiles/{id}/api-key（V5.4）：解密明文，供前端回显编辑 */
export interface ApiKeyView {
  apiKey: string | null
}

// ---------- 运行 ----------

/** 后端 AgentRunEntity.status 枚举 */
export type BackendRunStatus =
  | 'queued'
  | 'running'
  | 'revising'
  | 'completed'
  | 'completed_with_warning'
  | 'failed'
  | 'cancelled'

/** 后端 AgentStepRunEntity.status 枚举 */
export type BackendStepStatus = 'idle' | 'running' | 'revising' | 'success' | 'warning' | 'error'

/** GET /api/runs/{runId} 中的 Agent 步骤 */
export interface AgentStepView {
  /** 后端 Agent key（下划线命名，如 context_event / factual_auditor） */
  agentKey: string
  status: BackendStepStatus
  shortMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  retryable: boolean
}

/** GET /api/runs/{runId} */
export interface RunStatusView {
  runId: string
  sessionId: string
  mode: AnalysisMode
  status: BackendRunStatus
  /** 0-100，编排器计算，前端只展示不自行推算 */
  overallProgress: number
  elapsedMs: number
  revisionNo: number
  errorCode: string | null
  errorMessage: string | null
  agentSteps: AgentStepView[]
}

/** POST /api/sessions/{id}/runs */
export interface StartRunResponse {
  runId: string
  status: BackendRunStatus
  mode: AnalysisMode
}

/** GET /api/sessions/{id}/runs 列表项 */
export interface RunListItemView {
  runId: string
  mode: AnalysisMode
  status: BackendRunStatus
  startedAt: string | null
  finishedAt: string | null
}

// ---------- 摘要 ----------

/** GET /api/sessions/{id}/summary（?version= 指定版本） */
export interface SummaryView {
  summaryId: string
  sessionId: string
  runId: string
  version: number
  mode: AnalysisMode
  markdown: string | null
  /** 结构化 JSON 原文（字符串） */
  structured: string | null
  /** EvidenceLink[] 的 JSON 字符串，前端需解析 */
  evidenceLinks: string | null
  /** 团队模式事件账本与两路审核报告（JSON 字符串） */
  eventLedger: string | null
  summaryAudit: string | null
  importanceAudit: string | null
  auditStatus: string | null
  generatedAt: string
}

/** GET /api/sessions/{id}/summaries 列表项（不含 markdown / structured 全文） */
export type SummaryListItemView = Omit<SummaryView, 'markdown' | 'structured' | 'eventLedger' | 'summaryAudit' | 'importanceAudit'> & {
  markdown?: undefined
  structured?: undefined
  eventLedger?: undefined
  summaryAudit?: undefined
  importanceAudit?: undefined
}

// ---------- 评测 ----------

/** 评测记录视图（启动评测 / 历史记录共用） */
export interface EvaluationRecordView {
  evaluationId: string
  sessionId: string
  summaryId: string
  summaryVersion: number
  goldenVersion: number
  mode: AnalysisMode
  metrics: EvaluationMetrics
  outdated: boolean
  evaluatedAt: string
}

// ---------- 导入 ----------

export type ImportIssueLevel = 'ERROR' | 'WARNING' | 'INFO'

export interface ImportValidationIssue {
  level: ImportIssueLevel
  message: string
}

export interface ImportPreviewView {
  groupName: string
  messageCount: number
  memberCount: number
  relationshipCount: number
  goldenProvided: boolean
  title: string
}

/** POST /api/imports/validate */
export interface ImportValidateResponse {
  /** 校验通过时返回，确认导入需携带 */
  importId?: string
  status: 'ready_to_confirm' | 'validation_failed'
  validation: ImportValidationIssue[]
  preview?: ImportPreviewView
}

/** POST /api/imports/{id}/confirm */
export interface ImportConfirmResponse {
  sessionId: string
  title: string
  messageCount: number
  goldenProvided: boolean
}

// ---------- 模型配置 ----------

/** 后端持久化的连接状态（不含前端瞬态 testing） */
export type BackendConnectionStatus = 'untested' | 'available' | 'failed'

/** GET /api/model-profiles 列表项 / 保存与测试已保存档案的返回（脱敏视图） */
export interface ModelProfileView {
  profileId: string
  displayName: string
  providerType: ProviderType
  baseUrl: string
  modelName: string
  /** 掩码或 null，后端绝不返回明文 */
  apiKeyMasked: string | null
  thinkingModeSupported: boolean
  connectionStatus: BackendConnectionStatus
  lastErrorMessage: string | null
  lastTestedAt: string | null
  enabled: boolean
}

/** POST /api/model-profiles/test 测试未保存草稿时的返回 */
export interface ModelTestDraftView {
  connectionStatus: BackendConnectionStatus
  lastErrorMessage: string | null
  thinkingModeSupported: boolean
}

/** POST /api/model-profiles 请求体（apiKey 为空表示沿用已保存凭据） */
export interface SaveProfileRequest {
  profileId?: string
  displayName: string
  providerType: ProviderType
  baseUrl: string
  modelName: string
  apiKey?: string
  enabled?: boolean
}

/** POST /api/model-profiles/test 请求体 */
export interface TestProfileRequest {
  /** 携带则测试已保存档案，否则测试草稿配置 */
  profileId?: string
  providerType?: ProviderType
  baseUrl?: string
  apiKey?: string
  modelName?: string
}

/** POST /api/model-profiles/models 请求体（与 /test 一致） */
export interface ListModelsRequest {
  /** 携带则用已保存档案（可省略 apiKey），否则按草稿配置探测 */
  profileId?: string
  providerType?: ProviderType
  baseUrl?: string
  apiKey?: string
}

/** POST /api/model-profiles/models 返回；仅 openai-compatible 支持 */
export interface ListModelsResponse {
  models: string[]
}

/** GET /api/model-profiles/bindings */
export interface ModelBindingsView {
  defaultProfileId: string | null
  thinkingEnabled: boolean
  /** 后端 Agent key（下划线命名）→ profileId 的覆盖绑定 */
  overrides: Record<string, string>
  agentKeys: string[]
}

/** PUT /api/model-profiles/bindings 请求体 */
export interface SaveBindingsRequest {
  defaultProfileId: string | null
  thinkingEnabled: boolean
  overrides: Record<string, string>
}
