import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'

// ─── 类型定义 ────────────────────────────────────────────────────────────────────

export interface DownloadAsset {
  name: string
  url: string
  size: number
  platform: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  releaseNotes: string
  releaseUrl: string
  publishedAt: string
  downloadUrls: DownloadAsset[]
}

export interface UpdateContextType {
  updateInfo: UpdateCheckResult | null
  isChecking: boolean
  isDownloading: boolean
  downloadProgress: number
  isUpToDate: boolean
  error: string | null
  installationSource: string | null
  checkForUpdates: (force?: boolean) => Promise<void>
  downloadAndInstall: () => Promise<void>
  dismissUpdate: () => void
}

const UpdateContext = createContext<UpdateContextType | null>(null)

export function useUpdate() {
  const ctx = useContext(UpdateContext)
  if (!ctx) throw new Error('useUpdate must be used within UpdateProvider')
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────────

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isUpToDate, setIsUpToDate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installationSource, setInstallationSource] = useState<string | null>(null)
  const dismissedVersion = useRef<string | null>(null)

  // 读取已忽略的版本
  useEffect(() => {
    dismissedVersion.current = localStorage.getItem('loglens-dismissed-version')
  }, [])

  // 检查安装来源
  useEffect(() => {
    invoke<string | null>('get_installation_source')
      .then(setInstallationSource)
      .catch(() => {})
  }, [])

  // 监听下载进度
  useEffect(() => {
    const unlisteners: UnlistenFn[] = []
    listen<number>('update-progress', (event) => {
      setDownloadProgress(event.payload)
    }).then((fn) => unlisteners.push(fn))
    listen('update-installing', () => {
      setDownloadProgress(100)
    }).then((fn) => unlisteners.push(fn))
    return () => {
      unlisteners.forEach((fn) => fn())
    }
  }, [])

  // 启动时自动检查（延迟 2 秒）
  useEffect(() => {
    if (installationSource !== null) {
      const timer = setTimeout(() => {
        checkForUpdates(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [installationSource])

  const checkForUpdates = useCallback(async (force = false) => {
    setIsChecking(true)
    setError(null)
    try {
      const result = await invoke<UpdateCheckResult>('check_for_updates', { force })
      if (result.hasUpdate) {
        // 检查是否已被用户忽略
        if (!force && dismissedVersion.current === result.latestVersion) {
          setIsUpToDate(true)
          setUpdateInfo(null)
        } else {
          setUpdateInfo(result)
        }
      } else {
        setIsUpToDate(true)
        setUpdateInfo(null)
      }
    } catch (e) {
      setError(String(e))
      setIsUpToDate(false)
    } finally {
      setIsChecking(false)
    }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    setIsDownloading(true)
    setDownloadProgress(0)
    setError(null)
    try {
      await invoke('download_and_install_update')
      // 成功后会自动重启，不会到达这里
    } catch (e) {
      setError(String(e))
      setIsDownloading(false)
    }
  }, [])

  const dismissUpdate = useCallback(() => {
    if (updateInfo) {
      dismissedVersion.current = updateInfo.latestVersion
      localStorage.setItem('loglens-dismissed-version', updateInfo.latestVersion)
      setUpdateInfo(null)
    }
  }, [updateInfo])

  return (
    <UpdateContext.Provider
      value={{
        updateInfo,
        isChecking,
        isDownloading,
        downloadProgress,
        isUpToDate,
        error,
        installationSource,
        checkForUpdates,
        downloadAndInstall,
        dismissUpdate,
      }}
    >
      {children}
    </UpdateContext.Provider>
  )
}
