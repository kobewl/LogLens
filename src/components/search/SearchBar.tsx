import { Search, Sparkles, Loader2 } from 'lucide-react'

interface SearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  onSearch: () => void
  onAiQuery?: () => void
  loading?: boolean
}

export default function SearchBar({ query, onQueryChange, onSearch, onAiQuery, loading }: SearchBarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-elevated px-4 py-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder='搜索日志… 例: level=ERROR AND service=payment timeout'
          className="w-full rounded-md border border-border bg-input pl-9 pr-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent transition-colors"
        />
      </div>

      <button
        onClick={onSearch}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Search className="h-3.5 w-3.5" />}
        搜索
      </button>

      {onAiQuery && (
        <button
          onClick={onAiQuery}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-secondary hover:bg-surface-hover hover:text-primary disabled:opacity-50 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          AI
        </button>
      )}
    </div>
  )
}
