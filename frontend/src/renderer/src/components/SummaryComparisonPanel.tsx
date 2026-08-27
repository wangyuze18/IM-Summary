// SummaryComparisonPanel —— AI 最终摘要（FinalSummaryViewer）+ 黄金摘要（GoldenSummaryViewer）（设计文档 §8）
// 黄金摘要仅来自导入携带；未携带时黄金摘要区与评测区整体隐藏
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AnalysisMode, GoldenSummary, SummaryResult } from '../../../shared/types'
import { downloadText } from '../download'

interface Props {
  groupName: string
  summaries: SummaryResult[]
  activeVersion: number | null
  onSelectVersion: (version: number) => void
  golden: GoldenSummary | null
  generating: boolean
  generatingMode: AnalysisMode
  onToast: (text: string) => void
}

const MODE_LABEL: Record<AnalysisMode, string> = {
  'agent-workflow': '团队工作流',
  'single-model': '基础模式'
}

function FinalSummaryViewer(props: Props) {
  const { groupName, summaries, activeVersion, onSelectVersion, generating, generatingMode, onToast } = props
  const [exportOpen, setExportOpen] = useState(false)
  const current = summaries.find((s) => s.version === activeVersion) ?? summaries[summaries.length - 1]

  const handleCopy = async () => {
    if (!current) return
    try {
      await navigator.clipboard.writeText(current.markdown)
      onToast('摘要 Markdown 已复制')
    } catch {
      onToast('复制失败，请重试')
    }
  }

  const handleExport = (format: 'markdown' | 'json') => {
    if (!current) return
    const base = `${groupName}_摘要_${MODE_LABEL[current.mode]}_v${current.version}`
    if (format === 'markdown') {
      downloadText(`${base}.md`, current.markdown, 'text/markdown')
    } else {
      downloadText(`${base}.json`, JSON.stringify(current, null, 2), 'application/json')
    }
    setExportOpen(false)
    onToast(`已导出 ${format === 'markdown' ? 'Markdown' : 'JSON'}`)
  }

  return (
    <div className="summary-col">
      <div className="summary-head">
        <b>智能摘要</b>
        {current && (
          <>
            <span className={`mode-badge ${current.mode}`}>{MODE_LABEL[current.mode]}</span>
            <span className="status-tag completed">已完成</span>
          </>
        )}
        <span className="spacer" />
        {summaries.length > 1 && current && (
          <select
            className="version-select"
            value={current.version}
            onChange={(e) => onSelectVersion(Number(e.target.value))}
            title="同一会话存在多个版本时支持版本切换"
          >
            {[...summaries]
              .sort((a, b) => b.version - a.version)
              .map((s) => (
                <option key={s.version} value={s.version}>
                  v{s.version} · {MODE_LABEL[s.mode]}
                </option>
              ))}
          </select>
        )}
        {current && (
          <>
            <button className="icon-btn" onClick={handleCopy}>复制</button>
            <span style={{ position: 'relative' }}>
              <button className="icon-btn" onClick={() => setExportOpen((v) => !v)}>导出 ▾</button>
              {exportOpen && (
                <div
                  style={{
                    position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, minWidth: 130, overflow: 'hidden'
                  }}
                >
                  <button className="icon-btn" style={{ display: 'block', width: '100%', border: 'none', textAlign: 'left', padding: '8px 12px' }} onClick={() => handleExport('markdown')}>
                    Markdown（推荐）
                  </button>
                  <button className="icon-btn" style={{ display: 'block', width: '100%', border: 'none', textAlign: 'left', padding: '8px 12px' }} onClick={() => handleExport('json')}>
                    JSON
                  </button>
                </div>
              )}
            </span>
          </>
        )}
      </div>

      {generating ? (
        <div className="generating">
          <span className="spinner" />
          {generatingMode === 'agent-workflow' ? 'Agent 团队协同生成中…' : '单模型生成中…'}
        </div>
      ) : current ? (
        <div className="summary-body md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.markdown}</ReactMarkdown>
        </div>
      ) : (
        <div className="summary-empty">
          <div className="big">📝</div>
          尚未生成摘要，点击右上角"开始分析"启动
        </div>
      )}
    </div>
  )
}

function GoldenSummaryViewer({ golden }: { golden: GoldenSummary }) {
  return (
    <div className="summary-col">
      <div className="summary-head">
        <b>黄金摘要</b>
        <span className="mode-badge golden">导入携带 · v{golden.goldenVersion}</span>
      </div>
      <div className="summary-body md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{golden.markdown}</ReactMarkdown>
      </div>
    </div>
  )
}

export default function SummaryComparisonPanel(props: Props) {
  const { golden } = props
  return (
    <section className="panel">
      <div className={`summary-grid ${golden ? '' : 'single'}`}>
        <FinalSummaryViewer {...props} />
        {golden && <GoldenSummaryViewer golden={golden} />}
      </div>
    </section>
  )
}
