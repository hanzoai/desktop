//! The signed-in Hanzo key the local node embeds with (cloud#760).
//!
//! The app's IAM session is one keychain record, `iam-session`, which the main
//! window writes through `secure_storage_set` / `secure_storage_delete`
//! (`src/keychain.ts`) on sign-in, on a token refresh and on sign-out. The
//! node reads its key from its env at start, so:
//!
//! * every node start reads the record here ([`current_key`]);
//! * every write to the record calls [`changed`], which waits for the burst of
//!   writes a sign-in makes to settle, reads the record once, and lets the
//!   node manager restart the node if the key it would get differs.
//!
//! The key is read in this process and handed to the node's env only. It is
//! never logged; see hanzo-node-env for where it may be sent.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::AppHandle;

use crate::commands::secure_storage;
use crate::globals::HANZO_NODE_MANAGER_INSTANCE;

/// How long the record must stay unchanged before the node is checked. A
/// sign-in writes it several times in a row (token, refresh token, expiry).
const SETTLE: Duration = Duration::from_millis(1500);

/// Counts calls to [`changed`]; only the latest one acts.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// Whether `key` (a `secure_storage_*` key) is the session record.
pub fn is_session_record(key: &str) -> bool {
    key == hanzo_node_env::SESSION_RECORD
}

/// The signed-in key, or `None` when signed out (or the session has expired).
pub fn current_key(app: &AppHandle) -> Option<String> {
    let record = secure_storage::read(app, hanzo_node_env::SESSION_RECORD);
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    hanzo_node_env::signed_in_key(record.as_deref(), now_ms)
}

/// The session record was written or removed. Returns at once; the check runs
/// in the background once the record settles.
pub fn changed(app: AppHandle) {
    let mine = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SETTLE).await;
        if GENERATION.load(Ordering::SeqCst) != mine {
            return;
        }
        let Some(manager) = HANZO_NODE_MANAGER_INSTANCE.get() else {
            return;
        };
        let session_key = current_key(&app);
        manager.write().await.session_changed(session_key).await;
    });
}
