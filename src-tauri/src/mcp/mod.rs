pub mod activity;
pub mod install;
pub mod protocol;
pub mod server;
pub mod tools;

pub use install::{get_mcp_status, install_mcp_config};
pub use server::run_mcp_server;
