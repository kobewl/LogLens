use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::{AppHandle, Manager};

// ── 数据结构 ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_notes: String,
    pub release_url: String,
    pub published_at: String,
    pub download_urls: Vec<DownloadAsset>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadAsset {
    pub name: String,
    pub url: String,
    pub size: u64,
    pub platform: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct UpdateCheckCache {
    last_checked: u64,
    last_result: Option<UpdateCheckResult>,
}

#[derive(Deserialize, Debug)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize, Debug)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

// ── 常量 ────────────────────────────────────────────────────────────────────────

const GITHUB_REPO: &str = "kobewl/LogLens";
const CACHE_DURATION_SECS: u64 = 43200; // 12 小时

// ── 安装来源检测 ────────────────────────────────────────────────────────────────

fn detect_installation_source() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        if std::env::var("SNAP").is_ok() {
            return Some("snap".to_string());
        }
        if std::env::var("FLATPAK_ID").is_ok() {
            return Some("flatpak".to_string());
        }
    }
    None
}

fn is_managed_package() -> bool {
    detect_installation_source().is_some()
}

#[tauri::command]
pub fn get_installation_source() -> Option<String> {
    detect_installation_source()
}

// ── 辅助函数 ────────────────────────────────────────────────────────────────────

fn get_cache_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("update_check_cache.json"))
}

fn parse_version(version: &str) -> Option<(u32, u32, u32)> {
    let clean = version.trim_start_matches('v');
    let parts: Vec<&str> = clean.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let major = parts[0].parse().ok()?;
    let minor = parts[1].parse().ok()?;
    let patch = parts[2].parse().ok()?;
    Some((major, minor, patch))
}

fn is_newer_version(current: &str, latest: &str) -> bool {
    match (parse_version(current), parse_version(latest)) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    }
}

async fn fetch_latest_release() -> Result<GitHubRelease, String> {
    let client = Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        GITHUB_REPO
    );

    let res = client
        .get(&url)
        .header("User-Agent", "LogLens")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("GitHub API 返回错误: {}", res.status()));
    }

    res.json::<GitHubRelease>()
        .await
        .map_err(|e| format!("解析 API 响应失败: {}", e))
}

fn categorize_asset(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.ends_with(".dmg") || lower.contains("darwin") || lower.contains("macos") {
        "macos".to_string()
    } else if lower.ends_with(".exe") || lower.ends_with(".msi") || lower.contains("windows") {
        "windows".to_string()
    } else if lower.ends_with(".appimage") || lower.ends_with(".deb") || lower.ends_with(".rpm") {
        "linux".to_string()
    } else {
        "other".to_string()
    }
}

// ── Tauri Commands ──────────────────────────────────────────────────────────────

/// 检查更新（带 12 小时缓存）
#[tauri::command]
pub async fn check_for_updates(app: AppHandle, force: bool) -> Result<UpdateCheckResult, String> {
    // 包管理器安装的版本不支持内置更新
    if is_managed_package() {
        return Err("此版本由包管理器管理，请使用系统包管理器更新。".to_string());
    }

    // 非强制模式下检查缓存
    if !force {
        if let Some(cache_path) = get_cache_path(&app) {
            if cache_path.exists() {
                if let Ok(content) = fs::read_to_string(&cache_path) {
                    if let Ok(cache) = serde_json::from_str::<UpdateCheckCache>(&content) {
                        let now = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();
                        if now - cache.last_checked < CACHE_DURATION_SECS {
                            if let Some(result) = cache.last_result {
                                if result.current_version == env!("CARGO_PKG_VERSION") {
                                    return Ok(result);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 从 GitHub API 获取最新 Release
    let release = fetch_latest_release().await?;

    let current_version = env!("CARGO_PKG_VERSION");
    let latest_version = release.tag_name.trim_start_matches('v');

    let download_urls = release
        .assets
        .into_iter()
        .map(|asset| DownloadAsset {
            name: asset.name.clone(),
            url: asset.browser_download_url,
            size: asset.size,
            platform: categorize_asset(&asset.name),
        })
        .collect();

    let result = UpdateCheckResult {
        has_update: is_newer_version(current_version, &release.tag_name),
        current_version: current_version.to_string(),
        latest_version: latest_version.to_string(),
        release_notes: release.body.unwrap_or_default(),
        release_url: release.html_url,
        published_at: release.published_at.unwrap_or_default(),
        download_urls,
    };

    // 写入缓存
    if let Some(cache_path) = get_cache_path(&app) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let cache = UpdateCheckCache {
            last_checked: timestamp,
            last_result: Some(result.clone()),
        };
        if let Ok(content) = serde_json::to_string(&cache) {
            let _ = fs::write(cache_path, content);
        }
    }

    Ok(result)
}

/// 下载并安装更新（通过 tauri-plugin-updater）
#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    let updater = app
        .updater_builder()
        .build()
        .map_err(|e| format!("无法构建更新器: {}", e))?;

    if let Some(update) = updater.check().await.map_err(|e| format!("检查更新失败: {}", e))? {
        let mut downloaded = 0u64;

        update
            .download_and_install(
                |chunk_length, content_length| {
                    downloaded += chunk_length as u64;
                    let progress = if let Some(total) = content_length {
                        if total > 0 {
                            ((downloaded as f64 / total as f64) * 100.0) as u32
                        } else {
                            0
                        }
                    } else {
                        0
                    };
                    let _ = app.emit("update-progress", progress);
                },
                || {
                    let _ = app.emit("update-installing", ());
                },
            )
            .await
            .map_err(|e| format!("下载安装失败: {}", e))?;

        // 安装完成后重启应用（此调用通常不会返回）
        app.restart();
        #[allow(unreachable_code)]
        Ok(())
    } else {
        Err("没有可用的更新".to_string())
    }
}

// ── 测试 ────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_parsing() {
        assert_eq!(parse_version("0.4.0"), Some((0, 4, 0)));
        assert_eq!(parse_version("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("invalid"), None);
        assert_eq!(parse_version("1.2"), None);
    }

    #[test]
    fn test_version_comparison() {
        assert!(is_newer_version("0.4.0", "0.5.0"));
        assert!(is_newer_version("0.4.0", "1.0.0"));
        assert!(!is_newer_version("0.4.0", "0.4.0"));
        assert!(!is_newer_version("1.0.0", "0.9.9"));
        assert!(!is_newer_version("invalid", "1.0.0"));
    }

    #[test]
    fn test_categorize_asset() {
        assert_eq!(categorize_asset("LogLens_0.4.0_x64.dmg"), "macos");
        assert_eq!(categorize_asset("LogLens_0.4.0_x64-setup.exe"), "windows");
        assert_eq!(categorize_asset("loglens_0.4.0_amd64.AppImage"), "linux");
        assert_eq!(categorize_asset("README.txt"), "other");
    }
}
