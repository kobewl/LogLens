import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  FileText, FolderOpen, BarChart3, Upload, Loader2,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Cloud, HardDrive,
} from 'lucide-react'
import { useLogFile } from '../hooks/useLogFile'
import { useSearch } from '../hooks/useSearch'
import { useAi } from '../hooks/useAi'
import LogTable from '../components/log/LogTable'
import SearchBar from '../components/search/SearchBar'
import TimelineChart from '../components/timeline/TimelineChart'
import AiChatPanel from '../components/ai/AiChatPanel'
import CloudQueryView from '../components/cloud/CloudQueryView'
import { ToastContainer, showToast } from '../components/ui/Toast'
import type { LogStats } from '../types/log'

type WorkspaceMode = 'local' | 'cloud'

export default function Workspace() {
  const { currentFile, sessions, loading: fileLoading, openFile, selectSession, refreshSessions } = useLogFile()
  const filePath = currentFile?.path ?? null
  const { query, setQuery, entries, total, loading, search, loadInitial } = useSearch(filePath)
  const { analyze, summarize, naturalQuery } = useAi(filePath)
  const [stats, setStats] = useState<LogStats | null>(null)
  const [selectedLine, setSelectedLine] = useState<number>()
  const [mode, setMode] = useState<WorkspaceMode>('local')
  const [dragOver, setDragOver] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [aiPanelOpen, setAiPanelOpen] = useState(true)

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    if (!currentFile) return
    loadInitial()
    invoke<LogStats>('get_log_stats', { path: currentFile.path })
      .then(setStats)
      .catch((e) => console.error('获取日志统计失败:', e))
  }, [currentFile, loadInitial])

  const handleOpen = useCallback(async (path?: string) => {
    try {
      const info = await openFile(path)
      if (info) {
        showToast(`已索引 ${info.line_count.toLocaleString()} 行`, 'success')
      }
    } catch (e) {
      showToast(String(e), 'error')
    }
  }, [openFile])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    await handleOpen()
  }, [handleOpen])

  // ── Cloud mode: full-page cloud query ─────────────────────────────────────
  if (mode === 'cloud') {
    return (
      <div className="flex h-full flex-col">
        <ToastContainer />
        {/* Sub-header with mode switcher */}
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-elevated px-4">
          <ModeTab
            active={false}
            icon={<HardDrive className="h-3.5 w-3.5" />}
            label="本地文件"
            onClick={() => setMode('local')}
          />
          <ModeTab
            active={true}
            icon={<Cloud className="h-3.5 w-3.5" />}
            label="云日志查询"
            onClick={() => setMode('cloud')}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <CloudQueryView />
        </div>
      </div>
    )
  }

  // ── Local mode: 3-panel layout ─────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      <ToastContainer />

      {/* Sub-header with mode switcher */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-elevated px-4">
        <ModeTab
          active={true}
          icon={<HardDrive className="h-3.5 w-3.5" />}
          label="本地文件"
          onClick={() => setMode('local')}
        />
        <ModeTab
          active={false}
          icon={<Cloud className="h-3.5 w-3.5" />}
          label="云日志查询"
          onClick={() => setMode('cloud')}
        />
      </div>

      {/* Main 3-panel area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        {sidebarOpen ? (
          <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-elevated">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">文件列表</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded p-0.5 text-muted hover:text-secondary hover:bg-surface-hover"
                title="折叠侧边栏"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-0.5">
              <button
                onClick={() => openFile().then((info) => info && loadInitial())}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-secondary hover:bg-surface-hover hover:text-primary transition-colors"
              >
                <FolderOpen className="h-3.5 w-3.5 text-accent" />
                <span>打开文件…</span>
              </button>

              {sessions.length > 0 && (
                <div className="pt-1">
                  <div className="px-2 pb-1 text-[10px] text-muted uppercase tracking-wider">最近打开</div>
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selectSession(s)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                        s.path === filePath
                          ? 'bg-accent/15 text-accent'
                          : 'text-secondary hover:bg-surface-hover hover:text-primary'
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.path.split('/').pop()}</div>
                        <div className="text-[10px] text-muted">
                          {s.format} · {s.line_count.toLocaleString()} 行
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            className="shrink-0 flex flex-col items-center gap-1 border-r border-border bg-elevated px-1.5 py-2 text-muted hover:text-secondary transition-colors"
            title="展开侧边栏"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!currentFile ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => handleOpen()}
                className={`flex w-full max-w-lg cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-16 transition-all ${
                  dragOver
                    ? 'border-accent bg-accent/5 scale-[1.01]'
                    : 'border-border hover:border-accent/40 hover:bg-surface-hover'
                }`}
              >
                {fileLoading ? (
                  <Loader2 className="h-10 w-10 animate-spin text-accent" />
                ) : (
                  <Upload className="h-10 w-10 text-accent" />
                )}
                <h2 className="mt-4 text-base font-semibold text-primary">拖拽日志文件到此处</h2>
                <p className="mt-1.5 text-sm text-secondary">Drop .log / .json / .csv files here, or click to browse</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['JSON Lines', 'CSV', 'NGINX', 'Syslog', '纯文本'].map((f) => (
                    <span key={f} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* File info bar */}
              <div className="flex items-center gap-3 border-b border-border bg-elevated px-4 py-2 text-xs text-secondary">
                <FileText className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="truncate text-primary font-medium">{currentFile.path.split('/').pop()}</span>
                <span className="shrink-0 text-muted">{currentFile.path}</span>
                <div className="ml-auto flex items-center gap-3 shrink-0">
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">
                    {currentFile.format}
                  </span>
                  <span>{currentFile.line_count.toLocaleString()} 行</span>
                  <span>{(currentFile.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>

              <SearchBar
                query={query}
                onQueryChange={setQuery}
                onSearch={() => search()}
                onAiQuery={async () => {
                  try {
                    const q = await naturalQuery(query || 'show all errors')
                    const trimmed = q?.trim?.() ?? ''
                    if (trimmed) {
                      setQuery(trimmed)
                      search(trimmed)
                    }
                  } catch (e) {
                    showToast(String(e), 'error')
                  }
                }}
                loading={loading}
              />

              <div className="border-b border-border">
                <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>时间分布</span>
                  <span className="text-secondary font-medium">{total.toLocaleString()} 条结果</span>
                </div>
                <TimelineChart stats={stats} />
              </div>

              <div className="flex-1 overflow-hidden">
                <LogTable entries={entries} selectedLine={selectedLine} onSelectLine={setSelectedLine} />
              </div>
            </>
          )}
        </div>

        {/* AI panel */}
        {aiPanelOpen ? (
          <aside className="flex w-80 shrink-0 flex-col border-l border-border">
            <div className="flex items-center justify-between border-b border-border bg-elevated px-3 py-2">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">AI 分析</span>
              <button
                onClick={() => setAiPanelOpen(false)}
                className="rounded p-0.5 text-muted hover:text-secondary hover:bg-surface-hover"
                title="折叠 AI 面板"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
            </div>
            <AiChatPanel
              filePath={filePath}
              onAnalyze={analyze}
              onSummarize={summarize}
              onNaturalQuery={naturalQuery}
              onApplyQuery={(q) => {
                try {
                  setQuery(q)
                  search(q)
                } catch (e) {
                  showToast(String(e), 'error')
                }
              }}
            />
          </aside>
        ) : (
          <button
            onClick={() => setAiPanelOpen(true)}
            className="shrink-0 flex flex-col items-center gap-1 border-l border-border bg-elevated px-1.5 py-2 text-muted hover:text-secondary transition-colors"
            title="展开 AI 面板"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function ModeTab({
  active, icon, label, onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-accent/15 text-accent'
          : 'text-secondary hover:bg-surface-hover hover:text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
