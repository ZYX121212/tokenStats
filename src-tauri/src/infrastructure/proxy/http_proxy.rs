use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use anyhow::Result;
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use regex::Regex;
use serde_json::Value;
use tokio::net::TcpListener;
use tokio::sync::Semaphore;
use tracing::Instrument;
use tracing::{debug, info, info_span, warn};

use crate::application::port::NotificationPort;
use crate::domain::entity::{AppSettings, ProviderConfig, TokenUsage};
use crate::domain::repository::TokenRepository;
use crate::infrastructure::notification::SystemNotification;
use crate::infrastructure::parser::usage_parser::UsageParser;

const MAX_REQUEST_BODY_SIZE: usize = 10 * 1024 * 1024; // 10MB
const MAX_CONCURRENT_CONNECTIONS: usize = 100;
const MAX_RETRIES: u32 = 3;
const RETRYABLE_STATUS: &[u16] = &[429, 502, 503, 504];
const CIRCUIT_BREAK_THRESHOLD: u32 = 10;
const CIRCUIT_BREAK_COOLDOWN_SECS: u64 = 30;
const MAX_CONCURRENT_INFLIGHT: usize = 50;
const SEMAPHORE_TIMEOUT_SECS: u64 = 5;
const MAX_LOG_BODY_SIZE: usize = 2048; // 2KB

#[derive(Clone)]
pub struct ProxyServer<R: TokenRepository> {
    settings: AppSettings,
    repository: R,
    parser: UsageParser,
    notifier: SystemNotification,
    client: reqwest::Client,
    active_connections: Arc<AtomicUsize>,
    request_count: Arc<AtomicU64>,
    consecutive_errors: Arc<AtomicU32>,
    last_error_time: Arc<Mutex<Option<Instant>>>,
    requests_total: Arc<AtomicU64>,
    tokens_total: Arc<AtomicU64>,
    errors_total: Arc<AtomicU64>,
    total_latency_ns: Arc<AtomicU64>,
    start_instant: Instant,
    debug_log: Arc<AtomicBool>,
    mock_mode: Arc<AtomicBool>,
    semaphore: Arc<Semaphore>,
    shutdown_signal: Arc<AtomicBool>,
    cache_hits: Arc<AtomicU64>,
    db_path: String,
    last_notify_time: Arc<Mutex<Option<Instant>>>,
}

impl<R: TokenRepository> ProxyServer<R> {
    pub fn new(settings: AppSettings, repository: R, db_path: String) -> Self {
        Self {
            settings,
            repository,
            parser: UsageParser::new(),
            notifier: SystemNotification::new(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .connect_timeout(std::time::Duration::from_secs(10))
                .read_timeout(std::time::Duration::from_secs(120))
                .build()
                .unwrap(),
            active_connections: Arc::new(AtomicUsize::new(0)),
            request_count: Arc::new(AtomicU64::new(0)),
            consecutive_errors: Arc::new(AtomicU32::new(0)),
            last_error_time: Arc::new(Mutex::new(None)),
            requests_total: Arc::new(AtomicU64::new(0)),
            tokens_total: Arc::new(AtomicU64::new(0)),
            errors_total: Arc::new(AtomicU64::new(0)),
            total_latency_ns: Arc::new(AtomicU64::new(0)),
            start_instant: Instant::now(),
            debug_log: Arc::new(AtomicBool::new(false)),
            mock_mode: Arc::new(AtomicBool::new(false)),
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_INFLIGHT)),
            shutdown_signal: Arc::new(AtomicBool::new(false)),
            cache_hits: Arc::new(AtomicU64::new(0)),
            db_path,
            last_notify_time: Arc::new(Mutex::new(None)),
        }
    }

    pub fn shutdown(&self) {
        self.shutdown_signal.store(true, Ordering::SeqCst);
        info!("代理服务器已收到关闭信号");
    }

    pub fn is_shutting_down(&self) -> bool {
        self.shutdown_signal.load(Ordering::SeqCst)
    }

    pub fn active_connections(&self) -> usize {
        self.active_connections.load(Ordering::Relaxed)
    }

    pub fn uptime_secs(&self) -> u64 {
        self.start_instant.elapsed().as_secs()
    }

    pub fn total_requests(&self) -> u64 {
        self.requests_total.load(Ordering::Relaxed)
    }

    pub fn total_errors(&self) -> u64 {
        self.errors_total.load(Ordering::Relaxed)
    }

    pub fn error_rate_pct(&self) -> f64 {
        let total = self.requests_total.load(Ordering::Relaxed);
        let errors = self.errors_total.load(Ordering::Relaxed);
        if total > 0 {
            (errors as f64 / total as f64) * 100.0
        } else {
            0.0
        }
    }
}

/// Run the proxy accept loop using a pre-built server handle.
/// Prefer this over `start_proxy` when you need to retain a metrics handle
/// (e.g. to read counters via `get_diagnostics`).
pub async fn run_proxy<R: TokenRepository + 'static>(server: Arc<ProxyServer<R>>) -> Result<()> {
    server
        .debug_log
        .store(server.settings.debug_log, Ordering::Relaxed);
    server
        .mock_mode
        .store(server.settings.mock_mode, Ordering::Relaxed);
    let proxy_host: std::net::IpAddr = server
        .settings
        .proxy_host
        .parse()
        .unwrap_or_else(|_| std::net::IpAddr::from([127, 0, 0, 1]));
    let addr = SocketAddr::new(proxy_host, server.settings.proxy_port);
    let listener = TcpListener::bind(addr).await?;
    info!("代理服务器启动于 http://{}", addr);

    loop {
        if server.is_shutting_down() {
            info!("代理服务器正在关闭，停止接受新连接...");
            break;
        }

        let circuit_tripped = {
            let errors = server.consecutive_errors.load(Ordering::Relaxed);
            if errors >= CIRCUIT_BREAK_THRESHOLD {
                let mut last_err = server.last_error_time.lock().unwrap();
                if let Some(t) = *last_err {
                    if t.elapsed().as_secs() < CIRCUIT_BREAK_COOLDOWN_SECS {
                        warn!(
                            "断路器开启！连续 {} 次错误，冷却 {} 秒",
                            errors, CIRCUIT_BREAK_COOLDOWN_SECS
                        );
                        true
                    } else {
                        server.consecutive_errors.store(0, Ordering::Relaxed);
                        *last_err = None;
                        info!("断路器冷却期已过，重置断路器");
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        };
        if circuit_tripped {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            continue;
        }

        let (stream, _) = listener.accept().await?;

        // 检查并发连接数是否超过上限
        if server.active_connections.load(Ordering::Relaxed) >= MAX_CONCURRENT_CONNECTIONS {
            warn!(
                "达到并发连接上限 ({})，暂时拒绝新连接",
                MAX_CONCURRENT_CONNECTIONS
            );
            drop(stream);
            continue;
        }

        let io = TokioIo::new(stream);
        let server = server.clone();

        tokio::task::spawn(async move {
            // 连接开始：增加活跃连接计数
            server.active_connections.fetch_add(1, Ordering::Relaxed);

            let server_for_request = server.clone();
            let service = service_fn(move |req| {
                let server = server_for_request.clone();
                async move { handle_request(req, server).await }
            });

            if let Err(err) = http1::Builder::new()
                .preserve_header_case(true)
                .title_case_headers(true)
                .serve_connection(io, service)
                .await
            {
                warn!("连接错误: {}", err);
            }

            // 连接结束：减少活跃连接计数
            server.active_connections.fetch_sub(1, Ordering::Relaxed);
        });
    }

    Ok(())
}

async fn handle_request<R: TokenRepository>(
    req: Request<Incoming>,
    server: Arc<ProxyServer<R>>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let path = req.uri().path().to_string();
    let method = req.method().clone();

    let request_id = server.request_count.fetch_add(1, Ordering::Relaxed) + 1;
    let start_time = Instant::now();

    let span = info_span!(
        "handle_request",
        request_id = request_id,
        method = %method,
        path = %path,
    );

    async move {
        if path == "/health" || path == "/ping" {
            return handle_health_check(request_id, &method, &path, &server).await;
        }

        if path == "/metrics" {
            return handle_metrics(request_id, &server).await;
        }

        if path == "/status" {
            return handle_status(request_id, &server).await;
        }

        let permit = match tokio::time::timeout(
            std::time::Duration::from_secs(SEMAPHORE_TIMEOUT_SECS),
            server.semaphore.acquire()
        ).await {
            Ok(Ok(permit)) => permit,
            Ok(Err(_)) => {
                warn!("[{}] 信号量已关闭", request_id);
                return Ok(build_error_response("服务不可用"));
            }
            Err(_) => {
                warn!("[{}] 并发请求过多，等待许可超时 ({}s)", request_id, SEMAPHORE_TIMEOUT_SECS);
                return Ok(Response::builder()
                    .status(StatusCode::SERVICE_UNAVAILABLE)
                    .header("Content-Type", "application/json")
                    .header("Retry-After", SEMAPHORE_TIMEOUT_SECS.to_string())
                    .body(Full::new(Bytes::from(serde_json::json!({
                        "error": {
                            "message": "服务器繁忙，请稍后重试",
                            "type": "overloaded"
                        }
                    }).to_string())))
                    .unwrap());
            }
        };

        let provider = extract_provider(&path, &server.settings);

        let (parts, body) = req.into_parts();
        let body_bytes = match body.collect().await {
            Ok(collected) => {
                let bytes = collected.to_bytes();
                if bytes.len() > MAX_REQUEST_BODY_SIZE {
                    warn!("[{}] 请求体过大: {} bytes (限制: {} bytes)", request_id, bytes.len(), MAX_REQUEST_BODY_SIZE);
                    server.errors_total.fetch_add(1, Ordering::Relaxed);
                    drop(permit);
                    return Ok(build_error_response("请求体过大，最大允许 10MB"));
                }
                bytes
            }
            Err(e) => {
                warn!("[{}] 读取请求体失败: {}", request_id, e);
                server.errors_total.fetch_add(1, Ordering::Relaxed);
                drop(permit);
                return Ok(build_error_response("读取请求体失败"));
            }
        };

        let request_json: Option<Value> = serde_json::from_slice(&body_bytes).ok();

    if server.debug_log.load(Ordering::Relaxed) {
        let log_body = mask_sensitive_headers(&parts, &body_bytes);
        debug!("[{}] 请求体 (脱敏): {}", request_id, log_body);
    }

    if server.mock_mode.load(Ordering::Relaxed) {
        debug!("[{}] Mock 模式启用，返回假响应", request_id);
        let model_name = request_json
            .as_ref()
            .and_then(|v| v.get("model"))
            .and_then(|m| m.as_str())
            .unwrap_or("unknown")
            .to_string();

        let mock_response = build_mock_response(&model_name, &provider.name);

        if let Some(ref req_json) = request_json {
            if let Some(usage) = server.parser.parse_usage(&provider.name, Some(req_json), &mock_response) {
                if let Err(e) = server.repository.record(&usage) {
                    warn!("记录 Token 使用失败: {}", e);
                }
            }
        }

        drop(permit);
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(Full::new(Bytes::from(mock_response.to_string())))
            .unwrap());
    }

        let upstream_url = match build_upstream_url(&path, &provider) {
            Some(url) => url,
            None => {
                warn!("[{}] {} {} → 无法解析上游 URL", request_id, method, path);
                server.errors_total.fetch_add(1, Ordering::Relaxed);
                return Ok(build_error_response("无法解析上游 URL"));
            }
        };

        info!(
            "[{}] {} {} → {} (body: {} bytes)",
            request_id,
            method,
            path,
            upstream_url,
            body_bytes.len()
        );

        let mut upstream_req = server.client.request(
            reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
            &upstream_url,
        );

        for (key, value) in &parts.headers {
            if key.as_str() != "host" {
                if let Ok(header_value) = reqwest::header::HeaderValue::from_bytes(value.as_bytes()) {
                    upstream_req = upstream_req.header(key.as_str(), header_value);
                }
            }
        }

        upstream_req = upstream_req.body(body_bytes.to_vec());

        let upstream_res = {
            let mut result: Option<reqwest::Response> = None;

            for attempt in 0..MAX_RETRIES {
                let req_to_send = upstream_req.try_clone();

                match req_to_send {
                    Some(req) => match req.send().await {
                        Ok(resp) => {
                            let status = resp.status().as_u16();
                            if RETRYABLE_STATUS.contains(&status) && attempt < MAX_RETRIES - 1 {
                                warn!(
                                    "[{}] 上游返回 {}，重试 {}/{}",
                                    request_id, status, attempt + 1, MAX_RETRIES
                                );
                                let backoff_ms = 200u64 * (1u64 << attempt.min(3));
                                tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                                continue;
                            }
                            result = Some(resp);
                            break;
                        }
                        Err(e) if attempt < MAX_RETRIES - 1 => {
                            warn!(
                                "[{}] 连接错误: {}，重试 {}/{}",
                                request_id, e, attempt + 1, MAX_RETRIES
                            );
                            let backoff_ms = 200u64 * (1u64 << attempt.min(3));
                            tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                            continue;
                        }
                        Err(e) => {
                            warn!("[{}] 上游请求失败 (最终): {}", request_id, e);
                            server.errors_total.fetch_add(1, Ordering::Relaxed);
                            return Ok(build_error_response(&format!("上游请求失败: {}", e)));
                        }
                    },
                    None => {
                        warn!("[{}] 无法克隆请求，跳过重试", request_id);
                        break;
                    }
                }
            }

            match result {
                Some(res) => res,
                None => {
                    server.errors_total.fetch_add(1, Ordering::Relaxed);
                    return Ok(build_error_response("上游请求失败：所有重试均未成功"));
                }
            }
        };

        let status = upstream_res.status();
        let is_stream = upstream_res
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .map(|ct| ct.contains("text/event-stream"))
            .unwrap_or(false);

        let mut response_headers = Vec::new();
        for (key, value) in upstream_res.headers() {
            if let Ok(header_value) = hyper::header::HeaderValue::from_bytes(value.as_bytes()) {
                response_headers.push((key.as_str().to_string(), header_value));
            }
        }

        let response_bytes = match upstream_res.bytes().await {
            Ok(bytes) => bytes,
            Err(e) => {
                warn!("读取响应失败: {}", e);
                server.errors_total.fetch_add(1, Ordering::Relaxed);
                return Ok(build_error_response("读取响应失败"));
            }
        };

        let mut tokens_recorded: u64 = 0;
        let model_name = provider.name.clone();

        if status.is_success() {
            if is_stream {
                debug!("检测到 SSE 流式响应，大小: {} bytes", response_bytes.len());

                let parse_span = info_span!("parse_stream", request_id = request_id);
                let text = String::from_utf8_lossy(&response_bytes);
                let chunks = async { server.parser.parse_stream_chunk(&text) }.instrument(parse_span).await;

                if let Some(usage) = server.parser.extract_usage_from_stream(&chunks) {
                    let usage = TokenUsage {
                        provider: provider.name.clone(),
                        source: Some("proxy".to_string()),
                        ..usage
                    };
                    tokens_recorded = usage.total_tokens;

                    let db_span = info_span!("db_write", operation = "record_token_event", request_id = request_id, model = %usage.model);
                    async {
                        if let Err(e) = server.repository.record(&usage) {
                            server.errors_total.fetch_add(1, Ordering::Relaxed);
                            warn!("记录 Token 使用失败: {}", e);
                        }
                    }.instrument(db_span).await;
                }
            } else if let Ok(response_json) = serde_json::from_slice::<Value>(&response_bytes) {
                    let parse_span = info_span!("parse_usage", request_id = request_id);
                    let usage_result = async {
                        server
                            .parser
                            .parse_usage(&provider.name, request_json.as_ref(), &response_json)
                    }.instrument(parse_span).await;

                    if let Some(mut usage) = usage_result {
                        usage.source = Some("proxy".to_string());
                        tokens_recorded = usage.total_tokens;

                        let db_span = info_span!("db_write", operation = "record_token_event", request_id = request_id, model = %usage.model);
                        async {
                            if let Err(e) = server.repository.record(&usage) {
                                server.errors_total.fetch_add(1, Ordering::Relaxed);
                                warn!("记录 Token 使用失败: {}", e);
                            }
                        }.instrument(db_span).await;
                    }
            }
        }

        let mut response = Response::builder().status(
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK),
        );

        for (key, value) in response_headers {
            response = response.header(key, value);
        }

        if is_stream {
            response = response.header("transfer-encoding", "chunked");
            debug!("已为 SSE 响应添加 Transfer-Encoding: chunked 头");
        }

        let status_code = StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK);
        let response_size = response_bytes.len();
        let latency_ms = start_time.elapsed().as_millis() as u64;

        server.requests_total.fetch_add(1, Ordering::Relaxed);
        server.tokens_total.fetch_add(tokens_recorded, Ordering::Relaxed);
        server.total_latency_ns.fetch_add(start_time.elapsed().as_nanos() as u64, Ordering::Relaxed);

        // Check 5-minute token threshold for notification (with 5-min cooldown)
        if tokens_recorded > 0 && server.settings.enable_notifications {
            if let Ok(snapshot) = server.repository.snapshot() {
                if snapshot.five_min_tokens >= server.settings.alert_threshold_5m {
                    let now = Instant::now();
                    let should_notify = {
                        let last_notify = server.last_notify_time.lock().unwrap();
                        last_notify.is_none_or(|t| now.duration_since(t).as_secs() >= 300)
                    };
                    if should_notify {
                        *server.last_notify_time.lock().unwrap() = Some(now);
                        server.notifier.warn(
                            "TokenStats 告警",
                            &format!("5 分钟内 Token 使用量已达 {}，超过阈值 {}", snapshot.five_min_tokens, server.settings.alert_threshold_5m),
                        );
                    }
                }
            }
        }

        info!(
            request_id = request_id,
            model = %model_name,
            status_code = status_code.as_u16(),
            tokens = tokens_recorded,
            latency_ms = latency_ms,
            "[{}] ← {} ({} bytes, {}ms)",
            request_id,
            status_code.as_u16(),
            response_size,
            latency_ms
        );

        if status_code.is_success() || status_code.as_u16() == 429 {
            server.consecutive_errors.store(0, Ordering::Relaxed);
        } else {
            let errors = server.consecutive_errors.fetch_add(1, Ordering::Relaxed) + 1;
            *server.last_error_time.lock().unwrap() = Some(Instant::now());
            if errors >= CIRCUIT_BREAK_THRESHOLD {
                warn!(
                    "[{}] 连续错误计数: {}/{} (达到断路器阈值)",
                    request_id, errors, CIRCUIT_BREAK_THRESHOLD
                );
            }
        }

        if server.debug_log.load(Ordering::Relaxed) {
            let log_response = truncate_body_for_log(&response_bytes);
            debug!("[{}] 响应体 (截断): {}", request_id, log_response);
        }

        drop(permit);

        Ok(response
            .body(Full::new(response_bytes))
            .unwrap_or_else(|_| build_error_response("构建响应失败")))
    }.instrument(span).await
}

fn extract_provider(path: &str, settings: &AppSettings) -> ProviderConfig {
    let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    let provider_name = parts.first().unwrap_or(&"unknown");

    let matching_providers: Vec<&ProviderConfig> = settings
        .providers
        .iter()
        .filter(|p| p.name.to_lowercase() == provider_name.to_lowercase())
        .collect();

    if matching_providers.is_empty() {
        return ProviderConfig {
            name: provider_name.to_string(),
            base_url: String::new(),
            api_key: String::new(),
            weight: 1,
        };
    }

    if matching_providers.len() == 1 {
        return (*matching_providers[0]).clone();
    }

    let total_weight: u32 = matching_providers.iter().map(|p| p.weight).sum();
    if total_weight == 0 {
        return (*matching_providers[0]).clone();
    }

    let counter = RR_COUNTER.fetch_add(1, Ordering::Relaxed) % total_weight;
    let mut cumulative_weight = 0u32;

    for provider in &matching_providers {
        cumulative_weight += provider.weight;
        if counter < cumulative_weight {
            return (*provider).clone();
        }
    }

    (*matching_providers.last().unwrap()).clone()
}

static RR_COUNTER: AtomicU32 = AtomicU32::new(0);

fn build_upstream_url(path: &str, provider: &ProviderConfig) -> Option<String> {
    if provider.base_url.is_empty() {
        return None;
    }

    let path_parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    let api_path = if path_parts.len() > 1 {
        path_parts[1..].join("/")
    } else {
        path.trim_start_matches('/').to_string()
    };

    let base = provider.base_url.trim_end_matches('/');
    let suffix = format!("/{}", api_path);

    Some(format!("{}{}", base, suffix))
}

fn build_error_response(message: &str) -> Response<Full<Bytes>> {
    let safe_msg = safe_error_message(message);
    let body = serde_json::json!({
        "error": {
            "message": safe_msg,
            "type": "proxy_error"
        }
    });

    Response::builder()
        .status(StatusCode::BAD_GATEWAY)
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(body.to_string())))
        .unwrap()
}

/// 对内部错误消息进行脱敏处理，避免暴露敏感信息（如 URL、IP 地址等）
fn safe_error_message(internal_msg: &str) -> &'static str {
    let msg = internal_msg.to_lowercase();

    if msg.contains("timeout") || msg.contains("timed out") {
        return "上游服务响应超时";
    }
    if msg.contains("connect") || msg.contains("connection") {
        return "无法连接到上游服务";
    }
    if msg.contains("dns") || msg.contains("resolve") {
        return "DNS 解析失败";
    }
    if msg.contains("refused") {
        return "上游服务拒绝连接";
    }
    if msg.contains("请求体过大") || msg.contains("10mb") {
        return "请求体过大，最大允许 10MB";
    }
    if msg.contains("读取请求体失败") {
        return "读取请求体失败";
    }
    if msg.contains("读取响应失败") || msg.contains("构建响应失败") {
        return "响应处理失败";
    }
    if msg.contains("无法解析上游 url") || msg.contains("无法解析请求路径") {
        return "请求路径无效";
    }

    // 默认返回通用错误消息
    "请求处理失败，请稍后重试"
}

/// 脱敏请求体中的敏感信息（Authorization、x-api-key、bearer token 等）
fn mask_sensitive_headers(parts: &http::request::Parts, body: &Bytes) -> String {
    let mut log_body = String::from_utf8_lossy(body).to_string();

    let auth_patterns = [
        (
            r#""authorization"\s*:\s*"[^"]*""#,
            r#""authorization": "***MASKED***""#,
        ),
        (
            r#""Authorization"\s*:\s*"[^"]*""#,
            r#""Authorization": "***MASKED***""#,
        ),
        (
            r#"'authorization'\s*:\s*'[^']*'"#,
            r#"'authorization': '***MASKED***'"#,
        ),
        (
            r#"'Authorization'\s*:\s*'[^']*'"#,
            r#"'Authorization': '***MASKED***'"#,
        ),
        (
            r#""x-api-key"\s*:\s*"[^"]*""#,
            r#""x-api-key": "***MASKED***""#,
        ),
        (
            r#""X-Api-Key"\s*:\s*"[^"]*""#,
            r#""X-Api-Key": "***MASKED***""#,
        ),
        (r#"(?i)(Bearer\s+)[^\s"']+""#, "$1***MASKED***"),
        (r#"(?i)(sk-)[a-zA-Z0-9_-]+"#, "${1}***MASKED***"),
    ];

    for (pattern, replacement) in &auth_patterns {
        if let Ok(re) = Regex::new(pattern) {
            log_body = re.replace_all(&log_body, *replacement).to_string();
        }
    }

    if let Some(_auth_val) = parts.headers.get("authorization") {
        debug!("Authorization header 已脱敏: 原始值已替换为 ***MASKED***");
    }

    log_body
}

/// 截断响应体用于日志记录（超过 2KB 时截断）
fn truncate_body_for_log(body: &Bytes) -> String {
    let body_str = String::from_utf8_lossy(body);

    if body_str.len() > MAX_LOG_BODY_SIZE {
        format!(
            "{}... [截断: 总计 {} bytes, 显示前 {} bytes]",
            &body_str[..MAX_LOG_BODY_SIZE],
            body_str.len(),
            MAX_LOG_BODY_SIZE
        )
    } else {
        body_str.to_string()
    }
}

/// 构造 Mock 响应（OpenAI 格式）
fn build_mock_response(model_name: &str, provider_name: &str) -> Value {
    serde_json::json!({
        "id": "chatcmpl-mock",
        "object": "chat.completion",
        "created": chrono::Utc::now().timestamp(),
        "model": model_name,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "[MOCK] This is a simulated response from TokenStats proxy in mock mode."
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "total_tokens": 150
        },
        "provider": provider_name
    })
}

async fn handle_health_check(
    request_id: u64,
    method: &hyper::Method,
    path: &str,
    server: &ProxyServer<impl TokenRepository>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let total_requests = server.request_count.load(Ordering::Relaxed);
    let health_body = serde_json::json!({
        "status": "ok",
        "service": "tokenstats-proxy",
        "total_requests": total_requests,
    });
    info!("[{}] {} {} → 健康检查", request_id, method, path);
    Ok(hyper::Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(health_body.to_string())))
        .unwrap())
}

async fn handle_metrics(
    request_id: u64,
    server: &ProxyServer<impl TokenRepository>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let uptime_secs = server.start_instant.elapsed().as_secs();
    let avg_latency_ns = {
        let total = server.total_latency_ns.load(Ordering::Relaxed);
        let count = server.requests_total.load(Ordering::Relaxed);
        if count > 0 {
            total / count
        } else {
            0
        }
    };

    let metrics_body = serde_json::json!({
        "metrics": {
            "requests_total": server.requests_total.load(Ordering::Relaxed),
            "tokens_total": server.tokens_total.load(Ordering::Relaxed),
            "errors_total": server.errors_total.load(Ordering::Relaxed),
            "active_connections": server.active_connections.load(Ordering::Relaxed),
            "avg_latency_ns": avg_latency_ns,
            "uptime_seconds": uptime_secs,
        }
    });
    info!("[{}] → /metrics", request_id);
    Ok(Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(metrics_body.to_string())))
        .unwrap())
}

#[tracing::instrument(skip(server), fields(request_id = request_id))]
async fn handle_status<R: TokenRepository>(
    request_id: u64,
    server: &Arc<ProxyServer<R>>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let uptime_secs = server.start_instant.elapsed().as_secs();
    let active_connections = server.active_connections.load(Ordering::Relaxed);
    let requests_total = server.requests_total.load(Ordering::Relaxed);
    let errors_total = server.errors_total.load(Ordering::Relaxed);
    let cache_hits = server.cache_hits.load(Ordering::Relaxed);

    let errors = server.consecutive_errors.load(Ordering::Relaxed);
    let circuit_break_open = if errors >= CIRCUIT_BREAK_THRESHOLD {
        if let Some(last_err) = *server.last_error_time.lock().unwrap() {
            last_err.elapsed().as_secs() < CIRCUIT_BREAK_COOLDOWN_SECS
        } else {
            false
        }
    } else {
        false
    };

    let db_size_bytes = std::fs::metadata(&server.db_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let status_body = serde_json::json!({
        "uptime_secs": uptime_secs,
        "active_connections": active_connections,
        "requests_total": requests_total,
        "errors_total": errors_total,
        "cache_hits": cache_hits,
        "db_size_bytes": db_size_bytes,
        "circuit_break_open": circuit_break_open
    });

    info!("[{}] {} → 状态检查", request_id, "/status");
    Ok(hyper::Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(status_body.to_string())))
        .unwrap())
}
