import { NavLink, Outlet } from 'react-router-dom'
import { Cpu, FileSearch, LayoutDashboard, LogIn, Moon, Settings, Sun, Wrench } from 'lucide-react'
import clsx from 'clsx'
import { useTheme } from '../../App'

export default function MainLayout() {
  const { theme, toggle } = useTheme()
  return (
    <div className="flex h-full flex-col">
      <header
        className="flex h-14 shrink-0 items-center gap-3 px-5 border-b"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 select-none mr-1">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' }}
          >
            <LogIn className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span
            className="font-bold text-base tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            LogLens
          </span>
        </div>

        <div className="h-5 w-px" style={{ background: 'var(--border-default)' }} />

        <nav className="flex items-center gap-1">
          <NavItem to="/" icon={<LayoutDashboard className="h-4 w-4" />} label="首页" color="slate" />
          <NavItem to="/workspace" icon={<FileSearch className="h-4 w-4" />} label="工作区" color="blue" />
          <NavItem to="/tools" icon={<Wrench className="h-4 w-4" />} label="工具箱" color="green" />
          <NavItem to="/mcp" icon={<Cpu className="h-4 w-4" />} label="MCP" color="violet" />
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="设置" color="slate" />
        </nav>

        <div className="flex-1" />

        <div
          className="hidden sm:flex items-center gap-1.5 text-xs rounded-full px-3 py-1"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-overlay)' }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: 'var(--accent-success)' }}
          />
          <span>SLS · CLS · LTS</span>
        </div>

        <div className="h-4 w-px" style={{ background: 'var(--border-default)' }} />

        <button
          onClick={toggle}
          title={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
          className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-hover)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

const COLOR_MAP: Record<string, { active: string; activeBg: string }> = {
  blue: { active: '#3b82f6', activeBg: 'rgba(59,130,246,0.12)' },
  violet: { active: '#8b5cf6', activeBg: 'rgba(139,92,246,0.12)' },
  slate: { active: 'var(--text-primary)', activeBg: 'var(--surface-hover)' },
  green: { active: '#22c55e', activeBg: 'rgba(34,197,94,0.12)' },
}

function NavItem({
  to,
  icon,
  label,
  color = 'blue',
}: {
  to: string
  icon: React.ReactNode
  label: string
  color?: string
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.blue
  return (
    <NavLink
      to={to}
      end={to === '/'}
      style={({ isActive }) =>
        isActive
          ? { color: c.active, background: c.activeBg }
          : { color: 'var(--text-secondary)' }
      }
      className={clsx(
        'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-primary',
      )}
      onMouseEnter={(e) => {
        if (!e.currentTarget.classList.contains('active')) {
          e.currentTarget.style.background = 'var(--surface-hover)'
        }
      }}
      onMouseLeave={(e) => {
        if (!e.currentTarget.getAttribute('aria-current')) {
          e.currentTarget.style.background = ''
        }
      }}
    >
      {icon}
      {label}
    </NavLink>
  )
}
