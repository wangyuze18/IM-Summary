// HTTP 请求客户端 —— 渲染进程直连后端 REST API（设计文档 §11）
// 能力：JSON 请求/响应、multipart 上传、文件流下载、超时控制、后端连通性探测
// 错误统一收敛为 ApiError（见 errors.ts）

import { ApiError } from './errors'

/** 后端基地址：可用环境变量覆盖（构建时注入），默认本地 8080（后端 application.yml） */
const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080'
export const API_BASE_URL = envBase.replace(/\/+$/, '')

/** 默认请求超时（模型测试 / 评测等长耗时请求由调用方显式放宽） */
export const DEFAULT_TIMEOUT_MS = 15_000

export type QueryParams = Record<string, string | number | boolean | undefined>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** JSON 请求体；与 formData 互斥 */
  json?: unknown
  /** multipart 请求体（文件上传）；不手动设置 Content-Type，由浏览器生成 boundary */
  formData?: FormData
  query?: QueryParams
  timeoutMs?: number
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(path.startsWith('/') ? `${API_BASE_URL}${path}` : path)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

/** 解析后端统一错误体 { errorCode, message }（GlobalExceptionHandler） */
async function toHttpError(res: Response): Promise<ApiError> {
  let code = 'HTTP_ERROR'
  let message = `请求失败（HTTP ${res.status}）`
  try {
    const body = (await res.json()) as { errorCode?: string; message?: string }
    if (body && typeof body === 'object') {
      if (typeof body.errorCode === 'string') code = body.errorCode
      if (typeof body.message === 'string' && body.message) message = body.message
    }
  } catch {
    // 非 JSON 错误体，保留默认文案
  }
  return new ApiError(code, message, res.status)
}

async function execute<T>(path: string, options: RequestOptions, parse: (res: Response) => Promise<T>): Promise<T> {
  const { method = 'GET', json, formData, query, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    const headers: Record<string, string> = {}
    let body: BodyInit | undefined
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(json)
    } else if (formData !== undefined) {
      body = formData
    }
    res = await fetch(buildUrl(path, query), { method, headers, body, signal: controller.signal })
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError('TIMEOUT', `请求超时（${timeoutMs}ms），请稍后重试`)
    }
    // fetch 网络层错误（连接拒绝 / DNS 失败等）
    throw new ApiError('NETWORK_ERROR', '无法连接后端服务，请确认服务已启动')
  } finally {
    window.clearTimeout(timer)
  }

  if (!res.ok) throw await toHttpError(res)
  try {
    return await parse(res)
  } catch {
    throw new ApiError('PARSE_ERROR', '响应内容解析失败', res.status)
  }
}

/** JSON 请求，返回解析后的响应体 */
export function httpJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return execute<T>(path, options, async (res) => {
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  })
}

/** 文件流下载（摘要 / 评测导出），同时解析 Content-Disposition 中的建议文件名 */
export async function httpDownload(path: string, options: RequestOptions = {}): Promise<{ blob: Blob; filename: string | null }> {
  return execute(path, options, async (res) => {
    const disposition = res.headers.get('Content-Disposition') ?? ''
    const matched = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
    const filename = matched ? decodeURIComponent(matched[1]) : null
    return { blob: await res.blob(), filename }
  })
}

/**
 * 后端连通性探测：短超时拉取会话列表。
 * 返回 true 表示后端在线（即使业务报错也视为可达）；网络层失败返回 false。
 */
export async function probeBackend(timeoutMs = 2000): Promise<boolean> {
  try {
    await httpJson<unknown>('/api/sessions', { timeoutMs })
    return true
  } catch (e) {
    return e instanceof ApiError && e.code !== 'NETWORK_ERROR' && e.code !== 'TIMEOUT'
  }
}
