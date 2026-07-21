import { Routes, Route } from 'react-router-dom'
import { createContext, useContext, useEffect, useState } from 'react'
import MainLayout from './components/layout/MainLayout'
import Welcome from './pages/Welcome'
import Workspace from './pages/Workspace'
import Settings from './pages/Settings'
import McpPage from './pages/McpPage'
import ToolsPage from './pages/ToolsPage'
import { UpdateProvider } from './contexts/UpdateContext'
import UpdateNotificationModal from './components/modals/UpdateNotificationModal'

// ─── Theme Context ─────────────────────────────────────────────────────────────
type Theme = 'dark' | 'light'

interface ThemeCtx {
  theme: Theme
  toggle: () => void
  fontSize: number
  setFontSize: (n: number) => void
}

export const ThemeContext = createContext<ThemeCtx>({
  theme: 'dark',
  toggle: () => {},
  fontSize: 14,
  setFontSize: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('loglens-theme') as Theme) ?? 'dark'
  })
  const [fontSize, setFontSizeState] = useState<number>(() => {
    return Number(localStorage.getItem('loglens-font-size') ?? '14')
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('loglens-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-size', `${fontSize}px`)
    localStorage.setItem('loglens-font-size', String(fontSize))
  }, [fontSize])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  const setFontSize = (n: number) => setFontSizeState(Math.max(11, Math.min(18, n)))

  return (
    <ThemeContext.Provider value={{ theme, toggle, fontSize, setFontSize }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <UpdateProvider>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Welcome />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/mcp" element={<McpPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
        <UpdateNotificationModal />
      </UpdateProvider>
    </ThemeProvider>
  )
}
