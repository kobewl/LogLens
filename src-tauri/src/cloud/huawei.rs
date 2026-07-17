//! 华为云 LTS 直连 — 使用 REST API + AK/SK 签名
//! LTS 查询日志 API: POST /v2/{project_id}/groups/{log_group_id}/streams/{log_stream_id}/content/query

use crate::cloud::huawei_sign::{self, SignHeaders};
use crate::config::CloudCredentials;
use serde::{Deserialize, Serialize};

/// LTS 查询请求参数
#[derive(Debug, Clone, Serialize)]
pub struct LtsQueryParams {
    /// 起始时间 (毫秒时间戳字符串)
    pub start_time: String,
    /// 结束时间 (毫秒时间戳字符串)
    pub end_time: String,
    /// 关键词搜索
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<String>,
    /// 返回条数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    /// 是否倒序
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_desc: Option<bool>,
    /// 是否统计总数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_count: Option<bool>,
}

/// LTS 查询响应
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct LtsQueryResponse {
    pub logs: Option<Vec<LtsLogItem>>,
    pub count: Option<i64>,
    #[serde(rename = "isQueryComplete")]
    pub is_query_complete: Option<bool>,
}

/// 单条日志
#[derive(Debug, Clone, Deserialize)]
pub struct LtsLogItem {
    pub content: Option<String>,
    pub labels: Option<serde_json::Value>,
    pub log_time_ns: Option<String>,
}

/// 通过华为云 IAM API 自动发现指定地域的 project_id。
///
/// 接口: GET https://iam.myhuaweicloud.com/v3/projects?name={region}
/// 认证: SDK-HMAC-SHA256（与 LTS 相同的签名算法）
pub async fn discover_project_id(ak: &str, sk: &str, region: &str) -> Result<String, String> {
    // 尝试两个 IAM 端点: 先区域端点，再全局端点（区域端点对大部分账号更可靠）
    let endpoints = vec![
        format!("iam.{}.myhuaweicloud.com", region),
        "iam.myhuaweicloud.com".to_string(),
    ];

    // IAM API: URL 用不带斜杠路径，但签名用带斜杠（服务器会 normalize 为带斜杠）
    let sign_uri = "/v3/projects/";
    let url_uri  = "/v3/projects";
    let query = format!("name={}", region);

    for (idx, host) in endpoints.iter().enumerate() {
        let url = format!("https://{}{}?{}", host, url_uri, query);
        let sdk_date = huawei_sign::sdk_date();
        let headers = SignHeaders {
            content_type: None, // GET 请求无 body，不需要 Content-Type
            host: host.clone(),
            x_sdk_date: sdk_date.clone(),
        };
        let authorization = huawei_sign::sign(ak, sk, "GET", sign_uri, &query, &headers, "");

        let client = reqwest::Client::new();
        let response = match client
            .get(&url)
            .header("Authorization", &authorization)
            .header("X-Sdk-Date", &sdk_date)
            .header("Host", host.as_str())
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                if idx < endpoints.len() - 1 {
                    log::warn!("IAM 端点 {} 连接失败 ({}), 尝试下一个...", host, e);
                    continue;
                }
                return Err(format!("IAM 请求失败: {}", e));
            }
        };

        let status = response.status();
        let text = response.text().await.map_err(|e| e.to_string())?;

        if status.is_success() {
            let json: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| format!("解析 IAM 响应失败: {}", e))?;

            // 响应格式: { "projects": [{ "id": "xxx", "name": "region", ... }] }
            if let Some(project_id) = json["projects"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|p| p["id"].as_str())
            {
                return Ok(project_id.to_string());
            }

            return Err(format!(
                "IAM 响应中未找到地域 {} 的 project_id。\n\
                 请在 config.json credentials 中添加 \"project_id\": \"您的项目ID\"。\n\
                 响应内容: {}",
                region,
                truncate_str(&text, 300)
            ));
        }

        // 401/404 错误 → 尝试下一个端点（可能是端点不匹配该账号）
        if status.as_u16() == 401 || status.as_u16() == 404 {
            if idx < endpoints.len() - 1 {
                log::warn!("IAM 端点 {} 返回 {}，尝试下一个端点...", host, status.as_u16());
                continue;
            }
        }

        // 其他错误 → 直接返回
        return Err(format!(
            "IAM API 返回错误 ({})，无法自动获取 project_id。\n\
             请在 config.json 的 credentials 中手动添加 \"project_id\": \"您的项目ID\"。\n\
             获取路径: 华为云控制台 → 我的凭证 → API凭证 → 项目列表 → 找到地域 {} 对应的项目ID。\n\
             端点: {}\n\
             错误详情: {}",
            status.as_u16(),
            region,
            host,
            truncate_str(&text, 300)
        ));
    }

    // 所有端点都失败
    Err(format!(
        "所有 IAM 端点均失败，无法自动获取 project_id。\n\
         请在 config.json 的 credentials 中手动添加 \"project_id\": \"您的项目ID\"。\n\
         获取路径: 华为云控制台 → 我的凭证 → API凭证 → 项目列表 → 找到地域 {} 对应的项目ID。",
        region
    ))
}

/// 调用 LTS 查询日志 API
///
/// 若 `creds.project_id` 为空，则自动通过 IAM API 发现。
pub async fn query_logs(
    creds: &CloudCredentials,
    secret: &str,
    log_group_id: &str,
    log_stream_id: &str,
    params: &LtsQueryParams,
) -> Result<serde_json::Value, String> {
    let region = if creds.region.is_empty() { "cn-east-3" } else { &creds.region };
    let ak = &creds.access_key_id;

    // Auto-discover project_id if not provided
    let project_id_owned: String;
    let project_id = if creds.project_id.is_empty() {
        project_id_owned = discover_project_id(ak, secret, region).await?;
        &project_id_owned
    } else {
        &creds.project_id
    };

    let host = format!("lts.{}.myhuaweicloud.com", region);
    // 华为云 API Gateway 路由时不接受尾部斜杠，但签名验证时会标准化为带斜杠
    // 所以：URL 用 /content/query，签名用 /content/query/
    let url_uri = format!(
        "/v2/{}/groups/{}/streams/{}/content/query",
        project_id, log_group_id, log_stream_id
    );
    let sign_uri = format!(
        "/v2/{}/groups/{}/streams/{}/content/query/",
        project_id, log_group_id, log_stream_id
    );
    let url = format!("https://{}{}", host, url_uri);

    let body = serde_json::to_string(params).map_err(|e| format!("JSON序列化失败: {}", e))?;
    let sdk_date = huawei_sign::sdk_date();

    let headers = SignHeaders {
        content_type: Some("application/json;charset=utf8".to_string()),
        host: host.clone(),
        x_sdk_date: sdk_date.clone(),
    };

    let authorization = huawei_sign::sign(ak, secret, "POST", &sign_uri, "", &headers, &body);

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json;charset=utf8")
        .header("Host", &host)
        .header("X-Sdk-Date", &sdk_date)
        .header("Authorization", &authorization)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!("LTS API 返回错误 ({}): {}", status.as_u16(), truncate_str(&text, 500)));
    }

    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("解析响应失败: {} — body: {}", e, truncate_str(&text, 200)))?;
    Ok(value)
}

/// 测试连接：验证 AK/SK 签名是否正确
pub async fn test_connection(creds: &CloudCredentials, secret: &str) -> Result<String, String> {
    let region = if creds.region.is_empty() { "cn-east-3" } else { &creds.region };
    let project_id = &creds.project_id;
    let host = format!("lts.{}.myhuaweicloud.com", region);

    // Use a dummy group/stream ID to test auth; 400 means auth passed but IDs invalid
    let url_uri = format!(
        "/v2/{}/groups/test-group/streams/test-stream/content/query",
        project_id
    );
    let sign_uri = format!(
        "/v2/{}/groups/test-group/streams/test-stream/content/query/",
        project_id
    );
    let url = format!("https://{}{}", host, url_uri);

    let now_ms = chrono::Utc::now().timestamp_millis();
    let params = LtsQueryParams {
        start_time: (now_ms - 60000).to_string(),
        end_time: now_ms.to_string(),
        keywords: None,
        limit: Some(1),
        is_desc: Some(true),
        is_count: Some(false),
    };

    let body = serde_json::to_string(&params).map_err(|e| format!("JSON序列化失败: {}", e))?;
    let sdk_date = huawei_sign::sdk_date();

    let headers = SignHeaders {
        content_type: Some("application/json;charset=utf8".to_string()),
        host: host.clone(),
        x_sdk_date: sdk_date.clone(),
    };

    let authorization = huawei_sign::sign(
        &creds.access_key_id,
        secret,
        "POST",
        &sign_uri,
        "",
        &headers,
        &body,
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json;charset=utf8")
        .header("Host", &host)
        .header("X-Sdk-Date", &sdk_date)
        .header("Authorization", &authorization)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    if status.is_success() {
        return Ok("华为云 LTS 连接成功".to_string());
    }
    let text = response.text().await.unwrap_or_default();
    // 4xx with "LTS.0001" or group not found = auth passed, just wrong test IDs
    if status.as_u16() == 400 || text.contains("LTS.0001") || text.contains("not found") {
        Ok("华为云 LTS 认证通过 — AK/SK 有效".to_string())
    } else if status.as_u16() == 401 {
        Err("认证失败：AK/SK 错误或权限不足".to_string())
    } else {
        Err(format!("LTS 连接失败 ({}): {}", status.as_u16(), truncate_str(&text, 300)))
    }
}

fn truncate_str(s: &str, max: usize) -> String {
    if s.len() > max {
        format!("{}...", &s[..max])
    } else {
        s.to_string()
    }
}
