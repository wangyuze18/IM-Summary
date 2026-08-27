// EvaluationPanel —— 评测指标卡 + 评测历史列表 + 导出（设计文档 §9）
// 仅在导入携带黄金摘要时渲染；不提供自动对比组件与综合评价
import { useMemo, useState } from 'react'
import type { AnalysisMode, EvaluationMetrics, EvaluationRecord } from '../../../shared/types'
import { downloadText } from '../download'

interface Props {
  groupName: string
  records: EvaluationRecord[]
  currentMetrics: EvaluationMetrics | null
  onToast: (text: string) => void
}

type ModeFilter = 'all' | AnalysisMode

const MODE_LABEL: Record<AnalysisMode, string> = {
  'agent-workflow': '团队工作流',
  'single-model': '基础模式'
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function MetricsCards({ metrics }: { metrics: EvaluationMetrics }) {
  const cards = [
    { v: pct(metrics.accuracy), n: '准确率' },
    { v: pct(metrics.recall), n: '召回率' },
    { v: pct(metrics.keyInformationOmissionRate), n: '关键信息遗漏率' },
    { v: metrics.rougeL.toFixed(2), n: '文本相似度' }
  ]
  return (
    <div className="metrics-cards">
      {cards.map((c) => (
        <div className="metric-card" key={c.n}>
          <div className="v">{c.v}</div>
          <div className="n">{c.n}</div>
        </div>
      ))}
    </div>
  )
}

function toCsv(records: EvaluationRecord[]): string {
  const header = '评测时间,模式,摘要版本,黄金版本,Accuracy,Recall,关键信息遗漏率,ROUGE-L,状态'
  const rows = records.map((r) =>
    [
      r.evaluatedAt,
      MODE_LABEL[r.mode],
      `v${r.summaryVersion}`,
      `v${r.goldenVersion}`,
      r.metrics.accuracy,
      r.metrics.recall,
      r.metrics.keyInformationOmissionRate,
      r.metrics.rougeL,
      r.outdated ? '已过期' : '有效'
    ].join(',')
  )
  return [header, ...rows].join('\n')
}

function toMarkdown(records: EvaluationRecord[], groupName: string): string {
  const lines = [
    `# ${groupName} 评测历史`,
    '',
    '| 评测时间 | 模式 | 摘要版本 | 黄金版本 | Accuracy | Recall | 遗漏率 | ROUGE-L | 状态 |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    ...records.map(
      (r) =>
        `| ${r.evaluatedAt} | ${MODE_LABEL[r.mode]} | v${r.summaryVersion} | v${r.goldenVersion} | ${pct(r.metrics.accuracy)} | ${pct(r.metrics.recall)} | ${pct(r.metrics.keyInformationOmissionRate)} | ${r.metrics.rougeL.toFixed(2)} | ${r.outdated ? '已过期' : '有效'} |`
    )
  ]
  return lines.join('\n')
}

export default function EvaluationPanel({ groupName, records, currentMetrics, onToast }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [filter, setFilter] = useState<ModeFilter>('all')
  const [detail, setDetail] = useState<EvaluationRecord | null>(null)

  const filtered = useMemo(
    () => records.filter((r) => filter === 'all' || r.mode === filter),
    [records, filter]
  )

  // 各指标列在当前筛选记录中的最优值：遗漏率取最小，其余取最大；无记录时为 null
  const best = useMemo(() => {
    if (filtered.length === 0) return null
    const pick = (get: (m: EvaluationMetrics) => number, lowerBetter: boolean) =>
      filtered.reduce((acc, r) => {
        const v = get(r.metrics)
        return acc === null || (lowerBetter ? v < acc : v > acc) ? v : acc
      }, null as number | null)
    return {
      accuracy: pick((m) => m.accuracy, false),
      recall: pick((m) => m.recall, false),
      omission: pick((m) => m.keyInformationOmissionRate, true),
      rougeL: pick((m) => m.rougeL, false)
    }
  }, [filtered])

  const handleExport = (format: 'csv' | 'json' | 'markdown') => {
    const base = `${groupName}_评测历史_${filter === 'all' ? '全部模式' : MODE_LABEL[filter]}`
    if (format === 'csv') downloadText(`${base}.csv`, toCsv(filtered), 'text/csv')
    if (format === 'json') downloadText(`${base}.json`, JSON.stringify(filtered, null, 2), 'application/json')
    if (format === 'markdown') downloadText(`${base}.md`, toMarkdown(filtered, groupName), 'text/markdown')
    onToast(`已导出 ${filtered.length} 条评测记录（${format.toUpperCase()}）`)
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title">
          评测指标（基于黄金摘要）
        </div>
        <button className="link-more" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? '展开评测历史 ▾' : '收起评测历史 ▴'}
        </button>
      </div>

      {currentMetrics ? (
        <MetricsCards metrics={currentMetrics} />
      ) : (
        <div style={{ padding: '14px 16px 4px', color: 'var(--text-3)', fontSize: 12.5 }}>
          当前摘要尚未评测，完成一次分析后自动生成评测记录。
        </div>
      )}

      {!collapsed && (
        <>
          <div className="eval-toolbar">
            <b style={{ fontSize: 12.5 }}>评测历史</b>
            <select className="version-select" value={filter} onChange={(e) => setFilter(e.target.value as ModeFilter)}>
              <option value="all">全部模式</option>
              <option value="agent-workflow">团队工作流</option>
              <option value="single-model">基础模式</option>
            </select>
            <span className="spacer" />
            <button className="btn small" onClick={() => handleExport('csv')}>导出 CSV</button>
            <button className="btn small" onClick={() => handleExport('json')}>JSON</button>
            <button className="btn small" onClick={() => handleExport('markdown')}>Markdown</button>
          </div>
          <div className="eval-table-wrap">
            <table className="eval-table">
              <thead>
                <tr>
                  <th>评测时间</th>
                  <th>模式</th>
                  <th>摘要版本</th>
                  <th>黄金版本</th>
                  <th title="越高越好">准确率 ↑</th>
                  <th title="越高越好">召回率 ↑</th>
                  <th title="越低越好">遗漏率 ↓</th>
                  <th title="越高越好">文本相似度 ↑</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.evaluationId} onClick={() => setDetail(r)} title="点击查看该次评测详情">
                    <td>{r.evaluatedAt}</td>
                    <td><span className={`mode-badge ${r.mode}`}>{MODE_LABEL[r.mode]}</span></td>
                    <td>v{r.summaryVersion}</td>
                    <td>v{r.goldenVersion}</td>
                    <td style={r.metrics.accuracy === best?.accuracy ? { fontWeight: 700 } : undefined}>{pct(r.metrics.accuracy)}</td>
                    <td style={r.metrics.recall === best?.recall ? { fontWeight: 700 } : undefined}>{pct(r.metrics.recall)}</td>
                    <td style={r.metrics.keyInformationOmissionRate === best?.omission ? { fontWeight: 700 } : undefined}>{pct(r.metrics.keyInformationOmissionRate)}</td>
                    <td style={r.metrics.rougeL === best?.rougeL ? { fontWeight: 700 } : undefined}>{r.metrics.rougeL.toFixed(2)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 16 }}>当前筛选条件下暂无评测记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && (
        <div className="overlay center" onClick={() => setDetail(null)}>
          <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              评测详情
              <button className="drawer-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="panel-body" style={{ lineHeight: 2 }}>
              <div>评测时间：{detail.evaluatedAt}</div>
              <div>模式：<span className={`mode-badge ${detail.mode}`}>{MODE_LABEL[detail.mode]}</span></div>
              <div>摘要版本：v{detail.summaryVersion}　黄金版本：v{detail.goldenVersion}</div>
              <div>状态：{detail.outdated ? '已过期（黄金摘要已更新）' : '有效'}</div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />
              <div>准确率：<b>{pct(detail.metrics.accuracy)}</b></div>
              <div>召回率：<b>{pct(detail.metrics.recall)}</b></div>
              <div>关键信息遗漏率：<b>{pct(detail.metrics.keyInformationOmissionRate)}</b></div>
              <div>文本相似度：<b>{detail.metrics.rougeL.toFixed(2)}</b></div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
