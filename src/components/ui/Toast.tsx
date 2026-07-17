import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  leaving?: boolean
}

let toastId = 0
const listeners = new Set<(t: Toast) => void>()

export function showToast(message: string, type: Toast['type'] = 'info') {
  listeners.forEach((fn) => fn({ id: ++toastId, message, type }))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = (id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300)
  }

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts((prev) => [...prev, t])
      setTimeout(() => dismiss(t.id), 4000)
    }
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'flex items-center gap-2 rounded px-4 py-2 text-sm shadow-lg transition-all duration-300',
            t.leaving ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0',
            t.type === 'success' && 'bg-success/20 text-success border border-success/30',
            t.type === 'error' && 'bg-error/20 text-error border border-error/30',
            t.type === 'info' && 'bg-overlay text-primary border border-border',
          )}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-50 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
