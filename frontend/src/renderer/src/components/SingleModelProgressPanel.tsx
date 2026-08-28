// 基础模式：两个互不共享中间结果的模型并行生成，作为 baseline。
import defaultAgent from '../assets/agent-core-v2.png'

interface Props {
  running: boolean
  done: boolean
}

export default function SingleModelProgressPanel({ running, done }: Props) {
  return (
    <section className="panel">
      <div className="single-progress">
        {['摘要生成', '重要消息'].map((label) => <div key={label} className={`agent-node single-agent-node ${running ? 'running' : done ? 'completed' : 'waiting'}`}>
          <div className="agent-avatar single-agent-avatar">
            <img className="mascot" src={defaultAgent} alt={label} draggable={false} />
          </div>
          <div className="agent-name">{label}</div>
          <div className={`agent-live-status ${running ? 'running' : done ? 'completed' : 'waiting'}`}>
            <span className="status-dot" />
            <span>{running ? '生成中' : done ? '已完成' : '等待'}</span>
          </div>
        </div>)}
      </div>
    </section>
  )
}
