# LogLens 推广计划

## 🎯 目标
在 1-2 个月内将 LogLens 打造成 MCP 生态中最实用的开发工具之一，获得 GitHub 500+ stars。

## 📢 核心卖点（Elevator Pitch）
> "LogLens gives your AI coding agent eyes to see your application logs. Stop copy-pasting error messages — let your AI debug with real-time log access via MCP."

## 🐦 社交媒体文案

### Twitter/X (英文)
```
🪵🔍 LogLens v0.3.0 is out!

Give your AI coding agent (Cursor/Claude Code/Codex) the ability to read your app logs directly via MCP.

No more copy-pasting error messages:
→ "Search app.log for ERROR logs from the last hour"
→ "Get the context around line 1024"
→ "Show me the log file statistics"

OSS | Rust+Tauri | Apache 2.0
github.com/kobewl/LogLens

#MCP #DevTools #RustLang #AI #OpenSource
```

### Twitter/X (中文)
```
🪵🔍 LogLens v0.3.0 发布！

让你的 AI 编程助手（Cursor/Claude Code）能直接搜索你的应用日志。

以前：遇到 bug → 切换窗口 → tail -f → grep → 复制粘贴 → 回 AI 提问
现在：对 AI 说一句"搜索 app.log 中的 ERROR"即可

开源 | Rust+Tauri | Apache 2.0
github.com/kobewl/LogLens

#开源 #开发工具 #AI
```

### Reddit - r/programming
标题: "I built a tool that lets AI coding agents read your application logs via MCP"

内容:
```
As AI coding assistants (Cursor, Claude Code, Codex) get better at writing code, 
there's still a huge gap: they can't see your app's runtime output. 

Every time your code hits an error, you have to:
1. Switch to terminal
2. tail -f / grep the logs
3. Copy the error
4. Paste it back to the AI

I built LogLens to fix this. It's a Tauri desktop app that doubles as an MCP server. 
Once connected, your AI agent gets 6 tools:
- search_local_logs - full-text search + field filters
- get_log_context - see lines around an error
- list_log_sessions - discover available log files
- get_log_stats - overview statistics
- list_cloud_projects / search_cloud_logs - query production logs

Built with Rust (Tauri v2) + React. Completely local, Apache 2.0.

GitHub: https://github.com/kobewl/LogLens
Release: https://github.com/kobewl/LogLens/releases/tag/v0.3.0
```

### Reddit - r/rust
标题: "LogLens - A Tauri v2 + Tantivy desktop log analyzer with MCP server in Rust"

### Hacker News - Show HN
标题: "Show HN: LogLens – Give your AI coding agent real-time access to your app logs"

## 📅 发布时间线

| 日期 | 动作 |
|------|------|
| Day 1 | 发布 Reddit (r/rust + r/programming) |
| Day 2 | 发布 Hacker News Show HN |
| Day 3 | Twitter/X 英文 + 中文 |
| Day 7 | Dev.to 技术文章 |
| Day 14 | Product Hunt Launch (等更多功能) |

## 🔮 后续功能规划（驱动增长的策略）

### v0.4.0 - 实时追踪 MCP
- MCP 工具: tail_log_file（实时监听日志）
- 告警规则 + MCP 通知
- 让 AI Agent 能"监听"你的日志流

### v0.5.0 - 多文件关联
- 跨文件搜索
- 时间轴对齐
- 关联分析（API Gateway + Backend 日志同时看）

### v0.6.0 - 智能分析
- AI 自动诊断报告
- 异常模式学习
- 一键生成修复建议

### v1.0.0 - 正式版
- 插件系统
- 社区格式解析器
- Web Dashboard
