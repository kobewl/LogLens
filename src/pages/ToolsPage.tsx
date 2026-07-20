/**
 * ToolsPage — 常用开发者工具集合
 * - JSON 格式化 / 压缩 / 校验
 * - 时间戳转换（Unix ms/s ↔ 人类可读）
 * - 正则表达式测试
 * - Base64 编解码
 * - URL 编解码
 */
import { useState } from 'react'
import { Check, Copy, Wrench, Code2, Clock, Regex, Binary, Link2 } from 'lucide-react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import clsx from 'clsx'

type ToolId = 'json' | 'timestamp' | 'regex' | 'base64' | 'url'

const TOOLS: Array<{ id: ToolId; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; desc: string }> = [
  { id: 'json', icon: Code2, label: 'JSON 格式化', desc: '格式化、压缩、校验 JSON' },
  { id: 'timestamp', icon: Clock, label: '时间戳转换', desc: 'Unix 时间戳 ↔ 可读时间' },
  { id: 'regex', icon: Regex, label: '正则测试', desc: '实时匹配测试、分组提取' },
  { id: 'base64', icon: Binary, label: 'Base64', desc: '编码 / 解码' },
  { id: 'url', icon: Link2, label: 'URL 编解码', desc: 'encodeURIComponent / decode' },
]

export default function ToolsPage() {
  const [active, setActive] = useState<ToolId>('json')

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <div
        className="w-48 shrink-0 flex flex-col border-r py-4 px-3 gap-0.5"
        style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}
      >
        <div className="flex items-center gap-2 px-3 py-2 mb-3">
          <Wrench size={13} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            工具箱
          </span>
        </div>
        {TOOLS.map(({ id, icon: Icon, label, desc }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={clsx(
              'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors group',
              active === id ? 'bg-blue-500/15' : 'hover:bg-surface-hover'
            )}
          >
            <Icon
              size={14}
              className={clsx(
                'shrink-0',
                active === id ? 'text-blue-400' : 'text-muted group-hover:text-secondary'
              )}
            />
            <div>
              <div className="text-sm font-medium leading-tight"
                style={{ color: active === id ? '#60a5fa' : 'var(--text-primary)' }}>
                {label}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {active === 'json' && <JsonTool />}
        {active === 'timestamp' && <TimestampTool />}
        {active === 'regex' && <RegexTool />}
        {active === 'base64' && <Base64Tool />}
        {active === 'url' && <UrlTool />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// JSON Formatter
// ─────────────────────────────────────────────────────────────────
function JsonTool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [indent, setIndent] = useState(2)
  const [copied, setCopied] = useState(false)

  const format = () => {
    if (!input.trim()) return
    try {
      const parsed = JSON.parse(input)
      setOutput(JSON.stringify(parsed, null, indent))
      setError('')
    } catch (e) {
      setError(String(e))
      setOutput('')
    }
  }

  const compress = () => {
    if (!input.trim()) return
    try {
      setOutput(JSON.stringify(JSON.parse(input)))
      setError('')
    } catch (e) {
      setError(String(e))
    }
  }

  const copy = async () => {
    await writeText(output || input)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const sortKeys = () => {
    if (!input.trim()) return
    try {
      const sorted = sortObject(JSON.parse(input))
      setOutput(JSON.stringify(sorted, null, indent))
      setError('')
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <ToolLayout title="JSON 格式化" icon={<Code2 size={16} />}>
      <div className="flex gap-2 mb-3 flex-wrap">
        <ToolBtn onClick={format}>格式化</ToolBtn>
        <ToolBtn onClick={compress}>压缩</ToolBtn>
        <ToolBtn onClick={sortKeys}>排序键名</ToolBtn>
        <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          缩进
          <select
            value={indent}
            onChange={(e) => setIndent(Number(e.target.value))}
            className="form-input w-16"
            style={{ padding: '4px 28px 4px 8px' }}
          >
            {[2, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>输入</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 rounded-xl p-3 font-mono text-sm resize-none outline-none min-h-96"
            style={{
              background: 'var(--bg-elevated)',
              border: `1px solid ${error ? 'var(--accent-error)' : 'var(--border-default)'}`,
              color: 'var(--text-primary)',
            }}
            placeholder='{"key": "value"}'
          />
          {error && (
            <p className="text-xs mt-1" style={{ color: 'var(--accent-error)' }}>{error}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>输出</label>
            <button
              onClick={copy}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <textarea
            value={output}
            readOnly
            className="flex-1 rounded-xl p-3 font-mono text-sm resize-none min-h-96"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
            placeholder="格式化结果"
          />
        </div>
      </div>
    </ToolLayout>
  )
}

function sortObject(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObject)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.keys(obj as Record<string, unknown>).sort().map((k) => [
        k, sortObject((obj as Record<string, unknown>)[k])
      ])
    )
  }
  return obj
}

// ─────────────────────────────────────────────────────────────────
// Timestamp Converter
// ─────────────────────────────────────────────────────────────────
function TimestampTool() {
  const [tsInput, setTsInput] = useState('')
  const [dtInput, setDtInput] = useState('')
  const now = Date.now()

  const fromTs = () => {
    const n = Number(tsInput)
    if (isNaN(n)) return null
    const ms = n < 1e12 ? n * 1000 : n
    return new Date(ms)
  }

  const fromDt = () => {
    if (!dtInput) return null
    try { return new Date(dtInput) } catch { return null }
  }

  const setNow = () => setTsInput(String(now))

  const dateFromTs = fromTs()
  const tsFromDt = fromDt()

  const rows = [
    { label: '当前时间戳（ms）', value: String(now) },
    { label: '当前时间戳（s）', value: String(Math.floor(now / 1000)) },
    { label: '当前 ISO 8601', value: new Date(now).toISOString() },
    { label: '当前本地时间', value: new Date(now).toLocaleString() },
  ]

  return (
    <ToolLayout title="时间戳转换" icon={<Clock size={16} />}>
      <div className="grid grid-cols-2 gap-6">
        {/* TS → human */}
        <div className="rounded-xl border p-4 flex flex-col gap-3"
          style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            时间戳 → 可读时间
          </div>
          <div className="flex gap-2">
            <input
              value={tsInput}
              onChange={(e) => setTsInput(e.target.value)}
              placeholder="1700000000000"
              className="form-input flex-1"
            />
            <ToolBtn onClick={setNow}>Now</ToolBtn>
          </div>
          {dateFromTs && !isNaN(dateFromTs.getTime()) && (
            <div className="flex flex-col gap-1.5 text-sm">
              {[
                ['UTC', dateFromTs.toUTCString()],
                ['本地', dateFromTs.toLocaleString()],
                ['ISO', dateFromTs.toISOString()],
                ['时间戳(ms)', String(dateFromTs.getTime())],
                ['时间戳(s)', String(Math.floor(dateFromTs.getTime() / 1000))],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="w-20 shrink-0 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <CopyableValue value={v} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Human → TS */}
        <div className="rounded-xl border p-4 flex flex-col gap-3"
          style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            可读时间 → 时间戳
          </div>
          <input
            value={dtInput}
            onChange={(e) => setDtInput(e.target.value)}
            placeholder="2024-01-01 12:00:00"
            className="form-input"
          />
          {tsFromDt && !isNaN(tsFromDt.getTime()) && (
            <div className="flex flex-col gap-1.5 text-sm">
              {[
                ['时间戳(ms)', String(tsFromDt.getTime())],
                ['时间戳(s)', String(Math.floor(tsFromDt.getTime() / 1000))],
                ['UTC', tsFromDt.toUTCString()],
                ['ISO', tsFromDt.toISOString()],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="w-20 shrink-0 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <CopyableValue value={v} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick reference */}
      <div className="mt-6 rounded-xl border p-4"
        style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
        <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>当前时间快参</div>
        <div className="grid grid-cols-2 gap-2">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex gap-3 items-center">
              <span className="text-xs w-40 shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
              <CopyableValue value={value} />
            </div>
          ))}
        </div>
      </div>
    </ToolLayout>
  )
}

function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => { await writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="flex items-center gap-1.5 text-xs font-mono text-left flex-1 rounded px-2 py-0.5 transition-colors hover:bg-surface-hover"
      style={{ color: 'var(--text-primary)' }}
    >
      <span className="flex-1 truncate">{value}</span>
      {copied ? <Check size={10} className="shrink-0 text-green-400" /> : <Copy size={10} className="shrink-0 opacity-40" />}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Regex Tester
// ─────────────────────────────────────────────────────────────────
function RegexTool() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('')

  const results = (() => {
    if (!pattern || !text) return null
    try {
      const re = new RegExp(pattern, flags)
      const matches: Array<{ match: string; index: number; groups: string[] }> = []
      if (flags.includes('g')) {
        let m: RegExpExecArray | null
        let safety = 0
        while ((m = re.exec(text)) !== null && safety++ < 200) {
          matches.push({ match: m[0], index: m.index, groups: Array.from(m).slice(1) })
          if (!flags.includes('g')) break
        }
      } else {
        const m = re.exec(text)
        if (m) matches.push({ match: m[0], index: m.index, groups: Array.from(m).slice(1) })
      }
      return { matches, error: null }
    } catch (e) {
      return { matches: [], error: String(e) }
    }
  })()

  const highlighted = (() => {
    if (!results || results.error || !pattern) return text
    try {
      return text.replace(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'),
        (m) => `\x01${m}\x02`)
    } catch { return text }
  })()

  return (
    <ToolLayout title="正则测试" icon={<Regex size={16} />}>
      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>正则表达式</label>
          <div className="flex items-center gap-2 rounded-xl border px-3"
            style={{ background: 'var(--bg-elevated)', borderColor: results?.error ? 'var(--accent-error)' : 'var(--border-default)' }}>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="flex-1 py-2 text-sm outline-none bg-transparent font-mono"
              style={{ color: 'var(--text-primary)' }}
              placeholder="pattern"
            />
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <input
              value={flags}
              onChange={(e) => setFlags(e.target.value)}
              className="w-12 py-2 text-sm outline-none bg-transparent font-mono text-center"
              style={{ color: 'var(--accent-primary)' }}
              placeholder="gi"
            />
          </div>
          {results?.error && <p className="text-xs mt-1" style={{ color: 'var(--accent-error)' }}>{results.error}</p>}
        </div>
        {results && !results.error && (
          <div className="flex items-end pb-0.5">
            <span className="text-sm px-3 py-2 rounded-lg"
              style={{ background: 'rgba(47,129,247,0.12)', color: '#58a6ff' }}>
              {results.matches.length} 个匹配
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 mb-4">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>测试文本</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="rounded-xl border p-3 font-mono text-sm resize-none outline-none"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-primary)',
          }}
          placeholder="在此输入要测试的文本..."
        />
      </div>

      {results && !results.error && results.matches.length > 0 && (
        <div>
          <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>
            匹配结果（高亮预览）
          </label>
          <pre
            className="rounded-xl border p-3 text-sm font-mono whitespace-pre-wrap break-all"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            dangerouslySetInnerHTML={{
              __html: highlighted
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\x01/g, '<mark style="background:rgba(227,179,65,0.3);color:#e3b341;border-radius:2px">')
                .replace(/\x02/g, '</mark>')
            }}
          />
          <div className="mt-3 flex flex-col gap-1">
            {results.matches.slice(0, 20).map((m, i) => (
              <div key={i} className="flex items-center gap-3 text-xs font-mono px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--bg-elevated)' }}>
                <span className="w-6 text-right" style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
                <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(227,179,65,0.2)', color: '#e3b341' }}>
                  {m.match || '(empty)'}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>@{m.index}</span>
                {m.groups.length > 0 && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    groups: [{m.groups.map((g) => g ?? 'undefined').join(', ')}]
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolLayout>
  )
}

// ─────────────────────────────────────────────────────────────────
// Base64
// ─────────────────────────────────────────────────────────────────
function Base64Tool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const encode = () => {
    try { setOutput(btoa(unescape(encodeURIComponent(input)))); setError('') }
    catch (e) { setError(String(e)) }
  }
  const decode = () => {
    try { setOutput(decodeURIComponent(escape(atob(input.trim())))); setError('') }
    catch (e) { setError('无效的 Base64 字符串: ' + String(e)) }
  }
  const copy = async () => { await writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <ToolLayout title="Base64 编解码" icon={<Binary size={16} />}>
      <div className="flex gap-2 mb-3">
        <ToolBtn onClick={encode}>编码（→ Base64）</ToolBtn>
        <ToolBtn onClick={decode}>解码（Base64 →）</ToolBtn>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>输入</label>
          <textarea rows={12} value={input} onChange={(e) => setInput(e.target.value)}
            className="rounded-xl border p-3 font-mono text-sm resize-none outline-none"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            placeholder="输入原文或 Base64..." />
          {error && <p className="text-xs" style={{ color: 'var(--accent-error)' }}>{error}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>结果</label>
            <button onClick={copy} className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-muted)' }}>
              {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? '已复制' : '复制'}
            </button>
          </div>
          <textarea rows={12} value={output} readOnly
            className="rounded-xl border p-3 font-mono text-sm resize-none"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
        </div>
      </div>
    </ToolLayout>
  )
}

// ─────────────────────────────────────────────────────────────────
// URL Encode/Decode
// ─────────────────────────────────────────────────────────────────
function UrlTool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const encode = () => {
    try { setOutput(encodeURIComponent(input)); setError('') }
    catch (e) { setError(String(e)) }
  }
  const decode = () => {
    try { setOutput(decodeURIComponent(input)); setError('') }
    catch (e) { setError('无效的 URL 编码: ' + String(e)) }
  }
  const copy = async () => { await writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <ToolLayout title="URL 编解码" icon={<Link2 size={16} />}>
      <div className="flex gap-2 mb-3">
        <ToolBtn onClick={encode}>编码（encodeURIComponent）</ToolBtn>
        <ToolBtn onClick={decode}>解码（decodeURIComponent）</ToolBtn>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>输入</label>
          <textarea rows={12} value={input} onChange={(e) => setInput(e.target.value)}
            className="rounded-xl border p-3 font-mono text-sm resize-none outline-none"
            style={{ background: 'var(--bg-elevated)', borderColor: error ? 'var(--accent-error)' : 'var(--border-default)', color: 'var(--text-primary)' }}
            placeholder="https://example.com/path?key=value" />
          {error && <p className="text-xs" style={{ color: 'var(--accent-error)' }}>{error}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>结果</label>
            <button onClick={copy} className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-muted)' }}>
              {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? '已复制' : '复制'}
            </button>
          </div>
          <textarea rows={12} value={output} readOnly
            className="rounded-xl border p-3 font-mono text-sm resize-none"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
        </div>
      </div>
    </ToolLayout>
  )
}

// ─────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────
function ToolLayout({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}>
          {icon}
        </div>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function ToolBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{ background: '#1e3a5f', color: '#60a5fa', border: '1px solid rgba(47,129,247,0.3)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#1e4a7f' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#1e3a5f' }}
    >
      {children}
    </button>
  )
}
