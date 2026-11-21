//! Opening a site the way a person's browser would, from this computer.
//!
//! The agent that redesigns a site works in a sandbox with no network, so the
//! window does the opening: it fetches the page and its stylesheets and saves
//! them for the agent to read (`page.rs`). That makes this the one place a typed
//! address becomes a request, so it is strict about where a request may go.
//!
//! The rule: a site is on the internet, or it is on this computer and the
//! person typed `localhost` or a loopback address themselves. Nothing on a
//! private network (10/8, 172.16/12, 192.168/16, link-local, carrier-grade NAT,
//! IPv6 unique-local) is ever opened, and a redirect cannot take a request
//! anywhere the typed address could not. A name is resolved here, each address
//! judged, and the request pinned to the one that passed, so a name that
//! answers a private address (DNS rebinding) is refused as well.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::Duration;

use reqwest::{header, redirect, Client, Url};

/// The largest page saved, and the largest stylesheet.
pub const PAGE_LIMIT: usize = 5 * 1024 * 1024;
pub const SHEET_LIMIT: usize = 600 * 1024;

/// The longest a page, or a stylesheet, may take to arrive.
const PAGE_TIME: Duration = Duration::from_secs(15);
const SHEET_TIME: Duration = Duration::from_secs(8);

/// How many redirects are followed.
const HOPS: usize = 6;

const AGENT: &str = concat!(
    "Mozilla/5.0 (compatible; HanzoDesktop/",
    env!("CARGO_PKG_VERSION"),
    "; +https://hanzo.ai)"
);

pub const NOT_AN_ADDRESS: &str = "That is not a web address. Paste one like https://example.com.";
const NOT_WEB: &str = "Hanzo can open web addresses that start with http:// or https://.";
const HAS_LOGIN: &str = "Leave the user name and password out of the address.";
const PRIVATE: &str =
    "Hanzo opens sites on the internet, or one running on this computer. That address is on a private network.";
const NO_SITE: &str = "Hanzo could not find that site. Check the address and try again.";
const SLOW: &str = "The site took too long to answer.";
const TOO_BIG: &str = "That page is too large to open.";
const NOT_A_PAGE: &str = "That address is not a web page.";
const TOO_MANY: &str = "That address sends Hanzo around in circles.";

/// What a request brought back.
pub struct Fetched {
    /// Where it ended, after any redirects.
    pub url: Url,
    pub body: Vec<u8>,
}

/// What a person typed, as an address Hanzo may open. A bare name gets `https://`
/// (`http://` for `localhost` and loopback addresses, which rarely serve TLS).
pub fn address(raw: &str) -> Result<Url, String> {
    let text = raw.trim();
    if text.is_empty() || text.chars().any(char::is_whitespace) {
        return Err(NOT_AN_ADDRESS.into());
    }
    let full = if text.contains("://") {
        text.to_string()
    } else if local_text(text) {
        format!("http://{text}")
    } else {
        format!("https://{text}")
    };
    let url = Url::parse(&full).map_err(|_| NOT_AN_ADDRESS.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(NOT_WEB.into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(HAS_LOGIN.into());
    }
    if url.host_str().map_or(true, str::is_empty) {
        return Err(NOT_AN_ADDRESS.into());
    }
    Ok(url)
}

/// A scheme-less address that names this computer.
fn local_text(text: &str) -> bool {
    let host = text.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit_once('@').map_or(host, |(_, h)| h);
    let name = if let Some(rest) = host.strip_prefix('[') {
        rest.split(']').next().unwrap_or("")
    } else {
        host.rsplit_once(':').map_or(host, |(h, _)| h)
    };
    name.eq_ignore_ascii_case("localhost")
        || name.to_ascii_lowercase().ends_with(".localhost")
        || name.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
}

/// Whether the address names this computer: the one case a loopback request is allowed.
pub fn loopback(url: &Url) -> bool {
    let Some(host) = url.host_str() else { return false };
    let name = host.trim_start_matches('[').trim_end_matches(']');
    name.eq_ignore_ascii_case("localhost")
        || name.to_ascii_lowercase().ends_with(".localhost")
        || name.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
}

fn public4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_unspecified()
        || ip.is_multicast()
        || o[0] == 0
        || o[0] >= 240
        || (o[0] == 100 && (o[1] & 0xC0) == 64)
        || (o[0] == 192 && o[1] == 0 && o[2] == 0)
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19)))
}

fn public6(ip: Ipv6Addr) -> bool {
    let s = ip.segments();
    !(ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (s[0] & 0xfe00) == 0xfc00
        || (s[0] & 0xffc0) == 0xfe80)
}

/// Whether a request may go to `ip`: any public address, and a loopback one only
/// when the person typed a loopback address (`local`).
pub fn allowed(ip: IpAddr, local: bool) -> bool {
    let ip = match ip {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map_or(ip, IpAddr::V4),
        v4 => v4,
    };
    if ip.is_loopback() {
        return local;
    }
    match ip {
        IpAddr::V4(v4) => public4(v4),
        IpAddr::V6(v6) => public6(v6),
    }
}

/// The address a request to `url` is pinned to: the first the name resolves to that
/// `allowed` lets through. An address typed as a number has nothing to pin.
async fn pin(url: &Url, local: bool) -> Result<Option<SocketAddr>, String> {
    let host = url.host_str().ok_or(NOT_AN_ADDRESS)?;
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = bare.parse::<IpAddr>() {
        return if allowed(ip, local) { Ok(None) } else { Err(PRIVATE.into()) };
    }
    let port = url.port_or_known_default().ok_or(NOT_AN_ADDRESS)?;
    let found: Vec<SocketAddr> = tokio::net::lookup_host((bare, port))
        .await
        .map_err(|_| NO_SITE.to_string())?
        .collect();
    if found.is_empty() {
        return Err(NO_SITE.into());
    }
    found
        .into_iter()
        .find(|a| allowed(a.ip(), local))
        .map(Some)
        .ok_or_else(|| PRIVATE.to_string())
}

/// One request, redirects followed by hand so each hop is judged as the first was.
/// `local` is whether the person typed a loopback address; it never widens on a hop.
async fn get(first: &Url, local: bool, limit: usize, accept: &str, kinds: &[&str]) -> Result<Fetched, String> {
    let mut url = first.clone();
    for _ in 0..=HOPS {
        if !matches!(url.scheme(), "http" | "https") {
            return Err(NOT_WEB.into());
        }
        let pinned = pin(&url, local).await?;
        let mut client = Client::builder()
            .redirect(redirect::Policy::none())
            .user_agent(AGENT)
            .connect_timeout(Duration::from_secs(8));
        if let (Some(addr), Some(name)) = (pinned, url.host_str()) {
            client = client.resolve(name, addr);
        }
        let response = client
            .build()
            .map_err(|_| NO_SITE.to_string())?
            .get(url.clone())
            .header(header::ACCEPT, accept)
            .header(header::ACCEPT_LANGUAGE, "en;q=0.9,*;q=0.5")
            .send()
            .await
            .map_err(|e| if e.is_timeout() { SLOW.to_string() } else { NO_SITE.to_string() })?;
        let status = response.status();
        if status.is_redirection() {
            let to = response
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| url.join(v).ok())
                .ok_or_else(|| TOO_MANY.to_string())?;
            url = to;
            continue;
        }
        if !status.is_success() {
            return Err(format!("The site answered {}.", status.as_u16()));
        }
        let kind = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if !kinds.iter().any(|k| kind == *k) {
            return Err(NOT_A_PAGE.into());
        }
        if response.content_length().is_some_and(|n| n as usize > limit) {
            return Err(TOO_BIG.into());
        }
        let mut body = Vec::new();
        let mut response = response;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| if e.is_timeout() { SLOW.to_string() } else { NO_SITE.to_string() })?
        {
            if body.len() + chunk.len() > limit {
                return Err(TOO_BIG.into());
            }
            body.extend_from_slice(&chunk);
        }
        return Ok(Fetched { url, body });
    }
    Err(TOO_MANY.into())
}

/// A page: HTML only, 15 seconds, 5 MB.
pub async fn page(url: &Url) -> Result<Fetched, String> {
    let local = loopback(url);
    tokio::time::timeout(
        PAGE_TIME,
        get(url, local, PAGE_LIMIT, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", &["text/html", "application/xhtml+xml"]),
    )
    .await
    .map_err(|_| SLOW.to_string())?
}

/// A stylesheet of that page: CSS only, 8 seconds, 600 KB. `local` is the page's own.
pub async fn sheet(url: &Url, local: bool) -> Result<Fetched, String> {
    tokio::time::timeout(SHEET_TIME, get(url, local, SHEET_LIMIT, "text/css,*/*;q=0.1", &["text/css"]))
        .await
        .map_err(|_| SLOW.to_string())?
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    use super::*;

    #[test]
    fn a_bare_name_gets_a_scheme() {
        assert_eq!(address("example.com").unwrap().as_str(), "https://example.com/");
        assert_eq!(address("  https://example.com/a?b=1 ").unwrap().as_str(), "https://example.com/a?b=1");
        assert_eq!(address("localhost:3000").unwrap().as_str(), "http://localhost:3000/");
        assert_eq!(address("127.0.0.1:8080/x").unwrap().as_str(), "http://127.0.0.1:8080/x");
        assert_eq!(address("[::1]:9000").unwrap().as_str(), "http://[::1]:9000/");
    }

    #[test]
    fn only_web_addresses_are_opened() {
        for bad in [
            "",
            "   ",
            "file:///etc/passwd",
            "ftp://example.com",
            "javascript:alert(1)",
            "data:text/html,hi",
            "https://user:pw@example.com",
            "https://user@example.com",
            "two words",
            "https://",
        ] {
            assert!(address(bad).is_err(), "{bad} must be refused");
        }
    }

    #[test]
    fn loopback_is_the_computers_own_and_only_when_typed() {
        assert!(loopback(&address("localhost:3000").unwrap()));
        assert!(loopback(&address("http://127.0.0.1:1").unwrap()));
        assert!(loopback(&address("http://[::1]/").unwrap()));
        assert!(loopback(&address("http://app.localhost/").unwrap()));
        assert!(!loopback(&address("https://example.com").unwrap()));
        assert!(!loopback(&address("http://10.0.0.1").unwrap()));
    }

    #[test]
    fn private_networks_are_never_opened() {
        let no: [&str; 14] = [
            "10.0.0.1",
            "10.255.255.255",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",
            "224.0.0.1",
            "255.255.255.255",
            "fc00::1",
            "fe80::1",
            "::",
            "::ffff:10.0.0.1",
        ];
        for ip in no {
            let ip: IpAddr = ip.parse().unwrap();
            assert!(!allowed(ip, false) && !allowed(ip, true), "{ip} must be refused even when local");
        }
        for ip in ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:8.8.8.8"] {
            let ip: IpAddr = ip.parse().unwrap();
            assert!(allowed(ip, false), "{ip} is public");
        }
        for ip in ["127.0.0.1", "::1", "::ffff:127.0.0.1"] {
            let ip: IpAddr = ip.parse().unwrap();
            assert!(!allowed(ip, false), "{ip} needs the person to have typed it");
            assert!(allowed(ip, true));
        }
    }

    /// A server that answers each connection with the next canned response, and records the paths asked for.
    async fn serve(answers: Vec<String>) -> (SocketAddr, tokio::task::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let mut asked = Vec::new();
            for answer in answers {
                let (mut s, _) = listener.accept().await.unwrap();
                let mut buf = vec![0u8; 4096];
                let n = s.read(&mut buf).await.unwrap();
                let head = String::from_utf8_lossy(&buf[..n]).to_string();
                asked.push(head.lines().next().unwrap_or("").to_string());
                s.write_all(answer.as_bytes()).await.unwrap();
                let _ = s.shutdown().await;
            }
            asked
        });
        (addr, task)
    }

    fn ok(kind: &str, body: &str) -> String {
        format!("HTTP/1.1 200 OK\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
    }

    #[tokio::test]
    async fn a_page_on_this_computer_is_opened_when_its_address_was_typed() {
        let (addr, task) = serve(vec![ok("text/html; charset=utf-8", "<title>Hi</title>")]).await;
        let url = address(&format!("127.0.0.1:{}/a", addr.port())).unwrap();
        let got = page(&url).await.unwrap();
        assert_eq!(String::from_utf8(got.body).unwrap(), "<title>Hi</title>");
        assert_eq!(task.await.unwrap(), vec!["GET /a HTTP/1.1"]);
    }

    #[tokio::test]
    async fn a_redirect_is_followed_inside_the_same_rule() {
        let (addr, task) = serve(vec![
            "HTTP/1.1 302 Found\r\nLocation: /next\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
            ok("text/html", "<p>there</p>"),
        ])
        .await;
        let url = address(&format!("http://127.0.0.1:{}/", addr.port())).unwrap();
        let got = page(&url).await.unwrap();
        assert_eq!(got.url.path(), "/next");
        assert_eq!(task.await.unwrap(), vec!["GET / HTTP/1.1", "GET /next HTTP/1.1"]);
    }

    #[tokio::test]
    async fn a_redirect_to_a_private_network_is_refused() {
        let (addr, _task) = serve(vec![
            "HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/latest/meta-data/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
        ])
        .await;
        let url = address(&format!("http://127.0.0.1:{}/", addr.port())).unwrap();
        assert_eq!(page(&url).await.err().unwrap(), PRIVATE);
    }

    #[tokio::test]
    async fn a_public_site_cannot_send_a_request_to_this_computer() {
        // `local` is false as it is for a typed public address: a redirect to loopback is refused.
        let (addr, _task) = serve(vec![ok("text/html", "<p>secret</p>")]).await;
        let url = Url::parse(&format!("http://127.0.0.1:{}/", addr.port())).unwrap();
        let err = get(&url, false, PAGE_LIMIT, "*/*", &["text/html"]).await.err().unwrap();
        assert_eq!(err, PRIVATE);
    }

    #[tokio::test]
    async fn a_private_address_is_refused_before_anything_is_sent() {
        for typed in ["http://192.168.1.10/", "http://10.1.2.3:8080/", "http://169.254.169.254/", "http://[fc00::1]/"] {
            let url = address(typed).unwrap();
            assert_eq!(page(&url).await.err().unwrap(), PRIVATE, "{typed}");
        }
    }

    #[tokio::test]
    async fn what_is_not_a_page_is_refused() {
        let (addr, _task) = serve(vec![ok("application/pdf", "%PDF-1.4")]).await;
        let url = address(&format!("http://127.0.0.1:{}/", addr.port())).unwrap();
        assert_eq!(page(&url).await.err().unwrap(), NOT_A_PAGE);
    }

    #[tokio::test]
    async fn an_error_status_is_said_plainly() {
        let (addr, _task) = serve(vec!["HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string()]).await;
        let url = address(&format!("http://127.0.0.1:{}/", addr.port())).unwrap();
        assert_eq!(page(&url).await.err().unwrap(), "The site answered 404.");
    }

    #[tokio::test]
    async fn a_page_over_the_limit_is_refused() {
        let big = "x".repeat(PAGE_LIMIT + 1);
        let (addr, _task) = serve(vec![ok("text/html", &big)]).await;
        let url = address(&format!("http://127.0.0.1:{}/", addr.port())).unwrap();
        assert_eq!(page(&url).await.err().unwrap(), TOO_BIG);
    }

    #[tokio::test]
    async fn redirects_that_never_end_are_cut_off() {
        let again = "HTTP/1.1 302 Found\r\nLocation: /\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string();
        let (addr, _task) = serve(vec![again; HOPS + 1]).await;
        let url = address(&format!("http://127.0.0.1:{}/", addr.port())).unwrap();
        assert_eq!(page(&url).await.err().unwrap(), TOO_MANY);
    }

    #[tokio::test]
    async fn a_stylesheet_is_css_only() {
        let (addr, _task) = serve(vec![ok("text/css", "body{color:red}"), ok("text/html", "<p>no</p>")]).await;
        let css = Url::parse(&format!("http://127.0.0.1:{}/a.css", addr.port())).unwrap();
        assert_eq!(sheet(&css, true).await.unwrap().body, b"body{color:red}");
        assert_eq!(sheet(&css, true).await.err().unwrap(), NOT_A_PAGE);
    }
}
