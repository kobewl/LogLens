# 设置页面优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化LogLens设置页面的UI/UX，参考macOS系统设置风格

**Architecture:** 渐进式优化，在现有代码基础上修复bug、优化样式、改进交互，不改变整体代码结构

**Tech Stack:** React 19 + TypeScript + Tailwind CSS 4 + lucide-react

---

## 文件结构映射

### 将修改的文件
1. `src/index.css` - 全局样式，修复下拉选择器问题，添加新的CSS变量
2. `src/pages/Settings.tsx` - 设置页面组件，优化视觉样式和交互

### 测试文件
1. 无需创建新的测试文件，因为这是UI优化，主要通过视觉验证

## 任务分解

### Task 1: 修复下拉选择器显示问题

**Files:**
- Modify: `src/index.css:88-99`

- [ ] **Step 1: 检查当前下拉选择器样式**

读取`src/index.css`文件，查看第88-99行的select样式：
```css
/* Select arrow — dark */
select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 28px !important;
  appearance: none;
  -webkit-appearance: none;
}
[data-theme="light"] select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23656d76' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
}
```

- [ ] **Step 2: 修复下拉选择器样式**

修改`src/index.css`文件，确保下拉选择器正确显示：

```css
/* Select arrow — dark */
select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 28px !important;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

/* Select arrow — light */
[data-theme="light"] select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23656d76' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
}

/* 确保下拉选择器在所有浏览器中正常显示 */
select:focus {
  border-color: var(--accent-primary);
  outline: none;
}
```

- [ ] **Step 3: 测试下拉选择器**

运行开发服务器，检查所有下拉选择器是否正常显示：
```bash
pnpm tauri dev
```

验证：
1. 通用设置页面的"默认结果数量"下拉框
2. 通用设置页面的"默认查询条数"下拉框
3. 通用设置页面的"默认时间范围"下拉框
4. AI配置页面的"模型"下拉框

- [ ] **Step 4: 提交更改**

```bash
git add src/index.css
git commit -m "fix: 修复下拉选择器显示问题"
```

### Task 2: 优化颜色变量和间距规范

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: 添加颜色变量**

在`src/index.css`的`:root`部分添加颜色变量：

```css
:root {
  /* 颜色变量 */
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  
  --bg-base: #0d1117;
  --bg-elevated: #161b22;
  --bg-overlay: #1c2128;
  --bg-input: #21262d;
  
  --border-default: #30363d;
  
  --accent-primary: #2f81f7;
  --accent-error: #f85149;
  --accent-success: #3fb950;
  --accent-warning: #e3b341;
  
  /* 间距变量 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
  --spacing-2xl: 32px;
  
  /* 组件间距 */
  --component-gap: 16px;
  --section-gap: 24px;
  --group-gap: 32px;
  
  /* 字体大小 */
  --font-size-xs: 10px;
  --font-size-sm: 12px;
  --font-size-base: 13px;
  --font-size-lg: 14px;
  --font-size-xl: 16px;
  --font-size-2xl: 18px;
  
  /* 字重 */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  
  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 2: 添加亮色主题变量**

在`[data-theme="light"]`部分添加对应的变量：

```css
[data-theme="light"] {
  /* 颜色变量 */
  --text-primary: #1f2328;
  --text-secondary: #656d76;
  --text-muted: #9198a1;
  
  --bg-base: #ffffff;
  --bg-elevated: #f6f8fa;
  --bg-overlay: #eaeef2;
  --bg-input: #ffffff;
  
  --border-default: #d0d7de;
  
  --accent-primary: #0969da;
  --accent-error: #d1242f;
  --accent-success: #1a7f37;
  --accent-warning: #9a6700;
  
  /* 阴影在亮色主题下更深 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.12);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.12);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.18);
}
```

- [ ] **Step 3: 验证变量生效**

运行开发服务器，检查颜色和间距是否正确应用：
```bash
pnpm tauri dev
```

- [ ] **Step 4: 提交更改**

```bash
git add src/index.css
git commit -m "feat: 添加颜色变量和间距规范"
```

### Task 3: 优化设置页面组件样式

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: 优化TabLayout组件**

修改`src/pages/Settings.tsx`中的`TabLayout`组件，添加更好的样式：

```tsx
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
```

- [ ] **Step 2: 优化SettingGroup组件**

修改`SettingGroup`组件，添加更好的卡片样式：

```tsx
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
```

- [ ] **Step 3: 优化SettingRow组件**

修改`SettingRow`组件，添加更好的交互样式：

```tsx
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
```

- [ ] **Step 4: 优化InfoBox组件**

修改`InfoBox`组件，添加更好的样式：

```tsx
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
```

- [ ] **Step 5: 优化Toggle组件**

修改`Toggle`组件，添加更好的动画效果：

```tsx
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
```

- [ ] **Step 6: 测试组件样式**

运行开发服务器，检查所有组件样式是否正确：
```bash
pnpm tauri dev
```

验证：
1. 所有卡片样式统一
2. 所有交互元素有悬停效果
3. 所有动画流畅

- [ ] **Step 7: 提交更改**

```bash
git add src/pages/Settings.tsx
git commit -m "style: 优化设置页面组件样式"
```

### Task 4: 优化按钮交互效果

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: 优化主要按钮样式**

在`src/pages/Settings.tsx`中，找到所有主要按钮（如"保存配置"、"保存凭据"），添加更好的交互效果：

```tsx
<button
  onClick={saveAi}
  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
  style={{ background: '#2563eb' }}
>
  保存配置
</button>
```

- [ ] **Step 2: 优化次要按钮样式**

找到所有次要按钮（如"测试连接"、"检查更新"），添加更好的交互效果：

```tsx
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
```

- [ ] **Step 3: 优化导航按钮样式**

在左侧菜单中，优化导航按钮的交互效果：

```tsx
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
```

- [ ] **Step 4: 测试按钮交互**

运行开发服务器，测试所有按钮的交互效果：
```bash
pnpm tauri dev
```

验证：
1. 悬停时按钮有轻微放大和阴影效果
2. 点击时有缩放反馈
3. 禁用状态有正确的样式
4. 加载状态有旋转动画

- [ ] **Step 5: 提交更改**

```bash
git add src/pages/Settings.tsx
git commit -m "style: 优化按钮交互效果"
```

### Task 5: 优化输入框和下拉框样式

**Files:**
- Modify: `src/index.css`
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: 优化全局输入框样式**

在`src/index.css`中添加更好的输入框样式：

```css
/* 优化输入框样式 */
.form-input {
  width: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-input);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-base);
  color: var(--text-primary);
  outline: none;
  transition: all 150ms ease;
}

.form-input:hover {
  border-color: var(--text-muted);
}

.form-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(47, 129, 247, 0.15);
}

.form-input::placeholder {
  color: var(--text-muted);
}

/* 优化下拉框样式 */
select.form-input {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 28px !important;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

[data-theme="light"] select.form-input {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23656d76' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
}
```

- [ ] **Step 2: 优化密码输入框样式**

在`src/pages/Settings.tsx`中，优化密码输入框的样式：

```tsx
<SettingRow label="API Key" required hint="密钥不会上传，仅本地加密存储">
  <input
    type="password"
    value={aiForm.api_key}
    onChange={(e) => setAiForm({ ...aiForm, api_key: e.target.value })}
    placeholder="sk-..."
    className="form-input"
  />
</SettingRow>
```

- [ ] **Step 3: 测试输入框和下拉框**

运行开发服务器，测试所有输入框和下拉框：
```bash
pnpm tauri dev
```

验证：
1. 输入框悬停时边框颜色变化
2. 输入框聚焦时有蓝色边框和阴影
3. 下拉框箭头正确显示
4. 所有输入框样式统一

- [ ] **Step 4: 提交更改**

```bash
git add src/index.css src/pages/Settings.tsx
git commit -m "style: 优化输入框和下拉框样式"
```

### Task 6: 优化主题卡片和字体大小选择器

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: 优化主题卡片样式**

在`src/pages/Settings.tsx`中，优化`ThemeCard`组件：

```tsx
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
        'flex flex-col items-center gap-2 rounded-xl p-3 border transition-all duration-200 w-24',
        isActive ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-border/80'
      )}
      style={!isActive ? { 
        borderColor: 'var(--border-default)', 
        background: 'var(--bg-elevated)',
        boxShadow: 'var(--shadow-sm)'
      } : {
        boxShadow: 'var(--shadow-md)'
      }}
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
```

- [ ] **Step 2: 优化字体大小选择器**

在`src/pages/Settings.tsx`中，优化字体大小选择器：

```tsx
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
          className="px-2 py-0.5 rounded text-xs transition-all duration-200"
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
```

- [ ] **Step 3: 测试主题卡片和字体大小选择器**

运行开发服务器，测试这些组件：
```bash
pnpm tauri dev
```

验证：
1. 主题卡片悬停时有阴影效果
2. 主题卡片选中时有蓝色边框
3. 字体大小选择器点击时有反馈
4. 字体大小滑块拖动流畅

- [ ] **Step 4: 提交更改**

```bash
git add src/pages/Settings.tsx
git commit -m "style: 优化主题卡片和字体大小选择器"
```

### Task 7: 优化检查更新按钮和状态显示

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: 优化检查更新按钮**

在`src/pages/Settings.tsx`的`AboutTab`组件中，优化检查更新按钮：

```tsx
<button
  onClick={checkUpdate}
  disabled={updateState === 'checking'}
  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
  style={{
    background: 'var(--surface-hover)',
    color: 'var(--text-secondary)',
  }}
>
  {updateState === 'checking' ? (
    <Loader2 size={12} className="animate-spin" />
  ) : (
    <RefreshCw size={12} />
  )}
  检查更新
</button>
```

- [ ] **Step 2: 优化状态显示**

在`AboutTab`组件中，优化状态显示：

```tsx
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
        className="text-xs flex items-center gap-1 mt-1 hover:underline transition-colors duration-200"
        style={{ color: '#60a5fa' }}
      >
        <Download size={12} /> 前往下载
      </a>
    )}
  </div>
</div>
```

- [ ] **Step 3: 测试检查更新功能**

运行开发服务器，测试检查更新功能：
```bash
pnpm tauri dev
```

验证：
1. 检查更新按钮有悬停效果
2. 检查更新按钮有加载状态
3. 状态显示清晰
4. 下载链接有悬停效果

- [ ] **Step 4: 提交更改**

```bash
git add src/pages/Settings.tsx
git commit -m "style: 优化检查更新按钮和状态显示"
```

### Task 8: 整体测试和调优

**Files:**
- 无新文件，只测试现有文件

- [ ] **Step 1: 运行完整测试**

运行开发服务器，测试所有设置页面功能：
```bash
pnpm tauri dev
```

测试清单：
1. 所有下拉选择器正常显示，无`^`符号
2. 所有按钮有清晰的交互反馈
3. 所有开关有平滑的动画效果
4. 所有输入框有聚焦和悬停效果
5. 所有操作有成功/失败的反馈
6. 颜色对比度符合可访问性标准
7. 间距和留白统一
8. 字体大小和字重统一
9. 层次结构清晰
10. 整体风格接近macOS系统设置

- [ ] **Step 2: 修复发现的问题**

如果测试中发现任何问题，及时修复。

- [ ] **Step 3: 最终提交**

```bash
git add .
git commit -m "feat: 完成设置页面UI/UX优化"
```

## 验收标准

### 功能验收
- [ ] 所有下拉选择器正常显示，无`^`符号
- [ ] 所有按钮有清晰的交互反馈
- [ ] 所有开关有平滑的动画效果
- [ ] 所有输入框有聚焦和悬停效果
- [ ] 所有操作有成功/失败的反馈

### 视觉验收
- [ ] 颜色对比度符合可访问性标准
- [ ] 间距和留白统一
- [ ] 字体大小和字重统一
- [ ] 层次结构清晰
- [ ] 整体风格接近macOS系统设置

### 交互验收
- [ ] 所有交互都有视觉反馈
- [ ] 动画流畅，无卡顿
- [ ] 键盘导航可用
- [ ] 加载状态清晰

## 风险和注意事项

### 潜在风险
1. **浏览器兼容性**：不同浏览器可能渲染不同
2. **性能影响**：过多的动画可能影响性能
3. **可访问性**：确保颜色对比度符合标准

### 注意事项
1. 保持现有功能不变
2. 逐步优化，不要一次性大改
3. 测试所有浏览器和平台
4. 确保可访问性

---

**计划状态**：待执行  
**下一步**：选择执行方式（Subagent-Driven或Inline Execution）