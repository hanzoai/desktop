use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::PINNED_NODE_VERSION;

/// It matches ENV variables names from HanzoNode.
///
/// These options are serialized to the webview and saved there by the Node
/// Manager, so the signed-in key is not one of them: `EMBEDDINGS_SERVER_API_KEY`
/// is added to the env at spawn time only, by `HanzoNodeManager` through
/// hanzo-node-env.
#[derive(Serialize, Deserialize, Clone)]
pub struct HanzoNodeOptions {
    pub node_api_ip: Option<String>,
    pub node_api_port: Option<String>,
    pub node_ws_port: Option<String>,
    pub node_https_port: Option<String>,
    pub node_ip: Option<String>,
    pub node_port: Option<String>,
    pub global_identity_name: Option<String>,
    pub node_storage_path: Option<String>,
    pub embeddings_server_url: Option<String>,
    pub first_device_needs_registration_code: Option<String>,
    pub initial_agent_names: Option<String>,
    pub initial_agent_urls: Option<String>,
    pub initial_agent_models: Option<String>,
    pub initial_agent_api_keys: Option<String>,
    pub starting_num_qr_devices: Option<String>,
    pub log_all: Option<String>,
    pub proxy_identity: Option<String>,
    pub rpc_url: Option<String>,
    pub default_embedding_model: Option<String>,
    pub supported_embedding_models: Option<String>,
    pub hanzo_tools_runner_deno_binary_path: Option<String>,
    pub hanzo_tools_runner_uv_binary_path: Option<String>,
    pub hanzo_store_url: Option<String>,
    /// `SKIP_IMPORT_FROM_DIRECTORY`: "true" stops the node fetching its
    /// default-tool directory at start. See the default below.
    pub skip_import_from_directory: Option<String>,
    pub secret_desktop_installation_proof_key: Option<String>,
}

impl HanzoNodeOptions {
    pub fn with_app_options(
        _app_resource_dir: PathBuf,
        app_data_dir: PathBuf,
    ) -> HanzoNodeOptions {
        let default_node_storage_path = app_data_dir
            .join("node_storage")
            .to_string_lossy()
            .to_string();
        log::debug!("Node storage path: {:?}", default_node_storage_path);
        HanzoNodeOptions {
            node_storage_path: Some(default_node_storage_path),
            ..Default::default()
        }
    }

    pub fn default_initial_model() -> String {
        "hanzo-backend:FREE_TEXT_INFERENCE".to_string()
    }

    pub fn from_merge(
        base_options: HanzoNodeOptions,
        options: HanzoNodeOptions,
    ) -> HanzoNodeOptions {
        let default_options = HanzoNodeOptions::default();
        HanzoNodeOptions {
            node_api_ip: Some(
                options
                    .node_api_ip
                    .or(base_options.node_api_ip)
                    .unwrap_or_default(),
            ),
            node_api_port: Some(
                options
                    .node_api_port
                    .or(base_options.node_api_port)
                    .unwrap_or_default(),
            ),
            node_ws_port: Some(
                options
                    .node_ws_port
                    .or(base_options.node_ws_port)
                    .unwrap_or_default(),
            ),
            node_ip: Some(options.node_ip.or(base_options.node_ip).unwrap_or_default()),
            node_port: Some(
                options
                    .node_port
                    .or(base_options.node_port)
                    .unwrap_or_default(),
            ),
            node_https_port: Some(
                options
                    .node_https_port
                    .or(base_options.node_https_port)
                    .unwrap_or_default(),
            ),
            global_identity_name: Some(
                options
                    .global_identity_name
                    .or(base_options.global_identity_name)
                    .unwrap_or_default(),
            ),
            node_storage_path: Some(
                options
                    .node_storage_path
                    .or(base_options.node_storage_path)
                    .unwrap_or_default(),
            ),
            embeddings_server_url: Some(
                options
                    .embeddings_server_url
                    .or(base_options.embeddings_server_url)
                    .unwrap_or_default(),
            ),
            first_device_needs_registration_code: Some(
                options
                    .first_device_needs_registration_code
                    .or(base_options.first_device_needs_registration_code)
                    .unwrap_or_default(),
            ),
            initial_agent_names: Some(
                options
                    .initial_agent_names
                    .or(base_options.initial_agent_names)
                    .unwrap_or_default(),
            ),
            initial_agent_urls: Some(
                options
                    .initial_agent_urls
                    .or(base_options.initial_agent_urls)
                    .unwrap_or_default(),
            ),
            initial_agent_models: Some(
                options
                    .initial_agent_models
                    .or(base_options.initial_agent_models)
                    .unwrap_or_default(),
            ),
            initial_agent_api_keys: Some(
                options
                    .initial_agent_api_keys
                    .or(base_options.initial_agent_api_keys)
                    .unwrap_or_default(),
            ),
            starting_num_qr_devices: Some(
                options
                    .starting_num_qr_devices
                    .or(base_options.starting_num_qr_devices)
                    .unwrap_or_default(),
            ),
            log_all: Some(options.log_all.or(base_options.log_all).unwrap_or_default()),
            rpc_url: Some(options.rpc_url.or(base_options.rpc_url).unwrap_or_default()),
            default_embedding_model: Some(
                options
                    .default_embedding_model
                    .or(base_options.default_embedding_model)
                    .unwrap_or_else(|| default_options.default_embedding_model.unwrap_or_default()),
            ),
            supported_embedding_models: Some(
                options
                    .supported_embedding_models
                    .or(base_options.supported_embedding_models)
                    .unwrap_or_else(|| default_options.supported_embedding_models.unwrap_or_default()),
            ),
            hanzo_tools_runner_deno_binary_path: Some(
                options
                    .hanzo_tools_runner_deno_binary_path
                    .or(base_options.hanzo_tools_runner_deno_binary_path)
                    .unwrap_or_default(),
            ),
            hanzo_tools_runner_uv_binary_path: Some(
                options
                    .hanzo_tools_runner_uv_binary_path
                    .or(base_options.hanzo_tools_runner_uv_binary_path)
                    .unwrap_or_default(),
            ),
            hanzo_store_url: Some(
                options
                    .hanzo_store_url
                    .or(base_options.hanzo_store_url)
                    .unwrap_or_default(),
            ),
            skip_import_from_directory: Some(
                options
                    .skip_import_from_directory
                    .or(base_options.skip_import_from_directory)
                    .unwrap_or_else(|| default_options.skip_import_from_directory.unwrap_or_default()),
            ),
            secret_desktop_installation_proof_key: default_options
                .secret_desktop_installation_proof_key,
            proxy_identity: default_options.proxy_identity,
        }
    }
}
impl Default for HanzoNodeOptions {
    fn default() -> HanzoNodeOptions {
        let hanzo_tools_runner_deno_binary_path = std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .join(if cfg!(target_os = "windows") {
                "deno.exe"
            } else {
                "deno"
            })
            .to_string_lossy()
            .to_string();

        let hanzo_tools_runner_uv_binary_path = std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .join(if cfg!(target_os = "windows") {
                "uv.exe"
            } else {
                "uv"
            })
            .to_string_lossy()
            .to_string();

        HanzoNodeOptions {
            node_api_ip: Some("127.0.0.1".to_string()),
            node_api_port: Some("3690".to_string()),
            // The frontend's chat WebSocket connects to apiPort+1 (see
        // websocket-message.tsx). API port is 3690, so the WS server MUST be 3691
        // or chat streams never connect and every chat hangs forever.
        node_ws_port: Some("3691".to_string()),
            node_ip: Some("127.0.0.1".to_string()),
            node_port: Some("3692".to_string()),
            node_https_port: Some("3693".to_string()),
            global_identity_name: None,
            node_storage_path: Some("./".to_string()),
            // Inference and embedding both go to api.hanzo.ai, the one API
            // origin. Which base the node needs depends on its release: v1.19.4+
            // posts to `{base}/embeddings` on `https://api.hanzo.ai/v1` with the
            // signed-in key (EMBEDDINGS_SERVER_API_KEY, added at spawn from the
            // session, never stored here); older ones append Ollama's
            // `/api/embeddings` to `https://api.hanzo.ai`, which answers 404
            // (cloud#760). hanzo-node-env picks by the pinned release, and
            // rewrites an api.hanzo.ai URL saved by an older install at spawn.
            // Chain mining checkpoints go through the native RPC.
            embeddings_server_url: Some(
                hanzo_node_env::default_embeddings_url(PINNED_NODE_VERSION).to_string(),
            ),
            first_device_needs_registration_code: Some("false".to_string()),
            initial_agent_urls: Some(
                "https://api.hanzo.ai,https://api.hanzo.ai".to_string(),
            ),
            // Brand-aware agent names: "zoo_free_trial,zoo_code_gen" when
            // compiled with BRAND=zoo, "hanzo_free_trial,hanzo_code_gen"
            // otherwise. The agent ID is what surfaces as the display name
            // (formatText("zoo_free_trial") -> "Zoo Free Trial").
            // option_env! reads the env at *compile time* and bakes it in.
            initial_agent_names: Some(
                if option_env!("BRAND") == Some("zoo") {
                    "zoo_free_trial,zoo_code_gen".to_string()
                } else {
                    "hanzo_free_trial,hanzo_code_gen".to_string()
                },
            ),
            initial_agent_models: Some(
                "hanzo-backend:FREE_TEXT_INFERENCE,hanzo-backend:CODE_GENERATOR".to_string(),
            ),
            initial_agent_api_keys: Some("'',''".to_string()),
            starting_num_qr_devices: Some("0".to_string()),
            log_all: Some("1".to_string()),
            proxy_identity: Some("@@libp2p_relayer.sep-hanzo".to_string()),
            rpc_url: Some("https://sepolia.base.org".to_string()),
            // The node sizes its vector tables (`vec0 ... float[N]`) from this
            // model when it creates a new database, and it seeds 130 static
            // prompts whose embeddings are PRECOMPUTED with embeddinggemma:300m
            // — 768 floats each (hanzo-db-sqlite files/prompts_data.rs, node
            // v1.15.0). `all-minilm:l6-v2` made the tables 384 wide and every
            // seed insert failed: "Dimension mismatch ... Expected 384
            // dimensions but received 768" (cloud#760). 768 is also the node's
            // own default. A database already created at 384 keeps its tables
            // and its stored model; only a new one picks this up.
            //
            // api.hanzo.ai serves no embeddinggemma: it serves `zen-embedding`,
            // which node v1.19.4+ knows and stores 768 wide, and whose start-up
            // relabels a 768 database and recreates an empty 384 one. So with a
            // v1.19.4+ pin the default is `zen-embedding`; with an older pin it
            // stays `embeddinggemma:300m`, which that node can parse.
            default_embedding_model: Some(
                hanzo_node_env::default_embedding_model(PINNED_NODE_VERSION).to_string(),
            ),
            supported_embedding_models: Some(hanzo_node_env::default_supported_models(
                PINNED_NODE_VERSION,
            )),
            hanzo_tools_runner_deno_binary_path: Some(hanzo_tools_runner_deno_binary_path),
            hanzo_tools_runner_uv_binary_path: Some(hanzo_tools_runner_uv_binary_path),
            hanzo_store_url: Some("https://store-api.hanzo.ai".to_string()),
            // The node fetches its default-tool directory from
            // HANZO_TOOLS_DIRECTORY_URL, default
            // https://store-api.hanzo.ai/store/defaults. Nothing serves that:
            // the host falls through to the *.hanzo.ai ingress and answers
            // 404 (cloud#760), and hanzoai/store-api, the only code for it,
            // answers an object with stub entries where the node needs an
            // array of {name, file, routerKey}. So the fetch can only fail.
            // The flag skips just that fetch: the local-directory import it
            // also gates needs INSTALL_FOLDER_PATH, which the desktop never
            // sets. Set it to "false" once a directory is served.
            skip_import_from_directory: Some("true".to_string()),
            secret_desktop_installation_proof_key: option_env!(
                "SECRET_DESKTOP_INSTALLATION_PROOF_KEY"
            )
            .and_then(|s| Some(s.to_string())),
        }
    }
}
