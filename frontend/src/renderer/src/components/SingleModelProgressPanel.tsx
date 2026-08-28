import type { AgentKey, AgentStatus, AgentStepProgress } from '../../../shared/types'
import robotSprite from '../assets/acl-robot-agents-sprite.png'

interface Props { running: boolean; steps: AgentStepProgress[] }
type Tone = 'navy' | 'teal'

const STATUS_LABEL: Record<AgentStatus, string> = {
  waiting: '等待', running: '生成中', completed: '已完成', warning: '需调整', failed: '失败', revising: '修订中'
}
function BaselineLane({ agentKey, label, sprite, tone, status }: { agentKey: AgentKey; label: string; sprite: string; tone: Tone; status: AgentStatus }) {
  const active = status === 'running' || status === 'revising'
  return <div className={`baseline-paper-lane ${tone} ${status}`}>
    <div className={`paper-agent agent-node ${tone} ${status}`}>
      <div className="agent-avatar">
        <span className={`mascot mascot-sprite mascot-${sprite}`} style={{ backgroundImage: `url(${robotSprite})` }} role="img" aria-label={label} />
      </div>
      <div className="paper-agent-label">
        <span className="agent-name">{label}</span>
        <span className={`paper-agent-status ${status}`}><span className="status-dot" />{STATUS_LABEL[status]}</span>
      </div>
    </div>
    <span className={`baseline-arrow ${active ? 'active' : status === 'completed' || status === 'warning' ? 'done' : ''}`}><i /></span>
    <div className="baseline-output-sheet">
      <span className="sheet-fold" /><b>{label}</b><i /><i /><i />
    </div>
    <span className="sr-only">{agentKey}</span>
  </div>
}

export default function SingleModelProgressPanel({ running, steps }: Props) {
  const statusOf = (key: AgentKey): AgentStatus => steps.find((step) => step.agentKey === key)?.status ?? 'waiting'
  return <section className={`panel paper-workflow-panel baseline-paper-panel ${running ? 'is-running' : ''}`} aria-label="基础模式工作流">
    <div className="baseline-paper-flow">
      <BaselineLane agentKey="single-model" label="摘要生成" sprite="baseline-summary" tone="navy" status={statusOf('single-model')} />
      <BaselineLane agentKey="importance-extractor" label="重要消息" sprite="baseline-importance" tone="teal" status={statusOf('importance-extractor')} />
    </div>
  </section>
}
