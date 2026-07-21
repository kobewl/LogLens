pub mod ai;
pub mod cli;
pub mod cloud;
pub mod commands;
pub mod config;
pub mod filter;
pub mod index;
pub mod mcp;
pub mod models;
pub mod parser;
pub mod paths;
pub mod stats;
pub mod stream;
pub mod updater;

use commands::AppState;
use index::IndexManager;
use mcp::install::{get_mcp_status, install_mcp_config};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// 默认 MCP HTTP 端口
const MCP_HTTP_PORT: u16 = 19527;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args = cli::parse();

    // MCP 服务器模式（stdio 或 HTTP）
    if args.mcp_server || args.mcp_http_port.is_some() {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        if let Some(port) = args.mcp_http_port {
            rt.block_on(mcp::run_mcp_server_http(port));
        } else {
            rt.block_on(mcp::run_mcp_server());
        }
        return;
    }

    // ── GUI 模式：自动启动 MCP HTTP 子进程 ──
    let mcp_child = start_mcp_http_subprocess();
    let mcp_child = Arc::new(Mutex::new(mcp_child));
    let mcp_child_clone = mcp_child.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let rt = tokio::runtime::Runtime::new().expect("runtime");
            let db = rt
                .block_on(config::init_db())
                .expect("Failed to init database");
            let state = AppState {
                index_manager: Arc::new(IndexManager::new()),
                db,
            };
            app.manage(state);
            paths::ensure_dirs().ok();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_log_file,
            commands::get_log_file_info,
            commands::search_logs,
            commands::get_log_lines,
            commands::get_log_stats,
            commands::get_log_context,
            commands::list_sessions,
            commands::get_config,
            commands::save_app_config,
            commands::test_ai_connection,
            commands::ai_analyze_logs,
            commands::ai_summarize_logs,
            commands::ai_natural_query,
            commands::test_cloud_connection,
            commands::cloud_query_logs,
            commands::save_cloud_credentials,
            commands::get_ai_providers,
            commands::get_cloud_providers,
            commands::import_cloud_config,
            commands::list_imported_projects,
            commands::get_project_aliases,
            commands::get_project_credentials,
            commands::save_project_id,
            commands::update_project_credentials,
            commands::delete_cloud_project,
            commands::create_cloud_project,
            commands::huawei_query_logs,
            commands::cloud_search_logs,
            commands::get_mcp_running_status,
            commands::get_mcp_activity,
            commands::clear_mcp_activity,
            get_mcp_status,
            install_mcp_config,
            updater::check_for_updates,
            updater::download_and_install_update,
            updater::get_installation_source,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // 启动应用并在退出时清理 MCP 子进程
    app.run(move |_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Ok(mut guard) = mcp_child_clone.lock() {
                if let Some(ref mut child) = *guard {
                    let _ = child.kill();
                    eprintln!("[LogLens] MCP 子进程已终止");
                }
            }
        }
    });
}

/// 启动 MCP HTTP 子进程（后台运行，通过 localhost 端口通信）
fn start_mcp_http_subprocess() -> Option<Child> {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[LogLens] 无法获取可执行文件路径: {}", e);
            return None;
        }
    };

    match Command::new(&exe)
        .arg("--mcp-http-port")
        .arg(MCP_HTTP_PORT.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            eprintln!(
                "[LogLens] MCP HTTP 子进程已启动 (PID {}, port {})",
                child.id(),
                MCP_HTTP_PORT
            );
            Some(child)
        }
        Err(e) => {
            eprintln!("[LogLens] 无法启动 MCP HTTP 子进程: {}", e);
            None
        }
    }
}
