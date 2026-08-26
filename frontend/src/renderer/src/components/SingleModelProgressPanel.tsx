// SingleModelProgressPanel —— 单模型基础模式的简化进度展示（设计文档 §6.2）
// 不展示 7-Agent 工作流动画，仅"模型生成中 → 完成"

interface Props {
  running: boolean
  done: boolean
  elapsedSeconds: number | null
  progress: number
}

function formatElapsed(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export default function SingleModelProgressPanel({ running, done, elapsedSeconds, progress }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title">
          单模型基础模式
          {running && <span className="status-tag analyzing">生成中</span>}
          {done && !running && <span className="status-tag completed">已完成</span>}
        </div>
        {elapsedSeconds !== null && <span className="elapsed-time">⏱ 已进行：{formatElapsed(elapsedSeconds)}</span>}
      </div>
      <div className="single-progress">
        <div className="step">
          {running ? (
            <>
              <span className="spinner" /> 模型生成中…
            </>
          ) : done ? (
            <>✅ 生成完成</>
          ) : (
            <span style={{ color: 'var(--text-3)' }}>等待启动分析（单模型直接生成，无多 Agent 编排）</span>
          )}
        </div>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  )
}
