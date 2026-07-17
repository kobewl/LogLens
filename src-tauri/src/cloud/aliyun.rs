use crate::cloud::connector::McpClient;
use crate::config::CloudCredentials;

pub fn spawn_client(creds: &CloudCredentials, secret: &str) -> Result<McpClient, String> {
    let env = vec![
        ("ALIBABA_CLOUD_ACCESS_KEY_ID", creds.access_key_id.as_str()),
        ("ALIBABA_CLOUD_ACCESS_KEY_SECRET", secret),
        ("SLS_REGIONS", creds.region.as_str()),
    ];
    McpClient::spawn("npx", &["-y", "aliyun-sls-mcp"], &env)
}
