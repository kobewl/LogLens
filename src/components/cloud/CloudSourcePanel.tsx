import { useState, useEffect, useCallback } from 'react'
import { Cloud, Loader2, Upload, FolderOpen, ChevronRight, Search, Copy } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { open } from '@tauri-apps/plugin-dialog'
import { showToast } from '../ui/Toast'
import type { CloudProjectSummary, ImportAlias } from '../../types/log'

export default function CloudSourcePanel() {
  // 导入的项目
  const [projects, setProjects] = useState<CloudProjectSummary[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [projectAliases, setProjectAliases] = useState<ImportAlias[]>([])
  const [importing, setImporting] = useState(false)

  // 云日志查询相关
  const [searchAlias, setSearchAlias] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResult, setSearchResult] = useState('')

  // 加载已导入的项目
  const loadProjects = useCallback(async () => {
    try {
      const list = await invoke<CloudProjectSummary[]>('list_imported_projects')
      setProjects(list)
    } catch { /* 首次为空 */ }
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  // 导入 config.json
  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON Config', extensions: ['json'] }],
      })
      if (!selected) return
      setImporting(true)
      const result = await invoke<CloudProjectSummary[]>('import_cloud_config', { path: selected as string })
      setProjects(result)
      const totalAliases = result.reduce((sum, p) => sum + p.alias_count, 0)
      const names = result.map((p) => `${p.name}(${p.alias_count}条)`).join(', ')
      showToast(`导入成功: ${result.length} 个项目, ${totalAliases} 条别名\n${names}`, 'success')
      if (result.length > 0) {
        setSelectedProject(result[0].name)
        try {
          const aliases = await invoke<ImportAlias[]>('get_project_aliases', { projectName: result[0].name })
          setProjectAliases(aliases)
        } catch { /* ignore */ }
      }
    } catch (e) {
      const msg = String(e)
      showToast(msg.includes('解析 JSON') ? 'JSON 格式不正确，请检查文件是否为有效的 config.json' : msg, 'error')
    } finally {
      setImporting(false)
    }
  }

  // 点击项目查看别名
  const handleProjectClick = async (name: string) => {
    if (selectedProject === name) {
      setSelectedProject(null)
      setProjectAliases([])
      setSearchAlias(null)
      return
    }
    try {
      const aliases = await invoke<ImportAlias[]>('get_project_aliases', { projectName: name })
      setSelectedProject(name)
      setProjectAliases(aliases)
      setSearchAlias(null)
      setSearchResult('')
    } catch (e) {
      showToast(String(e), 'error')
    }
  }

  // 点击别名展开/折叠查询
  const handleAliasClick = (aliasName: string) => {
    setSearchAlias(searchAlias === aliasName ? null : aliasName)
    setSearchKeyword('')
    setSearchResult('')
  }

  // 执行云日志搜索
  const handleCloudSearch = async () => {
    if (!selectedProject || !searchAlias) return
    const project = projects.find((p) => p.name === selectedProject)
    if (!project) return

    setSearchLoading(true)
    setSearchResult('')
    try {
      const result = await invoke<string>('cloud_search_logs', {
        provider: project.provider,
        projectName: selectedProject,
        aliasName: searchAlias,
        keywords: searchKeyword || null,
        timeFrom: null,
        timeTo: null,
        limit: 100,
      })
      const parsed = typeof result === 'string' ? JSON.parse(result) : result
      setSearchResult(JSON.stringify(parsed, null, 2))
    } catch (e) {
      const msg = String(e)
      if (msg.includes('npx') || msg.includes('Failed to spawn')) {
        setSearchResult(`错误: 无法启动云服务连接器\n请确保已安装 Node.js 且网络连接正常\n\n${msg}`)
      } else {
        setSearchResult(`查询失败:\n${msg}`)
      }
    } finally {
      setSearchLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Cloud className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold">云日志 Cloud Logs</span>
      </div>

      {/* 导入按钮 */}
      <div className="border-b border-border p-2">
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex w-full items-center gap-2 rounded bg-accent/15 px-2 py-1.5 text-xs text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
        >
          {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          导入配置 Import config.json
        </button>
      </div>

      {/* 已导入的项目列表 */}
      {projects.length > 0 && (
        <div className="border-b border-border">
          <div className="px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider">
            已导入项目 Imported ({projects.length})
          </div>
          <div className="max-h-80 overflow-auto">
            {projects.map((p) => (
              <div key={p.name}>
                <button
                  onClick={() => handleProjectClick(p.name)}
                  className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs hover:bg-surface-hover transition-colors ${
                    selectedProject === p.name ? 'bg-accent/10 text-accent' : 'text-secondary'
                  }`}
                >
                  <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${selectedProject === p.name ? 'rotate-90' : ''}`} />
                  <FolderOpen className="h-3 w-3 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{p.name}</div>
                    <div className="text-[10px] text-muted">{p.provider} · {p.alias_count} aliases</div>
                  </div>
                </button>
                {selectedProject === p.name && projectAliases.length > 0 && (
                  <div className="border-t border-border bg-base/50">
                    {projectAliases.map((a, i) => (
                      <div key={i}>
                        <button
                          onClick={() => handleAliasClick(a.alias)}
                          className={`w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-surface-hover ${
                            searchAlias === a.alias ? 'bg-accent/10 text-accent' : 'text-secondary'
                          }`}
                        >
                          <div className="font-medium">{a.alias}</div>
                          {a.logstore && <div className="text-[10px] text-muted">logstore: {a.logstore}</div>}
                          {a.stream_id && <div className="text-[10px] text-muted">stream: {a.stream_id}</div>}
                          {a.description && <div className="text-[10px] text-muted">{a.description}</div>}
                        </button>
                        {searchAlias === a.alias && (
                          <div className="border-t border-border px-3 py-2">
                            <div className="flex gap-1">
                              <input
                                className="flex-1 rounded border border-border bg-input px-2 py-1 text-[11px] text-primary outline-none focus:border-accent"
                                placeholder="关键词 (如 error)"
                                value={searchKeyword}
                                onChange={(e) => setSearchKeyword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCloudSearch() }}
                              />
                              <button
                                onClick={handleCloudSearch}
                                disabled={searchLoading}
                                className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[11px] text-white hover:bg-accent/80 disabled:opacity-50"
                              >
                                {searchLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                                搜索
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 无项目时的提示 */}
      {projects.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <Cloud className="h-8 w-8 text-muted opacity-40" />
          <p className="text-xs text-muted">点击上方按钮导入 config.json</p>
          <p className="text-[10px] text-muted">
            支持阿里云 SLS · 腾讯云 CLS · 华为云 LTS
          </p>
        </div>
      )}

      {/* 云查询结果展示 */}
      {searchResult && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted">
            <span>查询结果 Result</span>
            <button
              onClick={async () => { await writeText(searchResult); showToast('已复制', 'success') }}
              className="flex items-center gap-1 hover:text-secondary"
            >
              <Copy className="h-3 w-3" /> 复制
            </button>
          </div>
          <pre className="max-h-64 overflow-auto border-t border-border p-2 text-[10px] leading-relaxed text-secondary whitespace-pre-wrap">
            {searchResult}
          </pre>
        </div>
      )}
    </div>
  )
}
