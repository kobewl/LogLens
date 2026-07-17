use directories::BaseDirs;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

#[cfg(target_os = "windows")]
use directories::ProjectDirs;

#[derive(serde::Serialize, Clone)]
pub struct McpClientStatus {
    pub client_id: String,
    pub client_name: String,
    pub installed: bool,
    pub config_path: Option<String>,
    pub executable_path: String,
    pub client_type: String,
    pub manual_command: Option<String>,
}

struct McpClient {
    id: &'static str,
    name: &'static str,
    config_path: Option<PathBuf>,
    client_type: &'static str,
}

fn get_all_clients() -> Vec<McpClient> {
    let base = BaseDirs::new();

    let claude_path = {
        #[cfg(target_os = "macos")]
        {
            base.as_ref().map(|b| {
                b.home_dir()
                    .join("Library/Application Support/Claude/claude_desktop_config.json")
            })
        }
        #[cfg(target_os = "windows")]
        {
            ProjectDirs::from("", "", "Claude")
                .map(|p| p.config_dir().join("claude_desktop_config.json"))
        }
        #[cfg(target_os = "linux")]
        {
            base.as_ref()
                .map(|b| b.config_dir().join("Claude/claude_desktop_config.json"))
        }
    };

    let claude_code_path = base.as_ref().map(|b| b.home_dir().join(".claude.json"));
    let codex_path = base
        .as_ref()
        .map(|b| b.home_dir().join(".codex/config.toml"));
    let cursor_path = base.as_ref().map(|b| b.home_dir().join(".cursor/mcp.json"));
    let windsurf_path = base
        .as_ref()
        .map(|b| b.home_dir().join(".codeium/windsurf/mcp_config.json"));
    let antigravity_path = base
        .as_ref()
        .map(|b| b.home_dir().join(".gemini/antigravity/mcp_config.json"));

    vec![
        McpClient {
            id: "cursor",
            name: "Cursor",
            config_path: cursor_path,
            client_type: "file",
        },
        McpClient {
            id: "claude",
            name: "Claude Desktop",
            config_path: claude_path,
            client_type: "file",
        },
        McpClient {
            id: "claude_code",
            name: "Claude Code",
            config_path: claude_code_path,
            client_type: "command",
        },
        McpClient {
            id: "codex",
            name: "Codex CLI",
            config_path: codex_path,
            client_type: "command",
        },
        McpClient {
            id: "windsurf",
            name: "Windsurf",
            config_path: windsurf_path,
            client_type: "file",
        },
        McpClient {
            id: "antigravity",
            name: "Gemini CLI",
            config_path: antigravity_path,
            client_type: "file",
        },
    ]
}

fn is_loglens_in_mcp_servers(path: &PathBuf) -> bool {
    if !path.exists() {
        return false;
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
        .and_then(|j| j.get("mcpServers").cloned())
        .map(|s| s.get("loglens").is_some())
        .unwrap_or(false)
}

fn is_command_client_installed(path: &PathBuf) -> bool {
    if !path.exists() {
        return false;
    }
    fs::read_to_string(path)
        .map(|c| {
            c.contains("\"loglens\"")
                || c.contains("[mcp_servers.loglens]")
                || c.contains("[mcp_servers.\"loglens\"]")
        })
        .unwrap_or(false)
}

fn build_command_client_invocation(
    client_id: &str,
    exe_str: &str,
) -> Option<(String, Vec<String>)> {
    match client_id {
        "claude_code" => Some((
            "claude".to_string(),
            vec![
                "mcp".to_string(),
                "add".to_string(),
                "--scope".to_string(),
                "user".to_string(),
                "loglens".to_string(),
                exe_str.to_string(),
                "--".to_string(),
                "--mcp-server".to_string(),
            ],
        )),
        "codex" => Some((
            "codex".to_string(),
            vec![
                "mcp".to_string(),
                "add".to_string(),
                "loglens".to_string(),
                "--".to_string(),
                exe_str.to_string(),
                "--mcp-server".to_string(),
            ],
        )),
        _ => None,
    }
}

fn build_manual_command(client_id: &str, exe_str: &str) -> Option<String> {
    let (program, args) = build_command_client_invocation(client_id, exe_str)?;
    Some(format!("{} {}", program, args.join(" ")))
}

#[tauri::command]
pub async fn get_mcp_status<R: Runtime>(
    _app: AppHandle<R>,
) -> Result<Vec<McpClientStatus>, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?
        .to_string_lossy()
        .to_string();

    let clients = get_all_clients();
    let statuses = clients
        .into_iter()
        .map(|c| {
            let installed = match c.client_type {
                "command" => c
                    .config_path
                    .as_ref()
                    .map(|p| is_command_client_installed(p))
                    .unwrap_or(false),
                _ => c
                    .config_path
                    .as_ref()
                    .map(|p| is_loglens_in_mcp_servers(p))
                    .unwrap_or(false),
            };
            McpClientStatus {
                client_id: c.id.to_string(),
                client_name: c.name.to_string(),
                installed,
                config_path: c.config_path.map(|p| p.to_string_lossy().to_string()),
                executable_path: exe_path.clone(),
                client_type: c.client_type.to_string(),
                manual_command: build_manual_command(c.id, &exe_path),
            }
        })
        .collect();

    Ok(statuses)
}

#[tauri::command]
pub async fn install_mcp_config<R: Runtime>(
    _app: AppHandle<R>,
    client_id: String,
) -> Result<String, String> {
    let exe_path =
        std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_str = exe_path.to_string_lossy().to_string();

    let clients = get_all_clients();
    let client = clients
        .iter()
        .find(|c| c.id == client_id)
        .ok_or_else(|| format!("Unknown client: {}", client_id))?;

    if client.client_type == "command" {
        let (program, args) = build_command_client_invocation(client.id, &exe_str)
            .ok_or_else(|| format!("Unsupported command client: {}", client.id))?;
        let manual_command = build_manual_command(client.id, &exe_str)
            .unwrap_or_else(|| format!("{} {}", program, args.join(" ")));
        let output = std::process::Command::new(&program)
            .args(&args)
            .output()
            .map_err(|e| {
                format!(
                    "{} CLI not found. Run manually:\n{}\n(Error: {})",
                    client.name, manual_command, e
                )
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("{} mcp add failed: {}", program, stderr));
        }

        return Ok(client.name.to_string());
    }

    // File-based clients: read-modify-write mcpServers JSON
    let config_path = client
        .config_path
        .as_ref()
        .ok_or("Could not determine config path for this OS")?;

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    if config.get("mcpServers").is_none() {
        config["mcpServers"] = json!({});
    }

    config["mcpServers"]["loglens"] = json!({
        "command": exe_str,
        "args": ["--mcp-server"]
    });

    let new_content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(config_path, new_content).map_err(|e| e.to_string())?;

    Ok(client.name.to_string())
}
