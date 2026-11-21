//! Thin wrapper over the `hanzo-ml` `soup` CLI (model soups + BitDelta) and the
//! `hanzo_training::grpo` example.
//!
//! The argument shapes here mirror `tensor-tools/src/bin/soup.rs` exactly:
//!
//! ```text
//! soup average        -o OUT [-w 1,3,1] MODEL...
//! soup delta          -b BASE -o OUT FINETUNE...
//! soup bitdelta-encode -b BASE -f FINETUNED -o OUT
//! soup bitdelta-apply  -b BASE -d DELTA     -o OUT
//! ```

use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};

/// Resolve the `soup` binary, in priority order:
/// 1. `HANZO_SOUP_BIN` (explicit override — dev builds / custom installs).
/// 2. A bundled, target-suffixed `soup-<triple>` (or `soup`) sitting next to the
///    app executable — this is what `download-binaries.sh` fetches into
///    `external-binaries/hanzo-engine/`.
/// 3. Bare `soup` on `PATH` (the ml repo installs it via
///    `cargo install --path tensor-tools` / `cargo build -p tensor-tools --bin
///    soup`).
fn soup_bin() -> String {
    if let Ok(explicit) = std::env::var("HANZO_SOUP_BIN") {
        if !explicit.is_empty() {
            return explicit;
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let ext = if cfg!(target_os = "windows") {
                ".exe"
            } else {
                ""
            };
            // Tauri sidecars are suffixed with the target triple; also accept a
            // plain `soup` for locally-dropped binaries.
            let candidates = [
                format!("soup-{}{}", std::env::consts::ARCH, ext),
                format!("soup{}", ext),
            ];
            for cand in candidates {
                let p = dir.join(&cand);
                if p.exists() {
                    return p.to_string_lossy().into_owned();
                }
            }
        }
    }

    "soup".to_string()
}

/// Run the `soup` binary with `args`, returning combined stdout on success or a
/// readable error (including stderr) on failure.
fn run_soup(args: &[String]) -> Result<String, String> {
    let bin = soup_bin();
    log::info!("model_tools: running `{}` {:?}", bin, args);

    let output = Command::new(&bin)
        .args(args)
        .output()
        .map_err(|e| format!("failed to launch `{}` ({}). Set HANZO_SOUP_BIN to the soup binary built from hanzoai/ml (`cargo build -p tensor-tools --bin soup`).", bin, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        log::info!("model_tools: soup ok: {}", stdout);
        // Prefer stdout, but surface stderr if the tool logged there.
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(format!(
            "soup exited with {}: {}",
            output.status,
            if stderr.is_empty() { stdout } else { stderr }
        ))
    }
}

/// `soup average` — uniform or weighted model soup over matching tensors.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoupAverageArgs {
    /// Input checkpoints to average (>= 1), as safetensors paths.
    pub models: Vec<String>,
    /// Output safetensors path.
    pub out: String,
    /// Optional per-model weights (normalised internally). Omit for uniform.
    #[serde(default)]
    pub weights: Option<Vec<f32>>,
}

/// `soup delta` — base + mean(ftᵢ − base).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoupDeltaArgs {
    /// Base checkpoint.
    pub base: String,
    /// Fine-tuned checkpoints (>= 1).
    pub finetunes: Vec<String>,
    /// Output safetensors path.
    pub out: String,
}

/// `soup bitdelta-encode` — compress a fine-tune to ~1 bit/weight vs base.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitDeltaEncodeArgs {
    /// Base checkpoint.
    pub base: String,
    /// Fine-tuned checkpoint to compress.
    pub finetuned: String,
    /// Output `.bitdelta` path.
    pub out: String,
}

/// `soup bitdelta-apply` — reconstruct a fine-tune from base + `.bitdelta`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitDeltaApplyArgs {
    /// Base checkpoint.
    pub base: String,
    /// Input `.bitdelta` file.
    pub delta: String,
    /// Output safetensors path.
    pub out: String,
}

pub fn soup_average(args: SoupAverageArgs) -> Result<String, String> {
    if args.models.is_empty() {
        return Err("soup average needs at least one input model".to_string());
    }
    let mut argv = vec!["average".to_string(), "-o".to_string(), args.out.clone()];
    if let Some(w) = &args.weights {
        if !w.is_empty() {
            let joined = w
                .iter()
                .map(|x| x.to_string())
                .collect::<Vec<_>>()
                .join(",");
            argv.push("-w".to_string());
            argv.push(joined);
        }
    }
    argv.extend(args.models.iter().cloned());
    run_soup(&argv)
}

pub fn soup_delta(args: SoupDeltaArgs) -> Result<String, String> {
    if args.finetunes.is_empty() {
        return Err("soup delta needs at least one fine-tune".to_string());
    }
    let mut argv = vec![
        "delta".to_string(),
        "-b".to_string(),
        args.base.clone(),
        "-o".to_string(),
        args.out.clone(),
    ];
    argv.extend(args.finetunes.iter().cloned());
    run_soup(&argv)
}

pub fn bitdelta_encode(args: BitDeltaEncodeArgs) -> Result<String, String> {
    run_soup(&[
        "bitdelta-encode".to_string(),
        "-b".to_string(),
        args.base,
        "-f".to_string(),
        args.finetuned,
        "-o".to_string(),
        args.out,
    ])
}

pub fn bitdelta_apply(args: BitDeltaApplyArgs) -> Result<String, String> {
    run_soup(&[
        "bitdelta-apply".to_string(),
        "-b".to_string(),
        args.base,
        "-d".to_string(),
        args.delta,
        "-o".to_string(),
        args.out,
    ])
}

/// Whether the `soup` binary is resolvable/launchable. Used by the UI to gate
/// the merge/compress panel.
pub fn soup_available() -> bool {
    // `soup --version` is cheap and provided by clap (`version` attr).
    Command::new(soup_bin())
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Config for a GRPO training run (developer preview — see module docs).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpoRunArgs {
    /// Group size G (completions sampled per prompt). Maps to GrpoConfig.
    #[serde(default)]
    pub group_size: Option<usize>,
    /// Number of optimization steps to run.
    #[serde(default)]
    pub steps: Option<usize>,
}

/// Launch the trainer-free GRPO example from a local `hanzoai/ml` checkout.
///
/// There is no GRPO server/daemon yet — `hanzo_training::grpo` is a library with
/// a runnable `grpo_toy` example. We therefore drive it via `cargo run`, which
/// requires `HANZO_ML_DIR` to point at a checkout. This is intentionally a
/// developer-preview path, not a packaged feature.
pub fn grpo_run(args: GrpoRunArgs) -> Result<String, String> {
    let ml_dir = std::env::var("HANZO_ML_DIR").map_err(|_| {
        "GRPO is a developer preview: set HANZO_ML_DIR to a hanzoai/ml checkout to run `cargo run -p hanzo-training --example grpo_toy`.".to_string()
    })?;
    let manifest = PathBuf::from(&ml_dir).join("Cargo.toml");
    if !manifest.exists() {
        return Err(format!(
            "HANZO_ML_DIR={} does not look like a hanzoai/ml checkout (no Cargo.toml)",
            ml_dir
        ));
    }

    log::info!(
        "model_tools: running GRPO example from {} (group_size={:?}, steps={:?})",
        ml_dir,
        args.group_size,
        args.steps
    );

    // The toy example currently takes no CLI flags; group_size/steps are
    // accepted for forward-compat and logged. Driving a real model is a
    // matter of implementing the `Policy` trait (see hanzo_training::grpo docs).
    let output = Command::new("cargo")
        .arg("run")
        .arg("--quiet")
        .arg("-p")
        .arg("hanzo-training")
        .arg("--example")
        .arg("grpo_toy")
        .current_dir(&ml_dir)
        .output()
        .map_err(|e| format!("failed to launch cargo for GRPO example: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(format!("GRPO example failed ({}): {}", output.status, stderr))
    }
}
