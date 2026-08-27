// DesktopAppShell —— 应用外壳与全局状态（设计文档 §15 组件结构）
// 原型阶段：不连接后端，Run 执行/评测/模型探测均为本地模拟
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WindowHeader from './components/WindowHeader'
import OfflineSessionSidebar from './components/OfflineSessionSidebar'
import AnalysisModeSwitcher from './components/AnalysisModeSwitcher'
import AgentWorkflowPanel from './components/AgentWorkflowPanel'
import SingleModelProgressPanel from './components/SingleModelProgressPanel'
import RawConversationPanel from './components/RawConversationPanel'
import SummaryComparisonPanel from './components/SummaryComparisonPanel'
import EvaluationPanel from './components/EvaluationPanel'
import CompactContextSidebar from './components/CompactContextSidebar'
import LocalModelSettingsDialog from './components/LocalModelSettingsDialog'
import ImportPreviewDialog from './components/ImportPreviewDialog'
import {
  MOCK_EVALUATION_HISTORY,
  MOCK_GOLDEN,
  MOCK_MEMBERS,
  MOCK_MESSAGES,
  MOCK_RELATIONS,
  MOCK_SESSIONS,
  buildMockSummaries
} from './mockData'
import {
  agentKeyFromBackend,
  agentKeyToBackend,
  computeTimeRange,
  confirmImport as confirmImportApi,
  deleteModelProfile,
  deleteSession,
  errorMessageOf,
  getGoldenSummary,
  getModelApiKey,
  getModelBindings,
  getOrganization,
  getRunStatus,
  getSessionDetail,
  getSummary,
  listEvaluationHistory,
  listModelProfiles,
  listProfileModels,
  listSessions as listSessionsApi,
  listSessionRuns,
  listSummaries,
  mapAgentSteps,
  mapEvaluationRecord,
  mapModelProfile,
  mapOrganization,
  mapRawMessages,
  mapSessionListItem,
  mapSummary,
  probeBackend,
  saveModelBindings,
  saveModelProfile,
  startEvaluation as startEvaluationApi,
  startRun as startRunApi,
  testModelProfile,
  validateImport as validateImportApi
} from './api'
import type { BackendRunStatus, RunStatusView, SaveBindingsRequest } from './api'
import type {
  AgentKey,
  AgentModelBinding,
  AgentStepProgress,
  AnalysisMode,
  ChatMessage,
  ConversationSession,
  EvaluationRecord,
  GoldenSummary,
  ImportFileItem,
  ModelProfile,
  OrganizationRelation,
  SummaryResult,
  UserProfile
} from '../../shared/types'

// 团队模式各 Agent 执行编排（毫秒）：两组并行关系与设计文档 §6.1 一致
const AGENT_PLAN: { key: AgentKey; start: number; duration: number }[] = [
  { key: 'context-event', start: 0, duration: 1200 },
  { key: 'state', start: 1200, duration: 1600 },
  { key: 'user-context', start: 1200, duration: 1800 },
  { key: 'personalized-relevance', start: 3000, duration: 1300 },
  { key: 'summary', start: 4300, duration: 1800 },
  { key: 'importance-extractor', start: 4300, duration: 1800 },
  { key: 'factual-auditor', start: 6100, duration: 1400 },
  { key: 'personalization-auditor', start: 6100, duration: 1600 }
]
const AGENT_TOTAL = 7700
const SINGLE_TOTAL = 2600

// 后端运行终态（对应 AgentRunEntity.status）
const RUN_TERMINAL_STATUSES: BackendRunStatus[] = ['completed', 'completed_with_warning', 'failed', 'cancelled']

interface RunState {
  sessionId: string
  mode: AnalysisMode
  startedAt: number
  elapsed: number
  progress: number
  steps: AgentStepProgress[]
  done: boolean
}

interface Toast {
  id: number
  text: string
  kind: 'info' | 'warn' | 'error'
}

const waitingSteps = (): AgentStepProgress[] =>
  AGENT_PLAN.map((p) => ({ agentKey: p.key, status: 'waiting', warnings: [] }))

const completedSteps = (): AgentStepProgress[] =>
  AGENT_PLAN.map((p) => ({ agentKey: p.key, status: 'completed', warnings: [] }))

function loadProfiles(): { profiles: ModelProfile[]; defaultProfileId: string | null } {
  try {
    const raw = localStorage.getItem('im-summary-model-settings')
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  // 初始种子配置，便于演示；可在设置中修改/删除
  return {
    profiles: [
      {
        profileId: 'p-seed-1',
        displayName: '主力大模型',
        providerType: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKeyMasked: 'sk-••••a1b2',
        modelName: 'gpt-4o',
        connectionStatus: 'available',
        thinkingModeSupported: true,
        thinkingModeEnabled: false,
        lastTestedAt: '2026-08-26 09:12'
      },
      {
        profileId: 'p-seed-2',
        displayName: '基线模型',
        providerType: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKeyMasked: 'sk-••••c3d4',
        modelName: 'claude-sonnet-4',
        connectionStatus: 'untested',
        thinkingModeSupported: null,
        thinkingModeEnabled: false
      }
    ],
    defaultProfileId: 'p-seed-1'
  }
}

export default function App() {
  // ---- 会话 ----
  const [sessions, setSessions] = useState<ConversationSession[]>(MOCK_SESSIONS)
  // 在线模式会话列表为真实数据（不会命中 mock 回退）；离线时默认展示首个 mock 会话
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const mockFallback = sessions.find((s) => s.sessionId === MOCK_SESSIONS[0]?.sessionId) ?? null
  const activeSession = sessions.find((s) => s.sessionId === activeSessionId) ?? mockFallback

  // ---- 摘要 / 黄金摘要 / 评测（按会话隔离）----
  const [summariesBySession, setSummariesBySession] = useState<Record<string, SummaryResult[]>>({
    's-001': [buildMockSummaries('agent-workflow', 1), buildMockSummaries('agent-workflow', 2), buildMockSummaries('single-model', 3)]
  })
  const [activeVersionBySession, setActiveVersionBySession] = useState<Record<string, number>>({ 's-001': 2 })
  const [goldenBySession, setGoldenBySession] = useState<Record<string, GoldenSummary | null>>({ 's-001': MOCK_GOLDEN })
  const [evalBySession, setEvalBySession] = useState<Record<string, EvaluationRecord[]>>({ 's-001': MOCK_EVALUATION_HISTORY })
  // 群组成员与组织关系（按会话隔离）：在线为后端真实数据（V4.4），离线回退 mock
  const [membersBySession, setMembersBySession] = useState<Record<string, UserProfile[]>>({})
  const [relationsBySession, setRelationsBySession] = useState<Record<string, OrganizationRelation[]>>({})

  // ---- 分析模式与 Run ----
  const [mode, setMode] = useState<AnalysisMode>('agent-workflow')
  const [run, setRun] = useState<RunState | null>(null)
  const timersRef = useRef<number[]>([])
  // 各模式上次运行耗时（按会话 + 模式隔离，V4.4：两模式时间相互独立）
  const [lastRunSecondsBySession, setLastRunSecondsBySession] = useState<Record<string, Partial<Record<AnalysisMode, number>>>>({})

  // 通过 ref 读取最新状态，避免在 setState updater 中嵌套调用 setState（StrictMode 下会重复执行）
  const summariesRef = useRef(summariesBySession)
  summariesRef.current = summariesBySession
  const goldenRef = useRef(goldenBySession)
  goldenRef.current = goldenBySession
  const runRef = useRef(run)
  runRef.current = run
  
  // 记录某会话某模式的上次运行耗时（终态回调中调用）
  const recordLastRunSeconds = (sessionId: string, runMode: AnalysisMode) => {
    const r = runRef.current
    if (!r || r.sessionId !== sessionId) return
    const seconds = Math.max(0, Math.round((Date.now() - r.startedAt) / 1000))
    setLastRunSecondsBySession((m) => ({ ...m, [sessionId]: { ...m[sessionId], [runMode]: seconds } }))
  }

  // ---- 模型设置 ----
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [{ profiles, defaultProfileId }, setModelSettings] = useState(loadProfiles)
  const [bindings, setBindings] = useState<AgentModelBinding[]>([])

  // ---- 导入 ----
  const [importFiles, setImportFiles] = useState<ImportFileItem[] | null>(null)

  // ---- 联动高亮 ----
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const [highlightUserId, setHighlightUserId] = useState<string | null>(null)

  // ---- Toast ----
  const [toasts, setToasts] = useState<Toast[]>([])
  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { id, text, kind }])
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 2600)
  }, [])

  // ---- 后端连接与双数据源 ----
  // 启动探测后端：在线时数据来自 REST API；离线时静默回退本地 mock，原型行为不变
  const [backendOnline, setBackendOnline] = useState(false)
  const backendOnlineRef = useRef(false)

  // 配置持久化（应用重启后恢复，设计文档验收 18）；后端在线时配置以后端为准，不回写本地
  useEffect(() => {
    if (backendOnlineRef.current) return
    localStorage.setItem('im-summary-model-settings', JSON.stringify({ profiles, defaultProfileId }))
  }, [profiles, defaultProfileId])

  // 启动探测：后端可达时切换为真实数据源，加载会话列表与模型配置
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const online = await probeBackend()
      if (cancelled) return
      backendOnlineRef.current = online
      setBackendOnline(online)
      if (!online) {
        // 离线回退：默认选中首个 mock 会话，保持原型交互不变
        setActiveSessionId(MOCK_SESSIONS[0]?.sessionId ?? null)
        return
      }
      try {
        const list = await listSessionsApi()
        if (cancelled) return
        setSessions(list.map(mapSessionListItem))
        setActiveSessionId(list[0]?.sessionId ?? null)
      } catch (e) {
        if (!cancelled) toast(`会话列表加载失败：${errorMessageOf(e)}`, 'error')
      }
      try {
        const [profileViews, bindingsView] = await Promise.all([listModelProfiles(), getModelBindings()])
        if (cancelled) return
        // API Key 明文回填：供设置界面回显与编辑（V4.4），仅驻留内存，不写 localStorage
        const profilesWithKeys = await Promise.all(
          profileViews.map(mapModelProfile).map(async (p) => {
            try {
              const { apiKey } = await getModelApiKey(p.profileId)
              return apiKey ? { ...p, apiKey } : p
            } catch {
              return p
            }
          })
        )
        if (cancelled) return
        setModelSettings({
          profiles: profilesWithKeys,
          defaultProfileId: bindingsView.defaultProfileId
        })
        setBindings(
          Object.entries(bindingsView.overrides).flatMap(([backendKey, profileId]) => {
            const agentKey = agentKeyFromBackend(backendKey)
            return agentKey ? [{ agentKey, profileId }] : []
          })
        )
      } catch (e) {
        if (!cancelled) toast(`模型配置加载失败：${errorMessageOf(e)}`, 'error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  // 从后端加载指定会话的详情 / 组织图 / 黄金摘要 / 摘要 / 评测历史（失败项保留当前数据并 Toast 提示）
  const refreshSessionFromBackend = useCallback(
    async (sessionId: string) => {
      let targetUserId: string | null = null
      try {
        const detail = await getSessionDetail(sessionId)
        targetUserId = detail.targetUserId
        const msgs = detail.messages ?? []
        setImportedMessages((m) => ({ ...m, [sessionId]: mapRawMessages(msgs, detail.users ?? []) }))
        // 列表接口无时间段统计：由消息时间戳计算回填会话条目（V4.4）
        if (msgs.length > 0) {
          const timeRange = computeTimeRange(msgs)
          setSessions((ss) => ss.map((s) => (s.sessionId === sessionId ? { ...s, timeRange } : s)))
        }
      } catch (e) {
        toast(`会话详情加载失败：${errorMessageOf(e)}`, 'error')
      }
      try {
        // 群组成员与组织关系改用真实数据（V4.4）；targetUserId 仅用于组织图居中，不标识“当前用户”
        const graph = await getOrganization(sessionId)
        const { members, relations } = mapOrganization(graph, targetUserId)
        setMembersBySession((m) => ({ ...m, [sessionId]: members }))
        setRelationsBySession((m) => ({ ...m, [sessionId]: relations }))
      } catch {
        // 组织图加载失败不阻断其他内容展示（保持空视图）
      }
      try {
        // 黄金摘要内容（V5.4）：携带时展示真实内容；未携带置 null，黄金摘要与评测区整体隐藏（§8.2）
        const goldenView = await getGoldenSummary(sessionId)
        setGoldenBySession((g) => ({
          ...g,
          [sessionId]:
            goldenView.goldenProvided && goldenView.content
              ? { goldenVersion: goldenView.goldenVersion ?? 1, markdown: goldenView.content }
              : null
        }))
      } catch {
        // 黄金摘要加载失败不阻断其他内容展示
      }
      try {
        // 列表接口不含全文，逐版本拉取完整摘要（版本数通常很少）
        const summaryItems = await listSummaries(sessionId)
        const fullSummaries = await Promise.all(summaryItems.map((s) => getSummary(sessionId, { version: s.version })))
        setSummariesBySession((map) => ({ ...map, [sessionId]: fullSummaries.map(mapSummary) }))
        if (fullSummaries.length > 0) {
          setActiveVersionBySession((av) => ({ ...av, [sessionId]: fullSummaries[0].version }))
        }
      } catch (e) {
        toast(`摘要加载失败：${errorMessageOf(e)}`, 'error')
      }
      try {
        const records = await listEvaluationHistory(sessionId)
        setEvalBySession((map) => ({ ...map, [sessionId]: records.map(mapEvaluationRecord) }))
      } catch {
        // 评测历史拉取失败不阻断其他内容展示
      }
      try {
        // 恢复各模式上次运行耗时（V4.4：取每模式最近一次成功运行的起止时间差）
        const runs = await listSessionRuns(sessionId)
        const latest: Partial<Record<AnalysisMode, { at: number; secs: number }>> = {}
        for (const r of runs) {
          if ((r.status === 'completed' || r.status === 'completed_with_warning') && r.startedAt && r.finishedAt) {
            const fin = new Date(r.finishedAt).getTime()
            const secs = Math.max(0, Math.round((fin - new Date(r.startedAt).getTime()) / 1000))
            const cur = latest[r.mode]
            if (!cur || fin >= cur.at) latest[r.mode] = { at: fin, secs }
          }
        }
        const entry = Object.fromEntries(Object.entries(latest).map(([m, v]) => [m, v.secs])) as Partial<Record<AnalysisMode, number>>
        if (Object.keys(entry).length > 0) {
          setLastRunSecondsBySession((m) => ({ ...m, [sessionId]: { ...m[sessionId], ...entry } }))
        }
      } catch {
        // 运行历史拉取失败不阻断其他内容展示
      }
    },
    [toast]
  )

  // 在线时切换选中会话即加载真实数据（写入按 sessionId 隔离，无跨会话竞态）
  useEffect(() => {
    if (!backendOnline || !activeSessionId) return
    void refreshSessionFromBackend(activeSessionId)
  }, [backendOnline, activeSessionId, refreshSessionFromBackend])

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t))
    timersRef.current = []
  }
  useEffect(() => clearTimers, [])

  // ---- 联动：证据定位 / 成员高亮（设计文档 §12）----
  const flashMessage = (messageId: string) => {
    setHighlightMessageId(messageId)
    window.setTimeout(() => setHighlightMessageId((cur) => (cur === messageId ? null : cur)), 2500)
  }
  const flashUser = (userId: string) => {
    setHighlightUserId(userId)
    window.setTimeout(() => setHighlightUserId((cur) => (cur === userId ? null : cur)), 2500)
  }

  // ---- 分析门禁（§11.6）----
  const defaultProfile = profiles.find((p) => p.profileId === defaultProfileId) ?? null
  const canAnalyze = defaultProfile !== null && defaultProfile.connectionStatus !== 'failed'
  const analyzeBlockReason = !defaultProfile
    ? '请先配置模型 API'
    : defaultProfile.connectionStatus === 'failed'
      ? '默认配置连接测试失败，请在模型设置中检查'
      : null

  // ---- Run 模拟 ----
  const finishRun = useCallback(
    (sessionId: string, runMode: AnalysisMode) => {
      recordLastRunSeconds(sessionId, runMode)
      setSessions((ss) => ss.map((s) => (s.sessionId === sessionId ? { ...s, status: 'completed' } : s)))
      const version = (summariesRef.current[sessionId] ?? []).reduce((max, s) => Math.max(max, s.version), 0) + 1
      const summary = buildMockSummaries(runMode, version)
      setActiveVersionBySession((av) => ({ ...av, [sessionId]: version }))
      setSummariesBySession((map) => ({ ...map, [sessionId]: [...(map[sessionId] ?? []), summary] }))
      // 有黄金摘要时自动生成一条评测记录（原型模拟指标）
      const golden = goldenRef.current[sessionId]
      if (golden) {
        const base = runMode === 'agent-workflow' ? 0.9 : 0.72
        const jitter = () => Math.round((Math.random() * 0.06 - 0.02) * 100) / 100
        const record: EvaluationRecord = {
          evaluationId: `ev-${Date.now()}`,
          mode: runMode,
          summaryVersion: version,
          goldenVersion: golden.goldenVersion,
          metrics: {
            accuracy: Math.min(0.99, base + jitter()),
            keyInformationOmissionRate: Math.max(0.01, (runMode === 'agent-workflow' ? 0.06 : 0.18) - jitter()),
            rougeL: Math.min(0.95, base - 0.08 + jitter()),
            // 原型模拟综合质量评分（0-100）：与准确率基线线性相关并叠加抖动
            llmScore: Math.min(99, Math.round(base * 100 - 4 + Math.random() * 8)),
            importantMessagePrecision: Math.min(0.99, base - 0.02 + jitter()),
            importantMessageRecall: Math.min(0.99, base - 0.05 + jitter())
          },
          evaluatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
          outdated: false
        }
        setEvalBySession((em) => ({ ...em, [sessionId]: [record, ...(em[sessionId] ?? [])] }))
      }
      setRun((r) => (r ? { ...r, done: true, progress: 100 } : r))
      toast('分析完成，摘要与评测已更新')
    },
    [toast]
  )

  const startRun = useCallback(
    (sessionId: string, runMode: AnalysisMode) => {
      clearTimers()
      const startedAt = Date.now()
      setSessions((ss) => ss.map((s) => (s.sessionId === sessionId ? { ...s, status: 'analyzing' } : s)))
      setRun({ sessionId, mode: runMode, startedAt, elapsed: 0, progress: 0, steps: waitingSteps(), done: false })

      // 已进行时间计时（§6.4：从 Run 启动时间累计，不显示预计剩余时间）
      const tick = window.setInterval(() => {
        setRun((r) => (r && !r.done ? { ...r, elapsed: Math.floor((Date.now() - r.startedAt) / 1000) } : r))
      }, 500)
      timersRef.current.push(tick)

      if (runMode === 'agent-workflow') {
        AGENT_PLAN.forEach(({ key, start, duration }) => {
          timersRef.current.push(
            window.setTimeout(() => {
              setRun((r) => (r ? { ...r, steps: r.steps.map((s) => (s.agentKey === key ? { ...s, status: 'running' } : s)) } : r))
            }, start)
          )
          timersRef.current.push(
            window.setTimeout(() => {
              setRun((r) =>
                r
                  ? {
                      ...r,
                      steps: r.steps.map((s) => (s.agentKey === key ? { ...s, status: 'completed', elapsedMs: duration } : s)),
                      progress: Math.min(99, Math.round(((start + duration) / AGENT_TOTAL) * 100))
                    }
                  : r
              )
            }, start + duration)
          )
        })
        timersRef.current.push(window.setTimeout(() => finishRun(sessionId, runMode), AGENT_TOTAL + 200))
      } else {
        // 单模型模式：简化的单步进度
        const progressTick = window.setInterval(() => {
          setRun((r) => (r && !r.done ? { ...r, progress: Math.min(96, r.progress + 4) } : r))
        }, 100)
        timersRef.current.push(progressTick)
        timersRef.current.push(window.setTimeout(() => finishRun(sessionId, runMode), SINGLE_TOTAL))
      }
    },
    [finishRun]
  )

  // ---- Run（后端数据源）：API 启动 + 轮询状态，进度与各 Agent 状态由后端给出，前端只展示 ----
  const finishRunBackend = useCallback(
    async (sessionId: string, status: RunStatusView) => {
      const failed = status.status === 'failed' || status.status === 'cancelled'
      const runMode = runRef.current?.mode
      if (!failed && runMode) recordLastRunSeconds(sessionId, runMode)
      setSessions((ss) => ss.map((s) => (s.sessionId === sessionId ? { ...s, status: failed ? 'failed' : 'completed' } : s)))
      setRun((r) => (r ? { ...r, done: true, progress: failed ? r.progress : 100 } : r))
      if (failed) {
        toast(`分析失败：${status.errorMessage ?? status.errorCode ?? '未知错误'}`, 'error')
        return
      }
      // 与原型行为对齐：分析完成后自动评测一次（无黄金摘要时后端返回 NOT_EVALUABLE，静默忽略）
      try {
        await startEvaluationApi(sessionId)
      } catch {
        // 评测失败不影响摘要可用性（后端同语义）
      }
      await refreshSessionFromBackend(sessionId)
      toast('分析完成，摘要与评测已更新')
    },
    [refreshSessionFromBackend, toast]
  )

  const startRunBackend = useCallback(
    async (sessionId: string, runMode: AnalysisMode) => {
      clearTimers()
      const startedAt = Date.now()
      setSessions((ss) => ss.map((s) => (s.sessionId === sessionId ? { ...s, status: 'analyzing' } : s)))
      setRun({ sessionId, mode: runMode, startedAt, elapsed: 0, progress: 0, steps: waitingSteps(), done: false })

      // 已进行时间计时（§6.4：从 Run 启动时间累计，不显示预计剩余时间）
      const tick = window.setInterval(() => {
        setRun((r) => (r && !r.done ? { ...r, elapsed: Math.floor((Date.now() - r.startedAt) / 1000) } : r))
      }, 500)
      timersRef.current.push(tick)

      let runId: string
      try {
        const started = await startRunApi(sessionId, { mode: runMode })
        runId = started.runId
      } catch (e) {
        setSessions((ss) => ss.map((s) => (s.sessionId === sessionId ? { ...s, status: 'failed' } : s)))
        setRun((r) => (r ? { ...r, done: true } : r))
        toast(`启动分析失败：${errorMessageOf(e)}`, 'error')
        return
      }

      // 轮询运行状态（WebSocket 的 HTTP 兜底；运行状态持久化在后端，断线可恢复）
      const planKeys = AGENT_PLAN.map((p) => p.key)
      // 重入保护：上一轮请求在途时跳过，避免乱序进度覆盖与终态重复处理（重复触发评测）
      let polling = false
      let finished = false
      const poll = window.setInterval(async () => {
        if (polling || finished) return
        polling = true
        try {
          const status = await getRunStatus(runId)
          setRun((r) =>
            r && !r.done
              ? { ...r, progress: status.overallProgress, steps: mapAgentSteps(status.agentSteps, planKeys) }
              : r
          )
          if (RUN_TERMINAL_STATUSES.includes(status.status)) {
            finished = true
            window.clearInterval(poll)
            await finishRunBackend(sessionId, status)
          }
        } catch {
          // 单次轮询失败等待下一轮；不阻断运行展示
        } finally {
          polling = false
        }
      }, 1000)
      timersRef.current.push(poll)
    },
    [finishRunBackend, toast]
  )

  const handleStartAnalysis = () => {
    if (!activeSession || !canAnalyze || run && !run.done && run.sessionId === activeSessionId) return
    // 后端在线：模型配置校验由后端在启动时完成，前端不做本地模拟校验
    if (backendOnline) {
      void startRunBackend(activeSession.sessionId, mode)
      return
    }
    if (defaultProfile!.connectionStatus === 'untested') {
      // 已保存、未测试：启动时先轻量校验（§11.6）
      toast('默认配置未测试，正在轻量校验…')
      updateProfile({ ...defaultProfile!, connectionStatus: 'testing' })
      window.setTimeout(() => {
        updateProfile({
          ...defaultProfile!,
          connectionStatus: 'available',
          thinkingModeSupported: detectThinking(defaultProfile!),
          lastTestedAt: new Date().toLocaleString('zh-CN', { hour12: false })
        })
        toast('校验通过，开始分析')
        startRun(activeSession.sessionId, mode)
      }, 900)
      return
    }
    startRun(activeSession.sessionId, mode)
  }

  // ---- 模型设置操作 ----
  const detectThinking = (p: ModelProfile): boolean =>
    p.providerType === 'anthropic' || /claude|gpt-5|o1|o3|qwen3|deepseek-r1|thinking/i.test(p.modelName)

  const updateProfile = (p: ModelProfile) => {
    setModelSettings((cur) => {
      const exists = cur.profiles.some((x) => x.profileId === p.profileId)
      return {
        profiles: exists ? cur.profiles.map((x) => (x.profileId === p.profileId ? p : x)) : [...cur.profiles, p],
        defaultProfileId: cur.defaultProfileId ?? p.profileId
      }
    })
  }

  const handleTestConnection = (profileId: string) => {
    const target = profiles.find((p) => p.profileId === profileId)
    if (!target) return
    updateProfile({ ...target, connectionStatus: 'testing', lastError: undefined })
    if (backendOnline) {
      testModelProfile({ profileId })
        .then((view) => {
          if ('profileId' in view) {
            updateProfile({ ...mapModelProfile(view), thinkingModeEnabled: target.thinkingModeEnabled, apiKey: target.apiKey })
          } else {
            updateProfile({
              ...target,
              connectionStatus: view.connectionStatus,
              thinkingModeSupported: view.thinkingModeSupported,
              lastError: view.lastErrorMessage ?? undefined,
              lastTestedAt: new Date().toLocaleString('zh-CN', { hour12: false })
            })
          }
          if (view.connectionStatus === 'available') toast('连接测试通过')
          else toast(view.lastErrorMessage ?? '连接测试失败', 'error')
        })
        .catch((e) => {
          updateProfile({
            ...target,
            connectionStatus: 'failed',
            lastError: errorMessageOf(e),
            lastTestedAt: new Date().toLocaleString('zh-CN', { hour12: false })
          })
          toast('连接测试失败', 'error')
        })
      return
    }
    window.setTimeout(() => {
      if (/invalid|localhost:0/.test(target.baseUrl)) {
        updateProfile({ ...target, connectionStatus: 'failed', thinkingModeSupported: null, lastError: '连接失败：无法解析目标地址', lastTestedAt: new Date().toLocaleString('zh-CN', { hour12: false }) })
        toast('连接测试失败', 'error')
      } else {
        updateProfile({ ...target, connectionStatus: 'available', thinkingModeSupported: detectThinking(target), lastTestedAt: new Date().toLocaleString('zh-CN', { hour12: false }) })
        toast('连接测试通过')
      }
    }, 1000)
  }

  // ---- 模型配置（后端数据源）：档案增删改 / 测试 / 绑定均走 API，本地状态跟随响应更新 ----
  // 本地绑定状态 → 后端绑定请求体（Agent key 转为后端下划线命名）
  const buildBindingsRequest = (nextDefault: string | null, nextBindings: AgentModelBinding[]): SaveBindingsRequest => ({
    defaultProfileId: nextDefault,
    // 后端 thinkingEnabled 为全局开关，以“任一档案启用”近似映射每档案开关
    thinkingEnabled: profiles.some((p) => p.thinkingModeEnabled),
    overrides: Object.fromEntries(
      nextBindings
        .filter((b) => b.profileId)
        .map((b) => [agentKeyToBackend(b.agentKey), b.profileId as string])
    )
  })

  // 获取模型列表（§11.7）：仅后端在线时可用；已保存档案未填新 Key 时后端使用已存凭据
  const handleFetchModels = async (req: Parameters<typeof listProfileModels>[0]) => {
    const res = await listProfileModels(req)
    return res.models
  }

  const handleSaveProfile = (p: ModelProfile) => {
    if (!backendOnline) {
      // 离线模式剥离明文 Key：明文仅在线回显与提交后端，不写 localStorage
      updateProfile({ ...p, apiKey: undefined })
      return
    }
    saveModelProfile({
      profileId: p.profileId,
      displayName: p.displayName,
      providerType: p.providerType,
      baseUrl: p.baseUrl,
      modelName: p.modelName,
      apiKey: p.apiKey
    })
      .then((view) => {
        // 保留内存中的明文 Key，供设置界面持续回显（每次保存均提交后端）
        const mapped = { ...mapModelProfile(view), thinkingModeEnabled: p.thinkingModeEnabled, apiKey: p.apiKey }
        // 在线新建首个档案时后端尚无默认配置，同步一次绑定，否则 Run 启动会因"未配置默认模型档案"失败
        if (defaultProfileId == null) {
          void saveModelBindings(buildBindingsRequest(view.profileId, bindings)).catch((e) =>
            toast(`同步默认配置失败：${errorMessageOf(e)}`, 'error')
          )
        }
        setModelSettings((cur) => {
          const hasServerId = cur.profiles.some((x) => x.profileId === view.profileId)
          return {
            // 新增档案时后端生成新 id，需移除客户端临时 id
            profiles: hasServerId
              ? cur.profiles.map((x) => (x.profileId === view.profileId ? mapped : x))
              : [...cur.profiles.filter((x) => x.profileId !== p.profileId), mapped],
            defaultProfileId: cur.defaultProfileId ?? view.profileId
          }
        })
      })
      .catch((e) => toast(`保存模型配置失败：${errorMessageOf(e)}`, 'error'))
  }

  const handleDeleteProfile = (profileId: string) => {
    const removeLocally = () =>
      setModelSettings((cur) => ({
        profiles: cur.profiles.filter((p) => p.profileId !== profileId),
        defaultProfileId: cur.defaultProfileId === profileId ? null : cur.defaultProfileId
      }))
    if (!backendOnline) {
      removeLocally()
      return
    }
    deleteModelProfile(profileId)
      .then(removeLocally)
      .catch((e) => toast(errorMessageOf(e), 'error'))
  }

  const handleSetDefaultProfile = (profileId: string) => {
    if (!backendOnline) {
      setModelSettings((cur) => ({ ...cur, defaultProfileId: profileId }))
      return
    }
    saveModelBindings(buildBindingsRequest(profileId, bindings))
      .then(() => setModelSettings((cur) => ({ ...cur, defaultProfileId: profileId })))
      .catch((e) => toast(`设置默认配置失败：${errorMessageOf(e)}`, 'error'))
  }

  const handleToggleThinking = (profileId: string, enabled: boolean) => {
    const p = profiles.find((x) => x.profileId === profileId)
    if (!p) return
    updateProfile({ ...p, thinkingModeEnabled: enabled })
    if (backendOnline) {
      const nextProfiles = profiles.map((x) => (x.profileId === profileId ? { ...x, thinkingModeEnabled: enabled } : x))
      saveModelBindings({
        defaultProfileId,
        thinkingEnabled: nextProfiles.some((x) => x.thinkingModeEnabled),
        overrides: Object.fromEntries(
          bindings.filter((b) => b.profileId).map((b) => [agentKeyToBackend(b.agentKey), b.profileId as string])
        )
      }).catch((e) => toast(`保存思考模式失败：${errorMessageOf(e)}`, 'error'))
    }
  }

  const handleBindingChange = (agentKey: AgentKey, profileId: string | undefined) => {
    const next = profileId
      ? [...bindings.filter((b) => b.agentKey !== agentKey), { agentKey, profileId }]
      : bindings.filter((b) => b.agentKey !== agentKey)
    setBindings(next)
    if (backendOnline) {
      saveModelBindings(buildBindingsRequest(defaultProfileId, next)).catch((e) =>
        toast(`保存模型绑定失败：${errorMessageOf(e)}`, 'error')
      )
    }
  }

  // ---- 会话删除（V4.4）：在线走后端级联删除，离线仅移除本地状态；同步清理按会话隔离的全部缓存 ----
  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      const strip = <T,>(m: Record<string, T>): Record<string, T> =>
        Object.fromEntries(Object.entries(m).filter(([k]) => k !== sessionId)) as Record<string, T>
      const removeLocally = () => {
        const remaining = sessions.filter((s) => s.sessionId !== sessionId)
        setSessions(remaining)
        if (activeSessionId === sessionId) setActiveSessionId(remaining[0]?.sessionId ?? null)
        setSummariesBySession((m) => strip(m))
        setActiveVersionBySession((m) => strip(m))
        setGoldenBySession((m) => strip(m))
        setEvalBySession((m) => strip(m))
        setMembersBySession((m) => strip(m))
        setRelationsBySession((m) => strip(m))
        setLastRunSecondsBySession((m) => strip(m))
        setImportedMessages((m) => strip(m))
        toast('会话已删除')
      }
      if (!backendOnline) {
        removeLocally()
        return
      }
      deleteSession(sessionId)
        .then(removeLocally)
        .catch((e) => toast(`删除会话失败：${errorMessageOf(e)}`, 'error'))
    },
    [sessions, activeSessionId, backendOnline, toast]
  )

  // ---- 导入解析（原型：本地解析 JSON / 文本，无后端预检）----
  const parseImportFile = async (name: string, readText: () => Promise<string>): Promise<ImportFileItem> => {
    const item: ImportFileItem = { id: `imp-${Date.now()}-${Math.random()}`, name, status: 'checking', warnings: [] }
    try {
      const text = await readText()
      if (name.endsWith('.json')) {
        const data = JSON.parse(text)
        if (!data.groupName || !Array.isArray(data.messages)) {
          return { ...item, status: 'failed', error: 'JSON 缺少必需字段 groupName / messages' }
        }
        const messages: ChatMessage[] = data.messages.slice(0, 500).map((m: Partial<ChatMessage>, i: number) => ({
          messageId: m.messageId ?? `imp-m-${i}`,
          senderId: m.senderId ?? 'u-unknown',
          senderName: m.senderName ?? '未知成员',
          senderRole: m.senderRole ?? '成员',
          sentAt: m.sentAt ?? '--:--',
          content: String(m.content ?? ''),
          mentions: m.mentions ?? []
        }))
        return {
          ...item,
          status: 'ok',
          preview: {
            groupName: data.groupName,
            messageCount: data.messages.length,
            memberCount: data.members?.length ?? new Set(messages.map((m) => m.senderId)).size,
            profileCount: data.profiles?.length ?? 0,
            relationCount: data.relations?.length ?? 0,
            hasGoldenSummary: typeof data.goldenSummary === 'string' && data.goldenSummary.length > 0
          },
          goldenMarkdown: typeof data.goldenSummary === 'string' ? data.goldenSummary : undefined,
          messages
        }
      }
      // txt / csv：按行解析，个性化数据缺失 → 警告态
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      return {
        ...item,
        status: 'warning',
        warnings: ['纯文本导入将按行解析消息', '成员画像与组织关系数据缺失，个性化能力降级'],
        preview: {
          groupName: name.replace(/\.\w+$/, ''),
          messageCount: lines.length,
          memberCount: 0,
          profileCount: 0,
          relationCount: 0,
          hasGoldenSummary: false
        }
      }
    } catch (e) {
      return { ...item, status: 'failed', error: `文件解析失败：${e instanceof Error ? e.message : String(e)}` }
    }
  }

  // ---- 导入预检查（后端数据源）：上传后端校验，校验问题映射为文件状态 ----
  const validateImportFile = async (f: { name: string; path?: string; file?: File }, id: string): Promise<ImportFileItem> => {
    const item: ImportFileItem = { id, name: f.name, status: 'checking', warnings: [] }
    try {
      let blob: Blob
      if (f.file) {
        blob = f.file
      } else if (f.path && window.desktopApi) {
        blob = new Blob([await window.desktopApi.readTextFile(f.path)], { type: 'application/octet-stream' })
      } else {
        throw new Error('无法读取文件')
      }
      const res = await validateImportApi(blob, f.name)
      if (res.status !== 'ready_to_confirm' || !res.importId) {
        const firstError = res.validation.find((v) => v.level === 'ERROR')
        return {
          ...item,
          status: 'failed',
          error: firstError?.message ?? '文件校验未通过',
          warnings: res.validation.filter((v) => v.level !== 'ERROR').map((v) => v.message)
        }
      }
      const pv = res.preview
      const warnings = res.validation.filter((v) => v.level === 'WARNING').map((v) => v.message)
      const infos = res.validation.filter((v) => v.level === 'INFO').map((v) => v.message)
      return {
        ...item,
        importId: res.importId,
        status: warnings.length > 0 ? 'warning' : 'ok',
        warnings: [...warnings, ...infos],
        preview: pv
          ? {
              groupName: pv.groupName,
              messageCount: pv.messageCount,
              memberCount: pv.memberCount,
              // 后端预览不区分画像数，以成员数近似；消息全文由确认导入后从会话详情加载
              profileCount: pv.memberCount,
              relationCount: pv.relationshipCount,
              hasGoldenSummary: pv.goldenProvided
            }
          : undefined
      }
    } catch (e) {
      return { ...item, status: 'failed', error: `预检查失败：${errorMessageOf(e)}` }
    }
  }

  const handleImportFiles = async (files: { name: string; path?: string; file?: File }[]) => {
    const items: ImportFileItem[] = files.map((f) => ({ id: `imp-${Date.now()}-${Math.random()}`, name: f.name, status: 'checking', warnings: [] }))
    setImportFiles((cur) => [...(cur ?? []), ...items])
    const parsed = await Promise.all(
      files.map((f, i) =>
        backendOnline
          ? validateImportFile(f, items[i].id)
          : parseImportFile(f.name, async () => {
              if (f.file) return f.file.text()
              if (f.path && window.desktopApi) return window.desktopApi.readTextFile(f.path)
              throw new Error('无法读取文件')
            }).then((item) => ({ ...item, id: items[i].id }))
      )
    )
    // 模拟逐文件预检查节奏
    for (const p of parsed) {
      await new Promise((r) => setTimeout(r, 250))
      setImportFiles((cur) => (cur ?? []).map((c) => (c.id === p.id ? p : c)))
    }
  }

  const handleConfirmImport = async (files: ImportFileItem[]) => {
    if (backendOnline) {
      const confirmedIds: string[] = []
      for (const f of files) {
        if (!f.importId) continue
        try {
          const res = await confirmImportApi(f.importId)
          confirmedIds.push(res.sessionId)
        } catch (e) {
          // 批量导入：单文件失败不阻断其他文件（§4.1）
          toast(`导入失败：${f.name}，${errorMessageOf(e)}`, 'error')
        }
      }
      setImportFiles(null)
      if (confirmedIds.length > 0) {
        try {
          const list = await listSessionsApi()
          setSessions(list.map(mapSessionListItem))
          // 批量导入完成后默认选中第一个成功项（§4.1）
          setActiveSessionId(confirmedIds[0])
        } catch (e) {
          toast(`刷新会话列表失败：${errorMessageOf(e)}`, 'error')
        }
        toast(`成功导入 ${confirmedIds.length} 个会话`)
      }
      return
    }
    const now = new Date().toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    const newSessions: ConversationSession[] = files.map((f, i) => ({
      sessionId: `s-imp-${Date.now()}-${i}`,
      groupName: f.preview!.groupName,
      importedAt: now,
      messageCount: f.preview!.messageCount,
      memberCount: f.preview!.memberCount || MOCK_MEMBERS.length,
      timeRange: '—',
      status: 'pending',
      hasGoldenSummary: f.preview!.hasGoldenSummary
    }))
    setSessions((ss) => [...newSessions, ...ss])
    files.forEach((f, i) => {
      const sid = newSessions[i].sessionId
      if (f.preview!.hasGoldenSummary && f.goldenMarkdown) {
        setGoldenBySession((m) => ({ ...m, [sid]: { goldenVersion: 1, markdown: f.goldenMarkdown! } }))
      }
      if (f.messages && f.messages.length > 0) {
        setImportedMessages((m) => ({ ...m, [sid]: f.messages! }))
      }
    })
    setImportFiles(null)
    // 批量导入完成后默认选中第一个成功项（§4.1）
    setActiveSessionId(newSessions[0].sessionId)
    toast(`成功导入 ${newSessions.length} 个会话`)
  }

  const [importedMessages, setImportedMessages] = useState<Record<string, ChatMessage[]>>({})

  // ---- 当前视图数据 ----
  const summaries = useMemo(() => (activeSessionId ? summariesBySession[activeSessionId] ?? [] : []), [summariesBySession, activeSessionId])
  const activeVersion = activeSessionId ? activeVersionBySession[activeSessionId] ?? null : null
  const golden = activeSessionId ? goldenBySession[activeSessionId] ?? null : null
  const evalRecords = activeSessionId ? evalBySession[activeSessionId] ?? [] : []
  // 在线模式不使用 mock 回退：未加载完成时展示空视图（V4.4）
  const messages = activeSessionId ? importedMessages[activeSessionId] ?? (backendOnline ? [] : MOCK_MESSAGES) : []
  const members = activeSessionId ? membersBySession[activeSessionId] ?? (backendOnline ? [] : MOCK_MEMBERS) : []
  const relations = activeSessionId ? relationsBySession[activeSessionId] ?? (backendOnline ? [] : MOCK_RELATIONS) : []
  const isRunningHere = run !== null && !run.done && run.sessionId === activeSessionId
  const analyzing = run !== null && !run.done

  const currentMetrics = useMemo(() => {
    if (!golden || evalRecords.length === 0) return null
    const current = summaries.find((s) => s.version === activeVersion)
    const matched = evalRecords.find((r) => current && r.summaryVersion === current.version && r.mode === current.mode && !r.outdated)
    return (matched ?? evalRecords.find((r) => !r.outdated) ?? evalRecords[0]).metrics
  }, [golden, evalRecords, summaries, activeVersion])

  const runForView = isRunningHere || (run && run.sessionId === activeSessionId) ? run : null

  return (
    <div className="app-shell">
      <WindowHeader
        hasSummary={summaries.length > 0}
        analyzing={analyzing}
        canAnalyze={canAnalyze && activeSession !== null}
        analyzeBlockReason={activeSession === null ? '请先导入并选择会话' : analyzeBlockReason}
        onStartAnalysis={handleStartAnalysis}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="app-body">
        <OfflineSessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onImportFiles={handleImportFiles}
          onDelete={handleDeleteSession}
        />

        {activeSession ? (
          <div className="workspace-stage">
            <div className="workspace-topbar">
            <AnalysisModeSwitcher
              mode={mode}
              disabled={analyzing}
              running={isRunningHere}
              elapsedSeconds={runForView?.elapsed ?? null}
              lastRunSeconds={activeSessionId ? lastRunSecondsBySession[activeSessionId]?.[mode] ?? null : null}
              onChange={setMode}
            />
            </div>

            {mode === 'agent-workflow' ? (
              <AgentWorkflowPanel
                steps={
                  runForView && runForView.mode === 'agent-workflow'
                    ? runForView.steps
                    : summaries.some((s) => s.mode === 'agent-workflow')
                      ? completedSteps()
                      : waitingSteps()
                }
                running={isRunningHere}
              />
            ) : (
              <SingleModelProgressPanel
                running={isRunningHere}
                done={
                  runForView && runForView.mode === 'single-model'
                    ? runForView.done
                    : summaries.some((s) => s.mode === 'single-model')
                }
              />
            )}

            <div className="workspace-lower">
              <main className="main-workspace">
            <div className="conversation-module panel">
              <RawConversationPanel
                groupName={activeSession.groupName}
                timeRange={activeSession.timeRange}
                messages={messages}
                members={members}
                highlightMessageId={highlightMessageId}
                onPersonClick={flashUser}
              />
              <CompactContextSidebar
                groupName={activeSession.groupName}
                members={members}
                relations={relations}
                highlightUserId={highlightUserId}
              />
            </div>

            <SummaryComparisonPanel
              groupName={activeSession.groupName}
              summaries={summaries}
              activeVersion={activeVersion}
              onSelectVersion={(v) => setActiveVersionBySession((m) => ({ ...m, [activeSession.sessionId]: v }))}
              golden={golden}
              generating={isRunningHere}
              generatingMode={run?.mode ?? mode}
              onToast={toast}
            />

            {/* 未携带黄金摘要时评测区整体隐藏（§8.2/§9.1） */}
            {golden && (
              <EvaluationPanel
                groupName={activeSession.groupName}
                records={evalRecords}
                currentMetrics={currentMetrics}
                onToast={toast}
              />
            )}

              </main>
            </div>
          </div>
        ) : (
          <main className="main-workspace">
            <div className="panel workspace-empty">
              <div className="big">🗂️</div>
              <div>尚未导入离线会话</div>
              <div style={{ fontSize: 12 }}>点击左侧"导入离线会话"或拖拽文件到左下角区域开始</div>
            </div>
          </main>
        )}

      </div>

      {settingsOpen && (
        <LocalModelSettingsDialog
          profiles={profiles}
          defaultProfileId={defaultProfileId}
          bindings={bindings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveProfile}
          onDelete={handleDeleteProfile}
          onSetDefault={handleSetDefaultProfile}
          onTest={handleTestConnection}
          onToggleThinking={handleToggleThinking}
          onBindingChange={handleBindingChange}
          onFetchModels={backendOnline ? handleFetchModels : undefined}
          onToast={toast}
        />
      )}

      {importFiles && importFiles.length > 0 && (
        <ImportPreviewDialog
          files={importFiles}
          onConfirm={handleConfirmImport}
          onCancel={() => setImportFiles(null)}
          onRemove={(id) => setImportFiles((cur) => (cur ?? []).filter((f) => f.id !== id))}
        />
      )}

      <div className="toast-box">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </div>
  )
}
