// WindowHeader —— 顶部全局区域：平台名称 + 模型设置入口 + 开始/重新分析（设计文档 §3）
import { useState } from 'react'
import PaperDialog from './PaperDialog'

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
        <button className="btn model-settings-btn" title="模型设置" onClick={onOpenSettings}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
          <span>模型设置</span>
        </button>
        <button
          className="btn primary analyze-btn"
          disabled={analyzing || !canAnalyze}
          title={!canAnalyze ? analyzeBlockReason ?? '' : ''}
          onClick={handleClick}
        >
          {!analyzing && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          )}
          {analyzing ? '分析中…' : hasSummary ? '重新分析' : '开始分析'}
        </button>
      </div>

      {confirming && (
        <PaperDialog
          title="重新分析"
          subtitle="将当前会话生成一个新版本"
          size="sm"
          onClose={() => setConfirming(false)}
          footer={<>
            <button className="btn" onClick={() => setConfirming(false)}>取消</button>
            <button className="btn primary" onClick={() => { setConfirming(false); onStartAnalysis() }}>开始新分析</button>
          </>}
        >
          <div className="paper-dialog-callout">
            已有摘要和评测历史会继续保留，新结果将作为下一个版本加入当前会话。
          </div>
        </PaperDialog>
      )}
    </header>
  )
}
