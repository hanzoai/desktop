use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Health {
    pub ok: bool,
    pub version: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Distro {
    Ubuntu,
    Alpine,
    Debian,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MachineState {
    Creating,
    Stopped,
    Starting,
    Running,
    Stopping,
    Deleting,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineSpec {
    pub name: String,
    pub distro: Distro,
    pub cpus: u32,
    pub memory_mb: u64,
    pub disk_gb: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rosetta: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Machine {
    pub name: String,
    pub distro: Distro,
    pub cpus: u32,
    pub memory_mb: u64,
    pub disk_gb: u64,
    pub state: MachineState,
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub vsock_port: Option<u32>,
    pub created_at: String,
    #[serde(default)]
    pub started_at: Option<String>,
}

/// Chunk emitted by the daemon during exec streaming. The `data` field is
/// base64 of the raw bytes from the corresponding stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ExecFrame {
    Chunk {
        stream: ExecStream,
        data: String,
    },
    Exit {
        exit: i32,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExecStream {
    Stdout,
    Stderr,
}

/// Free-form state-change event from the daemon's SSE feed. Forwarded to the
/// frontend as JSON without interpretation so new event shapes don't require
/// a desktop rebuild.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineEvent {
    #[serde(default)]
    pub event: Option<String>,
    pub data: serde_json::Value,
}
