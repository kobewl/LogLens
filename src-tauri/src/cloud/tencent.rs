use crate::cloud::connector::McpClient;
use crate::config::CloudCredentials;

pub fn spawn_client(creds: &CloudCredentials, secret: &str) -> Result<McpClient, String> {
    let env = vec![
        ("TENCENTCLOUD_SECRET_ID", creds.access_key_id.as_str()),
        ("TENCENTCLOUD_SECRET_KEY", secret),
        ("TZ", "Asia/Shanghai"),
    ];
    McpClient::spawn("npx", &["-y", "cls-mcp-server@latest"], &env)
}
