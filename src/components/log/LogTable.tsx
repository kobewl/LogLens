import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { FileSearch } from 'lucide-react'
import type { LogEntry } from '../../types/log'
import LogRow from './LogRow'

interface LogTableProps {
  entries: LogEntry[]
  selectedLine?: number
  onSelectLine?: (line: number) => void
}

export default function LogTable({ entries, selectedLine, onSelectLine }: LogTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 20,
  })

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
        <FileSearch className="h-10 w-10 opacity-30" />
        <p className="text-sm">暂无匹配日志</p>
        <p className="text-xs">请打开文件后搜索，或检查搜索条件是否正确</p>
      </div>
    )
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto font-mono text-xs">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const entry = entries[item.index]
          return (
            <div
              key={item.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${item.size}px`,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <LogRow
                entry={entry}
                selected={selectedLine === entry.line_number}
                onClick={() => onSelectLine?.(entry.line_number)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
