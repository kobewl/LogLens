# LogLens — 技术选型文档

## 🎯 选型原则

完全借鉴 Tabularis 的技术栈，针对日志分析场景做调整。

---

## 前端技术栈

| 技术 | 版本 | 用途 | 选择理由 |
|---|---|---|---|
| **React** | 19.x | UI 框架 | 与 Tabularis 一致 |
| **TypeScript** | 5.9.x | 类型安全 | 与 Tabularis 一致 |
| **Vite** | 7.x | 构建工具 | 与 Tabularis 一致 |
| **Tailwind CSS** | v4 | 样式框架 | 与 Tabularis 一致 |
| **React Router** | 7.x | 路由 | 与 Tabularis 一致 |
| **@tanstack/react-virtual** | 3.x | 虚拟滚动 | **核心依赖**：百万行日志只渲染可视区域 |
| **@tanstack/react-table** | 8.x | 数据表格 | 列管理、排序、列大小调整 |
| **recharts** | 3.x | 图表 | 时间线柱状图、错误趋势折线图、饼图 |
| **lucide-react** | 0.56x | 图标库 | 与 Tabularis 一致 |
| **react-markdown** | 10.x | Markdown 渲染 | AI 分析结果展示 |
| **i18next** | 25.x | 国际化 | 与 Tabularis 一致 |

### 与 Tabularis 的差异

```
Tabularis 有但 LogLens 不需要的:
  - Monaco Editor       (不需要代码编辑器)
  - @xyflow/react       (不需要 ER 图)
  - json-edit-react     (不需要 JSON 编辑器)
  - wkx / sql-formatter (不需要)

LogLens 新增的:
  - @tanstack/react-virtual  (虚拟滚动，核心组件)
```

---

## 后端技术栈 (Rust)

### 核心依赖

| Crate | 用途 | 选择理由 |
|---|---|---|
| **tauri** | 桌面框架 | v2.10+，与 Tabularis 完全一致 |
| **tantivy** | 全文索引引擎 | **核心选择**（详见下方） |
| **tokio** | 异步运行时 | 异步文件 IO + 索引 |
| **serde / serde_json** | 序列化 | 标准方案 |
| **serde_yaml** | YAML 解析 | 格式配置模板 |
| **csv** | CSV 解析 | 成熟的 CSV 库 |
| **regex** | 正则表达式 | 自定义格式解析、NGINX 日志匹配 |
| **chrono** | 时间处理 | 时间戳解析、时区转换 |
| **sqlx** | SQLite | 读取位置管理、会话存储 |
| **reqwest** | HTTP 客户端 | Ollama API 调用 |
| **uuid** | ID 生成 | 文件会话 ID |
| **sha2** | 哈希 | 文件内容哈希（避免重复索引） |
| **clap** | CLI 参数 | CLI 模式 |
| **directories** | 路径工具 | 跨平台配置目录 |
| **notify** | 文件监听 | 实时追踪模式 (tail -f) |

### Tauri 插件

| 插件 | 用途 |
|---|---|
| **tauri-plugin-dialog** | 文件打开对话框 |
| **tauri-plugin-fs** | 文件大小/修改时间读取 |
| **tauri-plugin-clipboard-manager** | 复制日志行 |
| **tauri-plugin-updater** | 自动更新 |

---

## 🔑 关键选型决策

### 决策 1：全文索引引擎 — 为什么选 tantivy？

这是 LogLens 最重要的技术选型。

```
候选方案对比：

SQLite FTS5          → 简单但功能弱：不支持字段级查询、排序算法固定
Elasticsearch 嵌入    → 太重：Java 依赖，不适合桌面嵌入
Meilisearch           → 不错但需要独立进程，不适合嵌入 Tauri
tantivy               → ✅ Rust 原生、嵌入方式、性能接近 Lucene、API 现代

tantivy 优势：
  - 完全 Rust 实现，直接嵌入 Tauri 进程（无外部依赖）
  - 性能极高：百万文档秒级索引、毫秒级搜索
  - 支持 BM25 排序（比 FTS5 的简单匹配更准确）
  - 支持字段级查询（level:ERROR AND timestamp:[* TO 2025-01-01]）
  - 可自定义 tokenizer（支持日志特有的分隔符）
```

**代价**：tantivy 编译较慢（~2-3 分钟），但这是可接受的。
**缓解**：使用 `tantivy-stacker` 减少编译时间，或预先编译为动态库。

### 决策 2：文件读取策略 — 流式 + 分块

```
500MB 日志文件的处理方式：

❌ 方案 A：全部读入内存 → 内存爆炸 (500MB+)
❌ 方案 B：mmap → 大文件 mmap 在 32 位系统上有问题
✅ 方案 C：BufReader 流式读取，1MB 分块解析

具体实现：
  1. 使用 tokio::fs::File + BufReader (64KB 缓冲)
  2. 每读取 1MB → 解析为 LogEntry[] → 批量写入 tantivy
  3. 每 1000 条 commit 一次索引
  4. 更新进度 → 发送事件给前端
```

### 决策 3：格式自动检测 — 采样 + 规则匹配

```
读取文件前 100 行 (可配置) → 尝试匹配：

1. JSON Lines: 每行是不是合法 JSON？
   → 如果是，提取公共字段，自动识别 timestamp/level/message

2. CSV: 前几行逗号/制表符数量一致？
   → 如果是，提取表头

3. NGINX/Apache: 匹配正则 /^(\S+) (\S+) (\S+) \[(.*?)\]/
   → 如果是，使用 NGINX 解析器

4. Syslog: 匹配 <PRI>VERSION TIMESTAMP 格式

5. 纯文本: 以上都不匹配
   → 用户可指定自定义正则来提取字段
```

### 决策 4：为什么不内嵌 Loki/VictoriaLogs？

```
Loki (Go)  → 无法嵌入 Rust 进程，需要独立部署
VictoriaLogs → 同样问题
ELK → Java 依赖，太重

LogLens 的定位是「本地桌面工具」，不是「可观察性平台」。
需要对标的是 glogg/lnav，而不是 Grafana。
```

### 决策 5：AI 只用 Ollama，不上云

```
OpenAI API → 需要 API Key + 网络 + 数据上云（日志可能含敏感信息）
Ollama      → ✅ 本地模型，完全离线，零隐私风险

首推模型：
  - llama3.2:3b    (通用，轻量，消费级 GPU 可跑)
  - qwen2.5:7b     (中文友好)
  - deepseek-r1:8b (推理能力强，适合异常检测)
```

---

## 🚫 有意不引入的技术

| 技术 | 不用的理由 |
|---|---|
| **Electron** | 太重，Tabularis 证明 Tauri 完全够用 |
| **Elasticsearch/Loki** | 嵌入式不可能，太重 |
| **tauri-plugin-sql** | 直接用 sqlx crate 更灵活 |
| **Monaco Editor** | 日志分析不需要代码编辑器 |
| **OpenAI/云端 AI** | 日志含敏感信息，必须本地 |
| **GPU 加速渲染** | Canvas/WebGL 对日志表格无优势，DOM 虚拟滚动足够 |

---

## 📊 与 Tabularis 技术栈对比

| 组件 | Tabularis | LogLens | 差异原因 |
|---|---|---|---|
| 前端框架 | React 19 | React 19 | 一致 |
| 后端框架 | Tauri v2 | Tauri v2 | 一致 |
| 全文索引 | ❌ (SQLx FTS5) | ✅ tantivy | 日志场景需要专业全文索引 |
| 数据库驱动 | SQLx (MySQL/PG/SQLite) | ❌ 不需要 | 日志工具不连接数据库 |
| 代码编辑器 | Monaco | ❌ 不需要 | - |
| ER 图 | @xyflow/react | ❌ 不需要 | - |
| 虚拟机 | ❌ | ❌ | - |
| SSH 隧道 | russh | ❌ 不需要 | - |
| MCP Server | ✅ 自研 | 可选 (Phase 4) | 非核心功能 |
| AI 集成 | 多 Provider | 仅 Ollama | 隐私优先 |
| 关键词 | 数据库管理 | 日志分析 | - |

---

## 📦 预估依赖体积

```
前端 (Vite build):
  - React + Router + recharts: ~200KB
  - @tanstack/react-virtual: ~15KB
  - Tailwind CSS: ~20KB (purged)
  总计: ~300KB (gzipped ~80KB)

后端 (Rust build, release):
  - Tauri + tokio + serde: ~5MB
  - tantivy: ~10MB (索引引擎)
  - 其他: ~3MB
  总计: ~20MB

App 安装包: ~25-35MB (macOS .dmg)
```

对比：ELK ~500MB (仅 ES)

---

## 🔧 开发环境

```bash
# 必需工具
Node.js 22+
pnpm 10+
Rust 1.77+

# 安装依赖
pnpm install

# 启动开发模式
pnpm tauri dev

# 构建
pnpm tauri build
```
