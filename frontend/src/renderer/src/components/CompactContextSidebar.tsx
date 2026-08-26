// CompactContextSidebar —— 右侧辅助区：群成员概览（GroupOverviewCard）+ 简化组织关系（CompactOrganizationGraphCard）（设计文档 §10）
import { useMemo, useState } from 'react'
import type { OrganizationRelation, RoleCategory, UserProfile } from '../../../shared/types'
import { avatarColor } from './RawConversationPanel'

interface Props {
  groupName: string
  members: UserProfile[]
  relations: OrganizationRelation[]
  highlightUserId: string | null
}

const ROLE_COLORS: Record<RoleCategory, string> = {
  产品: '#3b6ef6',
  研发: '#3dbb7d',
  测试: '#e8934a',
  其他: '#97a3b4'
}

function MiniAvatar({ member, hl }: { member: UserProfile; hl?: boolean }) {
  return (
    <span
      className={`mini-avatar ${hl ? 'hl' : ''}`}
      style={{ background: avatarColor(member.userId) }}
      title={`${member.name} · ${member.role} · 工号 ${member.employeeId}`}
    >
      {member.name.slice(-1)}
    </span>
  )
}

function GroupOverviewCard({ groupName, members, highlightUserId, onShowAll }: { groupName: string; members: UserProfile[]; highlightUserId: string | null; onShowAll: () => void }) {
  const roleCounts = useMemo(() => {
    const map = new Map<RoleCategory, number>()
    members.forEach((m) => map.set(m.roleCategory, (map.get(m.roleCategory) ?? 0) + 1))
    return [...map.entries()]
  }, [members])

  return (
    <section className="panel group-overview">
      <div className="panel-header" style={{ padding: '10px 14px' }}>
        <div className="panel-title" style={{ fontSize: 13 }}>群组信息</div>
      </div>
      <div style={{ padding: '10px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b>{groupName}</b>
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>共 {members.length} 人</span>
        </div>
        <div className="avatar-stack">
          {members.slice(0, 6).map((m) => (
            <MiniAvatar key={m.userId} member={m} hl={highlightUserId === m.userId} />
          ))}
          {members.length > 6 && (
            <span className="mini-avatar" style={{ background: '#eef1f6', color: 'var(--text-2)', border: '2px solid #fff', marginLeft: -7 }}>
              +{members.length - 6}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 2 }}>关键成员（按角色）</div>
        <div className="role-counts">
          {roleCounts.map(([role, count]) => (
            <span className="role-count" key={role}>
              <span className="role-dot" style={{ background: ROLE_COLORS[role] }} />
              {role}　{count} 人
            </span>
          ))}
        </div>
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <button className="link-more" onClick={onShowAll}>查看全部成员</button>
        </div>
      </div>
    </section>
  )
}

function OrgGraph({ members, relations, highlightUserId, full }: { members: UserProfile[]; relations: OrganizationRelation[]; highlightUserId: string | null; full?: boolean }) {
  const target = members.find((m) => m.isTargetUser) ?? members[0]
  // 简化模式：只画 targetUser 与最相关的 5 个成员（设计文档 §10.2）
  const shownMembers = useMemo(() => {
    if (full) return members
    const related = relations
      .filter((r) => r.fromUserId === target.userId || r.toUserId === target.userId)
      .map((r) => (r.fromUserId === target.userId ? r.toUserId : r.fromUserId))
    const unique = [...new Set(related)].slice(0, 5)
    return members.filter((m) => m.userId === target.userId || unique.includes(m.userId))
  }, [members, relations, target, full])

  const shownIds = new Set(shownMembers.map((m) => m.userId))
  const shownRelations = relations.filter((r) => shownIds.has(r.fromUserId) && shownIds.has(r.toUserId))

  const W = full ? 560 : 210
  const H = full ? 380 : 210
  const cx = W / 2
  const cy = H / 2
  const radius = full ? 140 : 56

  const others = shownMembers.filter((m) => m.userId !== target.userId)
  const pos = new Map<string, { x: number; y: number }>()
  pos.set(target.userId, { x: cx, y: cy })
  others.forEach((m, i) => {
    const angle = (Math.PI * 2 * i) / others.length - Math.PI / 2
    pos.set(m.userId, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) })
  })

  return (
    <svg className="org-svg" viewBox={`0 0 ${W} ${H}`}>
      {shownRelations.map((r, i) => {
        const a = pos.get(r.fromUserId)!
        const b = pos.get(r.toUserId)!
        return (
          <line
            key={i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#c3ccd9" strokeWidth={r.line === 'solid' ? 1.6 : 1.1}
            strokeDasharray={r.line === 'dashed' ? '4 4' : undefined}
          />
        )
      })}
      {shownMembers.map((m) => {
        const p = pos.get(m.userId)!
        const isTarget = m.userId === target.userId
        return (
          <g key={m.userId} className={`org-node ${highlightUserId === m.userId ? 'hl' : ''}`}>
            <title>{`${m.name} · ${m.role} · 工号 ${m.employeeId}`}</title>
            <circle cx={p.x} cy={p.y} r={isTarget ? 17 : 13} fill={avatarColor(m.userId)} opacity={isTarget ? 1 : 0.88} />
            <circle cx={p.x + (isTarget ? 12 : 9)} cy={p.y - (isTarget ? 12 : 9)} r={4} fill={ROLE_COLORS[m.roleCategory]} stroke="#fff" strokeWidth={1.2} />
            <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={isTarget ? 10 : 8.5} fill="#fff" fontWeight={600}>
              {m.name.slice(-1)}
            </text>
            <text x={p.x} y={p.y + (isTarget ? 30 : 25)} textAnchor="middle" fontSize={10} fill="#5b6a7d">
              {m.name}
            </text>
            <text x={p.x} y={p.y + (isTarget ? 41 : 35)} textAnchor="middle" fontSize={8} fill="#97a3b4">
              工号{m.employeeId}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function CompactContextSidebar({ groupName, members, relations, highlightUserId }: Props) {
  const [showAllMembers, setShowAllMembers] = useState(false)
  const [showFullGraph, setShowFullGraph] = useState(false)

  return (
    <aside className="compact-sidebar">
      <GroupOverviewCard groupName={groupName} members={members} highlightUserId={highlightUserId} onShowAll={() => setShowAllMembers(true)} />

      <section className="panel">
        <div className="panel-header" style={{ padding: '10px 14px' }}>
          <div className="panel-title" style={{ fontSize: 13 }}>组织关系（简述）</div>
        </div>
        <div style={{ padding: '6px 8px 10px' }}>
          <OrgGraph members={members} relations={relations} highlightUserId={highlightUserId} />
          <div style={{ textAlign: 'center' }}>
            <button className="link-more" onClick={() => setShowFullGraph(true)}>查看完整关系图 〉</button>
          </div>
        </div>
      </section>

      {showAllMembers && (
        <div className="overlay" onClick={() => setShowAllMembers(false)}>
          <div className="drawer" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              全部成员（{members.length}）
              <button className="drawer-close" onClick={() => setShowAllMembers(false)}>✕</button>
            </div>
            <div className="drawer-body">
              {members.map((m) => (
                <div className="member-row" key={m.userId}>
                  <MiniAvatar member={m} hl={highlightUserId === m.userId} />
                  <div className="who">
                    {m.name}
                    {m.isTargetUser && <span className="target-tag">当前用户</span>}
                    <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: 11.5 }}>
                      <span className="role-dot" style={{ background: ROLE_COLORS[m.roleCategory], display: 'inline-block', marginRight: 4 }} />
                      {m.role}
                    </span>
                  </div>
                  <span className="emp">工号 {m.employeeId}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFullGraph && (
        <div className="overlay center" onClick={() => setShowFullGraph(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              完整组织关系图
              <button className="drawer-close" onClick={() => setShowFullGraph(false)}>✕</button>
            </div>
            <div className="panel-body" style={{ overflowY: 'auto' }}>
              <OrgGraph members={members} relations={relations} highlightUserId={highlightUserId} full />
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-2)' }}>
                {(Object.keys(ROLE_COLORS) as RoleCategory[]).map((r) => (
                  <span key={r} className="role-count">
                    <span className="role-dot" style={{ background: ROLE_COLORS[r] }} />
                    {r}
                  </span>
                ))}
                <span className="role-count">— 实线：直接协作　┄ 虚线：弱关联</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
