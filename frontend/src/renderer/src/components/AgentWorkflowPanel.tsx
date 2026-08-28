import type { AgentKey, AgentStatus, AgentStepProgress } from '../../../shared/types'
import { AGENT_DEFS } from '../agentDefinitions'
import robotSprite from '../assets/acl-robot-agents-sprite.png'

interface Props { steps: AgentStepProgress[]; running: boolean }

const AGENT_LABEL: Partial<Record<AgentKey, string>> = {
  'context-event': '事件识别', state: '状态判断', summary: '摘要生成',
  'importance-extractor': '重要消息', 'factual-auditor': '摘要审核', 'importance-auditor': '消息审核'
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  waiting: '等待', running: '进行中', completed: '已完成', warning: '警告',
  failed: '失败', revising: '定向修订'
}

function AgentNode({ step }: { step: AgentStepProgress }) {
  const def = AGENT_DEFS.find((item) => item.key === step.agentKey)!
  return <div className={`agent-node ${step.status}`} title={`${def.name}：${def.short}`}>
    <div className="agent-avatar" style={{ background: `linear-gradient(145deg, ${def.light}22, #f8faff 68%)` }}>
      <span className={`mascot mascot-sprite mascot-${step.agentKey}`} style={{ backgroundImage: `url(${robotSprite})` }} role="img" aria-label={AGENT_LABEL[step.agentKey]} />
    </div>
    <div className="agent-name">{AGENT_LABEL[step.agentKey]}</div>
    <div className={`agent-live-status ${step.status}`}><span className="status-dot" /><span>{STATUS_LABEL[step.status]}</span></div>
  </div>
}

function Connector({ state }: { state: 'idle' | 'active' | 'done' }) {
  return <div className={`flow-connector ${state}`} />
}

export default function AgentWorkflowPanel({ steps, running }: Props) {
  const get = (key: AgentKey): AgentStepProgress => steps.find((step) => step.agentKey === key) ?? { agentKey: key, status: 'waiting', warnings: [] }
  const connAfter = (keys: AgentKey[]): 'idle' | 'active' | 'done' => {
    const statuses = keys.map((key) => get(key).status)
    if (statuses.every((status) => status === 'completed' || status === 'warning')) return 'done'
    if (statuses.some((status) => ['running', 'completed', 'warning', 'revising'].includes(status))) return 'active'
    return 'idle'
  }
  const revising = steps.some((step) => step.status === 'revising')
  return <section className={`panel workflow-panel ${running ? 'is-running' : ''} ${revising ? 'is-revising' : ''}`}>
    <div className="workflow-flow">
      <AgentNode step={get('context-event')} /><Connector state={connAfter(['context-event'])} />
      <AgentNode step={get('state')} /><Connector state={connAfter(['state'])} />
      <div className="parallel-group context-group"><div className="parallel-row"><AgentNode step={get('summary')} /><AgentNode step={get('importance-extractor')} /></div><span className="parallel-caption">并行生成</span></div>
      <Connector state={connAfter(['summary', 'importance-extractor'])} />
      <div className="parallel-group audit-group"><div className="parallel-row"><AgentNode step={get('factual-auditor')} /><AgentNode step={get('importance-auditor')} /></div><span className="parallel-caption">独立审核</span></div>
    </div>
  </section>
}
