// useRequest —— 轻量请求状态钩子
// 提供 data / loading / error 三态与竞态保护：
// - 仅最新一次请求的结果会写入状态（过期响应丢弃）
// - 组件卸载后不再写入状态

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, toApiError } from './errors'

export interface RequestState<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
  /** 执行一次请求；成功返回数据，失败返回 null（错误写入 error） */
  run: (request: () => Promise<T>) => Promise<T | null>
  /** 清空状态并使进行中的请求失效 */
  reset: () => void
}

export function useRequest<T>(): RequestState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const seqRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(async (request: () => Promise<T>): Promise<T | null> => {
    const seq = ++seqRef.current
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }
    try {
      const result = await request()
      if (seq === seqRef.current && mountedRef.current) {
        setData(result)
        setLoading(false)
      }
      return result
    } catch (e) {
      if (seq === seqRef.current && mountedRef.current) {
        setError(toApiError(e))
        setLoading(false)
      }
      return null
    }
  }, [])

  const reset = useCallback(() => {
    // 递增序号使进行中的请求结果作废
    seqRef.current++
    if (mountedRef.current) {
      setData(null)
      setError(null)
      setLoading(false)
    }
  }, [])

  return { data, loading, error, run, reset }
}
