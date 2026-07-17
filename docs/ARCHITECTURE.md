# LogLens — 架构设计文档

## 📐 设计原则（借鉴 Tabularis）

1. **日志文件只读不写**：原始日志文件绝不会被修改，索引和配置存到独立目录
2. **流式解析**：500MB 的日志文件不一次性加载到内存，用流式读取 + 分批索引
3. **虚拟滚动**：前端只渲染屏幕可见区域的日志行（@tanstack/react-virtual）
4. **本地优先**：所有数据默认存本地，AI 用 Ollama 本地模型，零网络依赖
5. **格式驱动**：解析器用插件模式，新增格式支持不需要改核心逻辑

---

## 🧱 整体分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    前端层 (React + TS)                       │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ 日志表格  │ │ 时间线图  │ │ 搜索面板  │ │ AI 对话面板    │ │
│  │(虚拟滚动) │ │(recharts)│ │(过滤构建) │ │(自然语言查询)  │ │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ 统计面板  │ │ 文件管理  │ │ 设置面板  │ │ 格式配置       │ │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘ │
├─────────────────────────────────────────────────────────────┤
│               Tauri v2 IPC (JSON + 二进制流)                 │
├─────────────────────────────────────────────────────────────┤
│                    后端层 (Rust)                              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  commands.rs                          │  │
│  │      所有 Tauri Command 的注册入口                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ parser/   │ │ index/    │ │ filter/   │ │ ai/          │  │
│  │ 解析引擎  │ │ 索引引擎   │ │ 过滤器    │ │ AI 异常检测   │  │
│  │           │ │           │ │           │ │              │  │
│  │ - json    │ │ - writer  │ │ - parser  │ │ - ollama     │  │
│  │ - csv     │ │ - reader  │ │ - exec    │ │ - prompt     │  │
│  │ - nginx   │ │ - schema  │ │ - query   │ │ - anomaly    │  │
│  │ - syslog  │ │           │ │           │ │ - nl_query   │  │
│  │ - custom  │ │           │ │           │ │              │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐   │
│  │ stream/  │ │ stats/    │ │ config/                   │   │
│  │ 流式读取 │ │ 统计分析   │ │ 配置 + 持久化              │   │
│  └──────────┘ └──────────┘ └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 前端目录结构（src/）

```
src/
├── main.tsx                    # 入口
├── App.tsx                     # 路由
├── index.css                   # 全局样式 + Tailwind
│
├── components/                 # UI 组件
│   ├── layout/                 # 布局
│   │   ├── MainLayout.tsx      # 主布局 (文件栏+内容区)
│   │   ├── FileBar.tsx         # 已打开文件标签栏
│   │   └── StatusBar.tsx       # 状态栏 (行数/内存/索引状态)
│   ├── log/                    # 日志展示
│   │   ├── LogTable.tsx        # 日志表格 (虚拟滚动，百万行)
│   │   ├── LogRow.tsx          # 单行日志渲染
│   │   ├── LogDetail.tsx       # 日志详情面板 (点击行展开)
│   │   └── ColumnSelector.tsx  # 列显示选择器
│   ├── search/                 # 搜索
│   │   ├── SearchBar.tsx       # 搜索栏 (全文 + 过滤条件)
│   │   ├── FilterBuilder.tsx   # 高级过滤构建器
│   │   └── SearchResults.tsx   # 搜索结果摘要
│   ├── timeline/               # 时间线
│   │   ├── TimelineChart.tsx   # 时间线图表 (recharts)
│   │   └── TimeRangeSelector.tsx # 时间范围选择
│   ├── stats/                  # 统计
│   │   ├── StatsPanel.tsx      # 统计面板
│   │   ├── ErrorTrend.tsx      # 错误趋势图
│   │   └── TopErrors.tsx       # Top 错误类型
│   ├── ai/                     # AI
│   │   ├── AiChatPanel.tsx     # AI 对话面板
│   │   └── AnomalyBadge.tsx    # 异常标记 (在日志行上)
│   ├── file/                   # 文件管理
│   │   ├── FileDropZone.tsx    # 拖拽区域
│   │   ├── FileManager.tsx     # 文件管理器
│   │   └── FormatConfig.tsx    # 格式配置 (自定义正则)
│   ├── modals/                 # 弹窗
│   │   └── SettingsModal.tsx
│   └── ui/                     # 通用 UI
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Select.tsx
│       ├── Tabs.tsx
│       ├── VirtualTable.tsx    # 虚拟滚动表格封装
│       └── Toast.tsx
│
├── pages/                      # 页面
│   ├── Workspace.tsx           # 主工作区
│   ├── Settings.tsx            # 设置
│   └── Welcome.tsx             # 欢迎页 (拖拽提示)
│
├── hooks/                      # 自定义 Hooks
│   ├── useLogFile.ts           # 日志文件加载
│   ├── useSearch.ts            # 搜索
│   ├── useTimeline.ts          # 时间线数据
│   ├── useStats.ts             # 统计数据
│   └── useAi.ts                # AI 功能
│
├── contexts/                   # 全局状态
│   ├── WorkspaceProvider.tsx    # 工作区
│   ├── SettingsProvider.tsx     # 设置
│   └── ThemeProvider.tsx        # 主题
│
├── types/                      # 类型定义
│   ├── log.ts                  # 日志条目
│   ├── filter.ts               # 过滤条件
│   └── format.ts               # 格式配置
│
├── utils/                      # 工具函数
│   ├── format.ts               # 数值格式化
│   └── color.ts                # 日志级别颜色映射
│
└── themes/                     # 主题
    ├── light.css
    └── dark.css
```

---

## 📂 后端目录结构（src-tauri/src/）

```
src-tauri/src/
├── main.rs                     # 程序入口
├── lib.rs                      # 模块注册
│
├── commands.rs                 # Tauri Command 注册中心
│
├── parser/                     # 日志解析引擎
│   ├── mod.rs
│   ├── detector.rs             # 格式自动检测
│   ├── json_parser.rs          # JSON Lines 解析
│   ├── csv_parser.rs           # CSV 解析
│   ├── nginx_parser.rs         # NGINX/Apache 访问日志解析
│   ├── syslog_parser.rs        # Syslog (RFC 5424) 解析
│   ├── custom_parser.rs        # 自定义正则解析
│   └── normalizer.rs           # 标准化 (统一字段名: timestamp/level/message)
│
├── index/                      # 全文索引引擎
│   ├── mod.rs
│   ├── engine.rs               # tantivy 索引封装
│   ├── writer.rs               # 索引写入 (批量提交)
│   ├── reader.rs               # 索引查询
│   ├── schema.rs               # 索引 Schema 定义
│   └── migrator.rs             # Schema 迁移
│
├── filter/                     # 过滤/搜索
│   ├── mod.rs
│   ├── parser.rs               # 过滤语法解析 (level=ERROR AND ...)
│   ├── executor.rs             # 过滤执行 (结合 tantivy + 内存过滤)
│   └── query_builder.rs        # tantivy Query 构建器
│
├── stream/                     # 文件流式读取
│   ├── mod.rs
│   ├── reader.rs               # 流式文件读取器 (分块)
│   ├── tail.rs                 # tail -f 实时追踪
│   └── position.rs             # 读取位置管理
│
├── stats/                      # 统计分析
│   ├── mod.rs
│   ├── aggregator.rs           # 聚合计算 (按时间/级别/服务)
│   ├── histogram.rs            # 直方图 (时间分布)
│   └── topk.rs                 # Top-K 统计
│
├── ai/                         # AI 异常检测
│   ├── mod.rs
│   ├── ollama.rs               # Ollama 客户端
│   ├── anomaly.rs              # 异常检测 Prompt 工程
│   ├── nl_query.rs             # 自然语言 → 过滤条件
│   └── summarizer.rs           # 日志摘要
│
├── config.rs                   # 配置文件管理
├── paths.rs                    # 路径工具
├── logger.rs                   # 日志系统
├── updater.rs                  # 自动更新
└── cli.rs                      # CLI 模式
```

---

## 🔄 核心数据流

### 打开日志文件的完整流程

```
用户拖拽 app.log (500MB) 到窗口
    │
    ▼
┌─ 前端 (React) ─────────────────────────────────────┐
│  1. FileDropZone 检测到文件                          │
│  2. invoke('open_log_file', { path })               │
└────────────────────────────────────────────────────┘
    │  Tauri IPC
    ▼
┌─ 后端 (Rust) ──────────────────────────────────────┐
│  commands::open_log_file(path)                      │
│    │                                                 │
│    ├─► parser::detector::detect()                    │
│    │    ├─ 读取前 100 行                             │
│    │    ├─ 尝试 JSON/CSV/NGINX/Syslog 模式匹配       │
│    │    ├─ 自动发现 timestamp/level/message 字段    │
│    │    └─ 返回 DetectedFormat                      │
│    │                                                 │
│    ├─► 返回格式信息给前端                            │
│    │    └─ 前端渲染格式确认 UI (可手动调整)          │
│    │                                                 │
│    ├─► index::writer::build_schema()                 │
│    │    └─ 根据检测到的字段创建 tantivy Schema        │
│    │                                                 │
│    ├─► stream::reader::process()                     │
│    │    ├─ 分块读取文件 (每块 1MB)                    │
│    │    ├─ 每块 → parser 解析 → NormalizedLogEntry   │
│    │    ├─ 每 1000 条 → index writer 批量提交         │
│    │    └─ 更新进度 (前端展示进度条)                  │
│    │                                                 │
│    └─► 返回：总行数、索引大小、字段列表              │
└────────────────────────────────────────────────────┘
    │  Tauri IPC
    ▼
┌─ 前端 (React) ─────────────────────────────────────┐
│  4. LogTable 使用虚拟滚动渲染前 100 行               │
│  5. StatsPanel 展示统计摘要                          │
│  6. TimelineChart 展示时间分布                       │
└────────────────────────────────────────────────────┘
```

### 搜索流程

```
用户输入：level=ERROR service=payment
    │
    ▼
┌─ 前端 ─────────────────────────────────────────────┐
│  1. SearchBar onChange → debounce 300ms             │
│  2. invoke('search_logs', { fileId, query })        │
└────────────────────────────────────────────────────┘
    │
    ▼
┌─ 后端 (Rust) ──────────────────────────────────────┐
│  commands::search_logs(fileId, query)                │
│    │                                                 │
│    ├─► filter::parser::parse("level=ERROR service=payment")
│    │    └─ 生成 AST: AND(                         │
│    │         EQUALS("level", "ERROR"),              │
│    │         EQUALS("service", "payment")           │
│    │       )                                        │
│    │                                                 │
│    ├─► filter::query_builder::build(ast)             │
│    │    └─ 生成 tantivy Query                        │
│    │                                                 │
│    ├─► index::reader::search(query)                  │
│    │    └─ tantivy 执行搜索 → (offset, score)[]     │
│    │                                                 │
│    └─► 返回：匹配行号列表、总数、耗时               │
└────────────────────────────────────────────────────┘
    │
    ▼
┌─ 前端 ─────────────────────────────────────────────┐
│  3. LogTable 跳转到第一个匹配行                     │
│  4. 匹配行高亮 (黄色背景)                           │
│  5. 侧边栏显示匹配密度 (滚动条上的刻度标记)         │
└────────────────────────────────────────────────────┘
```

---

## 🗄️ 存储设计

```
~/.loglens/
├── config.json                # 应用配置
├── indexes/                   # tantivy 索引文件
│   ├── {file_hash_1}/         # 每个文件的索引 (用文件哈希做目录名)
│   │   ├── meta.json          # 索引元数据
│   │   ├── *.idx              # tantivy 索引文件
│   │   └── positions.db       # 读取位置 (SQLite)
│   └── {file_hash_2}/
├── sessions/                  # 会话 (打开的文件、搜索历史)
│   └── default.json
└── templates/                 # 用户自定义格式模板
    └── my-app-format.toml
```

**关键设计决策**：
- 原始日志文件**只读**，绝不修改
- 索引用文件内容的 **SHA256 哈希** 做目录名 → 同一文件不会重复索引
- 索引可删除重建，不影响原始数据

---

## 🧠 AI 异常检测设计

### 工作流程

```
1. 用户点击「AI 分析」按钮（或右键某行日志 → AI 分析）
2. 后端收集上下文：
   - 该行前后各 50 行日志
   - 统计摘要（Error 数量、时间分布）
3. 调用 Ollama 本地模型：
   Prompt: "以下是一个应用日志片段，请指出其中异常的行并解释原因：..."
4. 模型返回：异常行号列表 + 原因解释
5. 前端在日志表格中标记异常行 (🔴 标记) + AI 解释面板
```

### 反幻觉设计（避免 AI 说胡话）
- **只让 AI 做判断，不让 AI 做计算**：统计数字（行数、时间）由 Rust 计算，AI 只做「这是否异常」的二元判断
- **行号锚定**：AI 必须引用具体行号，前端验证行号是否有效
- **置信度要求**：AI 必须标注对每个判断的信心程度（高/中/低）
