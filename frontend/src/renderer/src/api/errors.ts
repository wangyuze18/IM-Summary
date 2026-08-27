// 统一请求错误模型
// 后端 GlobalExceptionHandler 返回 { errorCode, message }；
// 网络 / 超时 / 解析失败由 httpClient 分类为本地错误码

/** 后端错误码见 GlobalExceptionHandler；NETWORK_* / TIMEOUT / PARSE_ERROR 为前端本地错误码 */
export type ApiErrorCode =
  | 'NOT_FOUND'
  | 'NOT_EVALUABLE'
  | 'INVALID_STATE'
  | 'INVALID_ARGUMENT'
  | 'FILE_TOO_LARGE'
  | 'INTERNAL_ERROR'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'PARSE_ERROR'
  | (string & {})

export class ApiError extends Error {
  /** 错误码：后端业务码或前端本地分类 */
  readonly code: ApiErrorCode
  /** HTTP 状态码；网络层错误（未收到响应）为 null */
  readonly status: number | null

  constructor(code: ApiErrorCode, message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** 将任意异常归一为 ApiError，便于状态层统一持有 */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  const message = e instanceof Error && e.message ? e.message : String(e)
  return new ApiError('HTTP_ERROR', message)
}

/** 提取面向用户的错误文案（后端 message 已为中文，直接使用） */
export function errorMessageOf(e: unknown): string {
  return toApiError(e).message
}
