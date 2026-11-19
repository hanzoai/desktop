use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;

const APPLE_EPOCH_OFFSET_SECS: i64 = 978_307_200;

pub const KINSHIP_COLUMNS: [&str; 17] = [
    "mother",
    "father",
    "parent",
    "sister",
    "brother",
    "sibling",
    "family",
    "friend",
    "familyAndFriends",
    "partner",
    "coworker",
    "alumni",
    "child",
    "son",
    "daughter",
    "myself",
    "unknown",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppleTriple {
    pub subject: String,
    pub predicate: String,
    #[serde(rename = "relationshipId", default, skip_serializing_if = "String::is_empty")]
    pub relationship_id: String,
    #[serde(rename = "relationshipPredicate", default, skip_serializing_if = "String::is_empty")]
    pub relationship_predicate: String,
    pub object: String,
    #[serde(default)]
    pub confidence: f64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub sources: String,
    #[serde(rename = "sourceDuplicates", default, skip_serializing_if = "is_zero")]
    pub source_duplicates: i64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub timestamp: String,
}

fn is_zero(v: &i64) -> bool {
    *v == 0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppleScorecard {
    pub entity: String,
    pub scores: BTreeMap<String, f64>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalEdgeView {
    pub predicate_id: String,
    pub predicate_label: String,
    pub relationship_type_id: String,
    pub relationship_type_label: String,
    pub target_id: String,
    pub target_name: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalEntityView {
    pub id: String,
    pub class_id: String,
    pub class_label: String,
    pub name: String,
    pub attributes: BTreeMap<String, Vec<String>>,
    pub edges: Vec<LocalEdgeView>,
    pub scorecard: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalAppleSnapshot {
    pub dir: String,
    pub active_triples_total: usize,
    pub expired_triples_total: usize,
    pub scorecards_total: usize,
    pub entities_total: usize,
    pub classes_breakdown: BTreeMap<String, usize>,
    pub entities: Vec<LocalEntityView>,
    pub apple_payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvoTurnInput {
    pub id: Option<String>,
    pub speaker: String,
    pub partner: Option<String>,
    pub text: String,
    pub at: Option<String>,
}

fn default_intelligence_platform_dir() -> Result<PathBuf, String> {
    if let Ok(env_dir) = std::env::var("HANZO_APPLE_PKG_DIR") {
        if !env_dir.trim().is_empty() {
            return Ok(PathBuf::from(env_dir));
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "cannot determine home directory".to_string())?;
    Ok(PathBuf::from(home).join("Library").join("IntelligencePlatform"))
}

fn class_label(code: &str) -> &'static str {
    match code {
        "SB56" => "entity",
        "SB104" => "person",
        "SB152" => "place",
        "nm_topic" => "topic",
        "SB65" => "event",
        "nm_document" => "document",
        "SB473" => "home",
        "SB10" => "organization",
        "SB2" => "group of humans",
        "SB144" => "software",
        "SB193" => "organism",
        "SB198" => "agent",
        "SB83" => "concept",
        "SB400" => "occurrence",
        "SB60" => "role",
        "SB197" => "siribase type",
        "nm_knowledgeSource" => "knowledge source",
        "SB170" => "time",
        "SB175" => "group",
        "SB470" => "device primary user",
        "CS165" => "employment",
        "CS148" => "residence",
        "CS112" => "kinship",
        "CS113" => "mother",
        "CS114" => "father",
        "CS115" => "parent",
        "CS116" => "sister",
        "CS117" => "brother",
        "CS118" => "sibling",
        "CS119" => "child",
        "CS120" => "son",
        "CS121" => "daughter",
        "CS122" => "partner",
        "CS123" => "spouse",
        "CS124" => "friend",
        "CS125" => "coworker",
        "CS126" => "alumni",
        "CS127" => "family",
        "CS128" => "familyAndFriends",
        _ => "entity",
    }
}

fn predicate_label(code: &str) -> &str {
    match code {
        "PS1" => "instance of",
        "PS2" => "label",
        "PS10" => "given name",
        "PS11" => "family name",
        "PS12" => "nickname",
        "PS19" => "birthday",
        "PS22" => "email",
        "PS23" => "phone",
        "PS24" => "handle",
        "PS33" => "name",
        "PS37" => "birthday components",
        "PS45" => "member of",
        "PS48" => "relationship to me",
        "PS51" => "attendee",
        "PS59" => "located in",
        "PS72" => "external identifier",
        "PS92" => "bundle identifier",
        "PS102" => "contact source",
        "PS112" => "start date",
        "PS113" => "end date",
        "PS204" => "has residence",
        "PS225" => "address",
        "PS311" => "role title",
        "PS312" => "given name",
        "PS441" => "family name",
        "PS500" => "employer",
        "PS501" => "school",
        "PS520" => "handle",
        "PS546" => "middle name",
        _ => code,
    }
}

fn normalize_timestamp(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return String::new();
    }
    if DateTime::parse_from_rfc3339(s).is_ok() {
        return s.to_string();
    }
    if let Ok(v) = s.parse::<f64>() {
        if v > 0.0 {
            let unix_secs = if v < 1_000_000_000.0 {
                (v as i64) + APPLE_EPOCH_OFFSET_SECS
            } else {
                v as i64
            };
            if let Some(dt) = DateTime::<Utc>::from_timestamp(unix_secs, 0) {
                return dt.to_rfc3339();
            }
        }
    }
    String::new()
}

fn sqlite_json_query(db_path: &Path, sql: &str) -> Result<Vec<BTreeMap<String, Value>>, String> {
    let out = Command::new("sqlite3")
        .arg("-readonly")
        .arg("-json")
        .arg(db_path)
        .arg(sql)
        .output()
        .map_err(|e| format!("failed to execute sqlite3 on {}: {e}", db_path.display()))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "sqlite3 query failed on {} ({}): {}",
            db_path.display(),
            out.status,
            stderr.trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(trimmed)
        .map_err(|e| format!("parse sqlite3 json output from {}: {e}", db_path.display()))
}

fn val_to_string(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(other) => other.to_string(),
    }
}

fn val_to_f64(v: Option<&Value>) -> f64 {
    match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn val_to_i64(v: Option<&Value>) -> i64 {
    match v {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::String(s)) => s.trim().parse::<i64>().unwrap_or(0),
        _ => 0,
    }
}

fn query_graph_triples(db_path: &Path, table: &str, limit: usize) -> Result<Vec<AppleTriple>, String> {
    let limit_clause = if limit > 0 {
        format!(" LIMIT {limit}")
    } else {
        String::new()
    };
    let sql = format!(
        "SELECT COALESCE(CAST(subject AS TEXT),'') AS subject, \
                COALESCE(CAST(predicate AS TEXT),'') AS predicate, \
                COALESCE(CAST(relationshipId AS TEXT),'') AS relationshipId, \
                COALESCE(CAST(relationshipPredicate AS TEXT),'') AS relationshipPredicate, \
                COALESCE(CAST(object AS TEXT),'') AS object, \
                COALESCE(CAST(confidence AS REAL), 0.9) AS confidence, \
                COALESCE(CAST(sources AS TEXT),'') AS sources, \
                COALESCE(CAST(sourceDuplicates AS INTEGER), 0) AS sourceDuplicates, \
                COALESCE(CAST(timestamp AS TEXT),'') AS timestamp \
         FROM {table}{limit_clause}"
    );
    let rows = match sqlite_json_query(db_path, &sql) {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let rel_id_raw = val_to_string(row.get("relationshipId"));
        let rel_id = if rel_id_raw == "0" { String::new() } else { rel_id_raw };
        out.push(AppleTriple {
            subject: val_to_string(row.get("subject")),
            predicate: val_to_string(row.get("predicate")),
            relationship_id: rel_id,
            relationship_predicate: val_to_string(row.get("relationshipPredicate")),
            object: val_to_string(row.get("object")),
            confidence: val_to_f64(row.get("confidence")),
            sources: val_to_string(row.get("sources")),
            source_duplicates: val_to_i64(row.get("sourceDuplicates")),
            timestamp: normalize_timestamp(&val_to_string(row.get("timestamp"))),
        });
    }
    Ok(out)
}

fn find_entity_tagging_db(dir: &Path) -> Option<PathBuf> {
    let candidates = [
        dir.join("entityTagging.db"),
        dir.join("Artifacts").join("entityTagging").join("entityTagging.db"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

fn query_scorecards(dir: &Path) -> Result<Vec<AppleScorecard>, String> {
    let Some(tag_db) = find_entity_tagging_db(dir) else {
        return Ok(Vec::new());
    };
    let tables = sqlite_json_query(
        &tag_db,
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    .unwrap_or_default();
    let mut out = Vec::new();
    for tbl_row in tables {
        let tbl = val_to_string(tbl_row.get("name"));
        if tbl.is_empty() || tbl.starts_with("sqlite_") {
            continue;
        }
        let rows = match sqlite_json_query(&tag_db, &format!("SELECT * FROM \"{tbl}\"")) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for row in rows {
            let mut entity = String::new();
            for id_col in ["mdid", "entity", "entity_id", "entityId", "person_id", "personId", "subject", "id"] {
                let candidate = val_to_string(row.get(id_col));
                if !candidate.is_empty() {
                    entity = candidate;
                    break;
                }
            }
            if entity.is_empty() {
                continue;
            }
            let mut scores = BTreeMap::new();
            for col in KINSHIP_COLUMNS {
                let s = val_to_f64(row.get(col));
                if s > 0.0 {
                    scores.insert(col.to_string(), s);
                }
            }
            if !scores.is_empty() {
                out.push(AppleScorecard {
                    entity,
                    scores,
                    source: "apple/entityTagging.db".to_string(),
                });
            }
        }
    }
    Ok(out)
}

pub fn read_apple_store_internal(
    dir: &Path,
    owner: &str,
    source: &str,
    limit: usize,
    entity_filter: Option<&str>,
) -> Result<LocalAppleSnapshot, String> {
    if !dir.is_dir() {
        return Err(format!(
            "Apple IntelligencePlatform directory not found at {} (grant Full Disk Access on macOS)",
            dir.display()
        ));
    }
    let graph_db = dir.join("graph.db");
    let (triples, expired) = if graph_db.is_file() {
        (
            query_graph_triples(&graph_db, "stable_graph", limit)?,
            query_graph_triples(&graph_db, "expired_stable_graph", limit)?,
        )
    } else {
        (Vec::new(), Vec::new())
    };
    let scorecards = query_scorecards(dir)?;

    let mut entities_map: BTreeMap<String, LocalEntityView> = BTreeMap::new();
    let ensure_entity = |map: &mut BTreeMap<String, LocalEntityView>, id: &str| {
        map.entry(id.to_string()).or_insert_with(|| LocalEntityView {
            id: id.to_string(),
            class_id: String::new(),
            class_label: "entity".to_string(),
            name: String::new(),
            attributes: BTreeMap::new(),
            edges: Vec::new(),
            scorecard: BTreeMap::new(),
        });
    };

    #[derive(Default)]
    struct RelGroup {
        subject: String,
        predicate: String,
        rel_type: String,
        target: String,
        confidence: f64,
    }
    let mut rel_groups: BTreeMap<(String, String, String), RelGroup> = BTreeMap::new();

    for t in &triples {
        if t.subject.is_empty() || t.predicate.is_empty() {
            continue;
        }
        ensure_entity(&mut entities_map, &t.subject);
        if !t.relationship_id.is_empty() {
            let g = rel_groups
                .entry((t.subject.clone(), t.predicate.clone(), t.relationship_id.clone()))
                .or_insert_with(|| RelGroup {
                    subject: t.subject.clone(),
                    predicate: t.predicate.clone(),
                    confidence: t.confidence,
                    ..Default::default()
                });
            if t.relationship_predicate == "PS1" {
                g.rel_type = t.object.clone();
            } else if t.relationship_predicate == "PS45" || g.target.is_empty() {
                g.target = t.object.clone();
            }
            continue;
        }
        let ent = entities_map.get_mut(&t.subject).expect("entity exists");
        if t.predicate == "PS1" {
            ent.class_id = t.object.clone();
            ent.class_label = class_label(&t.object).to_string();
        } else if (t.predicate == "PS33" || t.predicate == "PS2") && ent.name.is_empty() {
            ent.name = t.object.clone();
        } else {
            let label = predicate_label(&t.predicate).to_string();
            let vals = ent.attributes.entry(label).or_default();
            if !vals.contains(&t.object) {
                vals.push(t.object.clone());
            }
        }
    }

    for sc in &scorecards {
        ensure_entity(&mut entities_map, &sc.entity);
        if let Some(ent) = entities_map.get_mut(&sc.entity) {
            if ent.class_id.is_empty() {
                ent.class_id = "SB104".to_string();
                ent.class_label = "person".to_string();
            }
            ent.scorecard = sc.scores.clone();
        }
    }

    let names_lookup: BTreeMap<String, String> = entities_map
        .iter()
        .filter(|(_, e)| !e.name.is_empty())
        .map(|(k, e)| (k.clone(), e.name.clone()))
        .collect();

    for (_, g) in rel_groups {
        if g.target.is_empty() {
            continue;
        }
        let clean_target = g.target.strip_prefix("md:").unwrap_or(&g.target);
        let target_name = names_lookup
            .get(&g.target)
            .or_else(|| names_lookup.get(clean_target))
            .cloned()
            .unwrap_or_default();
        if let Some(ent) = entities_map.get_mut(&g.subject) {
            ent.edges.push(LocalEdgeView {
                predicate_id: g.predicate.clone(),
                predicate_label: predicate_label(&g.predicate).to_string(),
                relationship_type_id: g.rel_type.clone(),
                relationship_type_label: class_label(&g.rel_type).to_string(),
                target_id: g.target,
                target_name,
                confidence: g.confidence,
            });
        }
    }

    let mut classes_breakdown: BTreeMap<String, usize> = BTreeMap::new();
    for ent in entities_map.values() {
        *classes_breakdown.entry(ent.class_label.clone()).or_default() += 1;
    }

    let mut entities: Vec<LocalEntityView> = entities_map
        .into_values()
        .filter(|e| {
            let Some(f) = entity_filter else { return true };
            let q = f.to_ascii_lowercase();
            e.id.to_ascii_lowercase().contains(&q)
                || e.name.to_ascii_lowercase().contains(&q)
                || e.class_label.to_ascii_lowercase().contains(&q)
        })
        .collect();

    entities.sort_by(|a, b| {
        let score_a = a.edges.len() * 3 + a.scorecard.len() * 2 + a.attributes.len() + usize::from(!a.name.is_empty());
        let score_b = b.edges.len() * 3 + b.scorecard.len() * 2 + b.attributes.len() + usize::from(!b.name.is_empty());
        score_b.cmp(&score_a).then_with(|| a.id.cmp(&b.id))
    });

    let now_rfc3339 = Utc::now().to_rfc3339();
    let apple_payload = json!({
        "owner": owner,
        "source": source,
        "at": now_rfc3339,
        "triples": triples,
        "expired": expired,
        "scorecards": scorecards,
    });

    Ok(LocalAppleSnapshot {
        dir: dir.display().to_string(),
        active_triples_total: triples.len(),
        expired_triples_total: expired.len(),
        scorecards_total: scorecards.len(),
        entities_total: entities.len(),
        classes_breakdown,
        entities,
        apple_payload,
    })
}

#[tauri::command]
pub async fn knowledge_graph_read_local(
    dir: Option<String>,
    owner: Option<String>,
    source: Option<String>,
    limit: Option<usize>,
    entity_filter: Option<String>,
) -> Result<LocalAppleSnapshot, String> {
    let path = match dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => default_intelligence_platform_dir()?,
    };
    read_apple_store_internal(
        &path,
        owner.as_deref().unwrap_or("me"),
        source.as_deref().unwrap_or("apple/intelligenceplatform"),
        limit.unwrap_or(5000),
        entity_filter.as_deref(),
    )
}

#[tauri::command]
pub async fn knowledge_graph_sync_apple(
    api_url: Option<String>,
    bearer_token: String,
    dir: Option<String>,
    owner: Option<String>,
    source: Option<String>,
    limit: Option<usize>,
) -> Result<Value, String> {
    let path = match dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => default_intelligence_platform_dir()?,
    };
    let snap = read_apple_store_internal(
        &path,
        owner.as_deref().unwrap_or("me"),
        source.as_deref().unwrap_or("apple/intelligenceplatform"),
        limit.unwrap_or(5000),
        None,
    )?;
    let base = api_url
        .unwrap_or_else(|| "https://api.hanzo.ai".to_string())
        .trim_end_matches('/')
        .to_string();
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{base}/v1/graph/apple"))
        .bearer_auth(bearer_token)
        .json(&snap.apple_payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("POST /v1/graph/apple failed ({status}): {body}"));
    }
    Ok(body)
}

#[tauri::command]
pub async fn knowledge_graph_query_entity(
    api_url: Option<String>,
    bearer_token: Option<String>,
    entity: String,
    as_of: Option<String>,
    as_known: Option<String>,
    local: Option<bool>,
    dir: Option<String>,
) -> Result<Value, String> {
    if local.unwrap_or(false) {
        let path = match dir {
            Some(d) if !d.trim().is_empty() => PathBuf::from(d),
            _ => default_intelligence_platform_dir()?,
        };
        let snap = read_apple_store_internal(&path, "me", "apple/intelligenceplatform", 0, Some(&entity))?;
        return serde_json::to_value(snap).map_err(|e| e.to_string());
    }
    let base = api_url
        .unwrap_or_else(|| "https://api.hanzo.ai".to_string())
        .trim_end_matches('/')
        .to_string();
    let mut payload = serde_json::Map::new();
    payload.insert("entity".to_string(), Value::String(entity));
    if let Some(t) = as_of {
        payload.insert("as_of".to_string(), Value::String(t));
    }
    if let Some(t) = as_known {
        payload.insert("as_known".to_string(), Value::String(t));
    }
    let client = reqwest::Client::new();
    let mut req = client.post(format!("{base}/v1/graph/entity")).json(&payload);
    if let Some(tok) = bearer_token {
        if !tok.is_empty() {
            req = req.bearer_auth(tok);
        }
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("POST /v1/graph/entity failed ({status}): {body}"));
    }
    Ok(body)
}

#[tauri::command]
pub async fn knowledge_graph_update_convo(
    api_url: Option<String>,
    bearer_token: String,
    source: String,
    turns: Vec<ConvoTurnInput>,
    at: Option<String>,
    dry_run: Option<bool>,
) -> Result<Value, String> {
    let base = api_url
        .unwrap_or_else(|| "https://api.hanzo.ai".to_string())
        .trim_end_matches('/')
        .to_string();
    let now = at.unwrap_or_else(|| Utc::now().to_rfc3339());
    let payload = json!({
        "source": source,
        "at": now,
        "dry_run": dry_run.unwrap_or(false),
        "turns": turns,
    });
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{base}/v1/graph/convo"))
        .bearer_auth(bearer_token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("POST /v1/graph/convo failed ({status}): {body}"));
    }
    Ok(body)
}

#[tauri::command]
pub async fn knowledge_graph_get_ontology(
    api_url: Option<String>,
    bearer_token: Option<String>,
    group: Option<String>,
    q: Option<String>,
    local: Option<bool>,
) -> Result<Value, String> {
    if local.unwrap_or(false) {
        return Ok(json!({
            "classes_count": 181,
            "predicates_count": 278,
            "features_count": 144,
            "scorecard_columns": KINSHIP_COLUMNS,
        }));
    }
    let base = api_url
        .unwrap_or_else(|| "https://api.hanzo.ai".to_string())
        .trim_end_matches('/')
        .to_string();
    let client = reqwest::Client::new();
    let mut req = client.get(format!("{base}/v1/graph/ontology"));
    if let Some(g) = group {
        req = req.query(&[("group", g)]);
    }
    if let Some(q_str) = q {
        req = req.query(&[("q", q_str)]);
    }
    if let Some(tok) = bearer_token {
        if !tok.is_empty() {
            req = req.bearer_auth(tok);
        }
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("GET /v1/graph/ontology failed ({status}): {body}"));
    }
    Ok(body)
}
