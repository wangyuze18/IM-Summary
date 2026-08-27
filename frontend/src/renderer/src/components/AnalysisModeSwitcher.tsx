// AnalysisModeSwitcher —— 分析模式切换器（设计文档 §5）
import type { AnalysisMode } from '../../../shared/types'

interface Props {
  mode: AnalysisMode
  disabled: boolean
  elapsedSeconds?: number | null
  running?: boolean
  done?: boolean
  onChange: (mode: AnalysisMode) => void
}

const MODES: { key: AnalysisMode; label: string; desc: string }[] = [
  { key: 'agent-workflow', label: '团队工作流', desc: '多阶段协同分析' },
  { key: 'single-model', label: '基础模式', desc: '单模型直接生成' }
]

function formatElapsed(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export default function AnalysisModeSwitcher({ mode, disabled, elapsedSeconds, running, done, onChange }: Props) {
  return (
    <div className="analysis-bar">
      <div className="mode-switcher" role="tablist" aria-label="分析模式">
        {MODES.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={mode === m.key}
            className={mode === m.key ? 'active' : ''}
            disabled={disabled}
            title={disabled ? '分析进行中，暂不能切换模式' : m.desc}
            onClick={() => onChange(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <span className="spacer" />
      <span className={`run-state ${running ? 'running' : done ? 'done' : 'idle'}`}>
        <span className="status-dot" />
        {running ? '分析中' : done ? '已完成' : '等待分析'}
      </span>
      {elapsedSeconds != null && <span className="total-elapsed">总耗时 {formatElapsed(elapsedSeconds)}</span>}
    </div>
  )
}
