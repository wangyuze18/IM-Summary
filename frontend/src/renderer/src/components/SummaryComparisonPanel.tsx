// SummaryComparisonPanel —— AI 最终摘要（FinalSummaryViewer）+ 黄金摘要（GoldenSummaryViewer）（设计文档 §8）
// 黄金摘要仅来自导入携带；未携带时只隐藏黄金对照，评测区仍保留占位说明
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
  'agent-workflow': '团队模式',
  'single-model': '基础模式'
}

function TeamQualityProof({ summary }: { summary: SummaryResult }) {
  if (summary.mode !== 'agent-workflow') return null
  const summaryIssues = summary.summaryAudit?.issues ?? []
  const importanceIssues = summary.importanceAudit?.issues ?? []
  const evidenceMessages = new Set(summary.eventLedger.flatMap((event) => event.evidenceMessageIds)).size
  const hasArtifacts = summary.eventLedger.length > 0 || summary.summaryAudit !== null || summary.importanceAudit !== null

  return (
    <details className="quality-proof">
      <summary>
        <span>质量详情</span>
        {hasArtifacts ? (
          <span className="quality-stats">
            {summary.eventLedger.length} 个事件 · {evidenceMessages} 条证据 · 摘要 {summaryIssues.length} 项问题 · 重要消息 {importanceIssues.length} 项问题
          </span>
        ) : (
          <span className="quality-stats">历史版本未保存审核产物</span>
        )}
      </summary>
      {hasArtifacts && (
        <div className="quality-proof-body">
          <div className="quality-proof-row">
            <b>共享证据账本</b>
            <span>{summary.eventLedger.length} 个原子事件，所有证据可回溯至原始 messageId。</span>
          </div>
          <div className="quality-proof-row">
            <b>摘要事实审核</b>
            <span>{summary.summaryAudit?.passed ? '已通过' : '未通过'}，{summaryIssues.length} 项留存问题。</span>
          </div>
          <div className="quality-proof-row">
            <b>重要消息审核</b>
            <span>{summary.importanceAudit?.passed ? '已通过' : '未通过'}，{importanceIssues.length} 项留存问题。</span>
          </div>
          {[...summaryIssues, ...importanceIssues].length > 0 && (
            <ul>
              {[...summaryIssues, ...importanceIssues].map((issue, index) => (
                <li key={`${issue.type}-${index}`}>
                  <span className={`audit-severity ${issue.severity}`}>{issue.severity === 'error' ? '错误' : '警告'}</span>
                  {issue.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  )
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
            <span className="summary-export-anchor">
              <button className="icon-btn" onClick={() => setExportOpen((v) => !v)}>导出 ▾</button>
              {exportOpen && (
                <div className="paper-popover" role="menu" aria-label="导出格式">
                  <div className="paper-popover-title">导出格式</div>
                  <button role="menuitem" onClick={() => handleExport('markdown')}><b>Markdown</b><span>适合阅读与分享</span></button>
                  <button role="menuitem" onClick={() => handleExport('json')}><b>JSON</b><span>保留结构化字段</span></button>
                </div>
              )}
            </span>
          </>
        )}
      </div>

      {generating ? (
        <div className="generating">
          <span className="spinner" />
          {generatingMode === 'agent-workflow' ? '团队分析中…' : '生成中…'}
        </div>
      ) : current ? (
        <>
          <TeamQualityProof summary={current} />
          <div className="summary-body md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.markdown}</ReactMarkdown>
          </div>
        </>
      ) : (
        <div className="summary-empty">
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
