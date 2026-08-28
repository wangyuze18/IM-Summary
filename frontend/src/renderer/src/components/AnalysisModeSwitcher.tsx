// AnalysisModeSwitcher —— 分析模式切换器（设计文档 §5）
// V4.4：模式标签不带状态点；最右侧仅展示时间：分析中实时计时，运行过显示上次耗时，未运行过隐藏；两模式时间相互独立
import type { AnalysisMode } from '../../../shared/types'

interface Props {
  mode: AnalysisMode
  disabled: boolean
  /** 当前会话正在分析中 */
  running?: boolean
  /** 分析中的实时秒数 */
  elapsedSeconds?: number | null
  /** 当前模式上次运行耗时（秒）；从未运行时为 null，时间区整体隐藏 */
  lastRunSeconds?: number | null
  onChange: (mode: AnalysisMode) => void
}

const MODES: { key: AnalysisMode; label: string; desc: string }[] = [
  { key: 'agent-workflow', label: '团队模式', desc: '共享事实链与独立审核' },
  { key: 'single-model', label: '基础模式', desc: '摘要与重要消息并行生成' }
]

function formatElapsed(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export default function AnalysisModeSwitcher({ mode, disabled, running, elapsedSeconds, lastRunSeconds, onChange }: Props) {
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
      {/* 分析中：实时计时；否则仅当该模式运行过时展示上次耗时，未运行过不显示 */}
      {running ? (
        <span className="run-state running">
          <span className="status-dot" />
          分析中 · {formatElapsed(elapsedSeconds ?? 0)}
        </span>
      ) : lastRunSeconds != null ? (
        <span className="run-state done">
          <span className="status-dot" />
          上次运行耗时 {formatElapsed(lastRunSeconds)}
        </span>
      ) : null}
    </div>
  )
}
