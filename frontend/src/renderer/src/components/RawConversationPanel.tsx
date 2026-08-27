// RawConversationPanel —— 原始群聊区域（设计文档 §7）
// 纯文本：仅展示文本消息、@提及、发送者和时间，不展示富媒体组件；支持 messageId 证据高亮定位
import { useEffect, useRef } from 'react'
import type { ChatMessage, UserProfile } from '../../../shared/types'

interface Props {
  groupName: string
  timeRange: string
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
  const { groupName, timeRange, messages, members, highlightMessageId, onPersonClick } = props
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // 证据定位：滚动并高亮对应 messageId（设计文档 §12）
  useEffect(() => {
    if (!highlightMessageId) return
    const el = msgRefs.current[highlightMessageId]
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    }
  }, [highlightMessageId])

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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, minWidth: 0 }}>
          <div className="panel-title">原始群聊：{groupName}</div>
          <div className="chat-meta">
            <span>消息总数：{messages.length}</span>
            <span>时间范围：{timeRange}</span>
          </div>
        </div>
      </div>
      <div className="chat-list">
        {messages.map((msg) => (
          <div
            key={msg.messageId}
            ref={(el) => {
              msgRefs.current[msg.messageId] = el
            }}
            className={`chat-msg ${highlightMessageId === msg.messageId ? 'highlight' : ''}`}
          >
            <div
              className="chat-avatar"
              style={{ background: avatarColor(msg.senderId) }}
              title={`${msg.senderName} · ${msg.senderRole}`}
              onClick={() => onPersonClick(msg.senderId)}
            >
              {msg.senderName.slice(-1)}
            </div>
            <div className="chat-who">
              <span className="chat-sender" onClick={() => onPersonClick(msg.senderId)}>
                {msg.senderName}
              </span>
              <span className="chat-role">{msg.senderRole}</span>
            </div>
            <div className="chat-content">{renderContent(msg)}</div>
            <div className="chat-time">{msg.sentAt}</div>
          </div>
        ))}
        {messages.length === 0 && <div style={{ color: 'var(--text-3)', padding: 20, textAlign: 'center' }}>暂无消息</div>}
      </div>
    </section>
  )
}
