import { useState } from 'react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import clsx from 'clsx'
import { Copy, Check, ChevronRight, ChevronDown } from 'lucide-react'
import type { LogEntry } from '../../types/log'

interface LogRowProps {
  entry: LogEntry
  index: number
  selected?: boolean
  onClick?: () => void
  zebraStripe?: boolean
}

const LEVEL_STYLES: Record<string, { badge: string; row: string }> = {
  ERROR: {
    badge: 'bg-[#f85149]/15 text-[#f85149] border border-[#f85149]/30',
    row: 'border-l-2 border-l-[#f85149]/60',
  },
  FATAL: {
    badge: 'bg-[#f85149]/25 text-[#f85149] border border-[#f85149]/40',
    row: 'border-l-2 border-l-[#f85149]',
  },
  WARN: {
    badge: 'bg-[#e3b341]/15 text-[#e3b341] border border-[#e3b341]/30',
    row: 'border-l-2 border-l-[#e3b341]/60',
  },
  WARNING: {
    badge: 'bg-[#e3b341]/15 text-[#e3b341] border border-[#e3b341]/30',
    row: 'border-l-2 border-l-[#e3b341]/60',
  },
  INFO: {
    badge: 'bg-[#2f81f7]/10 text-[#58a6ff] border border-[#2f81f7]/25',
    row: '',
  },
  DEBUG: {
    badge: 'bg-[#8b949e]/10 text-[#6e7681] border border-[#8b949e]/20',
    row: '',
  },
  TRACE: {
    badge: 'bg-[#8b949e]/8 text-[#6e7681] border border-[#8b949e]/15',
    row: '',
  },
}

export default function LogRow({ entry, index, selected, onClick, zebraStripe }: LogRowProps) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const level = entry.level?.toUpperCase() ?? ''
  const levelStyle = LEVEL_STYLES[level]
  const isEven = index % 2 === 0

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await writeText(entry.raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(!expanded)
  }

  return (
    <div
      className={clsx(
        'group border-b border-border/40 font-mono text-xs',
        levelStyle?.row,
        selected && 'bg-accent/8',
        zebraStripe && !isEven && !selected && 'bg-surface-hover/30',
      )}
    >
      {/* Main row */}
      <div
        onClick={onClick}
        className={clsx(
          'flex cursor-pointer items-center gap-2 px-2 py-0.5 hover:bg-surface-hover transition-colors',
          selected && 'bg-accent/8 hover:bg-accent/12',
        )}
      >
        {/* Expand toggle */}
        <button
          onClick={toggleExpand}
          className="shrink-0 text-muted hover:text-secondary transition-colors"
        >
          {expanded
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronRight className="h-3 w-3" />}
        </button>

        {/* Line number */}
        <span className="w-10 shrink-0 text-right text-muted select-none">
          {entry.line_number}
        </span>

        {/* Timestamp */}
        <span className="w-20 shrink-0 text-muted">
          {entry.timestamp?.slice(11, 23) ?? ''}
        </span>

        {/* Level badge */}
        <span className="w-16 shrink-0">
          {level ? (
            <span className={clsx(
              'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none',
              levelStyle?.badge ?? 'bg-surface-hover text-secondary border border-border',
            )}>
              {level.slice(0, 5)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>

        {/* Service */}
        {entry.service && (
          <span className="w-20 shrink-0 truncate text-[#8b949e] text-[10px]">
            {entry.service}
          </span>
        )}

        {/* Message */}
        <span className={clsx(
          'min-w-0 flex-1 truncate',
          level === 'ERROR' || level === 'FATAL' ? 'text-[#f85149]/90' :
          level === 'WARN' || level === 'WARNING' ? 'text-[#e3b341]/90' :
          'text-primary',
        )}>
          {entry.message}
        </span>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-muted hover:text-secondary transition-all ml-1"
          title="复制原始日志"
        >
          {copied
            ? <Check className="h-3 w-3 text-success" />
            : <Copy className="h-3 w-3" />}
        </button>
      </div>

      {/* Expanded: raw log */}
      {expanded && (
        <div className="mx-10 mb-1.5 rounded border border-border bg-overlay px-3 py-2">
          <div className="text-[10px] text-muted mb-1">原始日志 Raw</div>
          <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-secondary">
            {entry.raw}
          </pre>
          {entry.timestamp && (
            <div className="mt-1.5 text-[10px] text-muted">
              完整时间戳: <span className="text-secondary">{entry.timestamp}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
