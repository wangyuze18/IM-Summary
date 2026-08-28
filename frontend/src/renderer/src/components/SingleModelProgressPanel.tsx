// 基础模式：两个互不共享中间结果的模型并行生成。
import type { AgentKey, AgentStatus, AgentStepProgress } from '../../../shared/types'
import robotSprite from '../assets/acl-robot-agents-sprite.png'

interface Props {
  running: boolean
  steps: AgentStepProgress[]
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  waiting: '等待', running: '生成中', completed: '已完成', warning: '警告', failed: '失败', revising: '修订中'
}

export default function SingleModelProgressPanel({ running, steps }: Props) {
  const statusOf = (key: AgentKey): AgentStatus => steps.find((step) => step.agentKey === key)?.status ?? 'waiting'
  return (
    <section className={`panel ${running ? 'is-running' : ''}`}>
      <div className="single-progress">
        {([
          { key: 'single-model', label: '摘要生成', sprite: 'baseline-summary' },
          { key: 'importance-extractor', label: '重要消息', sprite: 'baseline-importance' }
        ] as const).map(({ key, label, sprite }) => {
          const status = statusOf(key)
          return <div key={label} className={`agent-node single-agent-node ${status}`}>
            <div className="agent-avatar single-agent-avatar">
              <span className={`mascot mascot-sprite mascot-${sprite}`} style={{ backgroundImage: `url(${robotSprite})` }} role="img" aria-label={label} />
            </div>
            <div className="agent-name">{label}</div>
            <div className={`agent-live-status ${status}`}>
              <span className="status-dot" />
              <span>{STATUS_LABEL[status]}</span>
            </div>
          </div>
        })}
      </div>
    </section>
  )
}
