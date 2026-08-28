import { useEffect, useRef, useState } from 'react'
import type { AgentKey, AgentModelBinding, ConnectionStatus, ModelProfile, ProviderType } from '../../../shared/types'
import type { ListModelsResponse } from '../api/wireTypes'
import robotSprite from '../assets/acl-robot-agents-sprite.png'

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
  onFetchModels?: (req: { profileId?: string; providerType?: ProviderType; baseUrl?: string; apiKey?: string }) => Promise<ListModelsResponse>
  onToast: (text: string) => void
}
type AssignmentView = 'baseline' | 'team' | 'evaluation'
type EditingProfile = Omit<ModelProfile, 'profileId'> & { profileId?: string }

interface WorkCard {
  key: AgentKey
  title: string
  action: string
  sprite: string
  tone: 'navy' | 'teal'
}

const PROVIDER_LABEL: Record<ProviderType, string> = {
  'openai-compatible': 'OpenAI 兼容', anthropic: 'Anthropic', custom: '自定义服务'
}

const CONN_LABEL: Record<ConnectionStatus, string> = {
  untested: '待验证', testing: '验证中', available: '可使用', failed: '不可用'
}

const EMPTY_FORM: Omit<ModelProfile, 'profileId'> = {
  displayName: '', providerType: 'openai-compatible', baseUrl: '', apiKey: '', modelName: '',
  connectionStatus: 'untested', thinkingModeSupported: null, thinkingModeEnabled: false
}

const BASELINE_WORK: WorkCard[] = [
  { key: 'single-model', title: '摘要生成', action: '整理群聊为工作简报', sprite: 'baseline-summary', tone: 'navy' },
  { key: 'importance-extractor', title: '重要消息', action: '挑出需要关注的原始消息', sprite: 'baseline-importance', tone: 'teal' }
]

const TEAM_PHASES: Array<{ title: string; work: WorkCard[] }> = [
  { title: '理解群聊', work: [
    { key: 'context-event', title: '事件识别', action: '还原话题与关键事件', sprite: 'context-event', tone: 'navy' },
    { key: 'state', title: '状态判断', action: '确认当前有效结论', sprite: 'state', tone: 'teal' }
  ] },
  { title: '生成内容', work: [
    { key: 'summary', title: '摘要生成', action: '撰写结构化工作简报', sprite: 'summary', tone: 'navy' },
    { key: 'importance-extractor', title: '重要消息', action: '按说话人保留原始消息', sprite: 'importance-extractor', tone: 'teal' }
  ] },
  { title: '检查与返工', work: [
    { key: 'factual-auditor', title: '摘要审核', action: '核对事实、状态与遗漏', sprite: 'factual-auditor', tone: 'navy' },
    { key: 'importance-auditor', title: '消息审核', action: '剔除误报并补回遗漏', sprite: 'importance-auditor', tone: 'teal' }
  ] }
]

const EVALUATION_WORK: WorkCard = {
  key: 'evaluation-judge', title: '结果评审', action: '对照参考答案给出评测结果', sprite: 'factual-auditor', tone: 'navy'
}

function maskKey(key: string): string {
  if (key.length <= 6) return '••••••'
  return `${key.slice(0, 3)}••••${key.slice(-4)}`
}

function WorkAssignmentCard({ work, profiles, defaultProfileId, bindings, onChange }: {
  work: WorkCard
  profiles: ModelProfile[]
  defaultProfileId: string | null
  bindings: AgentModelBinding[]
  onChange: (agentKey: AgentKey, profileId: string | undefined) => void
}) {
  const binding = bindings.find((item) => item.agentKey === work.key)
  const defaultProfile = profiles.find((item) => item.profileId === defaultProfileId)
  return <div className={`work-assignment-card ${work.tone}`}>
    <span className={`assignment-mascot mascot-sprite mascot-${work.sprite}`} style={{ backgroundImage: `url(${robotSprite})` }} aria-hidden="true" />
    <div className="assignment-copy"><b>{work.title}</b><span>{work.action}</span></div>
    <select value={binding?.profileId ?? ''} disabled={profiles.length === 0} onChange={(e) => onChange(work.key, e.target.value || undefined)} aria-label={`${work.title}使用的模型`}>
      <option value="">{defaultProfile ? `常用模型 · ${defaultProfile.displayName}` : '先添加模型'}</option>
      {profiles.map((profile) => <option key={profile.profileId} value={profile.profileId}>{profile.displayName}</option>)}
    </select>
  </div>
}

export default function LocalModelSettingsDialog(props: Props) {
  const { profiles, defaultProfileId, bindings, onClose, onSave, onDelete, onSetDefault, onTest, onToggleThinking, onBindingChange, onFetchModels, onToast } = props
  const [editing, setEditing] = useState<EditingProfile | null>(null)
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('baseline')
  const [formError, setFormError] = useState('')
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelCapabilities, setModelCapabilities] = useState<ListModelsResponse['capabilities']>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const lastFetchKeyRef = useRef('')

  const startEdit = (profile?: ModelProfile) => {
    setFormError('')
    setModelOptions([])
    setModelCapabilities({})
    setModelsError('')
    lastFetchKeyRef.current = ''
    setEditing(profile ? { ...profile, apiKey: profile.apiKey ?? '' } : { ...EMPTY_FORM, displayName: `模型 ${profiles.length + 1}` })
  }

  const resetConnection = (patch: Partial<EditingProfile>) => {
    setModelOptions([])
    setModelCapabilities({})
    setModelsError('')
    lastFetchKeyRef.current = ''
    setEditing((current) => current ? {
      ...current, ...patch, modelName: '', connectionStatus: 'untested',
      thinkingModeSupported: null, thinkingModeEnabled: false
    } : current)
  }

  const autoFetchKey = editing && /^https?:\/\/.+/.test(editing.baseUrl.trim()) && (editing.apiKey?.trim() || editing.profileId)
    ? [editing.baseUrl.trim(), editing.apiKey?.trim() ?? '', editing.apiKey?.trim() ? '' : editing.profileId ?? ''].join('|')
    : ''

  useEffect(() => {
    if (!editing || !onFetchModels || !autoFetchKey || autoFetchKey === lastFetchKeyRef.current) return
    lastFetchKeyRef.current = autoFetchKey
    let alive = true
    const timer = window.setTimeout(async () => {
      setModelsLoading(true)
      setModelsError('')
      try {
        const request = editing.profileId && !editing.apiKey?.trim()
          ? { profileId: editing.profileId }
          : { providerType: editing.providerType, baseUrl: editing.baseUrl.trim(), apiKey: editing.apiKey?.trim() }
        const catalog = await onFetchModels(request)
        if (!alive) return
        const models = catalog.models
        setModelOptions(models)
        setModelCapabilities(catalog.capabilities)
        setModelsError(models.length === 0 ? '没有找到可选模型，请检查服务地址和访问密钥' : '')
        setEditing((current) => {
          if (!current) return current
          const nextModel = models.includes(current.modelName) ? current.modelName : (models[0] ?? '')
          const thinkingSupported = nextModel ? catalog.capabilities[nextModel]?.thinkingModeSupported ?? false : null
          return {
            ...current,
            modelName: nextModel,
            connectionStatus: nextModel ? 'available' : 'failed',
            thinkingModeSupported: thinkingSupported,
            thinkingModeEnabled: thinkingSupported ? current.thinkingModeEnabled : false
          }
        })
      } catch (error) {
        if (!alive) return
        setModelOptions([])
        setModelCapabilities({})
        setEditing((current) => current ? { ...current, modelName: '', thinkingModeSupported: null, thinkingModeEnabled: false } : current)
        setModelsError(error instanceof Error ? error.message : '暂时无法读取模型列表')
      } finally {
        if (alive) setModelsLoading(false)
      }
    }, 300)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [autoFetchKey, editing, onFetchModels])

  const saveEditing = () => {
    if (!editing) return
    if (!editing.displayName.trim()) return setFormError('请填写显示名称')
    if (!/^https?:\/\/.+/.test(editing.baseUrl.trim())) return setFormError('请填写以 http:// 或 https:// 开头的服务地址')
    if (!editing.modelName.trim()) return setFormError('请选择或填写模型')
    if (!editing.profileId && !editing.apiKey?.trim()) return setFormError('请填写访问密钥')
    onSave({
      ...editing,
      profileId: editing.profileId ?? `p-${Date.now()}`,
      apiKeyMasked: editing.apiKey?.trim() ? maskKey(editing.apiKey.trim()) : editing.apiKeyMasked,
      apiKey: editing.apiKey?.trim() || undefined,
      connectionStatus: editing.connectionStatus,
      thinkingModeSupported: editing.thinkingModeSupported
    })
    setEditing(null)
    onToast('模型已保存')
  }

  const duplicateProfile = (profile: ModelProfile) => {
    onSave({ ...profile, profileId: `p-${Date.now()}`, displayName: `${profile.displayName} 副本`, connectionStatus: 'untested', thinkingModeSupported: null, thinkingModeEnabled: false })
    onToast('模型副本已创建')
  }

  const assignmentProps = { profiles, defaultProfileId, bindings, onChange: onBindingChange }

  return <div className="overlay" onClick={onClose}>
    <div className="drawer model-settings-drawer" onClick={(event) => event.stopPropagation()}>
      <div className="drawer-header">模型设置<button className="drawer-close" onClick={onClose}>✕</button></div>
      <div className="drawer-body model-settings-body">
        <section className="model-settings-section">
          <div className="model-settings-heading">
            <div><b>可用模型</b><span>添加模型后，再分配给下方工作</span></div>
            {!editing && <button className="btn primary small" onClick={() => startEdit()}>添加模型</button>}
          </div>

          {profiles.length > 0 && <div className="model-library">
            {profiles.map((profile) => <button key={profile.profileId} className={`model-library-card ${editing?.profileId === profile.profileId ? 'selected' : ''}`} onClick={() => startEdit(profile)}>
              <span className={`conn-dot ${profile.connectionStatus}`} />
              <span className="model-library-copy"><b>{profile.displayName}</b><span>{profile.modelName || PROVIDER_LABEL[profile.providerType]}</span></span>
              {profile.profileId === defaultProfileId && <span className="common-model-tag">常用</span>}
              <span className={`model-health ${profile.connectionStatus}`}>{CONN_LABEL[profile.connectionStatus]}</span>
              {profile.thinkingModeSupported === true && <span className="deep-thinking-control" onClick={(event) => event.stopPropagation()}>
                <span>深度思考</span><span role="switch" aria-checked={profile.thinkingModeEnabled} className={`switch ${profile.thinkingModeEnabled ? 'on' : ''}`} onClick={() => onToggleThinking(profile.profileId, !profile.thinkingModeEnabled)} />
              </span>}
            </button>)}
          </div>}

          {profiles.length === 0 && !editing && <button className="model-library-empty" onClick={() => startEdit()}><b>添加第一个模型</b><span>填写服务地址、访问密钥并选择模型</span></button>}

          {editing && <div className="model-editor">
            <div className="model-editor-title"><b>{editing.profileId ? '编辑模型' : '添加模型'}</b><span>{editing.profileId ? editing.displayName : '连接一个可用于分析的模型'}</span></div>
            <div className="model-editor-grid">
              <div className="form-row"><label>显示名称</label><input value={editing.displayName} placeholder="例如：常用模型" onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} /></div>
              <div className="form-row"><label>模型服务</label><select value={editing.providerType} onChange={(e) => resetConnection({ providerType: e.target.value as ProviderType })}><option value="openai-compatible">OpenAI 兼容</option><option value="anthropic">Anthropic</option><option value="custom">自定义服务</option></select></div>
              <div className="form-row wide"><label>服务地址</label><input value={editing.baseUrl} placeholder="https://api.example.com/v1" onChange={(e) => resetConnection({ baseUrl: e.target.value })} /></div>
              <div className="form-row"><label>访问密钥</label><input type="password" value={editing.apiKey ?? ''} placeholder={editing.apiKeyMasked ?? '输入访问密钥'} onChange={(e) => resetConnection({ apiKey: e.target.value })} /></div>
              <div className="form-row"><label>模型</label><select value={editing.modelName} disabled={modelsLoading || modelOptions.length === 0} onChange={(e) => {
                const thinkingSupported = modelCapabilities[e.target.value]?.thinkingModeSupported ?? false
                setEditing({ ...editing, modelName: e.target.value, connectionStatus: e.target.value ? 'available' : 'untested', thinkingModeSupported: thinkingSupported, thinkingModeEnabled: thinkingSupported ? editing.thinkingModeEnabled : false })
              }}>
                <option value="">{modelsLoading ? '正在获取可用模型…' : autoFetchKey ? '请选择模型' : '先填写服务地址和访问密钥'}</option>
                {modelOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select></div>
              <div className="model-thinking-row wide">
                <div><b>思考模式</b><span>{modelsLoading ? '正在读取模型能力…' : editing.thinkingModeSupported === true ? '此模型支持，可按需开启' : editing.thinkingModeSupported === false ? '此模型未检测到思考模式' : '选择模型后自动识别'}</span></div>
                <button type="button" role="switch" aria-checked={editing.thinkingModeEnabled} aria-label="开启思考模式" disabled={editing.thinkingModeSupported !== true || modelsLoading} className={`switch ${editing.thinkingModeEnabled ? 'on' : ''}`} onClick={() => setEditing({ ...editing, thinkingModeEnabled: !editing.thinkingModeEnabled })} />
              </div>
            </div>
            {modelsError && <div className="error-text">{modelsError}</div>}
            {formError && <div className="error-text">{formError}</div>}
            <div className="form-actions">
              <button className="btn primary small" onClick={saveEditing}>保存</button>
              {editing.profileId && <button className="btn small" onClick={() => { onTest(editing.profileId!); setEditing(null) }}>验证连接</button>}
              {editing.profileId && editing.profileId !== defaultProfileId && <button className="btn small" onClick={() => { onSetDefault(editing.profileId!); setEditing(null); onToast('已设为常用模型') }}>设为常用</button>}
              {editing.profileId && <button className="btn small" onClick={() => duplicateProfile(editing as ModelProfile)}>创建副本</button>}
              {editing.profileId && <button className="btn small danger" onClick={() => { onDelete(editing.profileId!); setEditing(null); onToast('模型已删除') }}>删除</button>}
              <button className="btn small" onClick={() => setEditing(null)}>取消</button>
            </div>
          </div>}
        </section>

        <section className="model-settings-section assignment-section">
          <div className="model-settings-heading"><div><b>工作分配</b><span>为每项工作选择模型</span></div></div>
          <div className="assignment-tabs" role="tablist" aria-label="工作模式">
            <button className={assignmentView === 'baseline' ? 'active' : ''} onClick={() => setAssignmentView('baseline')}>基础模式</button>
            <button className={assignmentView === 'team' ? 'active' : ''} onClick={() => setAssignmentView('team')}>团队模式</button>
            <button className={assignmentView === 'evaluation' ? 'active' : ''} onClick={() => setAssignmentView('evaluation')}>结果评审</button>
          </div>
          {assignmentView === 'baseline' && <div className="assignment-grid baseline-assignments">{BASELINE_WORK.map((work) => <WorkAssignmentCard key={work.key} work={work} {...assignmentProps} />)}</div>}
          {assignmentView === 'team' && <div className="team-assignment-board">{TEAM_PHASES.map((phase, index) => <div className="assignment-phase" key={phase.title}>
            <div className="assignment-phase-title"><span>{index + 1}</span>{phase.title}</div>
            <div className="assignment-grid">{phase.work.map((work) => <WorkAssignmentCard key={`${phase.title}-${work.key}`} work={work} {...assignmentProps} />)}</div>
          </div>)}</div>}
          {assignmentView === 'evaluation' && <div className="assignment-grid evaluation-assignment"><WorkAssignmentCard work={EVALUATION_WORK} {...assignmentProps} /></div>}
        </section>
      </div>
    </div>
  </div>
}
