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
  SummaryResult
} from '../../shared/types'

// 团队模式各 Agent 执行编排（毫秒）：两组并行关系与设计文档 §6.1 一致
const AGENT_PLAN: { key: AgentKey; start: number; duration: number }[] = [
  { key: 'context-event', start: 0, duration: 1200 },
  { key: 'state', start: 1200, duration: 1600 },
  { key: 'user-context', start: 1200, duration: 1800 },
  { key: 'personalized-relevance', start: 3000, duration: 1300 },
  { key: 'summary', start: 4300, duration: 1800 },
  { key: 'factual-auditor', start: 6100, duration: 1400 },
  { key: 'personalization-auditor', start: 6100, duration: 1600 }
]
const AGENT_TOTAL = 7700
const SINGLE_TOTAL = 2600

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
  const [activeSessionId, setActiveSessionId] = useState<string | null>('s-001')
  const activeSession = sessions.find((s) => s.sessionId === activeSessionId) ?? null

  // ---- 摘要 / 黄金摘要 / 评测（按会话隔离）----
  const [summariesBySession, setSummariesBySession] = useState<Record<string, SummaryResult[]>>({
    's-001': [buildMockSummaries('agent-workflow', 1), buildMockSummaries('agent-workflow', 2), buildMockSummaries('single-model', 3)]
  })
  const [activeVersionBySession, setActiveVersionBySession] = useState<Record<string, number>>({ 's-001': 2 })
  const [goldenBySession, setGoldenBySession] = useState<Record<string, GoldenSummary | null>>({ 's-001': MOCK_GOLDEN })
  const [evalBySession, setEvalBySession] = useState<Record<string, EvaluationRecord[]>>({ 's-001': MOCK_EVALUATION_HISTORY })

  // ---- 分析模式与 Run ----
  const [mode, setMode] = useState<AnalysisMode>('agent-workflow')
  const [run, setRun] = useState<RunState | null>(null)
  const timersRef = useRef<number[]>([])

  // 通过 ref 读取最新状态，避免在 setState updater 内嵌套调用 setState（StrictMode 下会重复执行）
  const summariesRef = useRef(summariesBySession)
  summariesRef.current = summariesBySession
  const goldenRef = useRef(goldenBySession)
  goldenRef.current = goldenBySession

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

  // 配置持久化（应用重启后恢复，设计文档验收 18）
  useEffect(() => {
    localStorage.setItem('im-summary-model-settings', JSON.stringify({ profiles, defaultProfileId }))
  }, [profiles, defaultProfileId])

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
            recall: Math.min(0.99, base - 0.03 + jitter()),
            keyInformationOmissionRate: Math.max(0.01, (runMode === 'agent-workflow' ? 0.06 : 0.18) - jitter()),
            rougeL: Math.min(0.95, base - 0.08 + jitter())
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

  const handleStartAnalysis = () => {
    if (!activeSession || !canAnalyze || run && !run.done && run.sessionId === activeSessionId) return
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

  const handleImportFiles = async (files: { name: string; path?: string; file?: File }[]) => {
    const items: ImportFileItem[] = files.map((f) => ({ id: `imp-${Date.now()}-${Math.random()}`, name: f.name, status: 'checking', warnings: [] }))
    setImportFiles((cur) => [...(cur ?? []), ...items])
    const parsed = await Promise.all(
      files.map((f, i) =>
        parseImportFile(f.name, async () => {
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

  const handleConfirmImport = (files: ImportFileItem[]) => {
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
  const messages = activeSessionId ? importedMessages[activeSessionId] ?? MOCK_MESSAGES : []
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
        />

        {activeSession ? (
          <main className="main-workspace">
            <AnalysisModeSwitcher mode={mode} disabled={analyzing} onChange={setMode} />

            {mode === 'agent-workflow' ? (
              <AgentWorkflowPanel
                steps={runForView?.steps ?? waitingSteps()}
                elapsedSeconds={runForView ? runForView.elapsed : null}
                running={isRunningHere}
              />
            ) : (
              <SingleModelProgressPanel
                running={isRunningHere}
                done={runForView?.done ?? summaries.length > 0}
                elapsedSeconds={runForView ? runForView.elapsed : null}
                progress={runForView?.progress ?? (summaries.length > 0 ? 100 : 0)}
              />
            )}

            <RawConversationPanel
              groupName={activeSession.groupName}
              timeRange={activeSession.timeRange}
              memberCount={activeSession.memberCount}
              messages={messages}
              members={MOCK_MEMBERS}
              highlightMessageId={highlightMessageId}
              onPersonClick={flashUser}
            />

            <SummaryComparisonPanel
              groupName={activeSession.groupName}
              summaries={summaries}
              activeVersion={activeVersion}
              onSelectVersion={(v) => setActiveVersionBySession((m) => ({ ...m, [activeSession.sessionId]: v }))}
              golden={golden}
              generating={isRunningHere}
              generatingMode={run?.mode ?? mode}
              onEvidenceClick={flashMessage}
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
        ) : (
          <main className="main-workspace">
            <div className="panel workspace-empty">
              <div className="big">🗂️</div>
              <div>尚未导入离线会话</div>
              <div style={{ fontSize: 12 }}>点击左侧"导入离线会话"或拖拽文件到左下角区域开始</div>
            </div>
          </main>
        )}

        {activeSession && (
          <CompactContextSidebar
            groupName={activeSession.groupName}
            members={MOCK_MEMBERS}
            relations={MOCK_RELATIONS}
            highlightUserId={highlightUserId}
          />
        )}
      </div>

      {settingsOpen && (
        <LocalModelSettingsDialog
          profiles={profiles}
          defaultProfileId={defaultProfileId}
          bindings={bindings}
          onClose={() => setSettingsOpen(false)}
          onSave={updateProfile}
          onDelete={(id) =>
            setModelSettings((cur) => ({
              profiles: cur.profiles.filter((p) => p.profileId !== id),
              defaultProfileId: cur.defaultProfileId === id ? null : cur.defaultProfileId
            }))
          }
          onSetDefault={(id) => setModelSettings((cur) => ({ ...cur, defaultProfileId: id }))}
          onTest={handleTestConnection}
          onToggleThinking={(id, enabled) => {
            const p = profiles.find((x) => x.profileId === id)
            if (p) updateProfile({ ...p, thinkingModeEnabled: enabled })
          }}
          onBindingChange={(agentKey, profileId) =>
            setBindings((bs) => [...bs.filter((b) => b.agentKey !== agentKey), { agentKey, profileId }])
          }
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
