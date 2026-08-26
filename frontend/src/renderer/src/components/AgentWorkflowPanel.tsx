// AgentWorkflowPanel —— 7-Agent 工作流展示（设计文档 §6.1/§6.3/§6.4）
// 结构：Context & Event → (State ∥ User Context) → Personalized Relevance → Summary → (Factual ∥ Personalization Auditor) → Final
import { useState } from 'react'
import type { AgentKey, AgentStepProgress } from '../../../shared/types'
import { AGENT_DEFS } from '../mockData'

interface Props {
  steps: AgentStepProgress[]
  elapsedSeconds: number | null
  running: boolean
}

function RobotAvatar({ color, status }: { color: string; status: string }) {
  // 静态 SVG + CSS 小动画（设计文档 §16）
  return (
    <svg width="38" height="38" viewBox="0 0 38 38">
      <rect x="6" y="10" width="26" height="20" rx="7" fill={color} opacity={status === 'waiting' ? 0.45 : 1} />
      <rect x="14" y="4" width="10" height="7" rx="3" fill={color} opacity={status === 'waiting' ? 0.45 : 1} />
      <circle cx="15" cy="19" r="3" fill="#fff" />
      <circle cx="23" cy="19" r="3" fill="#fff" />
      <circle cx="15" cy="19" r="1.4" fill="#2b3648" />
      <circle cx="23" cy="19" r="1.4" fill="#2b3648" />
      {status === 'failed' ? (
        <path d="M14 26 q5 -3 10 0" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M14 25 q5 4 10 0" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      )}
      <line x1="19" y1="4" x2="19" y2="1.5" stroke={color} strokeWidth="2" />
      <circle cx="19" cy="1.5" r="1.5" fill={color} />
    </svg>
  )
}

function formatElapsed(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function AgentNode({ step, onClick, selected }: { step: AgentStepProgress; onClick: () => void; selected: boolean }) {
  const def = AGENT_DEFS.find((d) => d.key === step.agentKey)!
  return (
    <div className={`agent-node ${step.status}`} onClick={onClick} title={`${def.name}：${def.short}`}>
      <div className="agent-avatar" style={selected ? { boxShadow: '0 0 0 4px var(--yellow-bg)' } : undefined}>
        <RobotAvatar color={def.color} status={step.status} />
        {step.status === 'completed' && <span className="agent-badge completed">✓</span>}
        {step.status === 'failed' && <span className="agent-badge failed">✕</span>}
        {step.status === 'warning' && <span className="agent-badge warning">!</span>}
      </div>
      <div className="agent-name">{def.name.replace(' Agent', '')}</div>
      <div className="agent-short">{def.short}</div>
    </div>
  )
}

function Connector({ state }: { state: 'idle' | 'active' | 'done' }) {
  return <div className={`flow-connector ${state === 'done' ? 'done' : state === 'active' ? 'active' : ''}`} />
}

const STATUS_LABEL: Record<string, string> = {
  waiting: '等待',
  running: '进行中',
  completed: '已完成',
  warning: '警告',
  failed: '失败',
  revising: '修订中'
}

export default function AgentWorkflowPanel({ steps, elapsedSeconds, running }: Props) {
  const [selectedKey, setSelectedKey] = useState<AgentKey | null>(null)

  const get = (key: AgentKey): AgentStepProgress =>
    steps.find((s) => s.agentKey === key) ?? { agentKey: key, status: 'waiting', warnings: [] }

  const connAfter = (keys: AgentKey[]): 'idle' | 'active' | 'done' => {
    const sts = keys.map((k) => get(k).status)
    if (sts.every((s) => s === 'completed')) return 'done'
    if (sts.some((s) => s === 'running' || s === 'completed' || s === 'revising')) return 'active'
    return 'idle'
  }

  const selected = selectedKey ? get(selectedKey) : null
  const selectedDef = selectedKey ? AGENT_DEFS.find((d) => d.key === selectedKey)! : null
  const allDone = steps.length > 0 && steps.every((s) => s.status === 'completed')

  const toggle = (key: AgentKey) => setSelectedKey((cur) => (cur === key ? null : key))

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title">
          Agent 工作流
          {running && <span className="status-tag analyzing">进行中</span>}
          {allDone && !running && <span className="status-tag completed">已完成</span>}
        </div>
        {elapsedSeconds !== null && <span className="elapsed-time">⏱ 已进行：{formatElapsed(elapsedSeconds)}</span>}
      </div>

      <div className="workflow-flow">
        <AgentNode step={get('context-event')} selected={selectedKey === 'context-event'} onClick={() => toggle('context-event')} />
        <Connector state={connAfter(['context-event'])} />
        <div className="parallel-group">
          <AgentNode step={get('state')} selected={selectedKey === 'state'} onClick={() => toggle('state')} />
          <AgentNode step={get('user-context')} selected={selectedKey === 'user-context'} onClick={() => toggle('user-context')} />
          <span className="parallel-caption">上下文分析（并行）</span>
        </div>
        <Connector state={connAfter(['state', 'user-context'])} />
        <AgentNode step={get('personalized-relevance')} selected={selectedKey === 'personalized-relevance'} onClick={() => toggle('personalized-relevance')} />
        <Connector state={connAfter(['personalized-relevance'])} />
        <AgentNode step={get('summary')} selected={selectedKey === 'summary'} onClick={() => toggle('summary')} />
        <Connector state={connAfter(['summary'])} />
        <div className="parallel-group">
          <AgentNode step={get('factual-auditor')} selected={selectedKey === 'factual-auditor'} onClick={() => toggle('factual-auditor')} />
          <AgentNode step={get('personalization-auditor')} selected={selectedKey === 'personalization-auditor'} onClick={() => toggle('personalization-auditor')} />
          <span className="parallel-caption">质量审核（并行）</span>
        </div>
        <Connector state={connAfter(['factual-auditor', 'personalization-auditor'])} />
        <div className={`final-flag ${allDone ? 'done' : ''}`}>
          <div className="flag">{allDone ? '🏁' : '◌'}</div>
          <span>Final</span>
        </div>
      </div>
      <div className="workflow-caption">事实主线（Event Ledger）× 个性化主线（User Context）· 点击 Agent 查看阶段详情，不展示思维过程</div>

      {selected && selectedDef && (
        <div className="agent-detail-pop">
          <div className="row"><span className="k">Agent</span><b>{selectedDef.name}</b></div>
          <div className="row"><span className="k">阶段说明</span>{selectedDef.short}</div>
          <div className="row"><span className="k">状态</span>{STATUS_LABEL[selected.status]}</div>
          <div className="row"><span className="k">耗时</span>{selected.elapsedMs != null ? `${(selected.elapsedMs / 1000).toFixed(1)}s` : '—'}</div>
          {selected.warnings.length > 0 && (
            <div className="row"><span className="k">结构化告警</span><span style={{ color: 'var(--yellow)' }}>{selected.warnings.join('；')}</span></div>
          )}
          {selected.error && (
            <div className="row"><span className="k">错误</span><span style={{ color: 'var(--red)' }}>{selected.error}</span></div>
          )}
        </div>
      )}
    </section>
  )
}
