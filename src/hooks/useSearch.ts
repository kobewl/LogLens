import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { LogEntry, SearchResult } from '../types/log'

export function useSearch(filePath: string | null) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q?: string) => {
    if (!filePath) return
    const searchQuery = q ?? query
    setLoading(true)
    try {
      const result = await invoke<SearchResult>('search_logs', {
        path: filePath,
        query: searchQuery,
        limit: 5000,
      })
      setEntries(result.entries)
      setTotal(result.total)
      if (result.entries.length === 0 && !searchQuery) {
        const lines = await invoke<LogEntry[]>('get_log_lines', {
          path: filePath,
          offset: 0,
          limit: 2000,
        })
        setEntries(lines)
        setTotal(lines.length)
      }
    } finally {
      setLoading(false)
    }
  }, [filePath, query])

  const loadInitial = useCallback(async () => {
    if (!filePath) return
    setLoading(true)
    try {
      const lines = await invoke<LogEntry[]>('get_log_lines', {
        path: filePath,
        offset: 0,
        limit: 2000,
      })
      setEntries(lines)
      setTotal(lines.length)
    } finally {
      setLoading(false)
    }
  }, [filePath])

  return { query, setQuery, entries, total, loading, search, loadInitial }
}
