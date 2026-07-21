import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import {
  Activity,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  RefreshCw,
  Terminal,
  Trash2,
  Wrench,
  Zap,
  BookOpen,
  ChevronRight,
  XCircle,
  X,
  FileJson,
  Clock,
  Layers,
} from 'lucide-react'
import clsx from 'clsx'

interface McpClientStatus {
  client_id: string
  client_name: string
  installed: boolean
  config_path: string | null
  executable_path: string
  client_type: string
  manual_command?: string | null
}

type McpTab = 'setup' | 'tools' | 'docs' | 'activity'

interface McpCallEvent {
  id: string
  timestamp: string
  tool: string
  args_preview: string
  duration_ms: number
  status: 'success' | 'error'
  error?: string
  client_hint?: string
  result_preview?: string
}

// Brand icons as SVG components
const CursorIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#1a1a1a" />
    <path d="M8 8l16 8-16 8V8z" fill="white" />
  </svg>
)
const ClaudeIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#CC785C" />
    <text x="16" y="22" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">A</text>
  </svg>
)
const OpenAIIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#10a37f" />
    <circle cx="16" cy="16" r="8" fill="none" stroke="white" strokeWidth="2" />
    <circle cx="16" cy="16" r="3" fill="white" />
  </svg>
)
const WindsurfIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#0ea5e9" />
    <path d="M8 24 C8 16, 16 10, 24 8 L24 24 Z" fill="white" opacity="0.9" />
  </svg>
)
const GeminiIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#4285f4" />
    <path d="M16 6 L26 16 L16 26 L6 16 Z" fill="white" opacity="0.9" />
  </svg>
)

const ClientIcon = ({ clientId, size = 22 }: { clientId: string; size?: number }) => {
  switch (clientId) {
    case 'cursor': return <CursorIcon size={size} />
    case 'claude': return <ClaudeIcon size={size} />
    case 'claude_code': return <ClaudeIcon size={size} />
    case 'codex': return <OpenAIIcon size={size} />
    case 'windsurf': return <WindsurfIcon size={size} />
    case 'antigravity': return <GeminiIcon size={size} />
    default: return <Cpu size={size} />
  }
}

interface McpRunningStatus {
  running: boolean
  pid?: number
  port?: number
  last_active?: string
  last_client?: string
}

function McpStatusBadge({ status }: { status: McpRunningStatus | null }) {
  if (!status) return null
  if (status.running) {
    return (
      <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
        style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ background: '#4ade80' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#4ade80' }} />
        </span>
        运行中
        {status.pid && <span style={{ color: 'rgba(74,222,128,0.7)' }}>PID {status.pid}</span>}
        {status.port && <span style={{ color: 'rgba(74,222,128,0.7)' }}>:19527</span>}
        {status.last_client && <span style={{ color: 'rgba(74,222,128,0.7)' }}>· {status.last_client}</span>}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
      style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
      <span className="h-2 w-2 rounded-full" style={{ background: 'var(--text-muted)' }} />
      未运行
      {status.last_active && (
        <span>· 上次活跃 {new Date(status.last_active).toLocaleString()}</span>
      )}
    </div>
  )
}

export default function McpPage() {
  const [tab, setTab] = useState<McpTab>('setup')
  const [mcpStatus, setMcpStatus] = useState<McpRunningStatus | null>(null)

  // 每 5 秒轮询一次运行状态
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await invoke<McpRunningStatus>('get_mcp_running_status')
        setMcpStatus(s)
      } catch { /* ignore */ }
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [])

  const tabs = [
    { id: 'setup' as McpTab, icon: Zap, label: '一键接入' },
    { id: 'tools' as McpTab, icon: Wrench, label: 'MCP 工具' },
    { id: 'activity' as McpTab, icon: Activity, label: '调用历史' },
    { id: 'docs' as McpTab, icon: BookOpen, label: '使用说明' },
  ]

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="mx-auto max-w-4xl flex flex-col gap-0 p-8">

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
            <Cpu size={22} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>MCP 服务器</h1>
              <McpStatusBadge status={mcpStatus} />
            </div>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              将 LogLens 接入 AI 工具（Cursor / Claude / Codex 等），让 AI 直接查询你的 <strong style={{ color: '#4ade80' }}>本地应用日志</strong> 和 <strong style={{ color: '#60a5fa' }}>云端生产日志</strong>。
              支持 <strong>实时追踪</strong>、<strong>跨文件搜索</strong>、<strong>全文检索</strong>等 {MCP_TOOLS.length} 个工具。
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-6" style={{ borderColor: 'var(--border-default)' }}>
          {tabs.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                '-mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === id
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent hover:text-primary'
              )}
              style={tab !== id ? { color: 'var(--text-muted)' } : {}}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {tab === 'setup' && <McpSetupPanel />}
        {tab === 'tools' && <McpToolsPanel />}
        {tab === 'docs' && <McpDocsPanel />}
        {tab === 'activity' && <McpActivityPanel />}
      </div>
    </div>
  )
}

function McpSetupPanel() {
  const [clients, setClients] = useState<McpClientStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const selectedClient = useMemo(
    () => clients.find((c) => c.client_id === selected) ?? clients[0] ?? null,
    [clients, selected]
  )

  const jsonConfig = useMemo(() => {
    if (!selectedClient) return ''
    return JSON.stringify(
      {
        mcpServers: {
          loglens: {
            // stdio 方式（推荐）：AI 客户端自动管理进程
            command: selectedClient.executable_path || 'loglens',
            args: ['--mcp-server'],
            // HTTP 方式（备选）：连接已运行的服务
            // url: 'http://localhost:19527/mcp',
          },
        },
      },
      null,
      2
    )
  }, [selectedClient])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await invoke<McpClientStatus[]>('get_mcp_status')
      setClients(res)
      setSelected((cur) => cur ?? res[0]?.client_id ?? null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleInstall = async (clientId: string) => {
    setInstalling(clientId)
    setResult(null)
    try {
      const name = await invoke<string>('install_mcp_config', { clientId })
      setResult({ ok: true, msg: `✓ 已成功配置 ${name}` })
      await load()
    } catch (e) {
      setResult({ ok: false, msg: String(e) })
    } finally {
      setInstalling(null)
    }
  }

  const copyText = async (text: string, key: string) => {
    await writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
        <RefreshCw size={16} className="animate-spin mr-2" />
        检测安装状态…
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      {/* Left: client list */}
      <div className="w-52 shrink-0 flex flex-col gap-1">
        <div className="text-xs font-medium mb-2 uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}>
          AI 客户端
        </div>
        {clients.map((c) => (
          <button
            key={c.client_id}
            onClick={() => setSelected(c.client_id)}
            className={clsx(
              'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-colors text-left',
              selected === c.client_id
                ? 'bg-violet-500/15 text-violet-300'
                : 'hover:bg-surface-hover'
            )}
            style={selected !== c.client_id ? { color: 'var(--text-secondary)' } : {}}
          >
            <ClientIcon clientId={c.client_id} size={20} />
            <span className="flex-1 truncate">{c.client_name}</span>
            {c.installed && (
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: 'var(--accent-success)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Right: detail */}
      {selectedClient && (
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClientIcon clientId={selectedClient.client_id} size={28} />
              <div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {selectedClient.client_name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {selectedClient.installed ? (
                    <span style={{ color: 'var(--accent-success)' }}>● 已安装</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>○ 未安装</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleInstall(selectedClient.client_id)}
              disabled={installing === selectedClient.client_id}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                selectedClient.installed
                  ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                  : 'bg-violet-600 text-white hover:bg-violet-700'
              )}
            >
              {installing === selectedClient.client_id ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : selectedClient.installed ? (
                <Check size={14} />
              ) : (
                <Zap size={14} />
              )}
              {selectedClient.installed ? '重新安装' : '一键安装'}
            </button>
          </div>

          {result && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                background: result.ok ? 'rgba(26,127,55,0.15)' : 'rgba(248,81,73,0.15)',
                color: result.ok ? 'var(--accent-success)' : 'var(--accent-error)',
                border: `1px solid ${result.ok ? 'rgba(26,127,55,0.3)' : 'rgba(248,81,73,0.3)'}`,
              }}
            >
              {result.msg}
            </div>
          )}

          {/* Config path */}
          {selectedClient.config_path && (
            <div>
              <div className="text-xs font-medium mb-1.5 uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}>
                配置文件路径
              </div>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs"
                style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}>
                <span className="flex-1 truncate">{selectedClient.config_path}</span>
              </div>
            </div>
          )}

          {/* JSON config */}
          {selectedClient.client_type === 'file' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}>
                  手动配置（写入 mcpServers）
                </div>
                <button
                  onClick={() => copyText(jsonConfig, 'json')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {copied === 'json' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'json' ? '已复制' : '复制'}
                </button>
              </div>
              <pre
                className="rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto leading-relaxed"
                style={{ background: 'var(--bg-overlay)', color: 'var(--text-primary)' }}
              >
                {jsonConfig}
              </pre>
            </div>
          )}

          {/* CLI command for command-type clients */}
          {selectedClient.client_type === 'command' && selectedClient.manual_command && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}>
                  <Terminal size={12} />
                  手动安装命令
                </div>
                <button
                  onClick={() => copyText(selectedClient.manual_command!, 'cmd')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {copied === 'cmd' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'cmd' ? '已复制' : '复制'}
                </button>
              </div>
              <pre
                className="rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto"
                style={{ background: 'var(--bg-overlay)', color: 'var(--text-primary)' }}
              >
                {selectedClient.manual_command}
              </pre>
            </div>
          )}

          {/* Docs link */}
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <ExternalLink size={12} />
            <span>
              安装后重启 {selectedClient.client_name}，即可在 AI 对话中直接搜索分析日志
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const MCP_TOOLS = [
  {
    name: 'list_log_sessions',
    label: '📂 列出日志文件',
    category: 'local',
    desc: '【推荐第一步调用】列出 LogLens 中最近打开过的本地日志文件。AI Agent 应先调用此工具发现可用的日志文件。',
    params: [],
    workflow: '列出可用日志文件 → 获取 file_path → search_local_logs / tail_log_file / get_log_stats',
  },
  {
    name: 'search_local_logs',
    label: '🔍 搜索本地日志',
    category: 'local',
    desc: '【核心工具】搜索本地日志文件，支持全文检索和字段过滤（level=ERROR, service=api等）。AI Agent 调试时最常用的工具。',
    params: [
      { name: 'file_path', type: 'string', required: true,  desc: '日志文件的绝对路径。可从 list_log_sessions 获取。' },
      { name: 'query',     type: 'string', required: false, desc: '搜索查询。"ERROR"、"level=ERROR"、"timeout"。留空返回所有行。' },
      { name: 'limit',     type: 'integer',required: false, desc: '最大返回条数，默认 50，最大 500' },
    ],
    workflow: 'list_log_sessions → 获取 path → search_local_logs(file_path, "ERROR")',
  },
  {
    name: 'tail_log_file',
    label: '📡 实时追踪日志',
    category: 'local',
    desc: '【实时监控】像 tail -f 一样追踪日志文件的新增内容。首次调用返回末尾行，后续调用只返回新增行。适合监控运行中的应用。',
    params: [
      { name: 'file_path', type: 'string', required: true,  desc: '要监控的日志文件绝对路径' },
      { name: 'max_lines', type: 'integer',required: false, desc: '每次返回的最大行数，默认 50，最大 200' },
      { name: 'reset',     type: 'boolean',required: false, desc: '设为 true 重置追踪位置，从文件末尾重新开始' },
    ],
    workflow: '测试前调用一次 → 运行测试 → 再次调用获取新增日志',
  },
  {
    name: 'search_all_logs',
    label: '🔎 全量日志搜索',
    category: 'local',
    desc: '【跨文件搜索】同时搜索所有已知日志文件。不知道错误在哪个文件时使用，自动聚合所有文件的匹配结果。',
    params: [
      { name: 'query',          type: 'string', required: false, desc: '搜索查询，默认 "ERROR"。应用于所有文件。' },
      { name: 'limit_per_file', type: 'integer',required: false, desc: '每文件最大结果数，默认 20，最大 100' },
      { name: 'max_files',      type: 'integer',required: false, desc: '最多搜索的文件数，默认 10，最大 20' },
    ],
    workflow: 'search_all_logs("ERROR") → 发现哪个文件有错误 → search_local_logs 深入分析',
  },
  {
    name: 'get_log_context',
    label: '📋 上下文查看',
    category: 'local',
    desc: '获取指定日志行前后的上下文。当搜索发现错误行时，用此工具查看错误发生的上下文。',
    params: [
      { name: 'file_path',   type: 'string', required: true,  desc: '日志文件的绝对路径' },
      { name: 'line_number', type: 'integer',required: true,  desc: '目标行号' },
      { name: 'before',      type: 'integer',required: false, desc: '目标行之前的行数，默认 10，最大 100' },
      { name: 'after',       type: 'integer',required: false, desc: '目标行之后的行数，默认 10，最大 100' },
    ],
    workflow: 'search_local_logs → 获取异常行号 → get_log_context(该行号)',
  },
  {
    name: 'get_log_stats',
    label: '📊 日志统计',
    category: 'local',
    desc: '获取日志文件的高级统计概览：总行数、时间范围、各级别/服务分布、时间线。帮助 AI 快速了解日志全貌。',
    params: [
      { name: 'file_path', type: 'string', required: true,  desc: '日志文件的绝对路径' },
    ],
    workflow: '新日志文件 → get_log_stats(file_path) → 了解概况 → search_local_logs',
  },
  {
    name: 'list_cloud_projects',
    label: '☁️ 列出云项目',
    category: 'cloud',
    desc: '列出 LogLens 中所有已配置的云日志项目（华为云 LTS / 阿里云 SLS / 腾讯云 CLS）。',
    params: [],
    workflow: '调用后获取 project_name 和 alias_name，传给 search_cloud_logs。',
  },
  {
    name: 'search_cloud_logs',
    label: '☁️ 搜索云日志',
    category: 'cloud',
    desc: '按项目名 + 日志流别名查询云端生产日志。支持华为云 LTS、阿里云 SLS、腾讯云 CLS。',
    params: [
      { name: 'project_name', type: 'string', required: true,  desc: '云项目名称' },
      { name: 'alias_name',   type: 'string', required: true,  desc: '日志流别名' },
      { name: 'query',        type: 'string', required: false, desc: '查询关键词' },
      { name: 'time_range',   type: 'string', required: false, desc: '"15m" | "1h" | "3h" | "24h" | "7d"' },
      { name: 'limit',        type: 'integer',required: false, desc: '最大返回条数，默认 100' },
    ],
    workflow: 'list_cloud_projects → 确认 project_name + alias_name → search_cloud_logs(query, time_range)',
  },
]

function McpToolsPanel() {
  const [expanded, setExpanded] = useState<string | null>('search_local_logs')

  const localTools = MCP_TOOLS.filter(t => (t as any).category === 'local')
  const cloudTools = MCP_TOOLS.filter(t => (t as any).category === 'cloud')

  const renderToolCard = (tool: typeof MCP_TOOLS[0]) => (
    <div
      key={tool.name}
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}
    >
      <button
        onClick={() => setExpanded((v) => v === tool.name ? null : tool.name)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
      >
        <Activity size={15} style={{ color: 'var(--accent-primary)' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {tool.name}
            </code>
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(9,105,218,0.15)', color: 'var(--accent-primary)' }}>
              {tool.label}
            </span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {tool.desc}
          </div>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {expanded === tool.name ? '▲' : '▼'}
        </span>
      </button>

      {expanded === tool.name && (
        <div className="px-4 pb-4 pt-1">
          {'workflow' in tool && tool.workflow && (
            <div className="mb-3 flex gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
              <span className="shrink-0">💡</span>
              <span>{(tool as {workflow?: string}).workflow}</span>
            </div>
          )}
          {tool.params.length > 0 && (
            <>
              <div className="text-xs font-medium mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}>
                参数
              </div>
              <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-default)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--bg-overlay)' }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>参数名</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>类型</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>必填</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tool.params.map((p, i) => (
                      <tr key={p.name} style={{
                        borderTop: i > 0 ? `1px solid var(--border-default)` : undefined,
                      }}>
                        <td className="px-3 py-2">
                          <code className="font-mono" style={{ color: 'var(--text-primary)' }}>{p.name}</code>
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded font-mono"
                            style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}>
                            {p.type}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {p.required
                            ? <span style={{ color: 'var(--accent-error)' }}>必填</span>
                            : <span style={{ color: 'var(--text-muted)' }}>可选</span>
                          }
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tool.params.length === 0 && (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              无参数。
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* 本地日志工具 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>
            本地日志
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            AI Agent 调试本地应用时使用的核心工具
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {localTools.map(renderToolCard)}
        </div>
      </div>

      {/* 云日志工具 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>
            云日志
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            查询华为云/阿里云/腾讯云上的生产日志
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {cloudTools.map(renderToolCard)}
        </div>
      </div>
    </div>
  )
}

function McpDocsPanel() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: any[] = [
    {
      title: '什么是 MCP 服务器？',
      content: `MCP（Model Context Protocol）是 Anthropic 定义的 AI 工具协议标准。
LogLens 内置一个 MCP 服务器，使用 --mcp-server 参数启动后，通过 stdin/stdout 接收 JSON-RPC 2.0 请求，
让 AI 客户端（Cursor、Claude Desktop 等）能够直接调用 LogLens 的本地日志搜索和云日志查询能力。

**核心价值**：你的 AI 编程助手不再是"盲人"——它可以自己查看应用日志来定位 bug、理解运行时行为。`,
    },
    {
      title: '快速接入步骤',
      steps: [
        '确保已安装 LogLens 桌面应用（或在路径中有 loglens 可执行文件）',
        '进入「一键接入」Tab，找到你使用的 AI 客户端，点击「一键安装」',
        '重启 AI 客户端（Cursor / Claude Desktop 等）',
        '在 AI 对话中尝试："搜索 /var/log/app.log 中的 ERROR 日志" 或 "列出最近的日志文件"',
      ],
    },
    {
      title: '可用工具说明',
      table: [
        { name: 'search_local_logs', desc: '🔍 搜索本地日志文件，支持全文检索和字段过滤 — AI Agent 调试的核心工具' },
        { name: 'get_log_context', desc: '📋 获取指定行前后的上下文 — 发现错误后查看周边信息' },
        { name: 'list_log_sessions', desc: '📂 列出最近打开的日志文件 — AI 不知道日志在哪时先调这个' },
        { name: 'get_log_stats', desc: '📊 日志文件统计概览 — 快速了解整体情况' },
        { name: 'search_cloud_logs', desc: '☁️ 搜索阿里云/腾讯云/华为云上的生产日志' },
        { name: 'list_cloud_projects', desc: '☁️ 列出已配置的云日志项目' },
      ],
    },
    {
      title: '示例对话',
      examples: [
        '搜索 /var/log/app.log 中最近的 ERROR 日志，并分析可能的原因',
        '列出 LogLens 中最近打开的日志文件',
        '在 /logs/backend.log 中找到第 1024 行前后的上下文',
        '分析 /var/log/nginx/access.log 的统计信息（错误数、时间分布）',
        '在云项目 p30-test 的 P30 测试日志中搜索最近 15 分钟的 timeout',
      ],
    },
    {
      title: '故障排查',
      tips: [
        { icon: '🔍', title: '工具未出现', desc: '检查 mcp.json 中 command 路径是否正确，尝试在终端执行该命令加 --mcp-server 参数' },
        { icon: '⚡', title: 'AI 客户端未刷新', desc: '修改配置后必须完全重启 AI 客户端（不是刷新窗口）' },
        { icon: '📝', title: '日志格式不识别', desc: 'LogLens 自动识别 JSON / Log4j / Logback / Nginx 格式，纯文本也支持搜索' },
        { icon: '🤖', title: 'analyze_anomalies 失败', desc: '该工具需要在设置中配置 AI Provider（DeepSeek / OpenAI）的 API Key' },
      ],
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {sections.map((s, i) => (
        <div key={i} className="rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {i + 1}. {s.title}
            </h3>
          </div>
          <div className="px-5 py-4">
            {s.content && (
              <p className="text-sm leading-relaxed whitespace-pre-line"
                style={{ color: 'var(--text-secondary)' }}>{s.content}</p>
            )}
            {s.steps && (
              <ol className="flex flex-col gap-2">
                {s.steps.map((step: string, j: number) => (
                  <li key={j} className="flex items-start gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5"
                      style={{ background: 'rgba(47,129,247,0.15)', color: '#60a5fa' }}>
                      {j + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
            {s.code && (
              <pre className="rounded-lg p-3 text-xs font-mono overflow-x-auto leading-relaxed"
                style={{ background: 'var(--bg-overlay)', color: 'var(--text-primary)' }}>
                {s.code}
              </pre>
            )}
            {s.table && (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <th className="text-left py-2 pr-4 font-medium w-48" style={{ color: 'var(--text-muted)' }}>工具名</th>
                    <th className="text-left py-2 font-medium" style={{ color: 'var(--text-muted)' }}>功能说明</th>
                  </tr>
                </thead>
                <tbody>
                  {s.table.map((row: { name: string; desc: string }, j: number) => (
                    <tr key={j} style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <td className="py-2 pr-4">
                        <code className="text-xs font-mono" style={{ color: '#60a5fa' }}>{row.name}</code>
                      </td>
                      <td className="py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {s.examples && (
              <div className="flex flex-col gap-2">
                {s.examples.map((ex: string, j: number) => (
                  <div key={j} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-mono"
                    style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}>
                    <ChevronRight size={12} style={{ color: '#60a5fa' }} />
                    "{ex}"
                  </div>
                ))}
              </div>
            )}
            {s.tips && (
              <div className="flex flex-col gap-3">
                {s.tips.map((tip: { icon: string; title: string; desc: string }, j: number) => (
                  <div key={j} className="flex items-start gap-3">
                    <span className="text-lg shrink-0">{tip.icon}</span>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{tip.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{tip.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── 调用历史面板 ──────────────────────────────────────────────────────────────

const TOOL_COLORS: Record<string, string> = {
  search_local_logs:  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  tail_log_file:      'bg-lime-500/15 text-lime-400 border border-lime-500/25',
  search_all_logs:    'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  get_log_context:    'bg-teal-500/15 text-teal-400 border border-teal-500/25',
  list_log_sessions:  'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25',
  get_log_stats:      'bg-green-500/15 text-green-400 border border-green-500/25',
  search_cloud_logs:  'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  list_cloud_projects:'bg-sky-500/15 text-sky-400 border border-sky-500/25',
  analyze_anomalies:  'bg-orange-500/15 text-orange-400 border border-orange-500/25',
}

function ToolBadge({ name }: { name: string }) {
  const style = TOOL_COLORS[name] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/25'
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${style}`}>
      {name}
    </span>
  )
}

/** 把 args_preview JSON 转成人类可读的一行摘要 */
function summarizeArgs(tool: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson)
    if (tool === 'search_local_logs') {
      const parts: string[] = []
      if (args.file_path) parts.push(args.file_path.split('/').pop() || args.file_path)
      if (args.query)      parts.push(`"${args.query}"`)
      if (args.limit)      parts.push(`limit ${args.limit}`)
      return parts.join(' · ') || '（无参数）'
    }
    if (tool === 'tail_log_file') {
      const fname = args.file_path?.split('/').pop() || '?'
      return `${fname} · max ${args.max_lines ?? 50}${args.reset ? ' · reset' : ''}`
    }
    if (tool === 'search_all_logs')   return `"${args.query || 'ERROR'}" · ${args.limit_per_file ?? 20}/file`
    if (tool === 'get_log_context') {
      return `${args.file_path?.split('/').pop() || '?'} @ #${args.line_number} ±${args.before ?? 10}`
    }
    if (tool === 'list_log_sessions') return '列出本地日志文件'
    if (tool === 'get_log_stats')     return args.file_path?.split('/').pop() || '?'
    if (tool === 'search_cloud_logs') {
      const parts: string[] = []
      if (args.project_name) parts.push(args.project_name)
      if (args.alias_name)   parts.push(`/ ${args.alias_name}`)
      if (args.query)        parts.push(`· "${args.query}"`)
      if (args.time_range)   parts.push(`· ${args.time_range}`)
      if (args.limit)        parts.push(`· limit ${args.limit}`)
      return parts.join(' ') || '（无参数）'
    }
    if (tool === 'list_cloud_projects') return '列出所有云项目'
    return Object.entries(args).slice(0, 3).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
  } catch {
    return argsJson.slice(0, 80)
  }
}

// ─── 详情抽屉 ─────────────────────────────────────────────────────────────────

function DetailDrawer({ event, onClose }: { event: McpCallEvent; onClose: () => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const copy = async (text: string, key: string) => {
    await writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const ts = new Date(event.timestamp).toLocaleString()
  const formattedArgs = (() => {
    try { return JSON.stringify(JSON.parse(event.args_preview), null, 2) } catch { return event.args_preview }
  })()
  const formattedResult = (() => {
    if (!event.result_preview) return null
    try { return JSON.stringify(JSON.parse(event.result_preview), null, 2) } catch { return event.result_preview }
  })()

  return (
    // 遮罩层
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* 抽屉主体 */}
      <div
        ref={drawerRef}
        className="flex flex-col h-full overflow-hidden"
        style={{
          width: 'min(680px, 90vw)',
          background: 'var(--bg-base)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.35)',
        }}
      >
        {/* 抽屉顶部 */}
        <div className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {event.status === 'success'
              ? <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
              : <XCircle className="h-5 w-5 text-red-400 shrink-0" />}
            <code className="text-sm font-mono font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {event.tool}
            </code>
            <ToolBadge name={event.tool} />
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-surface-hover"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 元信息卡片 */}
        <div className="shrink-0 px-5 py-3 flex gap-4 flex-wrap text-xs"
          style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-overlay)' }}>
          {[
            { icon: Clock, label: ts },
            { icon: Activity, label: `${event.duration_ms} ms` },
            ...(event.client_hint ? [{ icon: Layers, label: `via ${event.client_hint}` }] : []),
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Icon className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
              {label}
            </div>
          ))}
        </div>

        {/* 滚动内容区 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* 入参 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}>
                <FileJson className="h-3.5 w-3.5" />
                入参 (Arguments)
              </div>
              <button
                onClick={() => copy(formattedArgs, 'args')}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-surface-hover"
                style={{ color: 'var(--text-muted)' }}
              >
                {copiedKey === 'args' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedKey === 'args' ? '已复制' : '复制'}
              </button>
            </div>
            <pre
              className="text-xs font-mono rounded-lg p-4 overflow-auto leading-relaxed"
              style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)', maxHeight: '240px' }}
            >
              {formattedArgs}
            </pre>
          </section>

          {/* 错误 */}
          {event.error && (
            <section>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-red-400">
                错误信息
              </div>
              <div
                className="rounded-lg px-4 py-3 text-xs font-mono break-all leading-relaxed"
                style={{ background: 'rgba(248,81,73,0.08)', color: '#f85149', border: '1px solid rgba(248,81,73,0.25)' }}
              >
                {event.error}
              </div>
            </section>
          )}

          {/* 返回结果 */}
          {formattedResult && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}>
                  返回结果 (Result)
                  <span className="ml-2 font-normal normal-case" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                    {event.result_preview!.length.toLocaleString()} 字符
                  </span>
                </div>
                <button
                  onClick={() => copy(formattedResult, 'result')}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-surface-hover"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {copiedKey === 'result' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedKey === 'result' ? '已复制' : '复制'}
                </button>
              </div>
              <pre
                className="text-xs font-mono rounded-lg p-4 overflow-auto leading-relaxed"
                style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)', maxHeight: '60vh' }}
              >
                {formattedResult}
              </pre>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 调用历史行 ────────────────────────────────────────────────────────────────

function ActivityRow({ event, onShowDetail }: { event: McpCallEvent; onShowDetail: (e: McpCallEvent) => void }) {
  const ts = new Date(event.timestamp).toLocaleString()
  const summary = summarizeArgs(event.tool, event.args_preview)

  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--border-default)' }}>
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-hover transition-colors"
        onClick={() => onShowDetail(event)}
      >
        {/* 状态 */}
        <div className="shrink-0">
          {event.status === 'success'
            ? <CheckCircle2 className="h-4 w-4 text-green-400" />
            : <XCircle className="h-4 w-4 text-red-400" />}
        </div>

        {/* 工具名徽章 */}
        <div className="w-44 shrink-0"><ToolBadge name={event.tool} /></div>

        {/* 摘要（可读） */}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm" style={{ color: 'var(--text-primary)' }}>{summary}</p>
          {event.client_hint && (
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>via {event.client_hint}</p>
          )}
        </div>

        {/* 耗时 */}
        <div className="w-16 shrink-0 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
          {event.duration_ms}ms
        </div>

        {/* 时间 */}
        <div className="w-44 shrink-0 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
          {ts}
        </div>

        <div className="shrink-0" style={{ color: 'var(--text-muted)' }}>
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  )
}

function McpActivityPanel() {
  const [events, setEvents] = useState<McpCallEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [toolFilter, setToolFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [clearing, setClearing] = useState(false)
  const [detailEvent, setDetailEvent] = useState<McpCallEvent | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await invoke<McpCallEvent[]>('get_mcp_activity', {
        toolFilter: toolFilter || null,
        statusFilter: statusFilter || null,
        limit: 200,
      })
      setEvents(result)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [toolFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const handleClear = async () => {
    if (!confirm('确定清空全部调用历史记录吗？')) return
    setClearing(true)
    try {
      await invoke('clear_mcp_activity')
      setEvents([])
    } finally {
      setClearing(false)
    }
  }

  const tools = ['search_local_logs', 'tail_log_file', 'search_all_logs', 'get_log_context', 'list_log_sessions', 'get_log_stats', 'list_cloud_projects', 'search_cloud_logs']
  const successCount = events.filter((e) => e.status === 'success').length
  const errorCount   = events.filter((e) => e.status === 'error').length

  return (
    <>
      {/* 详情抽屉（portal 到 body 层级，覆盖整个窗口） */}
      {detailEvent && (
        <DetailDrawer event={detailEvent} onClose={() => setDetailEvent(null)} />
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-3">
            {[
              { label: '总调用', value: events.length, color: 'var(--text-primary)', border: 'var(--border-default)', bg: 'var(--bg-elevated)' },
              { label: '成功',   value: successCount,  color: '#4ade80', border: 'rgba(74,222,128,0.3)', bg: 'rgba(74,222,128,0.05)' },
              { label: '失败',   value: errorCount,    color: '#f85149', border: 'rgba(248,81,73,0.3)',  bg: 'rgba(248,81,73,0.05)' },
            ].map(({ label, value, color, border, bg }) => (
              <div key={label} className="rounded-lg border px-3 py-2 text-center min-w-[68px]"
                style={{ borderColor: border, background: bg }}>
                <div className="text-lg font-semibold" style={{ color }}>{value}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <select value={toolFilter} onChange={(e) => setToolFilter(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-xs outline-none"
              style={{ borderColor: 'var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
              <option value="">全部工具</option>
              {tools.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-xs outline-none"
              style={{ borderColor: 'var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
              <option value="">全部状态</option>
              <option value="success">成功</option>
              <option value="error">失败</option>
            </select>
          </div>

          <div className="flex gap-2 ml-auto">
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-surface-hover transition-colors"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button onClick={handleClear} disabled={clearing || events.length === 0}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
              style={{ borderColor: 'rgba(248,81,73,0.3)' }}>
              <Trash2 className="h-3.5 w-3.5" />
              清空
            </button>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
          <div className="flex items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
            <div className="w-4 shrink-0" />
            <div className="w-44 shrink-0">工具</div>
            <div className="flex-1">查询摘要 / 客户端</div>
            <div className="w-16 text-right shrink-0">耗时</div>
            <div className="w-44 text-right shrink-0">时间</div>
            <div className="w-4 shrink-0" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2" style={{ color: 'var(--text-muted)' }}>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">加载中…</span>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--text-muted)' }}>
              <Activity className="h-10 w-10 opacity-20" />
              <p className="text-sm">暂无调用记录</p>
              <p className="text-xs">在 Cursor / Claude 等 AI 工具中使用 LogLens MCP 后，调用历史将显示在这里</p>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-base)' }}>
              {events.map((event) => (
                <ActivityRow key={event.id} event={event} onShowDetail={setDetailEvent} />
              ))}
            </div>
          )}
        </div>

        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          点击任意行查看完整详情。显示最近 200 条，按时间倒序。最多保留 5000 条（自动轮转）。
        </p>
      </div>
    </>
  )
}
