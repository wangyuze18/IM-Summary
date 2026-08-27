// SingleModelProgressPanel —— 单模型模式的简化进度展示（设计文档 §6.2）
// 不展示 7-Agent 工作流动画，仅"模型生成中 → 完成"
import defaultAgent from '../assets/agent-core-v2.png'

interface Props {
  running: boolean
  done: boolean
}

export default function SingleModelProgressPanel({ running, done }: Props) {
  return (
    <section className="panel">
      <div className="single-progress">
        <div className={`agent-node single-agent-node ${running ? 'running' : done ? 'completed' : 'waiting'}`}>
          <div className="agent-avatar single-agent-avatar">
            <img className="mascot" src={defaultAgent} alt="单模型智能体" draggable={false} />
          </div>
          <div className="agent-name">摘要生成 + 重要消息抽取</div>
          <div className={`agent-live-status ${running ? 'running' : done ? 'completed' : 'waiting'}`}>
            <span className="status-dot" />
            <span>{running ? '生成中' : done ? '已完成' : '等待'}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
