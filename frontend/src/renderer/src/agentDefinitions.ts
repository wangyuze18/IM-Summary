import type { AgentKey } from '../../shared/types'

export interface AgentDef {
  key: AgentKey
  name: string
  short: string
  light: string
}

export const AGENT_DEFS: AgentDef[] = [
  { key: 'context-event', name: 'Context & Event Agent', short: '主题、原子事件与证据', light: '#93b5f6' },
  { key: 'state', name: 'State Agent', short: '决议、待办与覆盖状态', light: '#7ad7a8' },
  { key: 'summary', name: 'Summary Agent', short: '结构化摘要生成', light: '#83c9f3' },
  { key: 'importance-extractor', name: 'Importance Agent', short: '按人员抽取原始重要消息', light: '#79d4c4' },
  { key: 'factual-auditor', name: 'Factual Auditor', short: '事实、遗漏与状态审核', light: '#9bbcf4' },
  { key: 'importance-auditor', name: 'Importance Auditor', short: '精确率、覆盖与原文审核', light: '#79d4c4' }
]
