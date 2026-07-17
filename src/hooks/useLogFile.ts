import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { LogFileInfo, LogFileSession } from '../types/log'

export function useLogFile() {
  const [currentFile, setCurrentFile] = useState<LogFileInfo | null>(null)
  const [sessions, setSessions] = useState<LogFileSession[]>([])
  const [loading, setLoading] = useState(false)

  const refreshSessions = useCallback(async () => {
    const list = await invoke<LogFileSession[]>('list_sessions')
    setSessions(list)
  }, [])

  const openFile = useCallback(async (path?: string) => {
    setLoading(true)
    try {
      let filePath = path
      if (!filePath) {
        const selected = await open({
          multiple: false,
          filters: [{ name: 'Log Files', extensions: ['log', 'json', 'jsonl', 'csv', 'txt'] }],
        })
        if (!selected) return null
        filePath = selected as string
      }
      const info = await invoke<LogFileInfo>('open_log_file', { path: filePath })
      setCurrentFile(info)
      await refreshSessions()
      return info
    } finally {
      setLoading(false)
    }
  }, [refreshSessions])

  const selectSession = useCallback(async (session: LogFileSession) => {
    const info = await invoke<LogFileInfo>('get_log_file_info', { path: session.path })
    setCurrentFile(info)
  }, [])

  return { currentFile, sessions, loading, openFile, selectSession, refreshSessions }
}
