//! LAN discovery of hanzo-engine servers.
//!
//! `engines_discover` browses mDNS/DNS-SD (`_hanzo-engine._tcp.local.`, advertised
//! by `hanzo serve`) for engines on the local network. `engine_probe` GETs
//! `<url>/v1/models` to health-check a URL and list its models; it also backs
//! manual entry and engines that aren't advertising (e.g. a remote cluster head).

use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;

const SERVICE_TYPE: &str = "_hanzo-engine._tcp.local.";
const BROWSE_SECS: u64 = 3;
const PROBE_TIMEOUT: Duration = Duration::from_millis(2500);

#[derive(Serialize, Clone)]
pub struct EngineInfo {
    pub name: String,
    pub host: String,
    pub ip: String,
    pub port: u16,
    pub models: Vec<String>,
    pub version: Option<String>,
    pub latency_ms: Option<u64>,
    pub base_url: String,
}

fn base_url(ip: &str, port: u16) -> String {
    format!("http://{ip}:{port}/v1")
}

#[tauri::command]
pub async fn engines_discover() -> Result<Vec<EngineInfo>, String> {
    tokio::task::spawn_blocking(browse)
        .await
        .map_err(|e| e.to_string())?
}

fn browse() -> Result<Vec<EngineInfo>, String> {
    let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
    let recv = daemon.browse(SERVICE_TYPE).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(BROWSE_SECS);
    let mut found: HashMap<String, EngineInfo> = HashMap::new();

    while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
        match recv.recv_timeout(remaining) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let name = info
                    .get_fullname()
                    .split('.')
                    .next()
                    .unwrap_or(info.get_fullname())
                    .to_string();
                let ip = info
                    .get_addresses_v4()
                    .into_iter()
                    .min()
                    .map(|a: Ipv4Addr| a.to_string())
                    .unwrap_or_default();
                let port = info
                    .get_property_val_str("port")
                    .and_then(|p| p.parse().ok())
                    .unwrap_or_else(|| info.get_port());
                let models = info
                    .get_property_val_str("models")
                    .filter(|m| !m.is_empty())
                    .map(|m| m.split(',').map(str::to_string).collect())
                    .unwrap_or_default();
                found.insert(
                    name.clone(),
                    EngineInfo {
                        base_url: base_url(&ip, port),
                        name,
                        host: info.get_hostname().trim_end_matches('.').to_string(),
                        ip,
                        port,
                        models,
                        version: info.get_property_val_str("v").map(str::to_string),
                        latency_ms: None,
                    },
                );
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }

    let _ = daemon.shutdown();
    let mut engines: Vec<EngineInfo> = found.into_values().collect();
    engines.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(engines)
}

#[tauri::command]
pub async fn engine_probe(url: String) -> Result<EngineInfo, String> {
    let base = url.trim().trim_end_matches('/');
    let base = base.strip_suffix("/v1").unwrap_or(base);
    let (host, port) = host_port(base);

    let client = reqwest::Client::builder()
        .timeout(PROBE_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;

    let start = Instant::now();
    let resp = client
        .get(format!("{base}/v1/models"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let latency_ms = start.elapsed().as_millis() as u64;

    if !resp.status().is_success() {
        return Err(format!("engine returned HTTP {}", resp.status().as_u16()));
    }
    let body: ModelsResponse = resp.json().await.map_err(|e| e.to_string())?;
    let models = body
        .data
        .into_iter()
        .map(|m| m.id)
        .filter(|id| id != "default")
        .collect();

    Ok(EngineInfo {
        name: host.clone(),
        host: host.clone(),
        ip: host.clone(),
        port,
        models,
        version: None,
        latency_ms: Some(latency_ms),
        base_url: format!("{base}/v1"),
    })
}

fn host_port(base: &str) -> (String, u16) {
    let authority = base
        .strip_prefix("http://")
        .or_else(|| base.strip_prefix("https://"))
        .unwrap_or(base);
    let authority = authority.split('/').next().unwrap_or(authority);
    match authority.rsplit_once(':') {
        Some((h, p)) => (h.to_string(), p.parse().unwrap_or(1234)),
        None => (authority.to_string(), 1234),
    }
}

#[derive(serde::Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(serde::Deserialize)]
struct ModelEntry {
    id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_host_and_port() {
        assert_eq!(host_port("http://10.0.0.144:1240"), ("10.0.0.144".into(), 1240));
        assert_eq!(host_port("https://engine.local:8000"), ("engine.local".into(), 8000));
        assert_eq!(host_port("http://localhost"), ("localhost".into(), 1234));
    }

    #[test]
    fn parses_models_response_dropping_default() {
        let body: ModelsResponse = serde_json::from_str(
            r#"{"object":"list","data":[{"id":"default"},{"id":"Qwen3-0.6B"}]}"#,
        )
        .unwrap();
        let ids: Vec<String> = body.data.into_iter().map(|m| m.id).filter(|id| id != "default").collect();
        assert_eq!(ids, vec!["Qwen3-0.6B".to_string()]);
    }

    // Live checks against a running `hanzo serve`. Run with a head up:
    //   HANZO_TEST_ENGINE_URL=http://localhost:1234 \
    //     cargo test -p hanzo-desktop engines -- --ignored --nocapture
    #[ignore]
    #[tokio::test]
    async fn probe_live_engine() {
        let url = std::env::var("HANZO_TEST_ENGINE_URL").unwrap_or_else(|_| "http://localhost:1240".into());
        let info = engine_probe(url).await.expect("probe failed");
        println!("probed {} -> models={:?} latency={:?}ms", info.base_url, info.models, info.latency_ms);
        assert!(!info.models.is_empty());
    }

    #[ignore]
    #[tokio::test]
    async fn discover_live_engines() {
        let engines = engines_discover().await.expect("discover failed");
        for e in &engines {
            println!("discovered {} at {} models={:?} v={:?}", e.name, e.base_url, e.models, e.version);
        }
        assert!(!engines.is_empty(), "no _hanzo-engine._tcp advertised on the LAN");
    }
}
