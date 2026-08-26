// WindowHeader —— 顶部全局区域：平台名称 + 模型设置入口 + 开始/重新分析（设计文档 §3）
import { useState } from 'react'

interface Props {
  hasSummary: boolean
  analyzing: boolean
  canAnalyze: boolean
  analyzeBlockReason: string | null
  onStartAnalysis: () => void
  onOpenSettings: () => void
}

export default function WindowHeader(props: Props) {
  const { hasSummary, analyzing, canAnalyze, analyzeBlockReason, onStartAnalysis, onOpenSettings } = props
  const [confirming, setConfirming] = useState(false)

  const handleClick = () => {
    if (analyzing || !canAnalyze) return
    if (hasSummary) {
      // 已有结果时点击明确提示会产生新 Run（设计文档 §3）
      setConfirming(true)
    } else {
      onStartAnalysis()
    }
  }

  return (
    <header className="window-header">
      <div className="product-title">
        <span className="logo-flower" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <ellipse key={a} cx="12" cy="5.6" rx="2.7" ry="4.9" fill="#3b6ef6" transform={`rotate(${a} 12 12)`} />
            ))}
            <circle cx="12" cy="12" r="2.5" fill="#2f5bd7" />
          </svg>
        </span>
        企业IM智能摘要平台
      </div>
      <div className="header-actions">
        <button className="btn" onClick={onOpenSettings}>
          ⚙ 模型设置
        </button>
        <button
          className="btn primary"
          disabled={analyzing || !canAnalyze}
          title={!canAnalyze ? analyzeBlockReason ?? '' : ''}
          onClick={handleClick}
        >
          {analyzing ? '分析中…' : hasSummary ? '重新分析' : '开始分析'}
        </button>
      </div>

      {confirming && (
        <div className="overlay center" onClick={() => setConfirming(false)}>
          <div className="modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              重新分析确认
              <button className="drawer-close" onClick={() => setConfirming(false)}>✕</button>
            </div>
            <div className="panel-body" style={{ lineHeight: 1.8 }}>
              重新分析将创建一个<b>新的 Run</b>并产生新版本摘要，已有摘要与评测历史会保留。是否继续？
            </div>
            <div className="panel-body" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 0 }}>
              <button className="btn" onClick={() => setConfirming(false)}>取消</button>
              <button
                className="btn primary"
                onClick={() => {
                  setConfirming(false)
                  onStartAnalysis()
                }}
              >
                确认，开始新 Run
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
