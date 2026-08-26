// AgentWorkflowPanel —— 7-Agent 工作流展示（设计文档 §6.1/§6.3/§6.4）
// 结构：Context & Event → (State ∥ User Context) → Personalized Relevance → Summary → (Factual ∥ Personalization Auditor) → Final
import { useState } from 'react'
import type { AgentKey, AgentStatus, AgentStepProgress } from '../../../shared/types'
import { AGENT_DEFS } from '../mockData'
import type { AgentDef, MascotProp } from '../mockData'

interface Props {
  steps: AgentStepProgress[]
  elapsedSeconds: number | null
  running: boolean
}

/** Q 版吉祥物面部表情（原型标准）：眨眼萌眼 + 腮红 + 微笑；失败时 X 眼 + 沮丧嘴 */
function MascotFace({ status }: { status: AgentStatus }) {
  if (status === 'failed') {
    return (
      <>
        <g stroke="#2b3648" strokeWidth="2" strokeLinecap="round">
          <line x1="20.5" y1="26" x2="27" y2="32" />
          <line x1="27" y1="26" x2="20.5" y2="32" />
          <line x1="37" y1="26" x2="43.5" y2="32" />
          <line x1="43.5" y1="26" x2="37" y2="32" />
        </g>
        <path d="M27 41 q5 -4.5 10 0" stroke="#2b3648" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </>
    )
  }
  return (
    <>
      <g className="mascot-eyes">
        <circle cx="24" cy="28.5" r="6.6" fill="#fff" />
        <circle cx="40" cy="28.5" r="6.6" fill="#fff" />
        <circle cx="25.2" cy="29.5" r="3.5" fill="#2b3648" />
        <circle cx="41.2" cy="29.5" r="3.5" fill="#2b3648" />
        <circle cx="26.5" cy="28" r="1.25" fill="#fff" />
        <circle cx="42.5" cy="28" r="1.25" fill="#fff" />
      </g>
      <ellipse cx="16.8" cy="36.8" rx="3.5" ry="2.1" fill="#ff8fa3" opacity="0.5" />
      <ellipse cx="47.2" cy="36.8" rx="3.5" ry="2.1" fill="#ff8fa3" opacity="0.5" />
      {status === 'running' ? (
        <path d="M27.5 37 q4.5 5.5 9 0 q-4.5 1.8 -9 0 Z" fill="#8c4a4a" stroke="#2b3648" strokeWidth="1.3" strokeLinejoin="round" />
      ) : (
        <path d="M27 37.5 q5 4.5 10 0" stroke="#2b3648" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      )}
    </>
  )
}

/** 手持道具：白色图标 + 暗部描线，位于身体右下 */
function MascotPropIcon({ prop, dark }: { prop: MascotProp; dark: string }) {
  switch (prop) {
    case 'search':
      return (
        <g stroke="#fff" strokeLinecap="round">
          <circle cx="45" cy="44" r="6" fill="none" strokeWidth="2.6" />
          <line x1="49.4" y1="48.4" x2="54" y2="53" strokeWidth="3.2" />
        </g>
      )
    case 'check':
      return (
        <g>
          <rect x="39" y="38.5" width="13" height="15" rx="2.5" fill="#fff" />
          <rect x="42.5" y="36" width="8" height="4.5" rx="2.2" fill="#fff" />
          <path d="M42.5 46.5 l3 3 l5.5 -6.5" stroke={dark} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    case 'book':
      return (
        <g>
          <rect x="38" y="40" width="16.5" height="12.5" rx="2" fill="#fff" />
          <line x1="46.2" y1="40.8" x2="46.2" y2="51.7" stroke={dark} strokeWidth="1.4" />
          <line x1="40.5" y1="44" x2="43.8" y2="44" stroke={dark} strokeWidth="1.1" strokeLinecap="round" />
          <line x1="40.5" y1="47" x2="43.8" y2="47" stroke={dark} strokeWidth="1.1" strokeLinecap="round" />
          <line x1="48.6" y1="44" x2="51.9" y2="44" stroke={dark} strokeWidth="1.1" strokeLinecap="round" />
          <line x1="48.6" y1="47" x2="51.9" y2="47" stroke={dark} strokeWidth="1.1" strokeLinecap="round" />
        </g>
      )
    case 'star':
      return <path d="M46 36.8 l2.2 4.5 4.9.7 -3.6 3.5.9 4.9 -4.4-2.3 -4.4 2.3.9-4.9 -3.6-3.5 4.9-.7 Z" fill="#fff" />
    case 'pencil':
      return (
        <g>
          <rect x="38" y="38" width="12" height="15" rx="2" fill="#fff" />
          <line x1="40.5" y1="42.5" x2="47.5" y2="42.5" stroke={dark} strokeWidth="1.1" strokeLinecap="round" />
          <line x1="40.5" y1="45.8" x2="47.5" y2="45.8" stroke={dark} strokeWidth="1.1" strokeLinecap="round" />
          <g transform="rotate(38 51 47)">
            <rect x="49.4" y="41" width="3.2" height="10" rx="1.4" fill="#ffd166" />
            <path d="M49.4 51 l1.6 3 l1.6 -3 Z" fill={dark} />
          </g>
        </g>
      )
    case 'shield':
      return (
        <g>
          <path d="M46.5 35.5 l8 3 v6.2 c0 5 -3.6 8.6 -8 10 c-4.4 -1.4 -8 -5 -8 -10 v-6.2 Z" fill="#fff" />
          <path d="M42.8 45 l2.6 2.6 l5 -5.6" stroke={dark} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    case 'heart':
      return (
        <path
          d="M46.5 52.5 c-6 -4.6 -9.2 -8.2 -9.2 -11.7 c0 -3 2.1 -5 4.6 -5 c1.8 0 3.4 1 4.6 2.7 c1.2 -1.7 2.8 -2.7 4.6 -2.7 c2.5 0 4.6 2 4.6 5 c0 3.5 -3.2 7.1 -9.2 11.7 Z"
          fill="#fff"
        />
      )
  }
}

/** Q 版 Agent 吉祥物：径向渐变团子身体 + 小短手 + 表情 + 道具（静态 SVG + CSS 小动画，§16） */
function Mascot({ def, status }: { def: AgentDef; status: AgentStatus }) {
  const gid = `mg-${def.key}`
  return (
    <svg className="mascot" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <radialGradient id={gid} cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor={def.light} />
          <stop offset="55%" stopColor={def.color} />
          <stop offset="100%" stopColor={def.dark} />
        </radialGradient>
      </defs>
      <ellipse cx="6.8" cy="40" rx="4" ry="6" fill={def.dark} transform="rotate(18 6.8 40)" />
      <ellipse cx="57.2" cy="40" rx="4" ry="6" fill={def.dark} transform="rotate(-18 57.2 40)" />
      <path d="M32 5 C47 5 57 16.5 57 31.5 C57 47 46 59 32 59 C18 59 7 47 7 31.5 C7 16.5 17 5 32 5 Z" fill={`url(#${gid})`} />
      <ellipse cx="21.5" cy="15" rx="9" ry="5" fill="#fff" opacity="0.32" transform="rotate(-22 21.5 15)" />
      <MascotFace status={status} />
      <MascotPropIcon prop={def.prop} dark={def.dark} />
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
        <Mascot def={def} status={step.status} />
        {step.status === 'completed' && <span className="agent-badge completed">✓</span>}
        {step.status === 'failed' && <span className="agent-badge failed">✕</span>}
        {step.status === 'warning' && <span className="agent-badge warning">!</span>}
        {step.status === 'revising' && <span className="agent-badge revising">↻</span>}
      </div>
      <div className="agent-name">{def.name.replace(' Agent', '')}</div>
      <div className="agent-short">{def.short}</div>
    </div>
  )
}

/** 连接线：已完成段中央带绿色对勾圆点（原型标准），进行中为流动渐变 */
function Connector({ state }: { state: 'idle' | 'active' | 'done' }) {
  return (
    <div className={`flow-connector ${state}`}>
      {state === 'done' && <span className="conn-check">✓</span>}
    </div>
  )
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
          <span className="parallel-caption green">上下文分析（并行）</span>
        </div>
        <Connector state={connAfter(['state', 'user-context'])} />
        <AgentNode step={get('personalized-relevance')} selected={selectedKey === 'personalized-relevance'} onClick={() => toggle('personalized-relevance')} />
        <Connector state={connAfter(['personalized-relevance'])} />
        <AgentNode step={get('summary')} selected={selectedKey === 'summary'} onClick={() => toggle('summary')} />
        <Connector state={connAfter(['summary'])} />
        <div className="parallel-group">
          <AgentNode step={get('factual-auditor')} selected={selectedKey === 'factual-auditor'} onClick={() => toggle('factual-auditor')} />
          <AgentNode step={get('personalization-auditor')} selected={selectedKey === 'personalization-auditor'} onClick={() => toggle('personalization-auditor')} />
          <span className="parallel-caption blue">质量审核（并行）</span>
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
