// 类型化 API 客户端 —— 覆盖后端全部 REST 端点（设计文档 §11.1）
// 出入参使用 wireTypes 中的线路类型；到前端视图契约的转换见 mappers.ts

import { httpJson, httpDownload } from './httpClient'
import type {
  EvaluationRecordView,
  ImportConfirmResponse,
  ImportValidateResponse,
  ListModelsRequest,
  ListModelsResponse,
  ModelBindingsView,
  ModelProfileView,
  ModelTestDraftView,
  OrganizationGraphView,
  RunListItemView,
  RunStatusView,
  SaveBindingsRequest,
  SaveProfileRequest,
  SessionDetailView,
  SessionListItemView,
  StartRunResponse,
  SummaryListItemView,
  SummaryView,
  TestProfileRequest
} from './wireTypes'

// ---------- 会话 ----------

/** 会话列表（keyword 可选，搜索群名） */
export function listSessions(keyword?: string): Promise<SessionListItemView[]> {
  return httpJson('/api/sessions', { query: { keyword } })
}

export function getSessionDetail(sessionId: string): Promise<SessionDetailView> {
  return httpJson(`/api/sessions/${encodeURIComponent(sessionId)}`)
}

export function getOrganization(sessionId: string): Promise<OrganizationGraphView> {
  return httpJson(`/api/sessions/${encodeURIComponent(sessionId)}/organization`)
}

export function listSessionRuns(sessionId: string): Promise<RunListItemView[]> {
  return httpJson(`/api/sessions/${encodeURIComponent(sessionId)}/runs`)
}

export function deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
  return httpJson(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

// ---------- 导入 ----------

/** 导入预检查：multipart 上传（后端限制单文件 50MB），超时放宽 */
export function validateImport(file: Blob, fileName: string): Promise<ImportValidateResponse> {
  const formData = new FormData()
  formData.append('file', file, fileName)
  return httpJson('/api/imports/validate', { method: 'POST', formData, timeoutMs: 30_000 })
}

/** 确认导入：预检查记录保留 30 分钟，过期后需重新预检查 */
export function confirmImport(importId: string): Promise<ImportConfirmResponse> {
  return httpJson(`/api/imports/${encodeURIComponent(importId)}/confirm`, { method: 'POST' })
}

// ---------- 分析运行 ----------

export function startRun(sessionId: string, body: { mode: 'agent-workflow' | 'single-model'; targetUserId?: string }): Promise<StartRunResponse> {
  return httpJson(`/api/sessions/${encodeURIComponent(sessionId)}/runs`, { method: 'POST', json: body })
}

/** 运行状态轮询（WebSocket 的 HTTP 兜底） */
export function getRunStatus(runId: string): Promise<RunStatusView> {
  return httpJson(`/api/runs/${encodeURIComponent(runId)}`)
}

// ---------- 摘要 ----------

/** 当前摘要：可按模式 / 版本过滤；列表接口不含全文，需逐版本取全文 */
export function getSummary(sessionId: string, opts: { mode?: string; version?: number } = {}): Promise<SummaryView> {
  return httpJson(`/api/sessions/${encodeURIComponent(sessionId)}/summary`, { query: { mode: opts.mode, version: opts.version } })
}

export function listSummaries(sessionId: string, mode?: string): Promise<SummaryListItemView[]> {
  return httpJson(`/api/sessions/${encodeURIComponent(sessionId)}/summaries`, { query: { mode } })
}

/** 摘要导出（markdown / json 文件流） */
export function downloadSummary(summaryId: string, type: 'markdown' | 'json' = 'markdown') {
  return httpDownload(`/api/summaries/${encodeURIComponent(summaryId)}/export`, { query: { type } })
}

// ---------- 评测 ----------

/** 启动评测（判官模型调用较慢，超时放宽）；无黄金摘要时后端返回 409 NOT_EVALUABLE */
export function startEvaluation(sessionId: string, summaryId?: string): Promise<EvaluationRecordView> {
  return httpJson(`/api/sessions/${encodeURIComponent(sessionId)}/evaluations`, {
    method: 'POST',
    json: { summaryId },
    timeoutMs: 120_000
  })
}

/** 评测历史：可按模式筛选 */
export function listEvaluationHistory(sessionId: string, mode?: string): Promise<EvaluationRecordView[]> {
  return httpJson(`/api/sessions/${encodeURIComponent(sessionId)}/evaluations`, { query: { mode } })
}

/** 评测导出（csv / json / markdown 文件流） */
export function downloadEvaluationExport(sessionId: string, format: 'csv' | 'json' | 'markdown' = 'csv', mode?: string) {
  return httpDownload(`/api/sessions/${encodeURIComponent(sessionId)}/evaluations/export`, {
    query: { format, mode }
  })
}

// ---------- 模型配置 ----------

export function listModelProfiles(): Promise<ModelProfileView[]> {
  return httpJson('/api/model-profiles')
}

/** 新增/更新档案；apiKey 为空表示沿用已保存凭据 */
export function saveModelProfile(body: SaveProfileRequest): Promise<ModelProfileView> {
  return httpJson('/api/model-profiles', { method: 'POST', json: body })
}

/** 删除档案；被默认绑定或 Agent 引用时后端返回 400/409 错误 */
export function deleteModelProfile(profileId: string): Promise<{ deleted: boolean }> {
  return httpJson(`/api/model-profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' })
}

/**
 * 测试连接：携带 profileId 返回完整脱敏档案视图；草稿测试仅返回检测结果。
 * 外部模型探测较慢，超时放宽。
 */
export function testModelProfile(body: TestProfileRequest): Promise<ModelProfileView | ModelTestDraftView> {
  return httpJson('/api/model-profiles/test', { method: 'POST', json: body, timeoutMs: 30_000 })
}

/**
 * 获取模型列表：携带 profileId 时用已保存档案（可省略 apiKey），否则按草稿探测。
 * 仅 OpenAI 兼容协议支持，其他协议后端返回 MODEL_CALL_FAILED 错误体。
 */
export function listProfileModels(body: ListModelsRequest): Promise<ListModelsResponse> {
  return httpJson('/api/model-profiles/models', { method: 'POST', json: body, timeoutMs: 30_000 })
}

export function getModelBindings(): Promise<ModelBindingsView> {
  return httpJson('/api/model-profiles/bindings')
}

export function saveModelBindings(body: SaveBindingsRequest): Promise<ModelBindingsView> {
  return httpJson('/api/model-profiles/bindings', { method: 'PUT', json: body })
}
