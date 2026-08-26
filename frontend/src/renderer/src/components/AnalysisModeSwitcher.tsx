// AnalysisModeSwitcher —— 分析模式切换器（设计文档 §5）
import type { AnalysisMode } from '../../../shared/types'

interface Props {
  mode: AnalysisMode
  disabled: boolean
  onChange: (mode: AnalysisMode) => void
}

const MODES: { key: AnalysisMode; label: string; desc: string }[] = [
  { key: 'agent-workflow', label: 'Agent 团队模式', desc: '7 个 Agent 协同分析，质量优先' },
  { key: 'single-model', label: '单模型基础模式', desc: '单一模型直接生成，作为基线对照' }
]

export default function AnalysisModeSwitcher({ mode, disabled, onChange }: Props) {
  const current = MODES.find((m) => m.key === mode)!
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
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
      <span className="mode-desc">{current.desc}（仅影响下次启动分析）</span>
    </div>
  )
}
