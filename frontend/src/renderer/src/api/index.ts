// 前端请求层模块出口
// 分层：httpClient（传输）→ services（端点）→ mappers（契约转换）→ useRequest（状态）

export { API_BASE_URL, probeBackend } from './httpClient'
export { ApiError, errorMessageOf, toApiError } from './errors'
export type { ApiErrorCode } from './errors'
