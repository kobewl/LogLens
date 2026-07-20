/**
 * CloudQueryView — 云日志全页查询界面
 * 左：项目/别名列表  右：查询表单 + 结构化结果
 *
 * Bug Fix: quickSearch 竞态 — 直接把 kw 传给 handleSearch，不依赖 React 异步 state
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Cloud, Loader2, Upload, Copy, RefreshCw, Search,
  AlertCircle, Info, ChevronDown, ChevronRight, CheckCircle2, Pencil, X, Plus, Trash2,
} from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { open } from '@tauri-apps/plugin-dialog'
import { showToast } from '../ui/Toast'
import type { CloudProjectSummary, ImportAlias } from '../../types/log'

// ─── 云日志结果解析 ────────────────────────────────────────────────────────────

interface LogRecord {
  time?: string
  level?: string
  message?: string
  [key: string]: unknown
}

/**
 * 解析 aliyun-sls-mcp / cls-mcp-server 的格式化文本输出。
 *
 * 格式样例:
 *   ## SLS Query Results
 *   ...
 *
 *   [1] 2024-01-01 12:00:01
 *     level: ERROR
 *     content: payment timeout
 *
 *   ---
 *
 *   [2] 2024-01-01 12:00:02
 *   ...
 */
function parseMcpTextLogs(text: string): LogRecord[] {
  if (!text || text.startsWith('Error:') || text.startsWith('error:')) return []

  // Split entries by separator "---"
  const parts = text.split(/\n---\n/)
  const records: LogRecord[] = []

  for (const part of parts) {
    const lines = part.split('\n')
    const record: LogRecord = {}

    for (const line of lines) {
      // Match entry header: "[1] 2024-01-01 12:00:01"
      const hm = line.match(/^\[(\d+)\]\s+(.+)$/)
      if (hm) {
        record.time = hm[2].trim()
        continue
      }
      // Match field lines with 2 or 4 spaces indent, or tab indent
      const fm = line.match(/^[ \t]{1,6}([^\s:][^:]*?):\s+(.*)$/)
      if (fm) {
        record[fm[1].trim()] = fm[2]
        continue
      }
      // Plain field line "key: value" (no indent, not the header)
      const pfm = line.match(/^([A-Za-z_][\w.]*?):\s+(.+)$/)
      if (pfm && !line.startsWith('[')) {
        record[pfm[1].trim()] = pfm[2]
      }
    }

    if (Object.keys(record).length > 0) {
      records.push(record)
    }
  }

  return records
}

/** 把各云厂商返回的不同 JSON / MCP 结构统一成日志记录数组 */
function parseCloudResult(raw: unknown): LogRecord[] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>

  // ── MCP standard tool response: { content: [{type:'text', text:'...'}] } ──
  // Used by aliyun-sls-mcp and cls-mcp-server
  const content = obj['content']
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown>
    if (first.type === 'text' && typeof first.text === 'string') {
      // isError=true means the tool itself threw an error
      if (obj['isError']) throw new Error(first.text)
      return parseMcpTextLogs(first.text)
    }
  }

  // ── Huawei LTS REST v2: { logs: [{content, labels, log_time_ns}], scrollId } ──
  // 注意：实际 API 返回 'logs'，不是 'log_contents'
  if (Array.isArray(obj['logs']) && obj['scrollId'] !== undefined) {
    return (obj['logs'] as Array<Record<string, unknown>>).map((item) => {
      // 纳秒 → 毫秒：截取末尾 6 位，避免 JS float64 精度问题
      const nsStr = String(item['log_time_ns'] ?? '')
      const timeMs = nsStr.length > 6 ? nsStr.slice(0, -6) : undefined
      const labels = (item['labels'] as Record<string, unknown>) ?? {}
      return { time: timeMs, message: item['content'] as string ?? '', ...labels }
    })
  }

  // ── Huawei LTS REST old: { log_contents: [...] } ──
  const ltsLogs = obj['log_contents'] ?? obj['logContents']
  if (Array.isArray(ltsLogs)) {
    return (ltsLogs as Array<Record<string, unknown>>).map((item) => {
      const nsStr = String(item['log_time_ns'] ?? item['log_time'] ?? '')
      const timeMs = nsStr.length > 6 ? nsStr.slice(0, -6) : undefined
      const content = item['log_content'] as Record<string, unknown> | undefined
      return { time: timeMs, ...content }
    })
  }

  // ── Aliyun SLS direct: { logs: [...] } ──
  const logs = obj['logs'] ?? obj['contents'] ?? obj['data']
  if (Array.isArray(logs)) return logs as LogRecord[]

  // ── Tencent CLS direct: { Results: [...] } ──
  const results = obj['Results'] ?? obj['results']
  if (Array.isArray(results)) {
    return (results as Array<Record<string, unknown>>).map((item) => {
      const fields: Record<string, unknown> = {}
      if (Array.isArray(item['LogItem'])) {
        for (const kv of item['LogItem'] as Array<{ Key: string; Value: string }>) {
          fields[kv.Key] = kv.Value
        }
      } else {
        Object.assign(fields, item)
      }
      return { time: String(item['Time'] ?? ''), ...fields }
    })
  }

  // ── Direct array ──
  if (Array.isArray(raw)) return raw as LogRecord[]

  // Fallback
  return [obj as LogRecord]
}

/** 从日志记录里推断 level */
function inferLevel(record: LogRecord): string {
  // First try explicit level fields
  const v =
    String(record['level'] ?? record['Level'] ?? record['severity'] ?? record['__level__'] ??
      record['log_level'] ?? record['loglevel'] ?? record['LEVEL'] ?? '')
      .toUpperCase()
  if (v.includes('ERROR') || v.includes('FATAL') || v.includes('CRIT')) return 'ERROR'
  if (v.includes('WARN')) return 'WARN'
  if (v.includes('INFO')) return 'INFO'
  if (v.includes('DEBUG') || v.includes('TRACE')) return 'DEBUG'

  // Fallback: scan content/message string for bracketed level markers
  const msg = String(
    record['content'] ?? record['message'] ?? record['msg'] ??
    record['__content__'] ?? record['log_content'] ?? '',
  ).toUpperCase()
  // Match [ERROR], ERROR:, " ERROR ", etc.
  if (/\bERROR\b|\bFATAL\b|\bCRITICAL\b/.test(msg)) return 'ERROR'
  if (/\bWARN(ING)?\b/.test(msg)) return 'WARN'
  if (/\bINFO\b/.test(msg)) return 'INFO'
  if (/\bDEBUG\b|\bTRACE\b/.test(msg)) return 'DEBUG'
  return ''
}

/** 剥去 Huawei LTS 搜索高亮标记，返回纯文本 */
function stripHighlightTags(text: string): string {
  return text.replace(/<\/?HighLightTag>/gi, '')
}

/** 将 <HighLightTag>关键词</HighLightTag> 渲染为带背景色的 React 节点 */
function renderHighlighted(text: string): React.ReactNode {
  if (!text.includes('<HighLightTag>') && !text.includes('<highlighttag>')) return text
  const parts = text.split(/(<HighLightTag>.*?<\/HighLightTag>)/gi)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^<HighLightTag>(.*?)<\/HighLightTag>$/i)
        if (m) return (
          <mark key={i} className="rounded px-0.5 bg-yellow-400/25 text-yellow-300 not-italic">
            {m[1]}
          </mark>
        )
        return <span key={i}>{part}</span>
      })}
    </>
  )
	}

	/** 从日志记录里推断 timestamp */
function inferTime(record: LogRecord): string {
  const raw = record['time'] ?? record['log_time_ns'] ?? record['__time__'] ?? record['timestamp'] ?? record['Time'] ?? ''
  if (!raw) return ''
  const s = String(raw)
  // 秒级时间戳 (10位)
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toLocaleString()
  // 毫秒级 (13位)
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toLocaleString()
  // 纳秒级 (19位) → 截取前13位得毫秒
  if (/^\d{19}$/.test(s)) return new Date(Number(s.slice(0, 13))).toLocaleString()
  return s.slice(0, 23)
}

// ─── Level 徽章 ───────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    ERROR: 'bg-[#f85149]/15 text-[#f85149] border border-[#f85149]/30',
    WARN:  'bg-[#e3b341]/15 text-[#e3b341] border border-[#e3b341]/30',
    INFO:  'bg-[#2f81f7]/15 text-[#58a6ff] border border-[#2f81f7]/30',
    DEBUG: 'bg-[#8b949e]/10 text-[#8b949e] border border-[#8b949e]/20',
  }
  const style = styles[level] ?? 'bg-[#8b949e]/10 text-[#8b949e] border border-[#8b949e]/20'
  const icon = {
    ERROR: <AlertCircle className="h-3 w-3" />,
    WARN:  <AlertCircle className="h-3 w-3" />,
    INFO:  <Info className="h-3 w-3" />,
    DEBUG: null,
  }[level] ?? null

  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${style}`}>
      {icon}
      {level || '—'}
    </span>
  )
}

// ─── 云厂商徽章 ───────────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: string }) {
  const map: Record<string, { label: string; style: string }> = {
    aliyun:  { label: '阿里云 SLS', style: 'text-[#e37b00] bg-[#e37b00]/10 border border-[#e37b00]/25' },
    tencent: { label: '腾讯云 CLS', style: 'text-[#1db9aa] bg-[#1db9aa]/10 border border-[#1db9aa]/25' },
    huawei:  { label: '华为云 LTS', style: 'text-[#c63131] bg-[#c63131]/10 border border-[#c63131]/25' },
  }
  const info = map[provider] ?? { label: provider, style: 'text-secondary bg-surface-hover border border-border' }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${info.style}`}>
      {info.label}
    </span>
  )
}

// ─── 结果行 ───────────────────────────────────────────────────────────────────

function ResultRow({ record, index }: { record: LogRecord; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const level = inferLevel(record)
  // 纯文本（用于级别检测等），带高亮原始值（用于渲染）
  const rawMsg = String(
    record['message'] ?? record['msg'] ?? record['content'] ?? record['log_content'] ??
    record['__content__'] ?? record['Message'] ?? record['rawLog'] ?? '',
  )
  const time = inferTime(record)

  const skipKeys = new Set([
    'time', '__time__', 'timestamp', 'Time', 'log_time_ns',
    'level', 'Level', 'severity', '__level__',
    'message', 'msg', 'content', 'log_content', '__content__', 'Message', 'rawLog',
  ])
  const extraKeys = Object.keys(record).filter((k) => !skipKeys.has(k))

  return (
    <div className="border-b border-border/50 font-mono text-sm">
      <div
        className="flex items-start gap-2 px-4 py-2 cursor-pointer hover:bg-surface-hover transition-colors group"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="w-8 shrink-0 text-muted text-right">{index + 1}</span>
        <button className="shrink-0 mt-0.5 text-muted group-hover:text-secondary">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <span className="w-44 shrink-0 text-muted truncate">{time}</span>
        <span className="w-20 shrink-0">
          {level ? <LevelBadge level={level} /> : <span className="text-muted">—</span>}
        </span>
        <span className="flex-1 truncate text-primary">
          {rawMsg ? renderHighlighted(rawMsg) : JSON.stringify(record)}
        </span>
      </div>
      {expanded && (
        <div className="mx-16 mb-3 rounded-md border border-border bg-overlay px-4 py-2 text-sm">
          {/* 优先显示主消息字段 */}
          {rawMsg && (
            <div className="flex gap-2 py-1 border-b border-border/50 mb-1">
              <span className="w-36 shrink-0 text-muted font-sans">message</span>
              <span className="flex-1 text-primary break-all whitespace-pre-wrap">
                {renderHighlighted(rawMsg)}
              </span>
            </div>
          )}
          {/* 时间 */}
          {time && (
            <div className="flex gap-2 py-1">
              <span className="w-36 shrink-0 text-muted font-sans">time</span>
              <span className="flex-1 text-primary">{time}</span>
            </div>
          )}
          {/* 其余字段 */}
          {extraKeys.map((k) => (
            <div key={k} className="flex gap-2 py-0.5">
              <span className="w-36 shrink-0 text-muted font-sans">{k}</span>
              <span className="flex-1 text-primary break-all">
                {stripHighlightTags(String(record[k] ?? ''))}
              </span>
            </div>
          ))}
          {extraKeys.length === 0 && !rawMsg && (
            <span className="text-muted text-xs">（无额外字段）</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function CloudQueryView() {
  const [projects, setProjects] = useState<CloudProjectSummary[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [projectAliases, setProjectAliases] = useState<ImportAlias[]>([])
  const [selectedAlias, setSelectedAlias] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const [queryStr, setQueryStr] = useState('')
  const [timeRange, setTimeRange] = useState('1h')
  const [limit, setLimit] = useState(100)
  const [searching, setSearching] = useState(false)
  const [records, setRecords] = useState<LogRecord[]>([])
  const [rawResult, setRawResult] = useState<unknown>(null)
  const [viewMode, setViewMode] = useState<'table' | 'raw'>('table')
  const [copied, setCopied] = useState(false)

  // 华为云 project_id 手动输入
  const [_projectCreds, setProjectCreds] = useState<Record<string, unknown> | null>(null)

  // 编辑项目凭据弹窗
  const [editingProject, setEditingProject] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)

  // 新增项目弹窗
  const [showAddProject, setShowAddProject] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '', provider: 'huawei', description: '',
    ak: '', sk: '', region: 'cn-east-3',
    log_group_id: '', project_id: '',
    // 阿里云
    endpoint: '', project: '',
    // 腾讯云
    secret_id: '', secret_key: '', logset_id: '',
  })
  const [addSaving, setAddSaving] = useState(false)

  // 删除确认
  const [deletingProject, setDeletingProject] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      const list = await invoke<CloudProjectSummary[]>('list_imported_projects')
      setProjects(list)
    } catch { /* 首次为空 */ }
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  const handleProjectSelect = async (name: string) => {
    setSelectedProject(name)
    setSelectedAlias(null)
    setRecords([])
    setRawResult(null)
    setProjectCreds(null)
    try {
      const aliases = await invoke<ImportAlias[]>('get_project_aliases', { projectName: name })
      setProjectAliases(aliases)
      if (aliases.length > 0) setSelectedAlias(aliases[0].alias)
      // 加载 credentials，检查是否缺少 project_id
      const creds = await invoke<Record<string, unknown> | null>('get_project_credentials', { projectName: name })
      setProjectCreds(creds)
    } catch (e) {
      showToast(String(e), 'error')
    }
  }

  // 打开编辑凭据弹窗
  const handleEditCredentials = async (projectName: string) => {
    try {
      const creds = await invoke<Record<string, unknown>>('get_project_credentials', { projectName })
      if (!creds) return
      // 把凭据中的字段转成字符串映射，密码字段默认不显示
      const form: Record<string, string> = {}
      for (const [k, v] of Object.entries(creds)) {
        form[k] = typeof v === 'string' ? v : ''
      }
      setEditForm(form)
      setEditingProject(projectName)
    } catch (e) {
      showToast(String(e), 'error')
    }
  }

  // 保存凭据编辑
  const handleSaveCredentials = async () => {
    if (!editingProject) return
    setEditSaving(true)
    try {
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(editForm)) {
        if (v.trim()) clean[k] = v.trim()
      }
      await invoke('update_project_credentials', {
        projectName: editingProject,
        credentials: clean,
      })
      showToast('凭据已更新', 'success')
      setEditingProject(null)
      if (selectedProject === editingProject) {
        const creds = await invoke<Record<string, unknown>>('get_project_credentials', { projectName: editingProject })
        setProjectCreds(creds)
      }
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setEditSaving(false)
    }
  }

  // 删除项目
  const handleDeleteProject = async (name: string) => {
    try {
      await invoke('delete_cloud_project', { projectName: name })
      setDeletingProject(null)
      if (selectedProject === name) {
        setSelectedProject(null)
        setProjectAliases([])
        setSelectedAlias(null)
        setRecords([])
        setRawResult(null)
        setProjectCreds(null)
      }
      await loadProjects()
      showToast(`已删除项目 ${name}`, 'success')
    } catch (e) {
      showToast(String(e), 'error')
    }
  }

  // 新增项目
  const handleAddProject = async () => {
    if (!addForm.name.trim()) { showToast('项目名称不能为空', 'error'); return }
    setAddSaving(true)
    try {
      let creds: Record<string, string> = {}
      if (addForm.provider === 'huawei') {
        creds = { ak: addForm.ak, sk: addForm.sk, region: addForm.region, log_group_id: addForm.log_group_id }
        if (addForm.project_id.trim()) creds.project_id = addForm.project_id
      } else if (addForm.provider === 'aliyun') {
        creds = { ak: addForm.ak, sk: addForm.sk, endpoint: addForm.endpoint, project: addForm.project }
      } else {
        creds = { secret_id: addForm.secret_id, secret_key: addForm.secret_key, region: addForm.region, logset_id: addForm.logset_id }
      }
      await invoke('create_cloud_project', {
        name: addForm.name.trim(),
        provider: addForm.provider,
        description: addForm.description.trim() || undefined,
        credentials: creds,
      })
      showToast(`项目 ${addForm.name} 已添加`, 'success')
      setShowAddProject(false)
      setAddForm({ name:'',provider:'huawei',description:'',ak:'',sk:'',region:'cn-east-3',log_group_id:'',project_id:'',endpoint:'',project:'',secret_id:'',secret_key:'',logset_id:'' })
      await loadProjects()
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setAddSaving(false)
    }
  }

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
      const total = result.reduce((s, p) => s + p.alias_count, 0)
      showToast(`导入成功：${result.length} 个项目，${total} 条别名`, 'success')
      if (result.length > 0) handleProjectSelect(result[0].name)
    } catch (e) {
      const msg = String(e)
      showToast(msg.includes('解析 JSON') ? 'JSON 格式不正确' : msg, 'error')
    } finally {
      setImporting(false)
    }
  }

  const getTimeRange = () => {
    const now = Date.now()
    const offsets: Record<string, number> = {
      '5m': 5 * 60000,
      '15m': 15 * 60000,
      '1h': 3600000,
      '6h': 6 * 3600000,
      '24h': 24 * 3600000,
      '7d': 7 * 86400000,
    }
    const ms = offsets[timeRange] ?? 3600000
    return { from: String(now - ms), to: String(now) }
  }

  /** 执行查询 — kw 参数允许绕过 React 异步 state，修复 quickSearch 竞态 */
  const handleSearch = async (kw?: string) => {
    if (!selectedProject || !selectedAlias) {
      showToast('请先选择项目和日志库', 'error')
      return
    }
    const project = projects.find((p) => p.name === selectedProject)
    if (!project) return

    const keyword = kw !== undefined ? kw : queryStr

    setSearching(true)
    setRecords([])
    setRawResult(null)
    const { from, to } = getTimeRange()

    try {
      const result = await invoke('cloud_search_logs', {
        provider: project.provider,
        projectName: selectedProject,
        aliasName: selectedAlias,
        keywords: keyword || null,
        timeFrom: from,
        timeTo: to,
        limit,
      })
      const parsed = typeof result === 'string' ? JSON.parse(result) : result
      setRawResult(parsed)
      try {
        const rows = parseCloudResult(parsed)
        setRecords(rows)
      } catch (parseErr) {
        // parseCloudResult throws when MCP isError=true
        showToast(`MCP 工具报错: ${String(parseErr)}`, 'error')
        setRecords([])
      }
    } catch (e) {
      showToast(`查询失败: ${String(e)}`, 'error')
      setRawResult({ error: String(e) })
    } finally {
      setSearching(false)
    }
  }

  /** quickSearch: 修复竞态 — 直接把 kw 传给 handleSearch，不 setQueryStr 后立即 call */
  const quickSearch = (kw: string) => {
    setQueryStr(kw)
    handleSearch(kw)
  }

  const currentProject = projects.find((p) => p.name === selectedProject)

  const rawText = rawResult ? JSON.stringify(rawResult, null, 2) : ''

  return (
    <div className="flex h-full">
      {/* ── 左侧：项目列表 ─────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-border bg-elevated flex flex-col">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-primary">云项目</h2>
          <p className="text-[10px] text-muted mt-0.5">选择项目和日志库后查询</p>
        </div>

        {/* 项目列表 */}
        <div className="flex-1 overflow-auto">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="rounded-full border-2 border-dashed border-border p-4">
                <Cloud className="h-8 w-8 text-muted opacity-40" />
              </div>
              <div>
                <p className="text-xs font-medium text-secondary">暂无云项目</p>
                <p className="text-[10px] text-muted mt-1">点击「导入配置」载入 config.json</p>
              </div>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {projects.map((p) => (
                <div
                  key={p.name}
                  className={`group w-full text-left rounded-md transition-colors ${
                    selectedProject === p.name
                      ? 'bg-accent/15 border border-accent/20'
                      : 'hover:bg-surface-hover border border-transparent'
                  }`}
                >
                  <div className="flex items-center">
                    <button
                      onClick={() => handleProjectSelect(p.name)}
                      className="flex-1 min-w-0 text-left px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-medium truncate ${
                          selectedProject === p.name ? 'text-accent' : 'text-primary'
                        }`}>{p.name}</span>
                        <ProviderBadge provider={p.provider} />
                      </div>
                      {p.description && (
                        <div className="text-[10px] text-muted mt-0.5 truncate">{p.description}</div>
                      )}
                      <div className="text-[10px] text-muted mt-0.5">{p.alias_count} 个日志库</div>
                    </button>
                    <div className="shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditCredentials(p.name) }}
                        className="px-2 py-2.5 text-muted hover:text-secondary"
                        title="编辑凭据"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingProject(p.name) }}
                        className="px-2 py-2.5 text-muted hover:text-red-400"
                        title="删除项目"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="border-t border-border p-3 flex gap-2">
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
          >
            {importing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Upload className="h-3.5 w-3.5" />}
            导入配置
          </button>
          <button
            onClick={() => setShowAddProject(true)}
            className="flex items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-secondary hover:bg-surface-hover hover:text-primary transition-colors"
            title="手动新增项目"
          >
            <Plus className="h-3.5 w-3.5" />
            新增
          </button>
          <button
            onClick={loadProjects}
            className="flex items-center justify-center rounded-md border border-border px-2.5 py-2 text-xs text-secondary hover:bg-surface-hover hover:text-primary transition-colors"
            title="刷新项目列表"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 别名/日志库选择 */}
        {currentProject && projectAliases.length > 0 && (
          <div className="border-t border-border px-3 py-3 bg-overlay/30">
            <div className="text-[10px] text-muted mb-1.5 font-medium uppercase tracking-wider">日志库</div>
            <div className="space-y-0.5">
              {projectAliases.map((a) => (
                <button
                  key={a.alias}
                  onClick={() => setSelectedAlias(a.alias)}
                  className={`w-full text-left rounded px-2 py-1.5 text-xs transition-colors ${
                    selectedAlias === a.alias
                      ? 'bg-accent/20 text-accent'
                      : 'text-secondary hover:bg-surface-hover hover:text-primary'
                  }`}
                >
                  <div className="font-medium truncate">{a.alias}</div>
                  {a.logstore && <div className="text-[10px] text-muted truncate">{a.logstore}</div>}
                  {a.description && <div className="text-[10px] text-muted truncate">{a.description}</div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 华为云 project_id 已改为查询时自动发现，无需手动输入 */}
      </div>

      {/* ── 右侧：查询 + 结果 ──────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 查询表单 */}
        <div className="border-b border-border bg-elevated px-6 py-4 space-y-3">
          <div className="flex items-center gap-3">
            {/* 查询语句 */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
              <input
                value={queryStr}
                onChange={(e) => setQueryStr(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                placeholder='查询语句，如 ERROR、level=ERROR、payment timeout（留空查全部）'
                className="w-full rounded-md border border-border bg-input pl-9 pr-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* 时间范围 */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="rounded-md border border-border bg-input px-3 py-2 text-sm text-primary outline-none focus:border-accent"
            >
              <option value="5m">近 5 分钟</option>
              <option value="15m">近 15 分钟</option>
              <option value="1h">近 1 小时</option>
              <option value="6h">近 6 小时</option>
              <option value="24h">近 24 小时</option>
              <option value="7d">近 7 天</option>
            </select>

            {/* 条数 */}
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 100)))}
              min={1}
              max={1000}
              title="返回条数"
              className="w-20 rounded-md border border-border bg-input px-3 py-2 text-sm text-primary outline-none focus:border-accent text-center"
            />

            {/* 查询按钮 */}
            <button
              onClick={() => handleSearch()}
              disabled={searching || !selectedAlias}
              className="flex items-center gap-1.5 rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-40 transition-colors"
            >
              {searching
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Search className="h-4 w-4" />}
              查询
            </button>
          </div>

          {/* 快捷按钮 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">快捷：</span>
            <QuickBtn label="全部" onClick={() => quickSearch('')} active={queryStr === ''} />
            <QuickBtn label="ERROR" onClick={() => quickSearch('ERROR')} active={queryStr === 'ERROR'} />
            <QuickBtn label="WARN"  onClick={() => quickSearch('WARN')}  active={queryStr === 'WARN'} />
            <QuickBtn label="INFO"  onClick={() => quickSearch('INFO')}  active={queryStr === 'INFO'} />
            {!selectedAlias && (
              <span className="ml-auto text-[10px] text-muted">← 请先在左侧选择项目和日志库</span>
            )}
          </div>
        </div>

        {/* 结果区域 */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* 结果工具栏 */}
          <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-elevated shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-primary">查询结果</span>
              {records.length > 0 && (
                <span className="text-[10px] text-muted bg-surface-hover border border-border px-2 py-0.5 rounded-full">
                  {records.length} 条
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!!rawResult && (
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1 text-xs transition-colors ${
                      viewMode === 'table'
                        ? 'bg-accent/20 text-accent'
                        : 'text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    表格
                  </button>
                  <button
                    onClick={() => setViewMode('raw')}
                    className={`px-3 py-1 text-xs transition-colors border-l border-border ${
                      viewMode === 'raw'
                        ? 'bg-accent/20 text-accent'
                        : 'text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    原始 JSON
                  </button>
                </div>
              )}
              {!!rawResult && (
                <button
                  onClick={async () => {
                    await writeText(rawText)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                    showToast('已复制', 'success')
                  }}
                  className="flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors"
                >
                  {copied
                    ? <><CheckCircle2 className="h-3.5 w-3.5 text-success" /> 已复制</>
                    : <><Copy className="h-3.5 w-3.5" /> 复制</>}
                </button>
              )}
              {!!rawResult && (
                <button
                  onClick={() => { setRecords([]); setRawResult(null); setQueryStr('') }}
                  className="text-xs text-secondary hover:text-primary transition-colors"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          {/* 结果内容 */}
          <div className="flex-1 overflow-auto bg-base">
            {searching ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <p className="text-sm text-secondary">查询中，请稍候…</p>
                <p className="text-xs text-muted">首次查询需要启动 MCP 服务，可能需要 10–60 秒</p>
              </div>
            ) : !!rawResult && viewMode === 'table' ? (
              records.length > 0 ? (
                <div>
                  {/* 表头 */}
                  <div className="sticky top-0 flex items-center gap-2 border-b border-border bg-elevated px-4 py-2 text-xs font-semibold text-muted uppercase tracking-wider z-10">
                    <span className="w-8 text-right shrink-0">#</span>
                    <span className="w-4 shrink-0" />
                    <span className="w-44 shrink-0">时间</span>
                    <span className="w-20 shrink-0">级别</span>
                    <span className="flex-1">消息</span>
                  </div>
                  {records.map((rec, i) => (
                    <ResultRow key={i} record={rec} index={i} />
                  ))}
                </div>
              ) : (() => {
                // When MCP returns text but parsing yields 0 records, show the text directly
                const mcpText = getMcpText(rawResult)
                if (mcpText) {
                  return (
                    <pre className="p-6 font-mono text-xs leading-relaxed text-primary whitespace-pre-wrap">
                      {mcpText}
                    </pre>
                  )
                }
                return (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
                    <Cloud className="h-10 w-10 opacity-20" />
                    <p className="text-sm">查询返回 0 条日志</p>
                    <p className="text-xs">尝试扩大时间范围或清除查询条件</p>
                  </div>
                )
              })()
            ) : !!rawResult && viewMode === 'raw' ? (
              <pre className="p-6 font-mono text-xs leading-relaxed text-primary whitespace-pre-wrap">
                {rawText}
              </pre>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
                <Cloud className="h-12 w-12 opacity-15" />
                <p className="text-sm font-medium text-secondary">云日志查询</p>
                <p className="text-xs">在左侧选择项目和日志库，然后点击「查询」</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 编辑凭据弹窗 */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingProject(null)}>
          <div
            className="w-full max-w-md rounded-xl border border-border bg-elevated shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-primary">编辑凭据</h3>
                <p className="text-[10px] text-muted mt-0.5">{editingProject}</p>
              </div>
              <button onClick={() => setEditingProject(null)} className="rounded p-1 text-muted hover:text-secondary hover:bg-surface-hover">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-96 overflow-auto">
              {Object.entries(editForm).map(([key, value]) => {
                const labelMap: Record<string, string> = {
                  ak: 'AccessKey ID (AK)', sk: 'SecretKey (SK)',
                  log_group_id: '日志组 ID (Log Group ID)',
                  log_group_name: '日志组名称 (可选)',
                  project_id: '项目 ID (Project ID)',
                  region: '地域 (Region)',
                  endpoint: '接入点 (Endpoint)',
                  project: 'SLS 项目名 (Project)',
                  secret_id: 'SecretId',
                  secret_key: 'SecretKey',
                  logset_id: '日志集 ID (Logset)',
                }
                const isSensitive = ['sk', 'secret_key', 'secretkey', 'password'].includes(key.toLowerCase())
                return (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
                      {labelMap[key] ?? key}
                    </label>
                    <input
                      value={value}
                      onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                      placeholder={isSensitive ? '••••••••（留空表示不修改）' : `输入 ${labelMap[key] ?? key}`}
                      className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent font-mono"
                    />
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button onClick={() => setEditingProject(null)} className="rounded-md border border-border px-4 py-2 text-xs text-secondary hover:bg-surface-hover transition-colors">
                取消
              </button>
              <button
                onClick={handleSaveCredentials}
                disabled={editSaving}
                className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                {editSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deletingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingProject(null)}>
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-elevated shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary">删除项目</h3>
                <p className="text-xs text-muted mt-0.5">此操作不可恢复</p>
              </div>
            </div>
            <p className="text-sm text-secondary mb-5">
              确定要删除项目 <span className="font-semibold text-primary">「{deletingProject}」</span> 及其所有日志库别名吗？
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeletingProject(null)} className="rounded-md border border-border px-4 py-2 text-sm text-secondary hover:bg-surface-hover transition-colors">
                取消
              </button>
              <button
                onClick={() => handleDeleteProject(deletingProject)}
                className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新增项目弹窗 */}
      {showAddProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddProject(false)}>
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-elevated shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-primary">新增云项目</h3>
              </div>
              <button onClick={() => setShowAddProject(false)} className="rounded p-1 text-muted hover:text-secondary hover:bg-surface-hover">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-auto">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">项目名称 *</label>
                  <input value={addForm.name} onChange={(e) => setAddForm({...addForm, name: e.target.value})}
                    placeholder="如 k30-prod" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">云平台 *</label>
                  <select value={addForm.provider} onChange={(e) => setAddForm({...addForm, provider: e.target.value})}
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-primary outline-none focus:border-accent">
                    <option value="huawei">华为云 LTS</option>
                    <option value="aliyun">阿里云 SLS</option>
                    <option value="tencent">腾讯云 CLS</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">描述（可选）</label>
                <input value={addForm.description} onChange={(e) => setAddForm({...addForm, description: e.target.value})}
                  placeholder="如 K30 生产环境日志" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent" />
              </div>

              <div className="border-t border-border/50 pt-3">
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">连接凭据</div>

                {/* 华为云字段 */}
                {addForm.provider === 'huawei' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">AccessKey ID (AK) *</label>
                        <input value={addForm.ak} onChange={(e) => setAddForm({...addForm, ak: e.target.value})}
                          placeholder="HPUA..." className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">SecretKey (SK) *</label>
                        <input type="password" value={addForm.sk} onChange={(e) => setAddForm({...addForm, sk: e.target.value})}
                          placeholder="••••••••" className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">地域 Region *</label>
                        <input value={addForm.region} onChange={(e) => setAddForm({...addForm, region: e.target.value})}
                          placeholder="cn-east-3" className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">项目 ID（留空自动获取）</label>
                        <input value={addForm.project_id} onChange={(e) => setAddForm({...addForm, project_id: e.target.value})}
                          placeholder="（自动发现）" className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted">日志组 ID (Log Group ID) *</label>
                      <input value={addForm.log_group_id} onChange={(e) => setAddForm({...addForm, log_group_id: e.target.value})}
                        placeholder="29c6945b-c0ff-4320-..." className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                    </div>
                  </div>
                )}

                {/* 阿里云字段 */}
                {addForm.provider === 'aliyun' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">AccessKey ID (AK) *</label>
                        <input value={addForm.ak} onChange={(e) => setAddForm({...addForm, ak: e.target.value})}
                          placeholder="LTAI..." className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">AccessKey Secret *</label>
                        <input type="password" value={addForm.sk} onChange={(e) => setAddForm({...addForm, sk: e.target.value})}
                          placeholder="••••••••" className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">接入点 Endpoint *</label>
                        <input value={addForm.endpoint} onChange={(e) => setAddForm({...addForm, endpoint: e.target.value})}
                          placeholder="cn-hangzhou.log.aliyuncs.com" className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">SLS 项目名 *</label>
                        <input value={addForm.project} onChange={(e) => setAddForm({...addForm, project: e.target.value})}
                          placeholder="my-sls-project" className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                    </div>
                  </div>
                )}

                {/* 腾讯云字段 */}
                {addForm.provider === 'tencent' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">SecretId *</label>
                        <input value={addForm.secret_id} onChange={(e) => setAddForm({...addForm, secret_id: e.target.value})}
                          placeholder="AKID..." className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">SecretKey *</label>
                        <input type="password" value={addForm.secret_key} onChange={(e) => setAddForm({...addForm, secret_key: e.target.value})}
                          placeholder="••••••••" className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">地域 Region *</label>
                        <input value={addForm.region} onChange={(e) => setAddForm({...addForm, region: e.target.value})}
                          placeholder="ap-guangzhou" className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted">日志集 ID (Logset)</label>
                        <input value={addForm.logset_id} onChange={(e) => setAddForm({...addForm, logset_id: e.target.value})}
                          placeholder="（可选）" className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent font-mono" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-muted">添加项目后，在项目列表中点击编辑图标，可添加日志流别名（通过导入 config.json 也可批量设置）。</p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button onClick={() => setShowAddProject(false)} className="rounded-md border border-border px-4 py-2 text-sm text-secondary hover:bg-surface-hover transition-colors">
                取消
              </button>
              <button
                onClick={handleAddProject}
                disabled={addSaving || !addForm.name.trim()}
                className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                {addSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                创建项目
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuickBtn({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-accent/20 text-accent border border-accent/30'
          : 'border border-border text-secondary hover:bg-surface-hover hover:text-primary'
      }`}
    >
      {label}
    </button>
  )
}

/** Extract raw text from an MCP tool response if present */
function getMcpText(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const content = obj['content']
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown>
    if (first.type === 'text' && typeof first.text === 'string') {
      return first.text
    }
  }
  return null
}
