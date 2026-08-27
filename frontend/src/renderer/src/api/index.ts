// 前端请求层模块出口
// 分层：httpClient（传输）→ services（端点）→ mappers（契约转换）→ useRequest（状态）

export { API_BASE_URL, probeBackend } from './httpClient'
export { ApiError, errorMessageOf, toApiError } from './errors'
export type { ApiErrorCode } from './errors'
export * from './services'
export * from './mappers'
export { useRequest } from './useRequest'
export type { RequestState } from './useRequest'
export type * from './wireTypes'
