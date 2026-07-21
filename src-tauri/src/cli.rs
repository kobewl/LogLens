//! Command-line argument parsing for LogLens.

use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "loglens", version, about = "LogLens - Local log analysis tool")]
pub struct Args {
    /// Start in MCP Server mode (stdio JSON-RPC)
    #[arg(long = "mcp-server")]
    pub mcp_server: bool,

    /// MCP Server HTTP port (starts HTTP server on localhost, auto-enables --mcp-server)
    #[arg(long = "mcp-http-port")]
    pub mcp_http_port: Option<u16>,
}

impl Args {
    fn defaults() -> Self {
        Self {
            mcp_server: false,
            mcp_http_port: None,
        }
    }
}

pub fn parse() -> Args {
    Args::try_parse().unwrap_or_else(|err| {
        if matches!(
            err.kind(),
            clap::error::ErrorKind::DisplayHelp | clap::error::ErrorKind::DisplayVersion
        ) {
            err.exit();
        }
        Args::defaults()
    })
}
