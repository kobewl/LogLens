import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  BotMessageSquare,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Database,
  Download,
  FileJson,
  Info,
  Loader2,
  Monitor,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
  XCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { showToast, ToastContainer } from '../components/ui/Toast'
import { useTheme } from '../App'
import type { AppConfig, AiProviderInfo, CloudProviderInfo, AiConfig, CloudCredentials } from '../types/log'

type SettingsTab = 'general' | 'ai' | 'cloud' | 'appearance' | 'about'

const NAV_ITEMS: Array<{
  id: SettingsTab
  label: string
  icon: React.ComponentType<{ size: number; className?: string }>
  desc: string
}> = [
  { id: 'general',    label: '通用',     icon: SettingsIcon,    desc: '应用行为偏好' },
  { id: 'ai',         label: 'AI 配置',  icon: BotMessageSquare, desc: 'API Key、模型' },
  { id: 'cloud',      label: '云日志',   icon: Cloud,           desc: '阿里、腾讯、华为' },
  { id: 'appearance', label: '外观',     icon: Palette,         desc: '主题、字号' },
  { id: 'about',      label: '关于',     icon: Info,            desc: '版本信息' },
]

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>('ai')

  return (
    <div
      className="h-full flex overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      <ToastContainer />

      {/* ── Left sidebar ─────────────────────────────────── */}
      <div
        className="w-52 shrink-0 flex flex-col border-r py-4 px-3 gap-0.5"
        style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 mb-3"
        >
          <SettingsIcon size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            设置
          </span>
        </div>

        {NAV_ITEMS.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-all duration-200 group',
              tab === id ? 'bg-blue-500/15' : 'hover:bg-surface-hover'
            )}
          >
            <Icon
              size={15}
              className={clsx(
                'shrink-0 transition-colors duration-200',
                tab === id ? 'text-blue-400' : 'text-muted group-hover:text-secondary'
              )}
            />
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-medium leading-tight"
                style={{ color: tab === id ? '#60a5fa' : 'var(--text-primary)' }}
              >
                {label}
              </div>
              <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                {desc}
              </div>
            </div>
            {tab === id && (
              <ChevronRight size={12} className="shrink-0 text-blue-400" />
            )}
          </button>
        ))}
      </div>

      {/* ── Right content ──────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {tab === 'general' && <GeneralTab />}
        {tab === 'ai' && <AiTab />}
        {tab === 'cloud' && <CloudTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// General Tab
// ─────────────────────────────────────────────────────────
function GeneralTab() {
  return (
    <TabLayout title="通用设置" icon={<SettingsIcon size={18} />}>
      <SettingGroup title="日志分析">
        <SettingRow label="默认结果数量" hint="每次搜索返回的最大条数">
          <select className="form-input w-40">
            <option>100</option>
            <option>200</option>
            <option>500</option>
            <option>1000</option>
          </select>
        </SettingRow>
        <SettingRow label="自动解析日志格式" hint="载入文件时自动识别 JSON/文本格式">
          <Toggle defaultChecked />
        </SettingRow>
        <SettingRow label="高亮关键词" hint="搜索结果中高亮匹配词">
          <Toggle defaultChecked />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="云日志查询">
        <SettingRow label="默认查询条数" hint="云日志默认返回条数">
          <select className="form-input w-40">
            <option>50</option>
            <option>100</option>
            <option>200</option>
          </select>
        </SettingRow>
        <SettingRow label="默认时间范围" hint="云查询默认时间窗口">
          <select className="form-input w-40">
            <option>最近 1 小时</option>
            <option>最近 3 小时</option>
            <option>最近 24 小时</option>
          </select>
        </SettingRow>
      </SettingGroup>

      <InfoBox>
        通用设置会在下次启动时生效，当前会话的配置保持不变。
      </InfoBox>
    </TabLayout>
  )
}

// ─────────────────────────────────────────────────────────
// AI Tab
// ─────────────────────────────────────────────────────────
function AiTab() {
  const [aiTab, setAiTab] = useState('deepseek')
  const [aiProviders, setAiProviders] = useState<AiProviderInfo[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [aiForm, setAiForm] = useState({ api_key: '', base_url: '', model: '' })
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    Promise.all([
      invoke<AiProviderInfo[]>('get_ai_providers'),
      invoke<AppConfig>('get_config'),
    ]).then(([ai, cfg]) => {
      setAiProviders(ai)
      setConfig(cfg)
      const provider = ai.find((p) => p.id === 'deepseek') ?? ai[0]
      setAiForm({
        api_key: '',
        base_url: cfg.ai.base_url || provider?.baseUrl || '',
        model: cfg.ai.model || provider?.defaultModel || '',
      })
    })
  }, [])

  const currentAiProvider = aiProviders.find((p) => p.id === aiTab)

  const buildAiConfig = (): AiConfig => ({
    provider: aiTab as AiConfig['provider'],
    api_key: aiForm.api_key,
    base_url: aiForm.base_url || currentAiProvider?.baseUrl || '',
    model: aiForm.model || currentAiProvider?.defaultModel || '',
  })

  const testAi = async () => {
    setAiTesting(true)
    setAiTestResult(null)
    try {
      await invoke<string>('test_ai_connection', { config: buildAiConfig() })
      setAiTestResult('success')
      showToast('AI 连接成功', 'success')
    } catch (e) {
      setAiTestResult('error')
      showToast(String(e), 'error')
    } finally {
      setAiTesting(false)
    }
  }

  const saveAi = async () => {
    if (!config) return
    await invoke('save_app_config', { config: { ...config, ai: buildAiConfig() } })
    showToast('AI 配置已保存', 'success')
  }

  return (
    <TabLayout title="AI 服务配置" icon={<BotMessageSquare size={18} />}
      subtitle="配置 AI 提供商，用于日志异常分析、摘要生成和自然语言查询">
      {/* Provider selector */}
      <div className="flex gap-2 flex-wrap mb-4">
        {aiProviders.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setAiTab(p.id)
              setAiForm({ api_key: '', base_url: p.baseUrl, model: p.defaultModel })
              setAiTestResult(null)
            }}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border hover:opacity-80 active:scale-95',
              aiTab === p.id
                ? 'border-blue-500 bg-blue-500/15 text-blue-400'
                : 'border-transparent hover:border-border'
            )}
            style={aiTab !== p.id ? {
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border-default)',
            } : {}}
          >
            {p.name}
          </button>
        ))}
      </div>

      <SettingGroup title={`${currentAiProvider?.name ?? 'AI'} 配置`}>
        <SettingRow label="API Key" required hint="密钥不会上传，仅本地加密存储">
          <input
            type="password"
            value={aiForm.api_key}
            onChange={(e) => setAiForm({ ...aiForm, api_key: e.target.value })}
            placeholder="sk-..."
            className="form-input"
          />
        </SettingRow>

        <SettingRow label="Base URL" hint="留空使用默认端点">
          <input
            value={aiForm.base_url}
            onChange={(e) => setAiForm({ ...aiForm, base_url: e.target.value })}
            className="form-input"
          />
        </SettingRow>

        <SettingRow label="模型">
          <select
            value={aiForm.model}
            onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
            className="form-input"
          >
            {(currentAiProvider?.models ?? []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </SettingRow>
      </SettingGroup>

      <div className="flex items-center gap-3">
        <button
          onClick={testAi}
          disabled={aiTesting}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm border transition-all duration-200 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            borderColor: 'var(--border-default)',
          }}
        >
          {aiTesting && <Loader2 size={14} className="animate-spin" />}
          测试连接
        </button>
        <button
          onClick={saveAi}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: '#2563eb' }}
        >
          保存配置
        </button>
        {aiTestResult === 'success' && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--accent-success)' }}>
            <CheckCircle2 size={14} /> 连接成功
          </span>
        )}
        {aiTestResult === 'error' && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--accent-error)' }}>
            <XCircle size={14} /> 连接失败
          </span>
        )}
      </div>

      <InfoBox>
        AI 功能仅在工作区「本地文件」模式下可用。API Key 仅存储于本地配置文件，不会上传到任何服务器。
      </InfoBox>
    </TabLayout>
  )
}

// ─────────────────────────────────────────────────────────
// Cloud Tab
// ─────────────────────────────────────────────────────────
const CLOUD_HINTS: Record<string, { regionPlaceholder: string; regionHint: string; extra?: string }> = {
  aliyun:  { regionPlaceholder: 'cn-hangzhou', regionHint: '如 cn-hangzhou、cn-beijing' },
  tencent: { regionPlaceholder: 'ap-guangzhou', regionHint: '如 ap-guangzhou、ap-shanghai' },
  huawei:  {
    regionPlaceholder: 'cn-east-3',
    regionHint: '如 cn-east-3、cn-north-4',
    extra: '华为云 Project ID：控制台 → 我的凭证 → API凭证 → 项目列表，留空则自动发现',
  },
}

function CloudTab() {
  const [cloudTab, setCloudTab] = useState('aliyun')
  const [cloudProviders, setCloudProviders] = useState<CloudProviderInfo[]>([])
  const [cloudForm, setCloudForm] = useState({
    access_key_id: '', access_key_secret: '', region: '', project_id: '',
  })
  const [cloudTesting, setCloudTesting] = useState(false)

  useEffect(() => {
    invoke<CloudProviderInfo[]>('get_cloud_providers').then(setCloudProviders)
  }, [])

  const testCloud = async () => {
    setCloudTesting(true)
    try {
      const result = await invoke<{ success: boolean; message: string }>('test_cloud_connection', {
        creds: {
          provider: cloudTab,
          access_key_id: cloudForm.access_key_id,
          access_key_secret: cloudForm.access_key_secret,
          region: cloudForm.region,
          project_id: cloudForm.project_id,
        } as CloudCredentials,
      })
      showToast(result.message, result.success ? 'success' : 'error')
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setCloudTesting(false)
    }
  }

  const saveCloud = async () => {
    await invoke('save_cloud_credentials', {
      creds: {
        provider: cloudTab,
        access_key_id: cloudForm.access_key_id,
        access_key_secret: cloudForm.access_key_secret,
        region: cloudForm.region,
        project_id: cloudForm.project_id,
      } as CloudCredentials,
    })
    showToast('云日志凭据已保存', 'success')
  }

  const hint = CLOUD_HINTS[cloudTab] ?? CLOUD_HINTS['aliyun']

  return (
    <TabLayout title="云日志凭据" icon={<Cloud size={18} />}
      subtitle="保存 AccessKey，用于快速测试连接。实际查询请在工作区导入 config.json">

      {/* Provider selector */}
      <div className="flex gap-2 flex-wrap mb-4">
        {cloudProviders.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setCloudTab(p.id)
              setCloudForm({ access_key_id: '', access_key_secret: '', region: '', project_id: '' })
            }}
            className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border hover:opacity-80 active:scale-95')}
            style={cloudTab === p.id ? {
              borderColor: '#3b82f6',
              background: 'rgba(59,130,246,0.12)',
              color: '#60a5fa',
            } : {
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border-default)',
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <SettingGroup title="访问凭据">
        <SettingRow label="AccessKey ID" required>
          <input
            value={cloudForm.access_key_id}
            onChange={(e) => setCloudForm({ ...cloudForm, access_key_id: e.target.value })}
            placeholder="LTAI..."
            className="form-input"
          />
        </SettingRow>
        <SettingRow label="AccessKey Secret" required>
          <input
            type="password"
            value={cloudForm.access_key_secret}
            onChange={(e) => setCloudForm({ ...cloudForm, access_key_secret: e.target.value })}
            placeholder="••••••"
            className="form-input"
          />
        </SettingRow>
        <SettingRow label="地域 Region" hint={hint.regionHint}>
          <input
            value={cloudForm.region}
            onChange={(e) => setCloudForm({ ...cloudForm, region: e.target.value })}
            placeholder={hint.regionPlaceholder}
            className="form-input"
          />
        </SettingRow>
        {cloudTab === 'huawei' && (
          <SettingRow label="Project ID" hint="留空自动发现">
            <input
              value={cloudForm.project_id}
              onChange={(e) => setCloudForm({ ...cloudForm, project_id: e.target.value })}
              placeholder="（留空则根据 Region 自动发现）"
              className="form-input"
            />
          </SettingRow>
        )}
      </SettingGroup>

      {hint.extra && (
        <InfoBox icon={<Info size={13} />}>{hint.extra}</InfoBox>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={testCloud}
          disabled={cloudTesting}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm border transition-all duration-200 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            borderColor: 'var(--border-default)',
          }}
        >
          {cloudTesting && <Loader2 size={14} className="animate-spin" />}
          测试连接
        </button>
        <button
          onClick={saveCloud}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: '#2563eb' }}
        >
          保存凭据
        </button>
      </div>

      {/* Config.json 格式说明 */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <FileJson size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            config.json 格式（工作区批量导入）
          </span>
        </div>
        <pre
          className="rounded-xl p-4 text-xs font-mono leading-relaxed overflow-x-auto"
          style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}
        >{`{
  "projects": [{
    "name": "my-app",
    "provider": "aliyun",
    "credentials": {
      "ak": "AK...",
      "sk": "SK...",
      "endpoint": "cn-hangzhou.log.aliyuncs.com",
      "project": "my-sls-project"
    },
    "aliases": [{
      "alias": "app-log",
      "logstore": "app-access-log"
    }]
  }]
}`}</pre>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
          快速使用步骤
        </div>
        {['准备好包含 ak/sk/endpoint 的 config.json', '进入「工作区」→ 切换到「云日志查询」', '点击「导入配置」选择文件', '从左侧项目列表选择，配置时间范围后查询'].map((s, i) => (
          <div key={i} className="flex items-start gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(37,99,235,0.15)', color: '#60a5fa' }}
            >
              {i + 1}
            </span>
            {s}
          </div>
        ))}
      </div>
    </TabLayout>
  )
}

// ─────────────────────────────────────────────────────────
// Appearance Tab
// ─────────────────────────────────────────────────────────
function AppearanceTab() {
  const { theme, toggle, fontSize, setFontSize } = useTheme()

  return (
    <TabLayout title="外观" icon={<Palette size={18} />}
      subtitle="个性化界面主题和显示偏好">
      <SettingGroup title="主题">
        <SettingRow label="颜色主题" hint="支持暗色和亮色两种主题">
          <div className="flex gap-2">
            <ThemeCard id="dark" current={theme} label="暗色" onSelect={toggle} />
            <ThemeCard id="light" current={theme} label="亮色" onSelect={toggle} />
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="字体">
        <SettingRow label="界面字体大小" hint={`当前: ${fontSize}px`}>
          <div className="flex items-center gap-3 w-56">
            <input
              type="range"
              min={11}
              max={18}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <div className="flex gap-1">
              {[12, 13, 14, 15, 16].map((s) => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className="px-2 py-0.5 rounded text-xs transition-all duration-200 hover:opacity-80 active:scale-95"
                  style={{
                    background: fontSize === s ? 'rgba(37,99,235,0.2)' : 'var(--bg-overlay)',
                    color: fontSize === s ? '#60a5fa' : 'var(--text-muted)',
                    border: `1px solid ${fontSize === s ? 'rgba(37,99,235,0.4)' : 'var(--border-default)'}`,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="日志显示">
        <SettingRow label="日志级别颜色" hint="不同级别使用不同颜色高亮">
          <Toggle defaultChecked />
        </SettingRow>
        <SettingRow label="时间戳显示" hint="在日志行前显示时间戳">
          <Toggle defaultChecked />
        </SettingRow>
        <SettingRow label="斑马纹" hint="奇偶行交替背景色">
          <Toggle />
        </SettingRow>
      </SettingGroup>

      {/* Level color preview */}
      <SettingGroup title="级别颜色预览">
        <div className="flex flex-wrap gap-2 p-4">
          {[
            { level: 'ERROR', bg: 'rgba(248,81,73,0.15)', text: '#f85149', border: 'rgba(248,81,73,0.3)' },
            { level: 'WARN',  bg: 'rgba(210,153,34,0.15)', text: '#d2991f', border: 'rgba(210,153,34,0.3)' },
            { level: 'INFO',  bg: 'rgba(47,129,247,0.15)', text: '#58a6ff', border: 'rgba(47,129,247,0.3)' },
            { level: 'DEBUG', bg: 'rgba(56,189,248,0.15)', text: '#7dd3fc', border: 'rgba(56,189,248,0.3)' },
            { level: 'TRACE', bg: 'rgba(148,163,184,0.12)', text: '#94a3b8', border: 'rgba(148,163,184,0.3)' },
          ].map(({ level, bg, text, border }) => (
            <span
              key={level}
              className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold border"
              style={{ background: bg, color: text, borderColor: border }}
            >
              {level}
            </span>
          ))}
        </div>
      </SettingGroup>
    </TabLayout>
  )
}

function ThemeCard({
  id, current, label, onSelect,
}: {
  id: string; current: string; label: string; onSelect: () => void
}) {
  const isActive = id === current
  return (
    <button
      onClick={() => { if (!isActive) onSelect() }}
      className={clsx(
        'flex flex-col items-center gap-2 rounded-xl p-3 border transition-all w-24',
        isActive ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-border/80'
      )}
      style={!isActive ? { borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' } : {}}
    >
      <div
        className="w-16 h-10 rounded-lg flex items-center justify-center"
        style={{
          background: id === 'dark' ? '#0d1117' : '#ffffff',
          border: `1px solid ${id === 'dark' ? '#30363d' : '#d0d7de'}`,
        }}
      >
        <div className="flex flex-col gap-0.5 w-10">
          <div className="h-1.5 rounded-full" style={{ background: id === 'dark' ? '#58a6ff' : '#0969da', width: '60%' }} />
          <div className="h-1 rounded-full" style={{ background: id === 'dark' ? '#30363d' : '#d0d7de' }} />
          <div className="h-1 rounded-full" style={{ background: id === 'dark' ? '#30363d' : '#d0d7de', width: '80%' }} />
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color: isActive ? '#60a5fa' : 'var(--text-secondary)' }}>
        {label}
      </span>
      {isActive && (
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────
// About Tab
// ─────────────────────────────────────────────────────────
function AboutTab() {
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'uptodate' | 'error'>('idle')
  const [latestVersion, setLatestVersion] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const currentVersion = '0.1.0'

  const checkUpdate = async () => {
    setUpdateState('checking')
    try {
      const res = await fetch('https://api.github.com/repos/kobewl/LogLens/releases/latest')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const tag = (data.tag_name || '').replace(/^v/, '')
      const htmlUrl = data.html_url || 'https://github.com/kobewl/LogLens/releases'

      if (tag && tag !== currentVersion) {
        setLatestVersion(tag)
        setDownloadUrl(htmlUrl)
        setUpdateState('available')
      } else {
        setUpdateState('uptodate')
      }
    } catch (e) {
      console.error('检查更新失败:', e)
      setUpdateState('error')
    }
  }

  return (
    <TabLayout title="关于 LogLens" icon={<Info size={18} />}>
      <div className="flex items-center gap-5 mb-6">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl shrink-0"
          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' }}
        >
          <Database size={28} className="text-white" />
        </div>
        <div>
          <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>LogLens</div>
          <div className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>版本 {currentVersion}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Tauri 2 · React 19 · Rust
          </div>
        </div>
      </div>

      <SettingGroup title="功能特性">
        {[
          { icon: <Monitor size={14} />, title: '本地日志分析', desc: '支持 JSON、格式化文本等多种日志格式，全文检索' },
          { icon: <Cloud size={14} />, title: '云日志查询', desc: '一键连接阿里云 SLS、腾讯云 CLS、华为云 LTS' },
          { icon: <BotMessageSquare size={14} />, title: 'AI 辅助分析', desc: '接入 DeepSeek、OpenAI 等，自然语言查询日志' },
          { icon: <SettingsIcon size={14} />, title: 'MCP 服务器', desc: '将 LogLens 作为 MCP 工具供 AI 客户端直接调用' },
        ].map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-3 py-3"
            style={{ borderBottom: i < 3 ? `1px solid var(--border-default)` : undefined }}
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5"
              style={{ background: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}
            >
              {item.icon}
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.title}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </SettingGroup>

      {/* ── 检查更新 ── */}
      <SettingGroup title="版本更新">
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {updateState === 'checking' && '正在检查更新…'}
              {updateState === 'uptodate' && '✅ 已是最新版本'}
              {updateState === 'available' && `🆕 发现新版本 v${latestVersion}`}
              {updateState === 'error' && '检查失败，请稍后重试'}
              {(updateState === 'idle') && '检查是否有新版本可用'}
            </div>
            {updateState === 'available' && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 mt-1 hover:underline"
                style={{ color: '#60a5fa' }}
              >
                <Download size={12} /> 前往下载
              </a>
            )}
          </div>
          <button
            onClick={checkUpdate}
            disabled={updateState === 'checking'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:scale-100"
            style={{
              background: 'var(--surface-hover)',
              color: 'var(--text-secondary)',
              opacity: updateState === 'checking' ? 0.5 : 1,
            }}
          >
            {updateState === 'checking' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            检查更新
          </button>
        </div>
      </SettingGroup>

      <div className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
        Built with ❤️ · MIT License
      </div>
    </TabLayout>
  )
}

// ─────────────────────────────────────────────────────────
// Shared Layout Components
// ─────────────────────────────────────────────────────────
function TabLayout({
  title, subtitle, icon, children,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-1">
        {icon && (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
            style={{ background: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}
          >
            {icon}
          </div>
        )}
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
      </div>
      {subtitle && (
        <p className="text-sm mb-6 ml-11" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
      )}
      {!subtitle && <div className="mb-6" />}
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  )
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'var(--text-muted)' }}>
        {title}
      </div>
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          borderColor: 'var(--border-default)',
          background: 'var(--bg-elevated)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {children}
      </div>
    </div>
  )
}

function SettingRow({
  label, hint, required, children,
}: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3"
      style={{ borderBottom: '1px solid var(--border-default)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
          {required && <span className="text-xs" style={{ color: 'var(--accent-error)' }}>*</span>}
        </div>
        {hint && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{hint}</div>
        )}
      </div>
      <div className="shrink-0 w-56">{children}</div>
    </div>
  )
}

function InfoBox({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
      style={{
        background: 'rgba(37,99,235,0.08)',
        border: '1px solid rgba(37,99,235,0.2)',
        color: 'var(--text-secondary)',
      }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: '#60a5fa' }}>
        {icon ?? <Info size={14} />}
      </span>
      {children}
    </div>
  )
}

function Toggle({ defaultChecked = false }: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked)
  return (
    <button
      onClick={() => setOn(!on)}
      className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200"
      style={{ background: on ? '#2563eb' : 'var(--bg-overlay)' }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: on ? 'translateX(16px)' : 'translateX(2px)' }}
      />
    </button>
  )
}
