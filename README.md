# LogLens 🪵🔍

> **Give Your AI Coding Agent Eyes to See Your Application Logs**
>
> 拖拽即分析 · AI 异常检测 · MCP 协议支持 · 零配置 · 完全本地

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License" />
  <img src="https://img.shields.io/badge/version-0.5.0-purple" alt="Version" />
  <img src="https://img.shields.io/badge/MCP-8%20tools-orange" alt="MCP Tools" />
</p>

---

## 🎯 这是什么？

**LogLens** 是一个基于 Tauri v2 的本地桌面日志分析工具。但更重要的是——它也是一个 **MCP (Model Context Protocol) 服务器**，可以让 Cursor、Claude Code、Codex 等 AI 编程助手**直接搜索和阅读你本地的应用日志**。

### 💡 杀手级场景

想象一下：你用 Cursor 或 Claude Code 写代码，运行应用时出了 bug。以前你需要：
1. 退出 AI 工具 → 2. 打开终端 → 3. `tail -f` / `grep` → 4. 手动分析 → 5. 回到 AI 工具描述问题

**现在只需要一句话：「搜索 app.log 中最近的 ERROR 日志，分析原因」** —— AI Agent 直接通过 LogLens MCP 查询日志，定位问题，给出修复方案。全程不离开编辑器。

### 为什么需要 LogLens？

| 现有方案 | 致命短板 |
|---|---|
| `tail -f \| grep` | 太原始，全靠人肉 |
| **glogg / klogg** | 已死/停滞多年，Qt 界面过时，无 AI |
| **lnav** | 终端 TUI，学习曲线陡峭 |
| **ELK / Loki** | 本地跑需要 4GB+ 内存，杀鸡用牛刀 |
| **Splunk / Datadog** | 天价，数据上云，隐私堪忧 |
| **AI Agent 无日志访问** | 👈 **最痛的点！AI 帮你写代码却看不到运行结果** |

> 💡 **LogLens = 桌面日志分析器 + AI Agent 的日志眼睛**

---

## ✨ 核心功能

### 桌面应用
- 📂 **拖拽即分析**：拖一个 500MB 的 `.log` 文件进去，自动识别格式，秒级可搜索
- 🔍 **全文检索**：基于 tantivy 搜索引擎，百万行日志毫秒级检索
- 🎯 **高级过滤**：`level=ERROR AND service=payment AND timestamp > 2025-01-01`
- 🤖 **AI 异常检测**：集成 DeepSeek / OpenAI / Ollama，自动标出异常行
- ⏱️ **时间线视图**：按时间轴展示日志分布
- 📊 **统计面板**：错误趋势图、Top 错误类型、日志级别分布
- ☁️ **云日志查询**：支持阿里云 SLS、腾讯云 CLS、华为云 LTS

### MCP 服务器（给 AI Agent 用）
- 🔍 **search_local_logs** — AI 直接搜索你的本地日志文件
- 📡 **tail_log_file** — 实时追踪日志新增内容（类似 tail -f）
- 🔎 **search_all_logs** — 跨所有已知日志文件搜索
- 📋 **get_log_context** — 获取某行日志前后的上下文
- 📂 **list_log_sessions** — 列出你最近打开的日志文件
- 📊 **get_log_stats** — 获取日志统计概览（级别分布、时间线）
- ☁️ **list_cloud_projects** — 列出已配置的云日志项目
- ☁️ **search_cloud_logs** — 搜索云端生产日志

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
| **AI** | DeepSeek / OpenAI / Ollama | 多模型支持 |
| **MCP** | JSON-RPC 2.0 over stdio | 标准协议 |

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

# 3. 启动开发服务器
pnpm tauri dev
```

### 接入 AI 编程助手（MCP）

LogLens 可以作为一个 MCP Server 被 AI 编程助手调用：

**Cursor：** 打开 LogLens → MCP 页面 → 选择 Cursor → 一键安装

**Claude Code：**
```bash
claude mcp add --scope user loglens -- /path/to/loglens --mcp-server
```

**Codex CLI：**
```bash
codex mcp add loglens -- /path/to/loglens --mcp-server
```

**Claude Desktop / Windsurf / Gemini CLI：**
在 MCP 配置文件中添加：
```json
{
  "mcpServers": {
    "loglens": {
      "command": "/path/to/loglens",
      "args": ["--mcp-server"]
    }
  }
}
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
│   │   ├── ai/                   # AI 对话 & 异常标记
│   │   ├── cloud/                # 云日志查询
│   │   └── ui/                   # 通用 UI 组件
│   ├── pages/                    # 页面
│   │   ├── Workspace.tsx         # 主工作区
│   │   ├── McpPage.tsx           # MCP 管理页面
│   │   ├── ToolsPage.tsx         # 开发工具
│   │   └── Settings.tsx          # 设置
│   ├── hooks/                    # 自定义 Hooks
│   ├── types/                    # TypeScript 类型定义
│   └── utils/                    # 工具函数
│
├── src-tauri/                    # 后端源码 (Rust)
│   └── src/
│       ├── parser/               # 日志解析引擎
│       ├── index/                # tantivy 全文索引引擎
│       ├── filter/               # 搜索过滤引擎
│       ├── stream/               # 文件流式读取
│       ├── stats/                # 统计分析
│       ├── ai/                   # AI 异常检测
│       ├── cloud/                # 云服务商集成
│       ├── mcp/                  # MCP Server (tools, server, protocol)
│       └── commands.rs           # Tauri IPC 命令注册
│
├── docs/                         # 设计文档
│   ├── ARCHITECTURE.md           # 架构设计
│   ├── FEATURES.md               # 功能规格
│   └── ROADMAP.md                # 路线图
│
└── public/                       # 静态资源
```

---

## 🗺️ 开发路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| **Phase 1** | 文件加载 + 格式自动识别 + 虚拟表格 + 基础搜索 | ✅ 完成 |
| **Phase 2** | tantivy 全文索引 + 高级过滤 + 统计面板 + 云日志 | ✅ 完成 |
| **Phase 3** | AI 异常检测 + 自然语言查询 + MCP Server | ✅ 完成 |
| **Phase 4** | **MCP 本地日志工具**（让 AI Agent 直接查本地日志）+ 实时追踪 | ✅ 完成 |
| **Phase 5** | 多文件关联 + 告警规则 + 插件系统 | 📋 计划中 |
| **Phase 6** | 插件系统 + 日志 Diff + 报告生成 | 📋 计划中 |

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
  <br>
  <sub>If LogLens helps you, please ⭐ star this repo!</sub>
</p>
