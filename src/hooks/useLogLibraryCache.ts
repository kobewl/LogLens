/**
 * useLogLibraryCache — 日志库查询状态缓存 Hook
 *
 * 为每个日志库（project + alias 组合）维护独立的查询状态。
 * 切换日志库时自动保存当前状态、加载目标状态，实现状态隔离。
 *
 * 使用场景：
 *   在日志库 A 中点击查询 → 切换到日志库 B → A 的查询状态被缓存
 *   → B 显示独立状态（默认空白）→ 切回 A → A 恢复之前的查询结果
 */
import { useRef, useCallback } from 'react'

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

/** 每个日志库需要隔离的查询状态 */
export interface LogLibraryState {
  /** 查询语句 */
  queryStr: string
  /** 是否正在查询（loading 状态） */
  searching: boolean
  /** 查询结果记录 */
  records: Record<string, unknown>[]
  /** 原始查询结果（用于 JSON 视图） */
  rawResult: unknown
  /** 结果视图模式 */
  viewMode: 'table' | 'raw'
}

// ─── 常量 ──────────────────────────────────────────────────────────────────────

/** 日志库状态的默认值 */
const DEFAULT_STATE: LogLibraryState = {
  queryStr: '',
  searching: false,
  records: [],
  rawResult: null,
  viewMode: 'table',
}

/** 缓存键分隔符，格式为 `${projectName}::${aliasName}` */
const KEY_SEPARATOR = '::'

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useLogLibraryCache() {
  /** 使用 useRef 存储缓存 Map，操作不触发重渲染 */
  const cacheRef = useRef<Map<string, LogLibraryState>>(new Map())

  /**
   * 生成唯一缓存键
   * @param project 项目名称
   * @param alias 日志库别名
   */
  const makeKey = useCallback((project: string, alias: string) => {
    return `${project}${KEY_SEPARATOR}${alias}`
  }, [])

  /**
   * 保存当前日志库的状态到缓存
   * @param key 缓存键
   * @param state 要保存的状态（会浅拷贝）
   */
  const saveState = useCallback((key: string, state: LogLibraryState) => {
    cacheRef.current.set(key, { ...state })
  }, [])

  /**
   * 加载指定日志库的缓存状态，无缓存则返回默认值
   * @param key 缓存键
   * @returns 日志库状态（始终返回新对象，避免引用问题）
   */
  const loadState = useCallback((key: string): LogLibraryState => {
    const cached = cacheRef.current.get(key)
    return cached ? { ...cached } : { ...DEFAULT_STATE }
  }, [])

  /**
   * 清除指定日志库的缓存
   * @param key 缓存键
   */
  const clearState = useCallback((key: string) => {
    cacheRef.current.delete(key)
  }, [])

  /**
   * 清除以指定前缀开头的所有缓存
   * 主要用于删除项目时清除该项目的所有日志库缓存
   * @param prefix 缓存键前缀（通常是项目名）
   */
  const clearByPrefix = useCallback((prefix: string) => {
    for (const key of cacheRef.current.keys()) {
      if (key.startsWith(prefix + KEY_SEPARATOR)) {
        cacheRef.current.delete(key)
      }
    }
  }, [])

  return {
    makeKey,
    saveState,
    loadState,
    clearState,
    clearByPrefix,
  }
}
