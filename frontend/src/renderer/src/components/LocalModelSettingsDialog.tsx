// LocalModelSettingsDialog —— 模型 API 设置抽屉（设计文档 §11）
// 协议选择（OpenAI 兼容/Anthropic/自定义）+ Base URL + API Key（仅掩码）+ Model Name
// 连接状态 / 思考模式状态 / 思考模式开关 / Agent 与模型绑定
import { useState } from 'react'
import type { AgentKey, AgentModelBinding, ConnectionStatus, ModelProfile, ProviderType } from '../../../shared/types'
import { AGENT_DEFS } from '../mockData'

interface Props {
  profiles: ModelProfile[]
  defaultProfileId: string | null
  bindings: AgentModelBinding[]
  onClose: () => void
  onSave: (profile: ModelProfile) => void
  onDelete: (profileId: string) => void
  onSetDefault: (profileId: string) => void
  onTest: (profileId: string) => void
  onToggleThinking: (profileId: string, enabled: boolean) => void
  onBindingChange: (agentKey: AgentKey, profileId: string | undefined) => void
  onToast: (text: string) => void
}

const PROVIDER_LABEL: Record<ProviderType, string> = {
  'openai-compatible': 'OpenAI 兼容',
  anthropic: 'Anthropic',
  custom: '自定义'
}

const CONN_LABEL: Record<ConnectionStatus, string> = {
  untested: '未测试',
  testing: '测试中',
  available: '可用',
  failed: '失败'
}

const EMPTY_FORM: Omit<ModelProfile, 'profileId'> = {
  displayName: '',
  providerType: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  modelName: '',
  connectionStatus: 'untested',
  thinkingModeSupported: null,
  thinkingModeEnabled: false
}

function maskKey(key: string): string {
  if (key.length <= 6) return '••••••'
  return `${key.slice(0, 3)}••••${key.slice(-4)}`
}

function ThinkingTag({ supported }: { supported: boolean | null }) {
  if (supported === null) return <span className="thinking-tag unknown">思考模式：- 未检测</span>
  return supported
    ? <span className="thinking-tag yes">思考模式：✓ 支持</span>
    : <span className="thinking-tag no">思考模式：✗ 不支持</span>
}

export default function LocalModelSettingsDialog(props: Props) {
  const { profiles, defaultProfileId, bindings, onClose, onSave, onDelete, onSetDefault, onTest, onToggleThinking, onBindingChange, onToast } = props
  const [editing, setEditing] = useState<(Omit<ModelProfile, 'profileId'> & { profileId?: string }) | null>(null)
  const [formError, setFormError] = useState('')

  const startEdit = (p?: ModelProfile) => {
    setFormError('')
    setEditing(
      p
        ? { ...p, apiKey: '' }
        : { ...EMPTY_FORM, displayName: `配置 ${profiles.length + 1}` }
    )
  }

  const validate = (): string => {
    if (!editing) return ''
    if (!editing.displayName.trim()) return '请填写配置名称'
    if (!/^https?:\/\/.+/.test(editing.baseUrl.trim())) return 'Base URL 格式不正确（需以 http:// 或 https:// 开头）'
    if (!editing.modelName.trim()) return '请填写 Model Name'
    if (!editing.profileId && !editing.apiKey?.trim()) return '请填写 API Key'
    return ''
  }

  const handleSave = () => {
    if (!editing) return
    const err = validate()
    if (err) {
      setFormError(err)
      return
    }
    const profile: ModelProfile = {
      ...editing,
      profileId: editing.profileId ?? `p-${Date.now()}`,
      apiKeyMasked: editing.apiKey?.trim() ? maskKey(editing.apiKey.trim()) : editing.apiKeyMasked,
      // 保留新填写的 API Key 供保存回调提交后端（仅请求使用，界面仍以掩码展示）；离线模式不读取该字段
      apiKey: editing.apiKey?.trim() || undefined,
      // 配置变更后连接状态需重新测试
      connectionStatus: 'untested',
      thinkingModeSupported: editing.apiKey?.trim() ? null : editing.thinkingModeSupported
    }
    onSave(profile)
    setEditing(null)
    onToast('配置已保存（仅影响后续 Run）')
  }

  const handleDuplicate = (p: ModelProfile) => {
    onSave({ ...p, profileId: `p-${Date.now()}`, displayName: `${p.displayName} 副本`, connectionStatus: 'untested', thinkingModeSupported: null, thinkingModeEnabled: false })
    onToast('已复制配置，请重新测试连接')
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          模型 API 设置
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          <div className="settings-note" style={{ marginBottom: 12 }}>
            模型凭据仅用于分析任务，保存后以掩码显示。
          </div>

          {profiles.map((p) => (
            <div key={p.profileId} className={`profile-card ${editing?.profileId === p.profileId ? 'selected' : ''}`} onClick={() => startEdit(p)}>
              <div className="head">
                <span className={`conn-dot ${p.connectionStatus}`} />
                <span className="name">{p.displayName}</span>
                {p.profileId === defaultProfileId && <span className="mode-badge agent-workflow">默认</span>}
                <span className="spacer" style={{ flex: 1 }} />
                <ThinkingTag supported={p.thinkingModeSupported} />
              </div>
              <div className="sub">
                {PROVIDER_LABEL[p.providerType]} · {p.modelName} · {p.baseUrl}
              </div>
              <div className="sub">
                API Key：{p.apiKeyMasked ?? '（未设置）'} · 连接状态：{CONN_LABEL[p.connectionStatus]}
                {p.lastTestedAt ? ` · 最近测试 ${p.lastTestedAt}` : ''}
              </div>
              {p.lastError && <div className="error-text">{p.lastError}</div>}
            </div>
          ))}

          {!editing && (
            <button className="btn" style={{ width: '100%' }} onClick={() => startEdit()}>＋ 新增配置档案</button>
          )}

          {editing && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginTop: 4 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>{editing.profileId ? '编辑配置' : '新增配置'}</div>
              <div className="form-row">
                <label>配置名称</label>
                <input value={editing.displayName} placeholder='如"主力大模型"、"基线模型"' onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} />
              </div>
              <div className="form-row">
                <label>接口协议</label>
                <select value={editing.providerType} onChange={(e) => setEditing({ ...editing, providerType: e.target.value as ProviderType })}>
                  <option value="openai-compatible">OpenAI 兼容</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="custom">自定义</option>
                </select>
              </div>
              <div className="form-row">
                <label>Base URL</label>
                <input value={editing.baseUrl} placeholder="https://api.example.com/v1" onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })} />
              </div>
              <div className="form-row">
                <label>API Key{editing.profileId ? '（留空表示不修改）' : ''}</label>
                <input type="password" value={editing.apiKey ?? ''} placeholder={editing.apiKeyMasked ?? 'sk-...'} onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Model Name</label>
                <input value={editing.modelName} placeholder="如 gpt-4o / claude-sonnet-4 / qwen-max" onChange={(e) => setEditing({ ...editing, modelName: e.target.value })} />
              </div>
              {formError && <div className="error-text" style={{ marginBottom: 8 }}>{formError}</div>}
              <div className="form-actions">
                <button className="btn primary small" onClick={handleSave}>保存配置</button>
                {editing.profileId && (
                  <>
                    <button className="btn small" disabled={false} onClick={() => { onTest(editing.profileId!); setEditing(null) }}>测试连接</button>
                    <button className="btn small" onClick={() => handleDuplicate(editing as ModelProfile)}>复制配置</button>
                    <button className="btn small danger" onClick={() => { onDelete(editing.profileId!); setEditing(null); onToast('配置已删除') }}>删除</button>
                    {editing.profileId !== defaultProfileId && (
                      <button className="btn small" onClick={() => { onSetDefault(editing.profileId!); setEditing(null); onToast('已设为默认配置') }}>设为默认</button>
                    )}
                  </>
                )}
                <button className="btn small" onClick={() => setEditing(null)}>取消</button>
              </div>
            </div>
          )}

          {/* 思考模式开关（§11.4）：仅支持时可用，默认关闭 */}
          {profiles.filter((p) => p.thinkingModeSupported === true).map((p) => (
            <div key={`think-${p.profileId}`} className="switch-row">
              <button
                className={`switch ${p.thinkingModeEnabled ? 'on' : ''}`}
                role="switch"
                aria-checked={p.thinkingModeEnabled}
                onClick={() => onToggleThinking(p.profileId, !p.thinkingModeEnabled)}
              />
              <span style={{ fontSize: 12.5 }}>启用思考模式（{p.displayName}）</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>默认关闭以节省成本</span>
            </div>
          ))}
          {profiles.some((p) => p.thinkingModeSupported === false) && (
            <div className="settings-note">部分配置经探测不支持思考模式，对应开关已隐藏。</div>
          )}

          {/* Agent 与模型绑定（§11.5）：默认收起，单个 Agent 可覆盖配置 */}
          <div className="settings-section">工作流模型</div>
          <details className="binding-details">
            <summary>按阶段指定模型</summary>
            <div style={{ marginTop: 6 }}>
              {AGENT_DEFS.map((def) => {
                const binding = bindings.find((b) => b.agentKey === def.key)
                return (
                  <div className="binding-row" key={def.key}>
                    <span className="agent">{def.name}</span>
                    <select
                      value={binding?.profileId ?? ''}
                      onChange={(e) => onBindingChange(def.key, e.target.value || undefined)}
                    >
                      <option value="">继承默认配置</option>
                      {profiles.map((p) => (
                        <option key={p.profileId} value={p.profileId}>{p.displayName}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
