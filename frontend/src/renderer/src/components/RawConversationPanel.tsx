// RawConversationPanel —— 原始群聊区域（设计文档 §7）
// 纯文本：仅展示文本消息、@提及、发送者和时间，不展示富媒体组件；支持 messageId 证据高亮定位
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, UserProfile } from '../../../shared/types'

interface Props {
  groupName: string
  timeRange: string
  memberCount: number
  messages: ChatMessage[]
  members: UserProfile[]
  highlightMessageId: string | null
  onPersonClick: (userId: string) => void
}

const AVATAR_COLORS = ['#5b8def', '#3dbb7d', '#e8934a', '#8f6fd8', '#e86a92', '#42b8a6', '#4aa8e8', '#d9930d']

export function avatarColor(userId: string): string {
  let hash = 0
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function RawConversationPanel(props: Props) {
  const { groupName, timeRange, memberCount, messages, members, highlightMessageId, onPersonClick } = props
  const [expanded, setExpanded] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // 证据定位：滚动并高亮对应 messageId（设计文档 §12）
  useEffect(() => {
    if (!highlightMessageId) return
    const el = msgRefs.current[highlightMessageId]
    if (el) {
      setExpanded(true)
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    }
  }, [highlightMessageId])

  const visible = expanded ? messages : messages.slice(0, 8)

  const renderContent = (msg: ChatMessage) => {
    if (msg.mentions.length === 0) return msg.content
    // @提及使用主色强调，点击联动右侧成员高亮
    const parts: React.ReactNode[] = []
    let rest = msg.content
    let i = 0
    while (rest.length > 0) {
      const idx = rest.indexOf('@')
      if (idx === -1) {
        parts.push(rest)
        break
      }
      if (idx > 0) parts.push(rest.slice(0, idx))
      const after = rest.slice(idx + 1)
      const mentioned = members.find((m) => msg.mentions.includes(m.userId) && after.startsWith(m.name))
      if (mentioned) {
        parts.push(
          <span key={`${msg.messageId}-${i++}`} className="mention" onClick={() => onPersonClick(mentioned.userId)}>
            @{mentioned.name}
          </span>
        )
        rest = after.slice(mentioned.name.length)
      } else {
        parts.push('@')
        rest = after
      }
    }
    return parts
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title">原始群聊：{groupName}</div>
        <div className="chat-meta">
          <span>消息总数：{messages.length}</span>
          <span>成员数：{memberCount}</span>
          <span>时间范围：{timeRange}</span>
          {messages.length > 8 && (
            <button className="link-more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? '收起' : `展开全部（共 ${messages.length} 条）`}
            </button>
          )}
        </div>
      </div>
      <div className="chat-list" ref={listRef} style={expanded ? { maxHeight: 460 } : undefined}>
        {visible.map((msg) => (
          <div
            key={msg.messageId}
            ref={(el) => {
              msgRefs.current[msg.messageId] = el
            }}
            className={`chat-msg ${highlightMessageId === msg.messageId ? 'highlight' : ''}`}
          >
            <div className="chat-time">{msg.sentAt}</div>
            <div
              className="chat-avatar"
              style={{ background: avatarColor(msg.senderId) }}
              title={`${msg.senderName} · ${msg.senderRole}`}
              onClick={() => onPersonClick(msg.senderId)}
            >
              {msg.senderName.slice(-1)}
            </div>
            <div style={{ minWidth: 0 }}>
              <span className="chat-sender" onClick={() => onPersonClick(msg.senderId)}>
                {msg.senderName}
                <span className="chat-role">{msg.senderRole}</span>
              </span>
              <div className="chat-content">{renderContent(msg)}</div>
            </div>
          </div>
        ))}
        {messages.length === 0 && <div style={{ color: 'var(--text-3)', padding: 20, textAlign: 'center' }}>暂无消息</div>}
      </div>
    </section>
  )
}
