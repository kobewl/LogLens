import { useState, useRef, useEffect } from 'react'
import { Sparkles, FileText, AlertTriangle, Send, Trash2, User, Bot } from 'lucide-react'
import { showToast } from '../ui/Toast'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  type?: 'analyze' | 'summarize' | 'query' | 'chat'
}

interface AiChatPanelProps {
  filePath: string | null
  onAnalyze: () => Promise<string>
  onSummarize: () => Promise<string>
  onNaturalQuery: (query: string) => Promise<string>
  onApplyQuery?: (query: string) => void
}

export default function AiChatPanel({
  filePath,
  onAnalyze,
  onSummarize,
  onNaturalQuery,
  onApplyQuery,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const addMessage = (role: Message['role'], content: string, type?: Message['type']) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role, content, timestamp: new Date(), type },
    ])
  }

  const runAction = async (
    userLabel: string,
    fn: () => Promise<string>,
    type: Message['type'],
  ) => {
    if (!filePath) {
      showToast('请先打开日志文件', 'error')
      return
    }
    addMessage('user', userLabel, type)
    setLoading(true)
    try {
      const result = await fn()
      addMessage('assistant', result, type)
    } catch (e) {
      addMessage('assistant', `❌ 出错: ${String(e)}`, type)
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    if (!filePath) {
      showToast('请先打开日志文件', 'error')
      return
    }

    addMessage('user', text)
    setLoading(true)
    try {
      const q = await onNaturalQuery(text)
      const reply = q.trim()
      addMessage('assistant', `已生成查询语句:\n\`\`\`\n${reply}\n\`\`\``, 'query')
      onApplyQuery?.(reply)
    } catch (e) {
      addMessage('assistant', `❌ 出错: ${String(e)}`)
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col bg-elevated">
      {/* Header */}
      <div className="border-b border-border px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-primary">AI 分析</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            title="清空对话"
            className="flex items-center gap-1 text-[10px] text-muted hover:text-error transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            清空
          </button>
        )}
      </div>

      {/* Quick action buttons */}
      <div className="flex gap-1.5 px-3 py-2 border-b border-border">
        <ActionBtn
          icon={<AlertTriangle className="h-3 w-3" />}
          label="异常分析"
          disabled={loading || !filePath}
          onClick={() => runAction('分析日志异常', onAnalyze, 'analyze')}
          color="text-warn"
        />
        <ActionBtn
          icon={<FileText className="h-3 w-3" />}
          label="日志摘要"
          disabled={loading || !filePath}
          onClick={() => runAction('生成日志摘要', onSummarize, 'summarize')}
          color="text-accent"
        />
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-auto px-3 py-2 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <Sparkles className="h-8 w-8 text-muted opacity-30" />
            <p className="text-xs text-muted">点击上方按钮，或输入自然语言查询</p>
            <p className="text-[10px] text-muted">例：找出最近一小时的超时错误</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onApplyQuery={
                msg.type === 'query' && msg.role === 'assistant'
                  ? () => {
                      // Extract query from code block
                      const m = msg.content.match(/```\n([\s\S]+?)\n```/)
                      if (m) onApplyQuery?.(m[1].trim())
                    }
                  : undefined
              }
            />
          ))
        )}
        {loading && (
          <div className="flex items-center gap-2 text-muted">
            <Bot className="h-4 w-4 shrink-0 text-accent" />
            <div className="flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border p-3">
        <div className="text-[10px] text-muted mb-1.5">自然语言查询（Enter 发送，Shift+Enter 换行）</div>
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="找出所有 payment 超时错误…"
            rows={2}
            disabled={loading || !filePath}
            className="flex-1 resize-none rounded-md border border-border bg-input px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-accent disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || !filePath}
            className="self-end flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white hover:bg-accent/80 disabled:opacity-40 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        {!filePath && (
          <p className="mt-1 text-[10px] text-muted">⬅ 请先在工作区打开日志文件</p>
        )}
      </div>
    </div>
  )
}

function ActionBtn({
  icon, label, disabled, onClick, color,
}: {
  icon: React.ReactNode
  label: string
  disabled: boolean
  onClick: () => void
  color: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium transition-colors ${color}
        hover:bg-surface-hover disabled:opacity-40`}
    >
      {icon}
      {label}
    </button>
  )
}

function MessageBubble({
  message,
  onApplyQuery,
}: {
  message: Message
  onApplyQuery?: () => void
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full mt-0.5 ${
        isUser ? 'bg-accent/20 text-accent' : 'bg-surface-hover text-secondary'
      }`}>
        {isUser
          ? <User className="h-3 w-3" />
          : <Bot className="h-3 w-3" />}
      </div>

      {/* Bubble */}
      <div className={`flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed max-w-full ${
          isUser
            ? 'bg-accent/15 text-primary'
            : 'bg-surface-hover text-primary border border-border'
        }`}>
          <MessageContent content={message.content} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted">
            {message.timestamp.toLocaleTimeString()}
          </span>
          {onApplyQuery && (
            <button
              onClick={onApplyQuery}
              className="text-[10px] text-accent hover:underline"
            >
              应用查询 →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Render message content with basic markdown-ish support */
function MessageContent({ content }: { content: string }) {
  // Split by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const code = part.slice(3, -3).replace(/^\n/, '').replace(/\n$/, '')
          return (
            <pre key={i} className="mt-1 rounded bg-overlay px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap overflow-auto">
              {code}
            </pre>
          )
        }
        return (
          <span key={i} className="whitespace-pre-wrap">{part}</span>
        )
      })}
    </>
  )
}
