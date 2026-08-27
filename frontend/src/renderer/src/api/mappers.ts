// 线路类型 → 前端视图契约（shared/types.ts）映射
// 集中收敛后端与前端数据契约的差异：时间格式、Agent key 命名、状态枚举、JSON 字符串字段

import type {
  AgentKey,
  AgentStatus,
  AgentStepProgress,
  ChatMessage,
  ConversationSession,
  EvaluationRecord,
  EvidenceLink,
  ModelProfile,
  OrganizationRelation,
  RoleCategory,
  SummaryResult,
  UserProfile
} from '../../../shared/types'
import type {
  AgentStepView,
  BackendStepStatus,
  EvaluationRecordView,
  ModelProfileView,
  OrganizationGraphView,
  RawImportMessage,
  RawImportUser,
  SessionListItemView,
  SummaryView
} from './wireTypes'

/** 后端 ISO 时间 → 界面展示格式（与原型 mock 的 zh-CN 风格一致） */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 后端 ISO 时间 → 消息展示的 时:分 */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '--:--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

// ---------- Agent key / 状态枚举映射 ----------

/** 后端下划线命名 → 前端连字符命名（single_model 无对应前端步骤，返回 null） */
const AGENT_KEY_FROM_BACKEND: Record<string, AgentKey> = {
  context_event: 'context-event',
  state: 'state',
  user_context: 'user-context',
  relevance: 'personalized-relevance',
  summary: 'summary',
  factual_auditor: 'factual-auditor',
  personalization_auditor: 'personalization-auditor'
}

const AGENT_KEY_TO_BACKEND: Record<AgentKey, string> = {
  'context-event': 'context_event',
  state: 'state',
  'user-context': 'user_context',
  'personalized-relevance': 'relevance',
  summary: 'summary',
  'factual-auditor': 'factual_auditor',
  'personalization-auditor': 'personalization_auditor'
}

export function agentKeyFromBackend(key: string): AgentKey | null {
  return AGENT_KEY_FROM_BACKEND[key] ?? null
}

export function agentKeyToBackend(key: AgentKey): string {
  return AGENT_KEY_TO_BACKEND[key]
}

const STEP_STATUS_FROM_BACKEND: Record<BackendStepStatus, AgentStatus> = {
  idle: 'waiting',
  running: 'running',
  revising: 'revising',
  success: 'completed',
  warning: 'warning',
  error: 'failed'
}

export function stepStatusFromBackend(status: BackendStepStatus): AgentStatus {
  return STEP_STATUS_FROM_BACKEND[status] ?? 'waiting'
}

/**
 * 后端 Agent 步骤 → 前端步骤进度（按 plan 顺序补全未返回的步骤为 waiting）。
 * 后端 warning 态携带的 shortMessage 归入 warnings，error 态归入 error。
 */
export function mapAgentSteps(steps: AgentStepView[], plan: AgentKey[]): AgentStepProgress[] {
  const byKey = new Map<AgentKey, AgentStepView>()
  for (const s of steps) {
    const key = agentKeyFromBackend(s.agentKey)
    if (key) byKey.set(key, s)
  }
  return plan.map((key) => {
    const s = byKey.get(key)
    if (!s) return { agentKey: key, status: 'waiting', warnings: [] }
    return {
      agentKey: key,
      status: stepStatusFromBackend(s.status),
      warnings: s.status === 'warning' && s.shortMessage ? [s.shortMessage] : [],
      error: s.status === 'error' ? (s.shortMessage ?? undefined) : undefined
    }
  })
}

// ---------- 会话 / 消息 ----------

export function mapSessionListItem(view: SessionListItemView): ConversationSession {
  return {
    sessionId: view.sessionId,
    groupName: view.title,
    importedAt: formatDateTime(view.importedAt),
    messageCount: view.messageCount,
    memberCount: view.memberCount,
    // 后端不提供时间段统计，与本地导入流程的占位保持一致
    timeRange: '—',
    status: view.hasSummary ? 'completed' : 'pending',
    hasGoldenSummary: view.goldenProvided
  }
}

/** 群聊时间范围：由消息首/末时间戳计算（V4.4），无有效时间戳时返回占位 */
export function computeTimeRange(messages: RawImportMessage[]): string {
  const times = messages
    .map((m) => (typeof m.timestamp === 'string' ? new Date(m.timestamp).getTime() : Number.NaN))
    .filter((t) => !Number.isNaN(t))
  if (times.length === 0) return '—'
  const fmt = (t: number) =>
    new Date(t).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  return `${fmt(Math.min(...times))} – ${fmt(Math.max(...times))}`
}

// ---------- 组织关系 ----------

/** 岗位名称 → 角色大类（产品/研发/测试/其他），测试优先于研发判断（如“测试开发工程师”） */
function inferRoleCategory(role: string): RoleCategory {
  if (/产品|PM|需求/.test(role)) return '产品'
  if (/测试|QA|质量/.test(role)) return '测试'
  if (/研发|开发|工程师|架构|运维|算法|前端|后端|DBA|安全/.test(role)) return '研发'
  return '其他'
}

/**
 * 后端组织图 → 前端成员/关系视图（V4.4：群组信息与组织关系改用真实数据）。
 * targetUserId 用于组织图居中，不作为「当前用户」展示（单用户 Demo）。
 */
export function mapOrganization(graph: OrganizationGraphView, targetUserId: string | null): {
  members: UserProfile[]
  relations: OrganizationRelation[]
} {
  const members: UserProfile[] = graph.nodes.map((n) => {
    const role = n.positionName ?? n.positionCode ?? '成员'
    return {
      userId: n.userId,
      name: n.displayName || n.userId,
      role,
      employeeId: n.employeeNo ?? '—',
      roleCategory: inferRoleCategory(role),
      isTargetUser: targetUserId != null && n.userId === targetUserId
    }
  })
  const relations: OrganizationRelation[] = graph.edges.map((e) => ({
    fromUserId: e.sourceUserId,
    toUserId: e.targetUserId,
    // 弱关联虚线，其余（上下级/协作者等）实线，与原型图例一致
    line: /weak|弱/.test(e.relationType) ? 'dashed' : 'solid'
  }))
  return { members, relations }
}

/** 导入文件原始消息 → 前端消息视图（成员画像用于补全发送者信息） */
export function mapRawMessages(messages: RawImportMessage[], users: RawImportUser[]): ChatMessage[] {
  const byName = new Map<string, RawImportUser>()
  for (const u of users) {
    if (u.name) byName.set(u.name, u)
  }
  return messages.map((m, i) => {
    const senderName = (typeof m.sender === 'string' ? m.sender : '').replace(/^@/, '')
    const user = byName.get(senderName)
    const content = typeof m.content === 'string' ? m.content : ''
    const mentions = Array.from(content.matchAll(/@([^\s@]+)/g)).map((x) => x[1])
    return {
      messageId: m.messageId ?? `m-${i}`,
      senderId: user?.userId ?? senderName ?? 'u-unknown',
      senderName: senderName || '未知成员',
      senderRole: (user?.position as string | undefined) ?? '成员',
      sentAt: formatClock(m.timestamp),
      content,
      mentions
    }
  })
}

// ---------- 摘要 / 评测 ----------

/** evidenceLinks 后端以 JSON 字符串返回，解析失败不影响摘要正文展示 */
function parseEvidenceLinks(raw: string | null): EvidenceLink[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .map((e) => ({
        summaryPoint: typeof e.summaryPoint === 'string' ? e.summaryPoint : '',
        messageIds: Array.isArray(e.messageIds) ? e.messageIds.map(String) : []
      }))
  } catch {
    return []
  }
}

export function mapSummary(view: SummaryView): SummaryResult {
  return {
    summaryId: view.summaryId,
    runId: view.runId,
    mode: view.mode,
    version: view.version,
    markdown: view.markdown ?? '',
    generatedAt: formatDateTime(view.generatedAt),
    evidenceLinks: parseEvidenceLinks(view.evidenceLinks)
  }
}

export function mapEvaluationRecord(view: EvaluationRecordView): EvaluationRecord {
  return {
    evaluationId: view.evaluationId,
    mode: view.mode,
    summaryVersion: view.summaryVersion,
    goldenVersion: view.goldenVersion,
    metrics: view.metrics,
    evaluatedAt: formatDateTime(view.evaluatedAt),
    outdated: view.outdated
  }
}

// ---------- 模型配置 ----------

export function mapModelProfile(view: ModelProfileView): ModelProfile {
  return {
    profileId: view.profileId,
    displayName: view.displayName,
    providerType: view.providerType,
    baseUrl: view.baseUrl,
    modelName: view.modelName,
    apiKeyMasked: view.apiKeyMasked ?? undefined,
    connectionStatus: view.connectionStatus,
    thinkingModeSupported: view.thinkingModeSupported,
    // 每档案的思考模式开关为前端本地状态，后端仅保存全局 thinkingEnabled
    thinkingModeEnabled: false,
    lastTestedAt: view.lastTestedAt ? formatDateTime(view.lastTestedAt) : undefined,
    lastError: view.lastErrorMessage ?? undefined
  }
}
