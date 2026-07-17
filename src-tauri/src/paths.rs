use directories::ProjectDirs;
use std::path::PathBuf;

const APP_QUALIFIER: &str = "com";
const APP_ORG: &str = "loglens";
const APP_NAME: &str = "LogLens";

pub fn get_app_data_dir() -> PathBuf {
    ProjectDirs::from(APP_QUALIFIER, APP_ORG, APP_NAME)
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| {
            std::env::current_dir().unwrap_or_default().join(".loglens")
        })
}

pub fn get_index_dir() -> PathBuf {
    get_app_data_dir().join("indexes")
}

pub fn get_config_path() -> PathBuf {
    get_app_data_dir().join("config.json")
}

pub fn get_db_path() -> PathBuf {
    get_app_data_dir().join("loglens.db")
}

pub fn get_secrets_path() -> PathBuf {
    get_app_data_dir().join("secrets.json")
}

pub fn ensure_dirs() -> std::io::Result<()> {
    std::fs::create_dir_all(get_app_data_dir())?;
    std::fs::create_dir_all(get_index_dir())?;
    Ok(())
}
