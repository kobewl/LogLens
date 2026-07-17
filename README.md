# LogLens 🪵🔍

> **拖拽即分析 · AI 异常检测 · 零配置 · 完全本地**
>
> 下一代本地桌面日志分析工具，填补 `tail -f | grep` 和 ELK 之间的巨大真空。

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License" />
  <img src="https://img.shields.io/badge/status-active%20development-orange" alt="Status" />
</p>

---

## 🎯 这是什么？

**LogLens** 是一个基于 Tauri v2 的本地桌面日志分析工具。你只需要把日志文件拖进去，它就会自动识别格式、建立全文索引，让你可以快速搜索和过滤。更厉害的是，它还能用本地 AI（Ollama）帮你自动发现日志中的异常模式。

### 为什么需要 LogLens？

| 现有方案 | 致命短板 |
|---|---|
| `tail -f \| grep` | 太原始，全靠人肉 |
| **glogg / klogg** | 已死/停滞多年，Qt 界面过时，无 AI |
| **lnav** | 终端 TUI，学习曲线陡峭 |
| **ELK / Loki** | 本地跑需要 4GB+ 内存，杀鸡用牛刀 |
| **Splunk / Datadog** | 天价，数据上云，隐私堪忧 |

> 💡 **结论：桌面端日志分析工具已经「断代」了 — LogLens 来填补这个空白。**

---

## ✨ 核心功能

- 📂 **拖拽即分析**：拖一个 500MB 的 `.log` 文件进去，自动识别格式（JSON Lines / CSV / NGINX / Syslog / 纯文本），秒级可搜索
- 🔍 **全文检索**：基于 tantivy 搜索引擎，百万行日志毫秒级检索
- 🎯 **高级过滤**：`level=ERROR AND service=payment AND timestamp > 2025-01-01`
- 🤖 **AI 异常检测**：集成 Ollama 本地模型，自动标出异常行，支持自然语言查询
- ⏱️ **时间线视图**：按时间轴展示日志分布，像 Skywalking 一样直观
- 📊 **统计面板**：错误趋势图、Top 错误类型、日志级别分布
- 🔴 **实时追踪**：`tail -f` 的升级版，实时滚动 + 实时过滤
- 🔗 **多文件关联**：同时打开多个日志文件，按时间轴对齐分析

---

## 🏗️ 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| **桌面框架** | [Tauri v2](https://v2.tauri.app/) | Rust 驱动，安装包 < 50MB |
| **前端** | React 19 + TypeScript | 现代化 UI |
| **构建工具** | Vite 7 | 极速 HMR |
| **CSS** | Tailwind CSS 4 | 原子化样式 |
| **虚拟滚动** | @tanstack/react-virtual | 百万行流畅滚动 |
| **图表** | Recharts | 统计可视化 |
| **搜索** | Tantivy (Rust) | 全文检索引擎 |
| **存储** | SQLite + 本地文件 | 索引持久化 |
| **AI** | Ollama (本地) | 隐私安全的 AI 分析 |
| **包管理** | pnpm | 快速、节省磁盘 |

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18
- **pnpm** >= 9（安装：`npm install -g pnpm`）
- **Rust** >= 1.77（安装：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`）
- **Tauri 系统依赖**（仅 Linux 需要）：
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### 开发模式

```bash
# 1. 克隆项目
git clone https://github.com/kobewl/LogLens.git
cd LogLens

# 2. 安装前端依赖
pnpm install

# 3. 启动开发服务器（前端 + Tauri 桌面窗口）
pnpm tauri dev
```

### 生产构建

```bash
# 构建当前平台的安装包
pnpm tauri build

# 产物在 src-tauri/target/release/bundle/
```

---

## 📁 项目结构

```
LogLens/
├── src/                          # 前端源码 (React + TypeScript)
│   ├── components/               # UI 组件
│   │   ├── layout/               # 布局 (文件栏、状态栏)
│   │   ├── log/                  # 日志表格 (虚拟滚动)
│   │   ├── search/               # 搜索 & 过滤
│   │   ├── timeline/             # 时间线图表
│   │   ├── stats/                # 统计面板
│   │   ├── ai/                   # AI 对话 & 异常标记
│   │   ├── file/                 # 文件拖拽 & 管理
│   │   └── ui/                   # 通用 UI 组件
│   ├── pages/                    # 页面
│   ├── hooks/                    # 自定义 Hooks
│   ├── contexts/                 # 全局状态
│   ├── types/                    # TypeScript 类型定义
│   └── utils/                    # 工具函数
│
├── src-tauri/                    # 后端源码 (Rust)
│   └── src/
│       ├── parser/               # 日志解析引擎 (JSON/CSV/NGINX/Syslog)
│       ├── index/                # tantivy 全文索引引擎
│       ├── filter/               # 搜索过滤引擎
│       ├── stream/               # 文件流式读取
│       ├── stats/                # 统计分析
│       ├── ai/                   # AI 异常检测 (Ollama)
│       └── commands.rs           # Tauri IPC 命令注册
│
├── docs/                         # 设计文档
│   ├── ARCHITECTURE.md           # 架构设计
│   ├── FEATURES.md               # 功能规格
│   ├── TECH_STACK.md             # 技术选型
│   └── ROADMAP.md                # 路线图
│
├── public/                       # 静态资源
├── index.html                    # HTML 入口
├── package.json                  # 前端依赖
├── vite.config.ts                # Vite 配置
└── .gitignore                    # Git 忽略规则
```

---

## 🗺️ 开发路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| **Phase 1** | 文件加载 + 格式自动识别 + 基础搜索 + 表格展示 | 🚧 开发中 |
| **Phase 2** | tantivy 全文索引 + 高级过滤 + 统计面板 | 📋 计划中 |
| **Phase 3** | AI 异常检测 + 自然语言查询 + Ollama 集成 | 📋 计划中 |
| **Phase 4** | 多文件关联 + 实时追踪 + 告警规则 | 📋 计划中 |

---

## 🤝 参与贡献

本项目正在积极开发中，欢迎提 Issue 和 PR！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 📄 License

[Apache License 2.0](LICENSE) — 完全免费，商业友好。

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/kobewl">kobewl</a>
</p>
