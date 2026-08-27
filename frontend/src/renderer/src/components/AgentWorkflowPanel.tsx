// AgentWorkflowPanel —— 7-Agent 工作流展示（设计文档 §6.1/§6.3/§6.4）
// 结构：Context & Event → (State ∥ User Context) → Personalized Relevance → Summary → (Factual ∥ Personalization Auditor) → Final
import type { AgentKey, AgentStatus, AgentStepProgress } from '../../../shared/types'
import { AGENT_DEFS } from '../mockData'
import type { AgentDef, MascotProp } from '../mockData'
import contextEventAgent from '../assets/agent-context-event.png'
import stateAgent from '../assets/agent-state.png'
import userContextAgent from '../assets/agent-user-context.png'
import relevanceAgent from '../assets/agent-relevance.png'
import summaryAgent from '../assets/agent-summary.png'
import factualAuditorAgent from '../assets/agent-factual-auditor.png'
import personalizationAuditorAgent from '../assets/agent-personalization-auditor.png'

interface Props {
  steps: AgentStepProgress[]
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
const AGENT_ART: Record<AgentKey, string> = {
  'context-event': contextEventAgent,
  state: stateAgent,
  'user-context': userContextAgent,
  'personalized-relevance': relevanceAgent,
  summary: summaryAgent,
  'factual-auditor': factualAuditorAgent,
  'personalization-auditor': personalizationAuditorAgent
}

function Mascot({ def }: { def: AgentDef; status: AgentStatus }) {
  return <img className="mascot" src={AGENT_ART[def.key]} alt="" draggable={false} />
}

const AGENT_LABEL: Record<AgentKey, string> = {
  'context-event': '事件识别', state: '状态判断', 'user-context': '用户上下文',
  'personalized-relevance': '相关性分析', summary: '摘要生成',
  'factual-auditor': '事实审核', 'personalization-auditor': '个性化审核'
}

function AgentNode({ step }: { step: AgentStepProgress }) {
  const def = AGENT_DEFS.find((d) => d.key === step.agentKey)!
  return (
    <div className={`agent-node ${step.status}`} title={`${def.name}：${def.short}`}>
      <div
        className="agent-avatar"
        style={{
          background: `linear-gradient(145deg, ${def.light}1f, #f8faff 68%)`
        }}
      >
        <Mascot def={def} status={step.status} />
      </div>
      <div className="agent-name">{AGENT_LABEL[step.agentKey]}</div>
      <div className={`agent-live-status ${step.status}`}>
        <span className="status-dot" />
        <span>{STATUS_LABEL[step.status]}</span>
      </div>
    </div>
  )
}

/** 连接线：已完成段中央带绿色对勾圆点（原型标准），进行中为流动渐变 */
function Connector({ state }: { state: 'idle' | 'active' | 'done' }) {
  return <div className={`flow-connector ${state}`} />
}

const STATUS_LABEL: Record<string, string> = {
  waiting: '等待',
  running: '进行中',
  completed: '已完成',
  warning: '警告',
  failed: '失败',
  revising: '修订中'
}

export default function AgentWorkflowPanel({ steps }: Props) {
  const get = (key: AgentKey): AgentStepProgress =>
    steps.find((s) => s.agentKey === key) ?? { agentKey: key, status: 'waiting', warnings: [] }

  const connAfter = (keys: AgentKey[]): 'idle' | 'active' | 'done' => {
    const sts = keys.map((k) => get(k).status)
    if (sts.every((s) => s === 'completed')) return 'done'
    if (sts.some((s) => s === 'running' || s === 'completed' || s === 'revising')) return 'active'
    return 'idle'
  }

  return (
    <section className="panel">
      <div className="workflow-flow">
        <AgentNode step={get('context-event')} />
        <Connector state={connAfter(['context-event'])} />
        <div className="parallel-group context-group">
          <div className="parallel-row">
            <AgentNode step={get('state')} />
            <Connector state={connAfter(['state'])} />
            <AgentNode step={get('user-context')} />
          </div>
          <span className="parallel-caption">并行分析</span>
        </div>
        <Connector state={connAfter(['state', 'user-context'])} />
        <AgentNode step={get('personalized-relevance')} />
        <Connector state={connAfter(['personalized-relevance'])} />
        <AgentNode step={get('summary')} />
        <Connector state={connAfter(['summary'])} />
        <div className="parallel-group audit-group">
          <div className="parallel-row">
            <AgentNode step={get('factual-auditor')} />
            <Connector state={connAfter(['factual-auditor'])} />
            <AgentNode step={get('personalization-auditor')} />
          </div>
          <span className="parallel-caption">并行审核</span>
        </div>
      </div>
    </section>
  )
}
