export interface LogEntry {
  line_number: number
  timestamp?: string
  level?: string
  service?: string
  message: string
  raw: string
}

export interface LogFileInfo {
  path: string
  format: string
  line_count: number
  size_bytes: number
  time_from?: string
  time_to?: string
}

export interface LogStats {
  total_lines: number
  by_level: { level: string; count: number }[]
  by_service: { service: string; count: number }[]
  timeline: { bucket: string; count: number; errors: number }[]
}

export interface SearchResult {
  entries: LogEntry[]
  total: number
}

export interface LogFileSession {
  id: string
  path: string
  format: string
  line_count: number
  indexed_at: string
}

export interface AiConfig {
  provider: 'deepseek' | 'ollama' | 'openai'
  api_key: string
  base_url: string
  model: string
}

export interface CloudCredentials {
  provider: 'aliyun' | 'tencent' | 'huawei'
  access_key_id: string
  access_key_secret: string
  region: string
  project_id?: string
}

export interface AppConfig {
  ai: AiConfig
  cloud_credentials: CloudCredentials[]
  language: string
}

export interface AiProviderInfo {
  id: string
  name: string
  baseUrl: string
  models: string[]
  defaultModel: string
}

export interface CloudProviderInfo {
  id: string
  name: string
  tools: string[]
}

export interface CloudTestResult {
  success: boolean
  message: string
  tools: string[]
}

// ========================
// 云项目导入相关类型
// ========================

export interface CloudProjectSummary {
  name: string
  provider: string
  description: string
  alias_count: number
}

export interface ImportAlias {
  alias: string
  stream_id?: string
  logstore?: string
  description?: string
  log_stream_name?: string
}
