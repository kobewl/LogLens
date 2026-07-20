import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, Loader2, FileSearch, Cloud, Cpu, Wrench,
  ChevronRight, Clock, Binary, Code2, Link2, Regex,
} from 'lucide-react'
import { useLogFile } from '../hooks/useLogFile'
import { showToast, ToastContainer } from '../components/ui/Toast'

export default function Welcome() {
  const navigate = useNavigate()
  const { openFile, loading, sessions, selectSession } = useLogFile()
  const [dragOver, setDragOver] = useState(false)

  const handleOpen = useCallback(async (path?: string) => {
    try {
      const info = await openFile(path)
      if (info) {
        showToast(`已索引 ${info.line_count.toLocaleString()} 行`, 'success')
        navigate('/workspace')
      }
    } catch (e) {
      showToast(String(e), 'error')
    }
  }, [openFile, navigate])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0] as File & { path?: string }
    if (file) await handleOpen(file.path || '')
    else await handleOpen()
  }, [handleOpen])

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg-base)' }}>
      <ToastContainer />

      <div className="max-w-3xl mx-auto px-8 py-10">

        {/* Hero */}
        <div className="flex items-center gap-5 mb-10">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%)' }}
          >
            <FileSearch className="h-8 w-8 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              LogLens
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              本地日志分析 · 云日志查询 · AI 智能分析 · MCP 服务器
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => handleOpen()}
          className="flex flex-col items-center justify-center cursor-pointer rounded-2xl border-2 border-dashed py-12 px-8 mb-8 transition-all"
          style={{
            borderColor: dragOver ? '#3b82f6' : 'var(--border-default)',
            background: dragOver ? 'rgba(59,130,246,0.05)' : 'var(--bg-elevated)',
          }}
        >
          {loading ? (
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#3b82f6' }} />
          ) : (
            <Upload className="h-10 w-10 mb-3" style={{ color: dragOver ? '#3b82f6' : 'var(--text-muted)' }} />
          )}
          <p className="text-sm font-medium mt-2" style={{ color: 'var(--text-primary)' }}>
            {loading ? '索引中…' : '拖放日志文件，或点击选择'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            支持 JSON、Log4j、Logback、Nginx、自定义格式
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            {
              icon: <Cloud className="h-5 w-5" />,
              color: '#3b82f6',
              bg: 'rgba(59,130,246,0.1)',
              title: '云日志查询',
              desc: '阿里云 SLS · 腾讯云 CLS · 华为云 LTS',
              action: () => navigate('/workspace'),
              badge: '→ 工作区',
            },
            {
              icon: <Cpu className="h-5 w-5" />,
              color: '#8b5cf6',
              bg: 'rgba(139,92,246,0.1)',
              title: 'MCP 服务器',
              desc: '让 Cursor、Claude 等 AI 工具直接搜索日志',
              action: () => navigate('/mcp'),
              badge: '→ MCP',
            },
            {
              icon: <Wrench className="h-5 w-5" />,
              color: '#22c55e',
              bg: 'rgba(34,197,94,0.1)',
              title: '开发者工具',
              desc: 'JSON 格式化 · 时间戳 · 正则测试 · Base64',
              action: () => navigate('/tools'),
              badge: '→ 工具箱',
            },
          ].map((card) => (
            <button
              key={card.title}
              onClick={card.action}
              className="text-left rounded-xl border p-4 transition-all group"
              style={{
                background: 'var(--bg-elevated)',
                borderColor: 'var(--border-default)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = card.color + '60'
                e.currentTarget.style.background = card.bg
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)'
                e.currentTarget.style.background = 'var(--bg-elevated)'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: card.bg, color: card.color }}
                >
                  {card.icon}
                </div>
                <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: card.color }}>
                  {card.badge}
                </span>
              </div>
              <div className="font-semibold text-sm mt-2" style={{ color: 'var(--text-primary)' }}>
                {card.title}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{card.desc}</div>
            </button>
          ))}
        </div>

        {/* Quick tool shortcuts */}
        <div className="rounded-xl border p-4 mb-8"
          style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-muted)' }}>
            常用工具
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[
              { icon: <Code2 size={14} />, label: 'JSON 格式化', tool: 'json' },
              { icon: <Clock size={14} />, label: '时间戳', tool: 'timestamp' },
              { icon: <Regex size={14} />, label: '正则测试', tool: 'regex' },
              { icon: <Binary size={14} />, label: 'Base64', tool: 'base64' },
              { icon: <Link2 size={14} />, label: 'URL 编码', tool: 'url' },
            ].map(({ icon, label }) => (
              <button
                key={label}
                onClick={() => navigate('/tools')}
                className="flex flex-col items-center gap-1.5 rounded-lg py-3 text-center transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-hover)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                {icon}
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--text-muted)' }}>
              最近打开
            </div>
            <div className="flex flex-col gap-1">
              {sessions.slice(0, 5).map((s) => (
                <button
                  key={s.id}
                  onClick={async () => {
                    await selectSession(s)
                    navigate('/workspace')
                  }}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors group"
                  style={{ background: 'var(--bg-elevated)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
                >
                  <FileText className="h-4 w-4 shrink-0" style={{ color: '#3b82f6' }} />
                  <span className="flex-1 text-sm text-left font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                    {s.path.split('/').pop()}
                  </span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {s.line_count.toLocaleString()} 行
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-muted)' }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
