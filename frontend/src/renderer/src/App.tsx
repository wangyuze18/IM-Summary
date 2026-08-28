// DesktopAppShell —— 应用外壳与全局状态。业务数据只来自后端。
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

const TEAM_AGENT_KEYS: AgentKey[] = ['context-event', 'state', 'summary', 'importance-extractor', 'factual-auditor', 'importance-auditor']
const BASELINE_AGENT_KEYS: AgentKey[] = ['single-model', 'importance-extractor']

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

const keysForMode = (mode: AnalysisMode): AgentKey[] => mode === 'agent-workflow' ? TEAM_AGENT_KEYS : BASELINE_AGENT_KEYS

const waitingSteps = (keys: AgentKey[] = TEAM_AGENT_KEYS): AgentStepProgress[] =>
  keys.map((agentKey) => ({ agentKey, status: 'waiting', warnings: [] }))

const completedSteps = (keys: AgentKey[] = TEAM_AGENT_KEYS): AgentStepProgress[] =>
  keys.map((agentKey) => ({ agentKey, status: 'completed', warnings: [] }))

export default function App() {
  // ---- 会话 ----
  const [sessions, setSessions] = useState<ConversationSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const activeSession = sessions.find((s) => s.sessionId === activeSessionId) ?? null

  // ---- 摘要 / 黄金摘要 / 评测（按会话隔离）----
  const [summariesBySession, setSummariesBySession] = useState<Record<string, SummaryResult[]>>({})
  const [activeVersionBySession, setActiveVersionBySession] = useState<Record<string, number>>({})
  const [goldenBySession, setGoldenBySession] = useState<Record<string, GoldenSummary | null>>({})
  const [evalBySession, setEvalBySession] = useState<Record<string, EvaluationRecord[]>>({})
  const [evaluatingBySession, setEvaluatingBySession] = useState<Record<string, boolean>>({})
  const [membersBySession, setMembersBySession] = useState<Record<string, UserProfile[]>>({})
  const [relationsBySession, setRelationsBySession] = useState<Record<string, OrganizationRelation[]>>({})

  // ---- 分析模式与 Run ----
  const [mode, setMode] = useState<AnalysisMode>('agent-workflow')
  const [run, setRun] = useState<RunState | null>(null)
  const timersRef = useRef<number[]>([])
  // 保留各会话、各模式最近一次 Run 的真实步骤结果，刷新后仍能区分“已完成”与“有提醒”。
  const [lastRunStepsBySession, setLastRunStepsBySession] = useState<
    Record<string, Partial<Record<AnalysisMode, AgentStepProgress[]>>>
  >({})
  // 各模式上次运行耗时（按会话 + 模式隔离，V4.4：两模式时间相互独立）
  const [lastRunSecondsBySession, setLastRunSecondsBySession] = useState<Record<string, Partial<Record<AnalysisMode, number>>>>({})

  // 通过 ref 读取最新状态，避免在 setState updater 中嵌套调用 setState（StrictMode 下会重复执行）
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
  const [{ profiles, defaultProfileId }, setModelSettings] = useState<{ profiles: ModelProfile[]; defaultProfileId: string | null }>({ profiles: [], defaultProfileId: null })
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

  // ---- 后端连接：业务数据的唯一数据源 ----
  const [backendOnline, setBackendOnline] = useState(false)
  const backendOnlineRef = useRef(false)

  // 启动探测：后端可达时切换为真实数据源，加载会话列表与模型配置
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const online = await probeBackend()
      if (cancelled) return
      backendOnlineRef.current = online
      setBackendOnline(online)
      if (!online) {
        setSessions([])
        setActiveSessionId(null)
        toast('后端未连接，请启动服务后刷新', 'warn')
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
      try {
        const detail = await getSessionDetail(sessionId)
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
        // 群组成员与组织关系使用真实数据，不建立账户个人视角。
        const graph = await getOrganization(sessionId)
        const { members, relations } = mapOrganization(graph)
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
        const latest: Partial<Record<AnalysisMode, { at: number; secs: number; runId: string }>> = {}
        for (const r of runs) {
          if ((r.status === 'completed' || r.status === 'completed_with_warning') && r.startedAt && r.finishedAt) {
            const fin = new Date(r.finishedAt).getTime()
            const secs = Math.max(0, Math.round((fin - new Date(r.startedAt).getTime()) / 1000))
            const cur = latest[r.mode]
            if (!cur || fin >= cur.at) latest[r.mode] = { at: fin, secs, runId: r.runId }
          }
        }
        const entry = Object.fromEntries(Object.entries(latest).map(([m, v]) => [m, v.secs])) as Partial<Record<AnalysisMode, number>>
        if (Object.keys(entry).length > 0) {
          setLastRunSecondsBySession((m) => ({ ...m, [sessionId]: { ...m[sessionId], ...entry } }))
        }
        const latestDetails = await Promise.all(
          Object.entries(latest).map(async ([runMode, value]) => {
            const detail = await getRunStatus(value.runId)
            const typedMode = runMode as AnalysisMode
            return [typedMode, mapAgentSteps(detail.agentSteps, keysForMode(typedMode))] as const
          })
        )
        if (latestDetails.length > 0) {
          setLastRunStepsBySession((m) => ({ ...m, [sessionId]: Object.fromEntries(latestDetails) }))
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

  // ---- Run：API 启动 + 轮询状态，进度与 Agent 状态由后端给出 ----
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
      await refreshSessionFromBackend(sessionId)
      toast('分析完成，摘要已更新')
      // 摘要先展示，耗时较长的 LLM 评测在后台继续，避免终态页面被评测阻塞。
      setEvaluatingBySession((current) => ({ ...current, [sessionId]: true }))
      void startEvaluationApi(sessionId)
        .then((record) => {
          const mapped = mapEvaluationRecord(record)
          setEvalBySession((current) => ({
            ...current,
            [sessionId]: [mapped, ...(current[sessionId] ?? []).filter((item) => item.evaluationId !== mapped.evaluationId)]
          }))
          toast('评测已更新')
        })
        .catch(() => {
          // 无黄金摘要或评测失败不影响摘要可用性。
        })
        .finally(() => setEvaluatingBySession((current) => ({ ...current, [sessionId]: false })))
    },
    [refreshSessionFromBackend, toast]
  )

  const startRunBackend = useCallback(
    async (sessionId: string, runMode: AnalysisMode) => {
      clearTimers()
      const startedAt = Date.now()
      setSessions((ss) => ss.map((s) => (s.sessionId === sessionId ? { ...s, status: 'analyzing' } : s)))
      const planKeys = keysForMode(runMode)
      setRun({ sessionId, mode: runMode, startedAt, elapsed: 0, progress: 0, steps: waitingSteps(planKeys), done: false })

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
    if (!backendOnline) {
      toast('后端未连接，无法开始分析', 'error')
      return
    }
    void startRunBackend(activeSession.sessionId, mode)
  }

  // ---- 模型设置操作 ----
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
    if (!backendOnline) {
      toast('后端未连接，无法测试模型', 'error')
      return
    }
    updateProfile({ ...target, connectionStatus: 'testing', lastError: undefined })
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
  const handleFetchModels = (req: Parameters<typeof listProfileModels>[0]) => listProfileModels(req)

  const handleSaveProfile = (p: ModelProfile) => {
    if (!backendOnline) {
      toast('后端未连接，无法保存配置', 'error')
      return
    }
    saveModelProfile({
      profileId: p.profileId,
      displayName: p.displayName,
      providerType: p.providerType,
      baseUrl: p.baseUrl,
      modelName: p.modelName,
      apiKey: p.apiKey,
      connectionStatus: p.connectionStatus === 'available' ? 'available' : 'untested',
      thinkingModeSupported: p.thinkingModeSupported
    })
      .then((view) => {
        // 保存成功后立即展示；真实模型的连接验证可能需要几十秒，在后台继续完成。
        const mapped = {
          ...mapModelProfile(view),
          connectionStatus: p.connectionStatus,
          thinkingModeSupported: p.thinkingModeSupported,
          thinkingModeEnabled: p.thinkingModeEnabled,
          apiKey: p.apiKey
        }
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
      toast('后端未连接，无法删除配置', 'error')
      return
    }
    deleteModelProfile(profileId)
      .then(removeLocally)
      .catch((e) => toast(errorMessageOf(e), 'error'))
  }

  const handleSetDefaultProfile = (profileId: string) => {
    if (!backendOnline) {
      toast('后端未连接，无法保存默认配置', 'error')
      return
    }
    saveModelBindings(buildBindingsRequest(profileId, bindings))
      .then(() => setModelSettings((cur) => ({ ...cur, defaultProfileId: profileId })))
      .catch((e) => toast(`设置默认配置失败：${errorMessageOf(e)}`, 'error'))
  }

  const handleToggleThinking = (profileId: string, enabled: boolean) => {
    const p = profiles.find((x) => x.profileId === profileId)
    if (!p) return
    if (!backendOnline) {
      toast('后端未连接，无法保存思考模式', 'error')
      return
    }
    updateProfile({ ...p, thinkingModeEnabled: enabled })
    const nextProfiles = profiles.map((x) => (x.profileId === profileId ? { ...x, thinkingModeEnabled: enabled } : x))
    saveModelBindings({
        defaultProfileId,
        thinkingEnabled: nextProfiles.some((x) => x.thinkingModeEnabled),
        overrides: Object.fromEntries(
          bindings.filter((b) => b.profileId).map((b) => [agentKeyToBackend(b.agentKey), b.profileId as string])
        )
    }).catch((e) => toast(`保存思考模式失败：${errorMessageOf(e)}`, 'error'))
  }

  const handleBindingChange = (agentKey: AgentKey, profileId: string | undefined) => {
    if (!backendOnline) {
      toast('后端未连接，无法保存模型绑定', 'error')
      return
    }
    const next = profileId
      ? [...bindings.filter((b) => b.agentKey !== agentKey), { agentKey, profileId }]
      : bindings.filter((b) => b.agentKey !== agentKey)
    setBindings(next)
    saveModelBindings(buildBindingsRequest(defaultProfileId, next)).catch((e) =>
      toast(`保存模型绑定失败：${errorMessageOf(e)}`, 'error')
    )
  }

  // ---- 会话删除：后端级联删除，再清理前端缓存 ----
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
        setLastRunStepsBySession((m) => strip(m))
        setImportedMessages((m) => strip(m))
        toast('会话已删除')
      }
      if (!backendOnline) {
        toast('后端未连接，无法删除会话', 'error')
        return
      }
      deleteSession(sessionId)
        .then(removeLocally)
        .catch((e) => toast(`删除会话失败：${errorMessageOf(e)}`, 'error'))
    },
    [sessions, activeSessionId, backendOnline, toast]
  )

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
              hasGoldenSummary: pv.goldenProvided,
              hasImportantMessageLabels: pv.importantMessagesProvided,
              importantMessageCount: pv.importantMessageCount
            }
          : undefined
      }
    } catch (e) {
      return { ...item, status: 'failed', error: `预检查失败：${errorMessageOf(e)}` }
    }
  }

  const handleImportFiles = async (files: { name: string; path?: string; file?: File }[]) => {
    if (!backendOnline) {
      toast('后端未连接，无法导入会话', 'error')
      return
    }
    const items: ImportFileItem[] = files.map((f) => ({ id: `imp-${Date.now()}-${Math.random()}`, name: f.name, status: 'checking', warnings: [] }))
    setImportFiles((cur) => [...(cur ?? []), ...items])
    const parsed = await Promise.all(
      files.map((f, i) => validateImportFile(f, items[i].id))
    )
    for (const p of parsed) {
      setImportFiles((cur) => (cur ?? []).map((c) => (c.id === p.id ? p : c)))
    }
  }

  const handleConfirmImport = async (files: ImportFileItem[]) => {
    if (!backendOnline) {
      toast('后端未连接，无法确认导入', 'error')
      return
    }
    const confirmedIds: string[] = []
    for (const f of files) {
      if (!f.importId) continue
      try {
        const res = await confirmImportApi(f.importId)
        confirmedIds.push(res.sessionId)
      } catch (e) {
        toast(`导入失败：${f.name}，${errorMessageOf(e)}`, 'error')
      }
    }
    setImportFiles(null)
    if (confirmedIds.length > 0) {
      try {
        const list = await listSessionsApi()
        setSessions(list.map(mapSessionListItem))
        setActiveSessionId(confirmedIds[0])
      } catch (e) {
        toast(`刷新会话列表失败：${errorMessageOf(e)}`, 'error')
      }
      toast(`成功导入 ${confirmedIds.length} 个会话`)
    }
  }

  const [importedMessages, setImportedMessages] = useState<Record<string, ChatMessage[]>>({})

  // ---- 当前视图数据 ----
  const summaries = useMemo(() => (activeSessionId ? summariesBySession[activeSessionId] ?? [] : []), [summariesBySession, activeSessionId])
  const activeVersion = activeSessionId ? activeVersionBySession[activeSessionId] ?? null : null
  const golden = activeSessionId ? goldenBySession[activeSessionId] ?? null : null
  const evalRecords = activeSessionId ? evalBySession[activeSessionId] ?? [] : []
  const evaluating = activeSessionId ? evaluatingBySession[activeSessionId] === true : false
  const messages = activeSessionId ? importedMessages[activeSessionId] ?? [] : []
  const members = activeSessionId ? membersBySession[activeSessionId] ?? [] : []
  const relations = activeSessionId ? relationsBySession[activeSessionId] ?? [] : []
  const isRunningHere = run !== null && !run.done && run.sessionId === activeSessionId
  const analyzing = run !== null && !run.done

  const currentMetrics = useMemo(() => {
    if (!golden || evalRecords.length === 0) return null
    const current = summaries.find((s) => s.version === activeVersion)
    const matched = evalRecords.find((r) => current && r.summaryVersion === current.version && r.mode === current.mode && !r.outdated)
    return matched?.metrics ?? null
  }, [golden, evalRecords, summaries, activeVersion])

  const handleEvaluateCurrent = () => {
    if (!activeSessionId || evaluating) return
    const current = summaries.find((summary) => summary.version === activeVersion)
    if (!current) return
    setEvaluatingBySession((state) => ({ ...state, [activeSessionId]: true }))
    void startEvaluationApi(activeSessionId, current.summaryId)
      .then((record) => {
        const mapped = mapEvaluationRecord(record)
        setEvalBySession((state) => ({
          ...state,
          [activeSessionId]: [mapped, ...(state[activeSessionId] ?? []).filter((item) => item.evaluationId !== mapped.evaluationId)]
        }))
        toast('评测已更新')
      })
      .catch((error) => toast(`评测未完成：${errorMessageOf(error)}`, 'error'))
      .finally(() => setEvaluatingBySession((state) => ({ ...state, [activeSessionId]: false })))
  }

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
                    : lastRunStepsBySession[activeSession.sessionId]?.['agent-workflow']
                      ?? (summaries.some((s) => s.mode === 'agent-workflow')
                      ? completedSteps()
                      : waitingSteps()
                      )
                }
                running={isRunningHere}
              />
            ) : (
              <SingleModelProgressPanel
                running={isRunningHere}
                steps={runForView && runForView.mode === 'single-model'
                  ? runForView.steps
                  : lastRunStepsBySession[activeSession.sessionId]?.['single-model']
                    ?? (summaries.some((s) => s.mode === 'single-model')
                      ? completedSteps(BASELINE_AGENT_KEYS)
                      : waitingSteps(BASELINE_AGENT_KEYS))}
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
                evaluating={evaluating}
                onEvaluate={handleEvaluateCurrent}
                onToast={toast}
              />
            )}

              </main>
            </div>
          </div>
        ) : (
          <main className="main-workspace">
            <div className="panel workspace-empty">
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
