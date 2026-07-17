import clsx from 'clsx'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className, type, ...props }: InputProps) {
  const [showPw, setShowPw] = useState(false)
  const isPassword = type === 'password'

  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-xs text-secondary">{label}</span>}
      <div className="relative">
        <input
          type={isPassword ? (showPw ? 'text' : 'password') : type}
          className={clsx(
            'w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-primary outline-none focus:border-accent',
            isPassword && 'pr-9',
            className,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
            tabIndex={-1}
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </label>
  )
}
