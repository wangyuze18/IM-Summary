// ImportPreviewDialog —— 导入预检查与预览（设计文档 §4.1）
// 批量导入：逐文件状态列表（校验结果/警告摘要），失败文件标红、可单独移除，不阻断其他文件
import { useState } from 'react'
import type { ImportFileItem, ImportFileStatus } from '../../../shared/types'
import PaperDialog from './PaperDialog'

interface Props {
  files: ImportFileItem[]
  onConfirm: (files: ImportFileItem[]) => void
  onCancel: () => void
  onRemove: (id: string) => void
}

const STATUS_LABEL: Record<ImportFileStatus, string> = {
  checking: '校验中…',
  ok: '校验通过',
  warning: '有警告',
  failed: '校验失败'
}

const STATUS_TAG_CLASS: Record<ImportFileStatus, string> = {
  checking: 'analyzing',
  ok: 'completed',
  warning: 'analyzing',
  failed: 'failed'
}

export default function ImportPreviewDialog({ files, onConfirm, onCancel, onRemove }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(files.find((f) => f.status !== 'failed')?.id ?? null)
  const selected = files.find((f) => f.id === selectedId) ?? null
  const importable = files.filter((f) => f.status === 'ok' || f.status === 'warning')
  const stillChecking = files.some((f) => f.status === 'checking')

  return <PaperDialog
    title="导入离线会话"
    subtitle={`${files.length} 个文件等待确认`}
    size="lg"
    onClose={onCancel}
    bodyClassName="import-dialog-body"
    footer={<>
      <button className="btn" onClick={onCancel}>取消</button>
      <button className="btn primary" disabled={importable.length === 0 || stillChecking} onClick={() => onConfirm(importable)}>
        确认导入（{importable.length}）
      </button>
    </>}
  >
          <section className="import-dialog-column">
            <div className="paper-section-label">文件校验状态</div>
            {files.map((f) => (
              <div
                key={f.id}
                className={`import-file-row ${f.id === selectedId ? 'selected' : ''} ${f.status === 'failed' ? 'failed' : ''}`}
                onClick={() => setSelectedId(f.id)}
              >
                <span className="fname" title={f.name}>{f.name}</span>
                <span className={`status-tag ${STATUS_TAG_CLASS[f.status]}`}>{STATUS_LABEL[f.status]}</span>
                <button
                  className="import-remove-file"
                  title="移除该文件"
                  aria-label={`移除${f.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(f.id)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <div style={{ color: 'var(--text-3)', fontSize: 11.5, lineHeight: 1.6, marginTop: 6 }}>
              单个文件失败不阻断其他文件；导入失败不创建会话，警告在确认前集中提示。
            </div>
          </section>

          <section className="import-dialog-column preview-column">
            <div className="paper-section-label">内容预览</div>
            {selected?.preview ? (
              <>
                <div className="import-preview-grid">
                  <div className="cell">群名称<b>{selected.preview.groupName}</b></div>
                  <div className="cell">消息数<b>{selected.preview.messageCount}</b></div>
                  <div className="cell">成员数<b>{selected.preview.memberCount}</b></div>
                  <div className="cell">角色数<b>{selected.preview.profileCount}</b></div>
                  <div className="cell">关系数<b>{selected.preview.relationCount}</b></div>
                  <div className="cell">
                    黄金摘要
                    <b style={{ color: selected.preview.hasGoldenSummary ? 'var(--yellow)' : 'var(--text-3)' }}>
                      {selected.preview.hasGoldenSummary ? '已携带' : '未携带'}
                    </b>
                  </div>
                  <div className="cell">
                    重要消息标注
                    <b style={{ color: selected.preview.hasImportantMessageLabels ? 'var(--green)' : 'var(--text-3)' }}>
                      {selected.preview.hasImportantMessageLabels ? `已标注 · ${selected.preview.importantMessageCount} 条` : '未标注'}
                    </b>
                  </div>
                </div>
                {selected.warnings.length > 0 && (
                  <div className="warn-list">
                    {selected.warnings.map((w, i) => (
                      <div key={i}>提示：{w}</div>
                    ))}
                  </div>
                )}
              </>
            ) : selected?.status === 'failed' ? (
              <div className="error-text" style={{ marginTop: 8 }}>{selected.error ?? '文件校验失败'}</div>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: 12.5, marginTop: 8 }}>
                {selected?.status === 'checking' ? '正在校验…' : '选择左侧文件查看预览'}
              </div>
            )}
          </section>
  </PaperDialog>
}
