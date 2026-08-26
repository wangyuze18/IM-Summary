// OfflineSessionSidebar —— 左侧离线会话栏：导入（NativeFileImportButton + FileDropZone）、搜索、会话列表（设计文档 §4）
import { useRef, useState } from 'react'
import type { ConversationSession, SessionStatus } from '../../../shared/types'

interface Props {
  sessions: ConversationSession[]
  activeSessionId: string | null
  onSelect: (sessionId: string) => void
  onImportFiles: (files: { name: string; path?: string; file?: File }[]) => void
}

const STATUS_TEXT: Record<SessionStatus, string> = {
  pending: '待分析',
  analyzing: '分析中',
  completed: '已完成',
  failed: '失败'
}

declare global {
  interface Window {
    desktopApi?: {
      isElectron: boolean
      openImportFiles: () => Promise<{ path: string; name: string }[]>
      readTextFile: (path: string) => Promise<string>
    }
  }
}

export default function OfflineSessionSidebar(props: Props) {
  const { sessions, activeSessionId, onSelect, onImportFiles } = props
  const [keyword, setKeyword] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = sessions.filter((s) => s.groupName.toLowerCase().includes(keyword.trim().toLowerCase()))

  const handleImportClick = async () => {
    if (window.desktopApi?.isElectron) {
      // Electron：走主进程系统文件选择器，支持多选批量导入
      const files = await window.desktopApi.openImportFiles()
      if (files.length > 0) onImportFiles(files)
    } else {
      // 浏览器调试环境降级：<input type=file multiple>
      fileInputRef.current?.click()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, file: f }))
    if (list.length > 0) onImportFiles(list)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const list = Array.from(e.dataTransfer.files)
      .filter((f) => /\.(txt|json|csv)$/i.test(f.name))
      .map((f) => ({ name: f.name, file: f }))
    if (list.length > 0) onImportFiles(list)
  }

  return (
    <aside className="session-sidebar">
      <div className="sidebar-section-title">
        离线会话
        <span className="tip" title="支持 txt / json / csv 格式，可批量导入">ⓘ</span>
      </div>
      <div className="sidebar-pad">
        <button className="btn primary import-btn" onClick={handleImportClick}>
          ＋ 导入离线会话
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.json,.csv"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
        <div className="session-search">
          <span className="icon">⌕</span>
          <input placeholder="搜索会话名称" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
      </div>

      <div className="session-list">
        {filtered.map((s) => (
          <div
            key={s.sessionId}
            className={`session-item ${s.sessionId === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelect(s.sessionId)}
          >
            <div className="info">
              <div className="name">{s.groupName}</div>
              <div className="meta">
                <span>{s.importedAt}</span>
                <span>{s.messageCount} 条消息</span>
              </div>
              <div className="meta" style={{ marginTop: 3 }}>
                <span className={`status-tag ${s.status}`}>{STATUS_TEXT[s.status]}</span>
                {s.hasGoldenSummary && <span className="status-tag" style={{ background: 'var(--yellow-bg)', color: 'var(--yellow)' }}>含黄金摘要</span>}
              </div>
            </div>
            {s.status === 'completed' && <span className="check">✓</span>}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 20, fontSize: 12 }}>
            {keyword ? '无匹配会话' : '暂无会话，请先导入'}
          </div>
        )}
      </div>

      <div
        className={`drop-zone ${dragOver ? 'dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="dz-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V5" />
            <path d="M7.5 9.5 12 5l4.5 4.5" />
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
        </div>
        支持拖拽或点击导入
        <div style={{ marginTop: 3, fontSize: 11 }}>支持 txt / json / csv 格式，可多选批量导入</div>
      </div>
    </aside>
  )
}
