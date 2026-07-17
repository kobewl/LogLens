//! 华为云 AK/SK 签名算法（SDK-HMAC-SHA256）
//! 参考: https://support.huaweicloud.com/devg-apisign/apisign-devg-pdf.pdf

use chrono::Utc;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// 签名的请求头集合
pub struct SignHeaders {
    /// Content-Type 头（GET 请求通常不需要，设为 None）
    pub content_type: Option<String>,
    pub host: String,
    pub x_sdk_date: String,
}

/// 生成当前 UTC 时间字符串 (YYYYMMDDTHHMMSSZ)
pub fn sdk_date() -> String {
    Utc::now().format("%Y%m%dT%H%M%SZ").to_string()
}

/// 对字节数组做 SHA-256 并返回小写十六进制
fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

/// HMAC-SHA256 签名
fn hmac_sha256(key: &[u8], data: &str) -> Vec<u8> {
    use sha2::Sha256;

    const BLOCK_SIZE: usize = 64;
    let mut key_padded = key.to_vec();
    if key_padded.len() > BLOCK_SIZE {
        key_padded = Sha256::digest(&key_padded).to_vec();
    }
    key_padded.resize(BLOCK_SIZE, 0);

    let ipad: Vec<u8> = key_padded.iter().map(|b| b ^ 0x36).collect();
    let opad: Vec<u8> = key_padded.iter().map(|b| b ^ 0x5c).collect();

    let inner_hash = Sha256::digest(
        [&ipad[..], data.as_bytes()].concat(),
    );
    Sha256::digest([&opad[..], &inner_hash[..]].concat()).to_vec()
}

/// 对 URI 进行编码（保留 / 不编码）
fn uri_encode(s: &str) -> String {
    let mut result = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

/// 构造规范的查询字符串（按 key 排序）
fn canonical_query_string(query: &str) -> String {
    if query.is_empty() {
        return String::new();
    }
    let mut params: BTreeMap<&str, &str> = BTreeMap::new();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            params.insert(k, v);
        } else if !pair.is_empty() {
            params.insert(pair, "");
        }
    }
    params
        .iter()
        .map(|(k, v)| format!("{}={}", uri_encode(k), uri_encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

/// 生成 Authorization 签名头
///
/// # 参数
/// - `ak`: Access Key
/// - `sk`: Secret Key
/// - `method`: HTTP 方法 (GET/POST)
/// - `uri`: 请求 URI 路径 (如 /v2/{project_id}/groups/.../content/query)
/// - `query`: 查询字符串 (不含 ?)
/// - `headers`: 请求头 (host, content-type, x-sdk-date)
/// - `body`: 请求体
pub fn sign(
    ak: &str,
    sk: &str,
    method: &str,
    uri: &str,
    query: &str,
    headers: &SignHeaders,
    body: &str,
) -> String {
    // Step 1: 构造规范请求
    let canonical_uri = uri_encode(uri);
    let canonical_query = canonical_query_string(query);

    // 请求头按小写名称排序
    let mut sorted_headers: BTreeMap<String, String> = BTreeMap::new();
    if let Some(ref ct) = headers.content_type {
        sorted_headers.insert("content-type".to_string(), ct.trim().to_lowercase());
    }
    sorted_headers.insert("host".to_string(), headers.host.trim().to_string());
    sorted_headers.insert("x-sdk-date".to_string(), headers.x_sdk_date.trim().to_string());

    let canonical_headers: String = sorted_headers
        .iter()
        .map(|(k, v)| format!("{}:{}\n", k, v))
        .collect();

    let signed_headers: String = sorted_headers
        .keys()
        .map(|k| k.as_str())
        .collect::<Vec<_>>()
        .join(";");

    let payload_hash = sha256_hex(body.as_bytes());

    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.to_uppercase(),
        canonical_uri,
        canonical_query,
        canonical_headers,
        signed_headers,
        payload_hash,
    );

    // Step 2: 创建待签字符串
    let canonical_request_hash = sha256_hex(canonical_request.as_bytes());
    let string_to_sign = format!(
        "SDK-HMAC-SHA256\n{}\n{}",
        headers.x_sdk_date, canonical_request_hash,
    );

    // Step 3: 计算签名
    // 华为云 SDK-HMAC-SHA256 直接用 SK 对 StringToSign 做一次 HMAC，不做 AWS V4 风格的 key 派生
    let signature_bytes = hmac_sha256(sk.as_bytes(), &string_to_sign);
    let signature = signature_bytes.iter().map(|b| format!("{:02x}", b)).collect::<String>();

    // Step 4: 返回 Authorization
    format!(
        "SDK-HMAC-SHA256 Access={}, SignedHeaders={}, Signature={}",
        ak, signed_headers, signature,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hmac_sha256_known_vector() {
        // RFC 4231 Test Case 1
        let key = b"key";
        let data = "The quick brown fox jumps over the lazy dog";
        let result = hmac_sha256(key, data);
        let hex: String = result.iter().map(|b| format!("{:02x}", b)).collect();
        assert_eq!(hex, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
    }

    #[test]
    fn test_sign_matches_python_sdk() {
        // 期望签名由 Python hmac.new(sk, string_to_sign, sha256).hexdigest() 算出，
        // 验证与华为云官方 Python SDK 一致（直接用 SK，不派生 key）
        let ak = "test_ak";
        let sk = "test_sk";
        let date = "20250101T000000Z";
        let headers = SignHeaders {
            content_type: Some("application/json;charset=utf8".to_string()),
            host: "lts.cn-north-4.myhuaweicloud.com".to_string(),
            x_sdk_date: date.to_string(),
        };

        let auth = sign(ak, sk, "POST", "/v2/test/groups/gid/streams/sid/content/query/", "", &headers, "{}");
        assert!(auth.starts_with("SDK-HMAC-SHA256 "));
        assert!(auth.contains("Access=test_ak"));
        assert!(
            auth.contains("Signature=0758e560dbdec3a6aadfb321b4111719be703365d86918c1b46ad454b32493b9"),
            "签名不匹配 Python SDK 参考值，实际: {auth}"
        );
    }
}
