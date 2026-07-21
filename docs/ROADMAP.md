# LogLens — 开发路线图

## 🗺️ 总览

```
Phase 1 (Month 1-2)    Phase 2 (Month 3-4)    Phase 3 (Month 5-6)    Phase 4 (Month 7-8)
    MVP 核心               全文索引                AI 异常检测            多文件 & 实时
    ─────────              ──────────              ──────────            ──────────
    文件加载                tantivy 索引            AI 自动分析            多文件 Tab
    格式识别                高级搜索                自然语言查询            实时追踪
    虚拟表格                过滤语法                Ollama 集成            告警规则
    基础展示                统计面板                异常标记                导出报告
```

---

## Phase 1：MVP 核心（第 1-2 月）

**目标**：能打开日志文件，自动识别格式，流畅浏览 100 万行日志。

### Sprint 1 — 项目脚手架 (Week 1-2)
- [ ] Tauri v2 + React 19 项目初始化
- [ ] 目录结构搭建（参考 Tabularis）
- [ ] Tailwind v4 + 主题系统
- [ ] 基础布局（文件栏 + 内容区）
- [ ] Tauri Command 注册机制
- [ ] 日志系统 + 配置管理
- [ ] 国际化基础设施

### Sprint 2 — 文件加载 + 解析引擎 (Week 3-4)
- [ ] `stream::reader` 流式文件读取
- [ ] `parser::detector` 格式自动检测（前 100 行采样）
- [ ] `parser::json_parser` JSON Lines 解析
- [ ] `parser::csv_parser` CSV 解析
- [ ] `parser::normalizer` 字段标准化
- [ ] `commands::open_log_file` Tauri Command
- [ ] 编码自动检测（UTF-8/UTF-16/GBK）

### Sprint 3 — 日志表格 (Week 5-6)
- [ ] `LogTable` 组件 + `@tanstack/react-virtual`
- [ ] 虚拟滚动实现（100万行 < 50MB 内存）
- [ ] 列自适应显示
- [ ] 级别颜色映射
- [ ] `LogDetail` 详情面板（点击行展开）
- [ ] `ColumnSelector` 列显隐控制

### Sprint 4 — 格式支持 (Week 7-8)
- [ ] `parser::nginx_parser` NGINX/Apache 日志
- [ ] `parser::syslog_parser` Syslog 格式
- [ ] `parser::custom_parser` 自定义正则
- [ ] `FormatConfig` UI（用户自定义格式编辑）
- [ ] 拖拽文件 + 文件选择对话框
- [ ] 欢迎页（拖拽提示）

---

## Phase 2：全文索引（第 3-4 月）

**目标**：百万行日志秒级搜索，统计面板可视化。

### Sprint 5 — tantivy 索引引擎 (Week 9-10)
- [ ] `index::engine` tantivy 封装
- [ ] `index::schema` 动态 Schema 构建
- [ ] `index::writer` 批量写入（每 1000 条 commit）
- [ ] 索引进度条（前端实时更新）
- [ ] 索引文件管理（SHA256 文件哈希去重）

### Sprint 6 — 搜索功能 (Week 11-12)
- [ ] `filter::parser` 过滤语法解析 (field=value AND ...)
- [ ] `filter::query_builder` tantivy Query 构建
- [ ] `SearchBar` 组件（搜索输入 + 语法提示）
- [ ] `FilterBuilder` 组件（可视化过滤条件构建）
- [ ] 搜索结果高亮 + 滚动条匹配标记
- [ ] 搜索历史

### Sprint 7 — 统计面板 (Week 13-14)
- [ ] `stats::aggregator` 聚合计算
- [ ] `stats::histogram` 时间分布直方图
- [ ] `stats::topk` Top-K 统计
- [ ] `StatsPanel` 组件（级别分布柱状图 + Top 错误饼图）
- [ ] `TimelineChart` 组件（时间轴柱状图）

### Sprint 8 — 导出 & 优化 (Week 15-16)
- [ ] 选中行导出（复制 / CSV / JSON）
- [ ] 过滤结果导出
- [ ] 性能优化（大文件流式索引调优）
- [ ] 内存占用优化

---

## Phase 3：AI 异常检测（第 5-6 月）

**目标**：AI 自动发现日志异常，自然语言查日志。

### Sprint 9 — Ollama 集成 (Week 17-18)
- [ ] `ai::ollama` Ollama HTTP 客户端
- [ ] 模型列表获取 + 选择 UI
- [ ] 模型下载引导
- [ ] 本地模型管理 UI

### Sprint 10 — AI 异常检测 (Week 19-20)
- [ ] `ai::anomaly` 异常检测 Prompt 工程
- [ ] 上下文收集（异常行前后各 50 行 + 统计摘要）
- [ ] 结果解析（行号提取 + 置信度 + 原因解释）
- [ ] `AnomalyBadge` 异常行标记 (🔴 图标)
- [ ] `AiChatPanel` AI 分析结果面板

### Sprint 11 — 自然语言查询 (Week 21-22)
- [ ] `ai::nl_query` 自然语言 → 过滤条件
- [ ] 查询确认 UI（展示转换结果，用户确认后执行）
- [ ] 模糊修正（字段名自动匹配）

### Sprint 12 — 日志摘要 (Week 23-24)
- [ ] `ai::summarizer` 日志摘要生成
- [ ] 「一句话总结这个日志文件」
- [ ] 「这个错误的原因可能是什么？」

---

## Phase 4：多文件 & 实时追踪（第 7-8 月）

**目标**：专业运维能力，多文件关联分析，实时追踪。

### Sprint 13 — 多文件管理 (Week 25-26)
- [ ] `FileBar` 多文件 Tab 切换
- [ ] 关联视图（两个文件按时间对齐并排）
- [ ] 跨文件搜索

### Sprint 14 — 实时追踪 (Week 27-28)
- [ ] `stream::tail` 文件变化监听 (notify crate)
- [ ] 实时模式 UI（自动滚动 + 暂停按钮）
- [ ] 实时过滤（新行匹配条件才显示）

### Sprint 15 — 告警规则 (Week 29-30)
- [ ] 告警规则引擎
- [ ] 规则配置 UI
- [ ] 系统通知 + 声音提示

### Sprint 16 — 收尾 (Week 31-32)
- [ ] 性能优化 + 内存泄漏排查
- [ ] E2E 测试 + 单元测试
- [ ] 文档完善
- [ ] 正式发布 v1.0

---

## 📊 里程碑总结

| 版本 | 时间 | 核心能力 | 竞品对标 | 状态 |
|---|---|---|---|---|
| **v0.1** | Month 2 | 文件加载 + 格式识别 + 虚拟表格 | 达到 glogg/klogg 核心功能，体验更好 | ✅ |
| **v0.2** | Month 3 | + tantivy 全文索引 + 搜索 + 统计 + 云日志 | 超越 glogg，达到 lnav 搜索能力 | ✅ |
| **v0.3** | Month 4 | + MCP 本地日志工具 + AI 异常检测 | **独有**：AI Agent 可直接搜索本地日志 | ✅ |
| **v0.4** | Month 5 | + 实时追踪 + MCP tail + 告警规则 | AI Agent 实时监听日志 | 📋 |
| **v0.5** | Month 6 | + 多文件关联 + 跨文件搜索 | 微服务关联分析 | 📋 |
| **v1.0** | Month 8 | 全功能，正式版发布 | 品类唯一的现代化桌面日志工具 | 📋 |

---

## 🎯 后续方向（按优先级）

1. ✅ **MCP Server（本地日志）**：让 AI Agent 能直接搜索本地日志 ← **v0.3 已完成**
2. 📋 **实时追踪 MCP**：AI Agent 实时 tail -f 日志
3. 📋 **插件系统**：社区贡献新的日志格式解析器
4. 📋 **日志对比**：两个时间段的日志 Diff
5. 📋 **智能告警**：异常检测 + 系统通知 + MCP 通知
6. 📋 **报告生成**：一键生成 PDF 日志分析报告
7. 📋 **Web Dashboard**：团队共享日志分析结果
