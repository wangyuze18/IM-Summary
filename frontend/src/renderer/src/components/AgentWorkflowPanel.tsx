import type { AgentKey, AgentStatus, AgentStepProgress } from '../../../shared/types'
import { AGENT_DEFS } from '../agentDefinitions'
import robotSprite from '../assets/acl-robot-agents-sprite.png'

interface Props { steps: AgentStepProgress[]; running: boolean }
type FlowState = 'idle' | 'active' | 'done'
type Tone = 'navy' | 'teal'

const AGENT_LABEL: Partial<Record<AgentKey, string>> = {
  'context-event': '事件识别', state: '状态判断', summary: '摘要生成',
  'importance-extractor': '重要消息', 'factual-auditor': '摘要审核', 'importance-auditor': '消息审核'
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  waiting: '等待', running: '进行中', completed: '已完成', warning: '有提醒',
  failed: '失败', revising: '修订中'
}

function statusLabel(step: AgentStepProgress): string {
  if (step.status !== 'warning') return STATUS_LABEL[step.status]
  return step.warnings.some((message) => message.includes('未通过')) ? '需修订' : '有提醒'
}

function RoleCard({ step, tone }: { step: AgentStepProgress; tone: Tone }) {
  const def = AGENT_DEFS.find((item) => item.key === step.agentKey)!
  const label = AGENT_LABEL[step.agentKey] ?? def.name
  return <div className={`workflow-role-card agent-node ${tone} ${step.status}`} title={`${def.name}：${def.short}`}>
    <span className={`role-card-mascot mascot-sprite mascot-${step.agentKey}`} style={{ backgroundImage: `url(${robotSprite})` }} role="img" aria-label={label} />
    <span className="role-card-copy">
      <b>{label}</b>
      <small className={step.status}><i />{statusLabel(step)}</small>
    </span>
  </div>
}

function marker(state: FlowState, tone: Tone) {
  if (state === 'done') return 'desk-arrow-green'
  if (state === 'active') return tone === 'teal' ? 'desk-arrow-teal' : 'desk-arrow-navy'
  return 'desk-arrow-gray'
}

function Edge({ d, state, tone = 'navy', arrow = true, feedback = false }: {
  d: string; state: FlowState; tone?: Tone; arrow?: boolean; feedback?: boolean
}) {
  return <path className={`desk-edge ${tone} ${state} ${feedback ? 'feedback' : ''}`} d={d} markerEnd={arrow ? `url(#${marker(state, tone)})` : undefined} />
}

function OutputSheet({ state }: { state: FlowState }) {
  return <div className={`workflow-output-sheet desk-output-sheet ${state === 'active' ? 'active' : state === 'done' ? 'done' : ''}`}>
    <span className="sheet-fold" /><b>工作简报</b>
    <span className="sheet-section navy">摘要</span><i /><i />
    <span className="sheet-section teal">重要事项</span><i />
  </div>
}

export default function AgentWorkflowPanel({ steps, running }: Props) {
  const get = (key: AgentKey): AgentStepProgress => steps.find((step) => step.agentKey === key) ?? { agentKey: key, status: 'waiting', warnings: [] }
  const flow = (keys: AgentKey[]): FlowState => {
    const statuses = keys.map((key) => get(key).status)
    if (statuses.every((status) => status === 'completed' || status === 'warning')) return 'done'
    if (statuses.some((status) => ['running', 'completed', 'warning', 'revising'].includes(status))) return 'active'
    return 'idle'
  }

  // 只在生成分支真正进入 revising 时点亮回退边；审核通过后的非阻断提醒不应被画成返工。
  const summaryRevision = get('summary').status === 'revising'
  const importanceRevision = get('importance-extractor').status === 'revising'
  const outputState = flow(['factual-auditor', 'importance-auditor'])

  return <section className={`panel paper-workflow-panel editorial-desk-panel ${running ? 'is-running' : ''}`} aria-label="团队模式工作流">
    <div className="editorial-desk-scroll">
      <div className="editorial-desk-canvas">
        <div className="desk-lane summary-lane" />
        <div className="desk-lane importance-lane" />

        <svg className="desk-edge-layer" width="960" height="224" viewBox="0 0 960 224" aria-hidden="true">
          <defs>
            <marker id="desk-arrow-gray" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" /></marker>
            <marker id="desk-arrow-navy" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" /></marker>
            <marker id="desk-arrow-teal" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" /></marker>
            <marker id="desk-arrow-green" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" /></marker>
          </defs>

          <Edge d="M146 113H172" state={flow(['context-event'])} />
          <Edge d="M298 113H330V64H374" state={flow(['state'])} />
          <Edge d="M298 113H330V162H374" state={flow(['state'])} tone="teal" />
          <Edge d="M500 64H572" state={flow(['summary'])} />
          <Edge d="M500 162H572" state={flow(['importance-extractor'])} tone="teal" />
          <Edge d="M698 64H806V113" state={flow(['factual-auditor'])} arrow={false} />
          <Edge d="M698 162H806V113" state={flow(['importance-auditor'])} tone="teal" arrow={false} />
          <Edge d="M806 113H860" state={outputState} />
          <Edge d="M635 90V106H437V90" state={summaryRevision ? 'active' : 'idle'} feedback />
          <Edge d="M635 188V208H437V188" state={importanceRevision ? 'active' : 'idle'} tone="teal" feedback />
        </svg>

        <span className="desk-stage-label understand-label"><b>1</b>共同理解</span>
        <span className="desk-stage-label compose-label"><b>2</b>双轨写审</span>
        <span className="desk-stage-label merge-label"><b>3</b>形成简报</span>
        <span className="desk-lane-label summary-label">摘要</span>
        <span className="desk-lane-label importance-label">消息</span>
        <span className="desk-feedback-label summary-feedback">未通过 · 返回修订</span>
        <span className="desk-feedback-label importance-feedback">未通过 · 返回修订</span>

        <div className="desk-node context-card"><RoleCard step={get('context-event')} tone="navy" /></div>
        <div className="desk-node state-card"><RoleCard step={get('state')} tone="teal" /></div>
        <div className="desk-node summary-card"><RoleCard step={get('summary')} tone="navy" /></div>
        <div className="desk-node summary-audit-card"><RoleCard step={get('factual-auditor')} tone="navy" /></div>
        <div className="desk-node importance-card"><RoleCard step={get('importance-extractor')} tone="teal" /></div>
        <div className="desk-node importance-audit-card"><RoleCard step={get('importance-auditor')} tone="teal" /></div>
        <div className="desk-output"><OutputSheet state={outputState} /></div>
      </div>
    </div>
  </section>
}
