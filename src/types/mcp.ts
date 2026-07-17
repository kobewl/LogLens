export interface McpTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpToolResult {
  content: { type: string; text: string }[]
  isError?: boolean
}
