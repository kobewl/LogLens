import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AiConfig } from '../types/log'

export function useAi(filePath: string | null) {
  const analyze = useCallback(async () => {
    if (!filePath) throw new Error('No file')
    return invoke<string>('ai_analyze_logs', { path: filePath, limit: 200 })
  }, [filePath])

  const summarize = useCallback(async () => {
    if (!filePath) throw new Error('No file')
    return invoke<string>('ai_summarize_logs', { path: filePath, limit: 500 })
  }, [filePath])

  const naturalQuery = useCallback(async (query: string) => {
    return invoke<string>('ai_natural_query', { nlQuery: query })
  }, [])

  const testConnection = useCallback(async (config: AiConfig) => {
    return invoke<string>('test_ai_connection', { config })
  }, [])

  return { analyze, summarize, naturalQuery, testConnection }
}
