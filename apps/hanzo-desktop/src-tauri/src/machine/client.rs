use std::path::{Path, PathBuf};

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::client::conn::http1;
use hyper::{Method, Request, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use thiserror::Error;
use tokio::net::UnixStream;
use tokio::sync::mpsc;

use super::socket::machined_socket_path;
use super::types::{ExecFrame, ExecStream, Health, Machine, MachineEvent, MachineSpec};

#[derive(Debug, Error)]
pub enum MachinedError {
    #[error("connect {path}: {source}")]
    Connect {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("handshake: {0}")]
    Handshake(hyper::Error),
    #[error("send request: {0}")]
    Send(hyper::Error),
    #[error("read body: {0}")]
    Body(hyper::Error),
    #[error("build request: {0}")]
    Http(#[from] hyper::http::Error),
    #[error("not found")]
    NotFound,
    #[error("daemon error {status}: {body}")]
    Daemon { status: u16, body: String },
    #[error("decode: {0}")]
    Decode(#[from] serde_json::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

/// HTTP/JSON client over the `hanzo-machined` UNIX socket. Each call opens a
/// fresh HTTP/1 connection — short-lived requests don't justify pooling, and
/// streaming endpoints keep a connection alive for their own duration.
#[derive(Debug, Clone)]
pub struct MachinedClient {
    socket: PathBuf,
}

impl MachinedClient {
    pub fn new() -> Self {
        Self { socket: machined_socket_path() }
    }

    pub fn with_socket(path: impl Into<PathBuf>) -> Self {
        Self { socket: path.into() }
    }

    pub fn socket_path(&self) -> &Path {
        &self.socket
    }

    pub async fn health(&self) -> Result<Health, MachinedError> {
        self.get_json("/v1/health").await
    }

    pub async fn list(&self) -> Result<Vec<Machine>, MachinedError> {
        self.get_json("/v1/machines").await
    }

    pub async fn get(&self, name: &str) -> Result<Machine, MachinedError> {
        self.get_json(&format!("/v1/machines/{}", name)).await
    }

    pub async fn create(&self, spec: &MachineSpec) -> Result<Machine, MachinedError> {
        self.send_json(Method::POST, "/v1/machines", Some(spec))
            .await
    }

    pub async fn start(&self, name: &str) -> Result<(), MachinedError> {
        self.send_empty(Method::POST, &format!("/v1/machines/{}/start", name))
            .await
    }

    pub async fn stop(&self, name: &str) -> Result<(), MachinedError> {
        self.send_empty(Method::POST, &format!("/v1/machines/{}/stop", name))
            .await
    }

    pub async fn delete(&self, name: &str) -> Result<(), MachinedError> {
        self.send_empty(Method::DELETE, &format!("/v1/machines/{}", name))
            .await
    }

    /// Execute a command inside the machine and forward chunked-JSON frames to
    /// the caller via an `mpsc` receiver. The receiver closes when the daemon
    /// emits `{"exit":N}` or the underlying connection ends.
    pub async fn exec_stream(
        &self,
        name: &str,
        cmd: &[String],
    ) -> Result<mpsc::Receiver<Result<ExecFrame, MachinedError>>, MachinedError> {
        let body = serde_json::json!({ "cmd": cmd });
        let res = self
            .raw_request(
                Method::POST,
                &format!("/v1/machines/{}/exec", name),
                Some(serde_json::to_vec(&body)?.into()),
            )
            .await?;
        check_status(&res)?;

        let (tx, rx) = mpsc::channel::<Result<ExecFrame, MachinedError>>(32);
        tokio::spawn(stream_ndjson(res, tx));
        Ok(rx)
    }

    /// Subscribe to the daemon's SSE state-change feed. Returns an `mpsc`
    /// receiver that closes when the connection terminates.
    pub async fn events_sse(
        &self,
    ) -> Result<mpsc::Receiver<Result<MachineEvent, MachinedError>>, MachinedError> {
        let res = self
            .raw_request(Method::GET, "/v1/machines/events", None)
            .await?;
        check_status(&res)?;

        let (tx, rx) = mpsc::channel::<Result<MachineEvent, MachinedError>>(32);
        tokio::spawn(stream_sse(res, tx));
        Ok(rx)
    }

    // ---- internals ----------------------------------------------------------

    async fn get_json<T: DeserializeOwned>(&self, path: &str) -> Result<T, MachinedError> {
        let res = self.raw_request(Method::GET, path, None).await?;
        let bytes = consume(res).await?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    async fn send_json<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
    ) -> Result<T, MachinedError> {
        let payload = match body {
            Some(b) => Some(Bytes::from(serde_json::to_vec(b)?)),
            None => None,
        };
        let res = self.raw_request(method, path, payload).await?;
        let bytes = consume(res).await?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    async fn send_empty(&self, method: Method, path: &str) -> Result<(), MachinedError> {
        let res = self.raw_request(method, path, None).await?;
        let _ = consume(res).await?;
        Ok(())
    }

    async fn raw_request(
        &self,
        method: Method,
        path: &str,
        body: Option<Bytes>,
    ) -> Result<Response<Incoming>, MachinedError> {
        let stream = UnixStream::connect(&self.socket)
            .await
            .map_err(|e| MachinedError::Connect { path: self.socket.clone(), source: e })?;
        let io = TokioIo::new(stream);
        let (mut sender, conn) = http1::handshake(io)
            .await
            .map_err(MachinedError::Handshake)?;

        // Drive the connection in the background; it ends when the response
        // body is fully consumed (or the stream closes for streaming endpoints).
        tokio::spawn(async move {
            let _ = conn.await;
        });

        let req_body = body.unwrap_or_default();
        let mut builder = Request::builder()
            .method(method)
            .uri(path)
            .header(hyper::header::HOST, "machined.local")
            .header(hyper::header::ACCEPT, "application/json");
        if !req_body.is_empty() {
            builder = builder.header(hyper::header::CONTENT_TYPE, "application/json");
        }
        let req = builder.body(Full::new(req_body))?;
        let res = sender.send_request(req).await.map_err(MachinedError::Send)?;
        Ok(res)
    }
}

impl Default for MachinedClient {
    fn default() -> Self {
        Self::new()
    }
}

fn check_status(res: &Response<Incoming>) -> Result<(), MachinedError> {
    let status = res.status();
    if status == StatusCode::NOT_FOUND {
        return Err(MachinedError::NotFound);
    }
    if !status.is_success() {
        return Err(MachinedError::Daemon { status: status.as_u16(), body: String::new() });
    }
    Ok(())
}

async fn consume(res: Response<Incoming>) -> Result<Bytes, MachinedError> {
    let status = res.status();
    let bytes = res
        .into_body()
        .collect()
        .await
        .map_err(MachinedError::Body)?
        .to_bytes();
    if status == StatusCode::NOT_FOUND {
        return Err(MachinedError::NotFound);
    }
    if status == StatusCode::NO_CONTENT {
        return Ok(Bytes::new());
    }
    if !status.is_success() {
        return Err(MachinedError::Daemon {
            status: status.as_u16(),
            body: String::from_utf8_lossy(&bytes).into_owned(),
        });
    }
    Ok(bytes)
}

async fn stream_ndjson(
    res: Response<Incoming>,
    tx: mpsc::Sender<Result<ExecFrame, MachinedError>>,
) {
    let mut body = res.into_body();
    let mut buf: Vec<u8> = Vec::with_capacity(1024);
    loop {
        let frame = match body.frame().await {
            Some(Ok(f)) => f,
            Some(Err(e)) => {
                let _ = tx.send(Err(MachinedError::Body(e))).await;
                return;
            }
            None => break,
        };
        let data = match frame.into_data() {
            Ok(d) => d,
            Err(_) => continue,
        };
        buf.extend_from_slice(&data);
        while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
            let line = buf.drain(..=pos).collect::<Vec<u8>>();
            let trimmed = trim_line(&line);
            if trimmed.is_empty() {
                continue;
            }
            let parsed: Result<ExecFrame, _> = serde_json::from_slice(trimmed);
            let send = match parsed {
                Ok(f) => {
                    let is_exit = matches!(f, ExecFrame::Exit { .. });
                    let r = tx.send(Ok(f)).await;
                    if is_exit || r.is_err() {
                        return;
                    }
                    Ok(())
                }
                Err(e) => tx.send(Err(MachinedError::Decode(e))).await.map_err(|_| ()),
            };
            if send.is_err() {
                return;
            }
        }
    }
    if !buf.is_empty() {
        if let Ok(f) = serde_json::from_slice::<ExecFrame>(trim_line(&buf)) {
            let _ = tx.send(Ok(f)).await;
        }
    }
}

async fn stream_sse(
    res: Response<Incoming>,
    tx: mpsc::Sender<Result<MachineEvent, MachinedError>>,
) {
    let mut body = res.into_body();
    let mut buf: Vec<u8> = Vec::with_capacity(1024);
    let mut event_name: Option<String> = None;
    let mut data_buf = String::new();

    let mut flush =
        |event_name: &mut Option<String>, data_buf: &mut String| -> Option<MachineEvent> {
            if data_buf.is_empty() {
                event_name.take();
                return None;
            }
            let parsed: serde_json::Value = serde_json::from_str(data_buf)
                .unwrap_or_else(|_| serde_json::Value::String(data_buf.clone()));
            let evt = MachineEvent { event: event_name.take(), data: parsed };
            data_buf.clear();
            Some(evt)
        };

    loop {
        let frame = match body.frame().await {
            Some(Ok(f)) => f,
            Some(Err(e)) => {
                let _ = tx.send(Err(MachinedError::Body(e))).await;
                return;
            }
            None => break,
        };
        let data = match frame.into_data() {
            Ok(d) => d,
            Err(_) => continue,
        };
        buf.extend_from_slice(&data);
        while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
            let line = buf.drain(..=pos).collect::<Vec<u8>>();
            let line = std::str::from_utf8(trim_line(&line)).unwrap_or("");
            if line.is_empty() {
                if let Some(evt) = flush(&mut event_name, &mut data_buf) {
                    if tx.send(Ok(evt)).await.is_err() {
                        return;
                    }
                }
                continue;
            }
            if let Some(rest) = line.strip_prefix("data:") {
                if !data_buf.is_empty() {
                    data_buf.push('\n');
                }
                data_buf.push_str(rest.trim_start());
            } else if let Some(rest) = line.strip_prefix("event:") {
                event_name = Some(rest.trim().to_string());
            }
            // ignore id:, retry:, comments
        }
    }
    if let Some(evt) = flush(&mut event_name, &mut data_buf) {
        let _ = tx.send(Ok(evt)).await;
    }
}

fn trim_line(line: &[u8]) -> &[u8] {
    let mut s = line;
    while let Some((&b, rest)) = s.split_last() {
        if b == b'\n' || b == b'\r' {
            s = rest;
        } else {
            break;
        }
    }
    s
}

// ---- TokioIo: minimal hyper::rt::{Read,Write} adapter for tokio I/O ---------
//
// Hyper 1.x uses its own I/O traits. Rather than depend on `hyper-util` for
// just this adapter, we inline the small wrapper used in the hyper book.

use std::pin::Pin;
use std::task::{Context, Poll};

use hyper::rt::{Read, ReadBufCursor, Write};
use tokio::io::{AsyncRead, AsyncWrite};

#[derive(Debug)]
pub struct TokioIo<T> {
    inner: T,
}

impl<T> TokioIo<T> {
    pub fn new(inner: T) -> Self {
        Self { inner }
    }
}

impl<T: AsyncRead + Unpin> Read for TokioIo<T> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        mut buf: ReadBufCursor<'_>,
    ) -> Poll<Result<(), std::io::Error>> {
        let n = unsafe {
            let mut tbuf = tokio::io::ReadBuf::uninit(buf.as_mut());
            match Pin::new(&mut self.inner).poll_read(cx, &mut tbuf) {
                Poll::Ready(Ok(())) => tbuf.filled().len(),
                Poll::Ready(Err(e)) => return Poll::Ready(Err(e)),
                Poll::Pending => return Poll::Pending,
            }
        };
        unsafe { buf.advance(n) };
        Poll::Ready(Ok(()))
    }
}

impl<T: AsyncWrite + Unpin> Write for TokioIo<T> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<Result<usize, std::io::Error>> {
        Pin::new(&mut self.inner).poll_write(cx, buf)
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Result<(), std::io::Error>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Result<(), std::io::Error>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

// =========================================================================
// Tests
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::convert::Infallible;
    use std::sync::Arc;
    use tempfile::TempDir;
    use tokio::io::AsyncWriteExt;
    use tokio::net::UnixListener;
    use tokio::sync::Mutex;

    type Handler = Arc<dyn Fn(Method, String, Vec<u8>) -> HandlerResp + Send + Sync>;
    type HandlerResp = (StatusCode, Vec<(&'static str, String)>, Vec<u8>);

    struct Server {
        _dir: TempDir,
        path: PathBuf,
    }

    impl Server {
        async fn start<F>(handler: F) -> Self
        where
            F: Fn(Method, String, Vec<u8>) -> HandlerResp + Send + Sync + 'static,
        {
            let dir = TempDir::new().unwrap();
            let path = dir.path().join("machined.sock");
            let listener = UnixListener::bind(&path).unwrap();
            let h: Handler = Arc::new(handler);
            tokio::spawn(async move {
                loop {
                    let (stream, _) = match listener.accept().await {
                        Ok(s) => s,
                        Err(_) => return,
                    };
                    let h = h.clone();
                    tokio::spawn(async move {
                        let _ = serve_one(stream, h).await;
                    });
                }
            });
            Server { _dir: dir, path }
        }
    }

    /// Minimal HTTP/1.1 parser sufficient for the tests in this module.
    /// Supports plain (Content-Length) bodies for requests and lets the
    /// handler emit either a buffered or chunked response (already encoded).
    async fn serve_one(
        mut stream: tokio::net::UnixStream,
        h: Handler,
    ) -> std::io::Result<()> {
        use tokio::io::AsyncReadExt;
        let mut buf = Vec::with_capacity(1024);
        let mut tmp = [0u8; 1024];
        let header_end;
        loop {
            let n = stream.read(&mut tmp).await?;
            if n == 0 {
                return Ok(());
            }
            buf.extend_from_slice(&tmp[..n]);
            if let Some(p) = find_double_crlf(&buf) {
                header_end = p;
                break;
            }
        }
        let head = std::str::from_utf8(&buf[..header_end]).unwrap_or("").to_string();
        let mut lines = head.lines();
        let req_line = lines.next().unwrap_or("");
        let mut parts = req_line.split_whitespace();
        let method = parts.next().unwrap_or("GET").to_string();
        let path = parts.next().unwrap_or("/").to_string();
        let mut content_length: usize = 0;
        for line in lines {
            if let Some(rest) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                content_length = rest.trim().parse().unwrap_or(0);
            }
        }
        let body_start = header_end + 4;
        let mut body = buf[body_start..].to_vec();
        while body.len() < content_length {
            let n = stream.read(&mut tmp).await?;
            if n == 0 {
                break;
            }
            body.extend_from_slice(&tmp[..n]);
        }
        body.truncate(content_length);
        let m = match method.as_str() {
            "GET" => Method::GET,
            "POST" => Method::POST,
            "DELETE" => Method::DELETE,
            "PUT" => Method::PUT,
            _ => Method::GET,
        };
        let (status, headers, payload) = h(m, path, body);
        let mut out = format!("HTTP/1.1 {} OK\r\n", status.as_u16());
        let mut has_len = false;
        let mut chunked = false;
        for (k, v) in &headers {
            out.push_str(&format!("{}: {}\r\n", k, v));
            if k.eq_ignore_ascii_case("content-length") {
                has_len = true;
            }
            if k.eq_ignore_ascii_case("transfer-encoding") && v.eq_ignore_ascii_case("chunked") {
                chunked = true;
            }
        }
        if !chunked && !has_len {
            out.push_str(&format!("content-length: {}\r\n", payload.len()));
        }
        out.push_str("\r\n");
        stream.write_all(out.as_bytes()).await?;
        stream.write_all(&payload).await?;
        stream.flush().await?;
        // Half-close so client sees EOF when the daemon ends a stream.
        let _ = stream.shutdown().await;
        Ok::<(), std::io::Error>(())
    }

    fn find_double_crlf(buf: &[u8]) -> Option<usize> {
        buf.windows(4).position(|w| w == b"\r\n\r\n")
    }

    fn json_resp(status: StatusCode, body: serde_json::Value) -> HandlerResp {
        let bytes = serde_json::to_vec(&body).unwrap();
        (
            status,
            vec![("content-type", "application/json".into())],
            bytes,
        )
    }

    fn chunk_encode(chunks: &[&[u8]]) -> Vec<u8> {
        let mut out = Vec::new();
        for c in chunks {
            out.extend_from_slice(format!("{:x}\r\n", c.len()).as_bytes());
            out.extend_from_slice(c);
            out.extend_from_slice(b"\r\n");
        }
        out.extend_from_slice(b"0\r\n\r\n");
        out
    }

    #[tokio::test]
    async fn health_ok() {
        let s = Server::start(|m, p, _| {
            assert_eq!(m, Method::GET);
            assert_eq!(p, "/v1/health");
            json_resp(StatusCode::OK, serde_json::json!({"ok": true, "version": "0.1.0"}))
        })
        .await;
        let c = MachinedClient::with_socket(&s.path);
        let h = c.health().await.unwrap();
        assert!(h.ok);
        assert_eq!(h.version, "0.1.0");
    }

    #[tokio::test]
    async fn list_machines() {
        let s = Server::start(|_, p, _| {
            assert_eq!(p, "/v1/machines");
            json_resp(
                StatusCode::OK,
                serde_json::json!([
                    {
                        "name": "m1", "distro": "ubuntu", "cpus": 2,
                        "memory_mb": 2048, "disk_gb": 20, "state": "running",
                        "ip": "10.0.0.1", "vsock_port": 1024,
                        "created_at": "2026-01-01T00:00:00Z",
                        "started_at": "2026-01-01T00:00:01Z"
                    }
                ]),
            )
        })
        .await;
        let c = MachinedClient::with_socket(&s.path);
        let v = c.list().await.unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].name, "m1");
        assert_eq!(v[0].state, super::super::types::MachineState::Running);
    }

    #[tokio::test]
    async fn get_404_maps_to_not_found() {
        let s = Server::start(|_, _, _| (StatusCode::NOT_FOUND, vec![], Vec::new())).await;
        let c = MachinedClient::with_socket(&s.path);
        let err = c.get("missing").await.unwrap_err();
        assert!(matches!(err, MachinedError::NotFound));
    }

    #[tokio::test]
    async fn create_post_body_roundtrips() {
        let captured = Arc::new(Mutex::new(Vec::new()));
        let cap = captured.clone();
        let s = Server::start(move |m, p, body| {
            assert_eq!(m, Method::POST);
            assert_eq!(p, "/v1/machines");
            let cap = cap.clone();
            tokio::spawn(async move {
                cap.lock().await.extend_from_slice(&body);
            });
            json_resp(
                StatusCode::CREATED,
                serde_json::json!({
                    "name": "m2", "distro": "alpine", "cpus": 1,
                    "memory_mb": 512, "disk_gb": 8, "state": "creating",
                    "created_at": "2026-01-02T00:00:00Z"
                }),
            )
        })
        .await;
        let c = MachinedClient::with_socket(&s.path);
        let m = c
            .create(&MachineSpec {
                name: "m2".into(),
                distro: super::super::types::Distro::Alpine,
                cpus: 1,
                memory_mb: 512,
                disk_gb: 8,
                rosetta: None,
            })
            .await
            .unwrap();
        assert_eq!(m.name, "m2");
        assert_eq!(m.state, super::super::types::MachineState::Creating);
    }

    #[tokio::test]
    async fn start_204_ok() {
        let s = Server::start(|m, p, _| {
            assert_eq!(m, Method::POST);
            assert_eq!(p, "/v1/machines/m1/start");
            (StatusCode::NO_CONTENT, vec![], Vec::new())
        })
        .await;
        let c = MachinedClient::with_socket(&s.path);
        c.start("m1").await.unwrap();
    }

    #[tokio::test]
    async fn delete_204_ok() {
        let s = Server::start(|m, p, _| {
            assert_eq!(m, Method::DELETE);
            assert_eq!(p, "/v1/machines/m1");
            (StatusCode::NO_CONTENT, vec![], Vec::new())
        })
        .await;
        let c = MachinedClient::with_socket(&s.path);
        c.delete("m1").await.unwrap();
    }

    #[tokio::test]
    async fn server_5xx_maps_to_daemon() {
        let s = Server::start(|_, _, _| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                vec![("content-type", "text/plain".into())],
                b"boom".to_vec(),
            )
        })
        .await;
        let c = MachinedClient::with_socket(&s.path);
        let err = c.list().await.unwrap_err();
        match err {
            MachinedError::Daemon { status, body } => {
                assert_eq!(status, 500);
                assert_eq!(body, "boom");
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[tokio::test]
    async fn exec_chunked_stream_parses_frames() {
        let s = Server::start(|m, p, _| {
            assert_eq!(m, Method::POST);
            assert_eq!(p, "/v1/machines/m1/exec");
            // Three NDJSON frames split across chunks at non-line boundaries.
            let payload = chunk_encode(&[
                b"{\"stream\":\"stdout\",\"data\":\"aGVsbG8=\"}" as &[u8],
                b"\n",
                b"{\"stream\":\"stderr\",\"data",
                b"\":\"d29ybGQ=\"}",
                b"\n{\"exit\":0}\n",
            ]);
            (
                StatusCode::OK,
                vec![
                    ("content-type", "application/x-ndjson".into()),
                    ("transfer-encoding", "chunked".into()),
                ],
                payload,
            )
        })
        .await;
        let c = MachinedClient::with_socket(&s.path);
        let mut rx = c
            .exec_stream("m1", &["echo".into(), "hi".into()])
            .await
            .unwrap();
        let f1 = rx.recv().await.unwrap().unwrap();
        match f1 {
            ExecFrame::Chunk { stream: ExecStream::Stdout, data } => {
                assert_eq!(data, "aGVsbG8=");
            }
            other => panic!("unexpected: {other:?}"),
        }
        let f2 = rx.recv().await.unwrap().unwrap();
        match f2 {
            ExecFrame::Chunk { stream: ExecStream::Stderr, data } => {
                assert_eq!(data, "d29ybGQ=");
            }
            other => panic!("unexpected: {other:?}"),
        }
        let f3 = rx.recv().await.unwrap().unwrap();
        assert!(matches!(f3, ExecFrame::Exit { exit: 0 }));
        // After exit, channel closes.
        assert!(rx.recv().await.is_none());
    }

    #[tokio::test]
    async fn sse_events_parse() {
        let s = Server::start(|m, p, _| {
            assert_eq!(m, Method::GET);
            assert_eq!(p, "/v1/machines/events");
            let payload = chunk_encode(&[
                b"event: state\n",
                b"data: {\"name\":\"m1\",\"state\":\"running\"}\n\n",
                b"data: {\"name\":\"m2\",\"state\":\"stopped\"}\n\n",
            ]);
            (
                StatusCode::OK,
                vec![
                    ("content-type", "text/event-stream".into()),
                    ("transfer-encoding", "chunked".into()),
                ],
                payload,
            )
        })
        .await;
        let c = MachinedClient::with_socket(&s.path);
        let mut rx = c.events_sse().await.unwrap();
        let e1 = rx.recv().await.unwrap().unwrap();
        assert_eq!(e1.event.as_deref(), Some("state"));
        assert_eq!(e1.data["name"], "m1");
        let e2 = rx.recv().await.unwrap().unwrap();
        assert_eq!(e2.event, None);
        assert_eq!(e2.data["state"], "stopped");
    }

    #[tokio::test]
    async fn connect_error_when_socket_missing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("nope.sock");
        let c = MachinedClient::with_socket(&path);
        let err = c.health().await.unwrap_err();
        assert!(matches!(err, MachinedError::Connect { .. }));
    }

    // Quiets a warning when only some Infallible-typed bounds are exercised.
    #[allow(dead_code)]
    fn _assert_send() {
        fn is_send<T: Send>() {}
        is_send::<MachinedClient>();
        is_send::<MachinedError>();
        is_send::<Result<(), Infallible>>();
    }
}
