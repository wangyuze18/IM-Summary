import { useMemo, useState } from 'react'
import type { AnalysisMode, EvaluationMetrics, EvaluationRecord } from '../../../shared/types'
import { downloadText } from '../download'

interface Props { groupName: string; records: EvaluationRecord[]; currentMetrics: EvaluationMetrics | null; onToast: (text: string) => void }
type ModeFilter = 'all' | AnalysisMode
const MODE_LABEL: Record<AnalysisMode, string> = { 'agent-workflow': '团队模式', 'single-model': '基础模式' }
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`
const optionalPct = (v?: number | null): string => v == null ? '暂无标注' : pct(v)

function MetricsCards({ metrics }: { metrics: EvaluationMetrics }) {
  const cards = [[pct(metrics.accuracy), '摘要准确率'], [pct(metrics.keyInformationOmissionRate), '关键信息遗漏率'], [metrics.rougeL.toFixed(2), '文本相似度'], [metrics.llmScore?.toFixed(1) ?? '—', '大模型文本评分'], [optionalPct(metrics.importantMessagePrecision), '重要消息精确率'], [optionalPct(metrics.importantMessageRecall), '重要消息召回率']]
  return <div className="metrics-cards">{cards.map(([v, n]) => <div className="metric-card" key={n}><div className="v">{v}</div><div className="n">{n}</div></div>)}</div>
}

function toCsv(records: EvaluationRecord[]): string {
  const header = '评测时间,模式,摘要版本,黄金版本,摘要准确率,关键信息遗漏率,文本相似度,大模型文本评分,重要消息精确率,重要消息召回率,状态'
  return [header, ...records.map((r) => [r.evaluatedAt, MODE_LABEL[r.mode], `v${r.summaryVersion}`, `v${r.goldenVersion}`, r.metrics.accuracy, r.metrics.keyInformationOmissionRate, r.metrics.rougeL, r.metrics.llmScore ?? '', r.metrics.importantMessagePrecision ?? '', r.metrics.importantMessageRecall ?? '', r.outdated ? '已过期' : '有效'].join(','))].join('\n')
}

function toMarkdown(records: EvaluationRecord[], groupName: string): string {
  return [`# ${groupName} 评测历史`, '', '| 评测时间 | 模式 | 摘要版本 | 黄金版本 | 摘要准确率 | 摘要遗漏率 | 文本相似度 | 大模型评分 | 重要消息精确率 | 重要消息召回率 | 状态 |', '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |', ...records.map((r) => `| ${r.evaluatedAt} | ${MODE_LABEL[r.mode]} | v${r.summaryVersion} | v${r.goldenVersion} | ${pct(r.metrics.accuracy)} | ${pct(r.metrics.keyInformationOmissionRate)} | ${r.metrics.rougeL.toFixed(2)} | ${r.metrics.llmScore?.toFixed(1) ?? '—'} | ${optionalPct(r.metrics.importantMessagePrecision)} | ${optionalPct(r.metrics.importantMessageRecall)} | ${r.outdated ? '已过期' : '有效'} |`)].join('\n')
}

export default function EvaluationPanel({ groupName, records, currentMetrics, onToast }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [filter, setFilter] = useState<ModeFilter>('all')
  const [detail, setDetail] = useState<EvaluationRecord | null>(null)
  const filtered = useMemo(() => records.filter((r) => filter === 'all' || r.mode === filter), [records, filter])
  const handleExport = (format: 'csv' | 'json' | 'markdown') => {
    const base = `${groupName}_评测历史_${filter === 'all' ? '全部模式' : MODE_LABEL[filter]}`
    const body = format === 'csv' ? toCsv(filtered) : format === 'json' ? JSON.stringify(filtered, null, 2) : toMarkdown(filtered, groupName)
    downloadText(`${base}.${format === 'markdown' ? 'md' : format}`, body, format === 'json' ? 'application/json' : 'text/plain')
    onToast(`已导出 ${filtered.length} 条评测记录（${format.toUpperCase()}）`)
  }
  return <section className="panel">
    <div className="panel-header"><div className="panel-title">评测指标</div><button className="link-more" onClick={() => setCollapsed((v) => !v)}>{collapsed ? '展开历史 ▾' : '收起历史 ▴'}</button></div>
    {currentMetrics ? <MetricsCards metrics={currentMetrics} /> : <div style={{ padding: '14px 16px 4px', color: 'var(--text-3)', fontSize: 12.5 }}>当前结果尚未评测；重要消息黄金标注缺失时，对应两项显示“暂无标注”。</div>}
    {!collapsed && <><div className="eval-toolbar"><b style={{ fontSize: 12.5 }}>评测历史</b><select className="version-select" value={filter} onChange={(e) => setFilter(e.target.value as ModeFilter)}><option value="all">全部模式</option><option value="agent-workflow">团队模式</option><option value="single-model">基础模式</option></select><span className="spacer" /><button className="btn small" onClick={() => handleExport('csv')}>导出 CSV</button><button className="btn small" onClick={() => handleExport('json')}>JSON</button><button className="btn small" onClick={() => handleExport('markdown')}>Markdown</button></div>
      <div className="eval-table-wrap"><table className="eval-table"><thead><tr><th>评测时间</th><th>模式</th><th>摘要版本</th><th>黄金版本</th><th>摘要准确率 ↑</th><th>摘要遗漏率 ↓</th><th>文本相似度 ↑</th><th>大模型评分 ↑</th><th>重要消息精确率 ↑</th><th>重要消息召回率 ↑</th></tr></thead><tbody>{filtered.map((r) => <tr key={r.evaluationId} onClick={() => setDetail(r)} title="点击查看详情"><td>{r.evaluatedAt}</td><td><span className={`mode-badge ${r.mode}`}>{MODE_LABEL[r.mode]}</span></td><td>v{r.summaryVersion}</td><td>v{r.goldenVersion}</td><td>{pct(r.metrics.accuracy)}</td><td>{pct(r.metrics.keyInformationOmissionRate)}</td><td>{r.metrics.rougeL.toFixed(2)}</td><td>{r.metrics.llmScore?.toFixed(1) ?? '—'}</td><td>{optionalPct(r.metrics.importantMessagePrecision)}</td><td>{optionalPct(r.metrics.importantMessageRecall)}</td></tr>)}{filtered.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 16 }}>暂无评测记录</td></tr>}</tbody></table></div></>}
    {detail && <div className="overlay center" onClick={() => setDetail(null)}><div className="modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}><div className="drawer-header">评测详情<button className="drawer-close" onClick={() => setDetail(null)}>✕</button></div><div className="panel-body" style={{ lineHeight: 2 }}><div>{detail.evaluatedAt} · {MODE_LABEL[detail.mode]} · v{detail.summaryVersion}</div><hr /><div>摘要准确率：<b>{pct(detail.metrics.accuracy)}</b></div><div>关键信息遗漏率：<b>{pct(detail.metrics.keyInformationOmissionRate)}</b></div><div>文本相似度：<b>{detail.metrics.rougeL.toFixed(2)}</b></div><div>大模型文本评分：<b>{detail.metrics.llmScore?.toFixed(1) ?? '—'}</b></div><div>重要消息精确率：<b>{optionalPct(detail.metrics.importantMessagePrecision)}</b></div><div>重要消息召回率：<b>{optionalPct(detail.metrics.importantMessageRecall)}</b></div></div></div></div>}
  </section>
}
