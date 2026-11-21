//! A saved copy of a site, for the agent to read.
//!
//! The agent works in a sandbox without a network, so the window saves what it
//! needs into the folder it will work in, under `.hanzo/reference/`:
//!
//!   page.html      the page as the site sent it
//!   text.md        its words in reading order, with its address, description,
//!                  the pictures it shows and the stylesheets saved beside it
//!   style-N.css    up to six of its stylesheets
//!   screenshot.*   how it looks, when the person's own browser could take one
//!
//! Each capture replaces the last, so nothing stale is left to read.

use std::collections::HashMap;
use std::io;
use std::path::Path;
use std::time::Duration;

use regex::Regex;
use reqwest::Url;

/// Where the copy goes, under the folder.
pub const REFERENCE: &str = ".hanzo/reference";

/// How many stylesheets are saved, and how many pictures are listed.
pub const SHEETS: usize = 6;
const IMAGES: usize = 40;

/// The words of a page are cut off here.
const TEXT_LIMIT: usize = 200_000;

/// A page, read.
pub struct Page {
    /// Where it was, after any redirects.
    pub url: Url,
    pub title: String,
    pub description: String,
    pub html: String,
    /// Its words, in reading order.
    pub text: String,
    /// The pictures it shows: their address and what they say they are of.
    pub images: Vec<(String, String)>,
    /// The stylesheets it links, in order.
    pub sheets: Vec<Url>,
}

fn regex(cell: &'static std::sync::OnceLock<Regex>, pattern: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).expect("a fixed pattern"))
}

/// Read a page's HTML.
pub fn read(url: Url, html: &str) -> Page {
    static TITLE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    static META: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    static IMG: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    static LINK: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();

    let title = regex(&TITLE, r"(?is)<title[^>]*>(.*?)</title>")
        .captures(html)
        .map(|c| squeeze(&decode(&c[1])))
        .unwrap_or_default();

    let mut description = String::new();
    for m in regex(&META, r"(?is)<meta\b[^>]*>").find_iter(html) {
        let tag = m.as_str();
        let name = attribute(tag, "name").or_else(|| attribute(tag, "property"));
        if matches!(name.as_deref(), Some("description" | "og:description")) {
            if let Some(content) = attribute(tag, "content") {
                description = squeeze(&decode(&content));
                break;
            }
        }
    }

    let mut images = Vec::new();
    for m in regex(&IMG, r"(?is)<img\b[^>]*>").find_iter(html) {
        if images.len() >= IMAGES {
            break;
        }
        let tag = m.as_str();
        let Some(src) = attribute(tag, "src").filter(|s| !s.starts_with("data:")) else { continue };
        let Ok(at) = url.join(&decode(&src)) else { continue };
        if !matches!(at.scheme(), "http" | "https") || images.iter().any(|(a, _): &(String, String)| *a == at.as_str()) {
            continue;
        }
        images.push((at.to_string(), squeeze(&decode(&attribute(tag, "alt").unwrap_or_default()))));
    }

    let mut sheets: Vec<Url> = Vec::new();
    for m in regex(&LINK, r"(?is)<link\b[^>]*>").find_iter(html) {
        let tag = m.as_str();
        let rel = attribute(tag, "rel").unwrap_or_default().to_ascii_lowercase();
        if !rel.split_whitespace().any(|r| r == "stylesheet") {
            continue;
        }
        let Some(href) = attribute(tag, "href") else { continue };
        let Ok(at) = url.join(&decode(&href)) else { continue };
        if matches!(at.scheme(), "http" | "https") && !sheets.contains(&at) {
            sheets.push(at);
        }
    }
    sheets.truncate(SHEETS);

    Page { text: readable(html), url, title, description, html: html.to_string(), images, sheets }
}

/// The value of an attribute in one tag, quoted either way or bare.
fn attribute(tag: &str, name: &str) -> Option<String> {
    static ATTR: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = regex(&ATTR, r#"(?is)([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))"#);
    re.captures_iter(tag).find_map(|c| {
        c[1].eq_ignore_ascii_case(name)
            .then(|| c.get(2).or_else(|| c.get(3)).or_else(|| c.get(4)).map_or(String::new(), |v| v.as_str().to_string()))
    })
}

/// Collapse every run of whitespace to one space.
fn squeeze(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// HTML character references, the common named ones and every numeric one.
fn decode(s: &str) -> String {
    static ENTITY: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = regex(&ENTITY, r"&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,8});");
    re.replace_all(s, |c: &regex::Captures| {
        let name = &c[1];
        let named = match name {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some(' '),
            "ndash" => Some('–'),
            "mdash" => Some('—'),
            "hellip" => Some('…'),
            "copy" => Some('©'),
            "reg" => Some('®'),
            "trade" => Some('™'),
            "lsquo" => Some('‘'),
            "rsquo" => Some('’'),
            "ldquo" => Some('“'),
            "rdquo" => Some('”'),
            "middot" => Some('·'),
            "bull" => Some('•'),
            "laquo" => Some('«'),
            "raquo" => Some('»'),
            "euro" => Some('€'),
            "pound" => Some('£'),
            _ => None,
        };
        let number = name.strip_prefix('#').and_then(|n| match n.strip_prefix(['x', 'X']) {
            Some(hex) => u32::from_str_radix(hex, 16).ok(),
            None => n.parse().ok(),
        });
        named
            .or_else(|| number.and_then(char::from_u32))
            .map_or_else(|| c[0].to_string(), |ch| ch.to_string())
    })
    .into_owned()
}

/// A page's words in reading order, as markdown the agent can read: headings as
/// `#`, list items as `-`, links as `[text](address)`, one block per line.
/// Scripts, styles, the head and anything hidden from a reader are dropped.
pub fn readable(html: &str) -> String {
    static NOISE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    static TOKEN: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let noise = regex(
        &NOISE,
        r"(?is)<!--.*?-->|<![^>]*>|<\?.*?\?>|<(script|style|noscript|svg|template|head|iframe|object|select|textarea)\b[^>]*>.*?</(?:script|style|noscript|svg|template|head|iframe|object|select|textarea)\s*>",
    );
    let token = regex(
        &TOKEN,
        r#"(?s)<(/?)([A-Za-z][A-Za-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+|<)"#,
    );
    let body = noise.replace_all(html, " ");
    let mut out = String::new();
    let mut href: Vec<Option<String>> = Vec::new();
    let mut pre = 0usize;
    for m in token.captures_iter(&body) {
        if let Some(text) = m.get(4) {
            if pre > 0 {
                out.push_str(&decode(text.as_str()));
            } else {
                let words = decode(text.as_str());
                let squeezed = squeeze(&words);
                if squeezed.is_empty() {
                    if !out.is_empty() && !out.ends_with([' ', '\n']) && words.chars().any(char::is_whitespace) {
                        out.push(' ');
                    }
                    continue;
                }
                if words.starts_with(char::is_whitespace) && !out.is_empty() && !out.ends_with([' ', '\n']) {
                    out.push(' ');
                }
                out.push_str(&squeezed);
                if words.ends_with(char::is_whitespace) {
                    out.push(' ');
                }
            }
            continue;
        }
        let closing = &m[1] == "/";
        let name = m[2].to_ascii_lowercase();
        let attrs = m.get(3).map_or("", |a| a.as_str());
        match name.as_str() {
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                out.push_str("\n\n");
                if !closing {
                    out.push_str(&"#".repeat(name[1..].parse::<usize>().unwrap_or(1)));
                    out.push(' ');
                }
            }
            "li" | "dt" | "dd" => {
                if !closing {
                    out.push_str("\n- ");
                }
            }
            "br" | "hr" => out.push('\n'),
            "pre" => {
                if closing {
                    pre = pre.saturating_sub(1);
                    if pre == 0 {
                        out.push_str("\u{2}\n");
                    }
                } else {
                    if pre == 0 {
                        out.push_str("\n\u{1}");
                    }
                    pre += 1;
                }
            }
            "a" => {
                if closing {
                    if let Some(Some(to)) = href.pop() {
                        if out.ends_with('[') {
                            out.pop();
                        } else {
                            out.push_str(&format!("]({to})"));
                        }
                    }
                } else {
                    let to = attribute(attrs, "href")
                        .map(|h| decode(&h))
                        .filter(|h| !h.is_empty() && !h.starts_with('#') && !h.to_ascii_lowercase().starts_with("javascript:"));
                    if to.is_some() {
                        out.push('[');
                    }
                    href.push(to);
                }
            }
            "img" => {
                if let Some(alt) = attribute(attrs, "alt").map(|a| squeeze(&decode(&a))).filter(|a| !a.is_empty()) {
                    out.push_str(&format!("[image: {alt}]"));
                }
            }
            "td" | "th" => out.push(' '),
            "p" | "div" | "section" | "article" | "header" | "footer" | "nav" | "main" | "aside" | "ul" | "ol" | "dl"
            | "table" | "tr" | "blockquote" | "form" | "figure" | "figcaption" | "details" | "summary" | "fieldset"
            | "address" | "body" | "html" => out.push('\n'),
            _ => {}
        }
    }
    // A line inside <pre> keeps its indent; every other line is trimmed, and blank lines never repeat.
    let mut lines: Vec<String> = Vec::new();
    let mut inside = false;
    for raw in out.split('\n') {
        let keep = inside || raw.starts_with('\u{1}');
        if raw.contains('\u{1}') {
            inside = true;
        }
        if raw.contains('\u{2}') {
            inside = false;
        }
        let bare = raw.replace(['\u{1}', '\u{2}'], "");
        let line = if keep { bare.trim_end().to_string() } else { bare.trim().to_string() };
        if line.is_empty() && lines.last().map_or(true, String::is_empty) {
            continue;
        }
        lines.push(line);
    }
    let mut text = lines.join("\n").trim().to_string();
    if text.len() > TEXT_LIMIT {
        let mut cut = TEXT_LIMIT;
        while !text.is_char_boundary(cut) {
            cut -= 1;
        }
        text.truncate(cut);
        text.push_str("\n\n[The rest of the page is cut off.]");
    }
    text
}

/// The text file that goes with a copy: what the page is, then its words, then what was saved beside it.
fn digest(page: &Page, sheets: &[(Url, usize)], screenshot: Option<&str>) -> String {
    let mut s = String::new();
    s.push_str(&format!("# {}\n\n", if page.title.is_empty() { page.url.as_str() } else { &page.title }));
    s.push_str(&format!("Address: {}\n", page.url));
    if !page.description.is_empty() {
        s.push_str(&format!("Description: {}\n", page.description));
    }
    s.push_str("\n---\n\n");
    s.push_str(&page.text);
    s.push_str("\n\n---\n\n## Saved beside this file\n\n- page.html: the page as the site sent it\n");
    for (n, (url, _)) in sheets.iter().enumerate() {
        s.push_str(&format!("- style-{}.css: {url}\n", n + 1));
    }
    if let Some(name) = screenshot {
        s.push_str(&format!("- {name}: how the page looks\n"));
    }
    if !page.images.is_empty() {
        s.push_str("\n## Pictures on the page\n\nThese can be linked from their own addresses.\n\n");
        for (at, alt) in &page.images {
            if alt.is_empty() {
                s.push_str(&format!("- {at}\n"));
            } else {
                s.push_str(&format!("- {alt}: {at}\n"));
            }
        }
    }
    s
}

/// What was saved.
pub struct Saved {
    /// The names of the files written, under the reference folder.
    pub files: Vec<String>,
    pub screenshot: bool,
}

/// Save a copy of `page` under `<dir>/.hanzo/reference`, replacing any copy there.
/// `sheets` are the stylesheets fetched, in order; `shot` is a picture and its extension.
pub fn save(dir: &Path, page: &Page, sheets: &[(Url, Vec<u8>)], shot: Option<(Vec<u8>, &str)>) -> io::Result<Saved> {
    let at = dir.join(REFERENCE);
    match std::fs::remove_dir_all(&at) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => return Err(e),
        _ => {}
    }
    std::fs::create_dir_all(&at)?;
    let mut files = vec!["page.html".to_string(), "text.md".to_string()];
    std::fs::write(at.join("page.html"), &page.html)?;
    let mut kept = Vec::new();
    for (n, (url, css)) in sheets.iter().enumerate() {
        let name = format!("style-{}.css", n + 1);
        let mut body = format!("/* {url} */\n").into_bytes();
        body.extend_from_slice(css);
        std::fs::write(at.join(&name), body)?;
        files.push(name);
        kept.push((url.clone(), css.len()));
    }
    let picture = match &shot {
        Some((bytes, ext)) => {
            let name = format!("screenshot.{ext}");
            std::fs::write(at.join(&name), bytes)?;
            files.push(name.clone());
            Some(name)
        }
        None => None,
    };
    std::fs::write(at.join("text.md"), digest(page, &kept, picture.as_deref()))?;
    Ok(Saved { files, screenshot: picture.is_some() })
}

/// The extension a picture's bytes call for, or None when they are not a picture a browser makes.
pub fn picture(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

/// What the person's own browser can do: a method and string params in, JSON out.
/// It is the extension's command surface (`commands::browser`), named here so the
/// capture can be driven by anything that answers it.
pub trait Browse {
    fn call(
        &self,
        method: &str,
        params: HashMap<String, String>,
    ) -> impl std::future::Future<Output = Result<serde_json::Value, String>> + Send;
}

/// No browser at all: where nothing is paired with Hanzo (Windows has no bridge to one), and what a test uses to keep a capture off the real one.
#[cfg(any(not(unix), test))]
pub struct Nobody;

#[cfg(any(not(unix), test))]
impl Browse for Nobody {
    async fn call(&self, _: &str, _: HashMap<String, String>) -> Result<serde_json::Value, String> {
        Err("There is no browser paired with Hanzo.".into())
    }
}

/// The first value under `key`, at any depth: the extension wraps its answers and the wrapper is not ours to depend on.
fn find<'a>(v: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Value> {
    match v {
        serde_json::Value::Object(map) => map.get(key).or_else(|| map.values().find_map(|x| find(x, key))),
        serde_json::Value::Array(items) => items.iter().find_map(|x| find(x, key)),
        _ => None,
    }
}

/// A picture of the page as the person's own browser shows it: open it in a new tab, wait for it to
/// finish loading, take the whole page, close the tab. None when there is no browser, or it declined.
/// The tab is closed whatever happens after it opened.
pub async fn shoot<B: Browse>(browser: &B, url: &str, settle: Duration, patience: Duration) -> Option<(Vec<u8>, &'static str)> {
    use base64::Engine;

    let made = browser.call("Target.createTarget", HashMap::from([("url".into(), url.to_string())])).await.ok()?;
    let id = match (find(&made, "targetId"), find(&made, "tabId")) {
        (Some(serde_json::Value::String(s)), _) => s.clone(),
        (_, Some(n)) => n.to_string().trim_matches('"').to_string(),
        _ => return None,
    };
    let result = async {
        // Ready when the page says so; a browser that will not answer that is given the settle time instead.
        let mut waited = Duration::ZERO;
        let mut answered = false;
        while waited < patience {
            let state = browser
                .call(
                    "Runtime.evaluate",
                    HashMap::from([
                        ("expression".into(), "document.readyState".into()),
                        ("returnByValue".into(), "true".into()),
                        ("targetId".into(), id.clone()),
                    ]),
                )
                .await;
            match state {
                Ok(v) if v.to_string().contains("complete") => {
                    answered = true;
                    break;
                }
                Ok(_) => {}
                Err(_) => break,
            }
            tokio::time::sleep(Duration::from_millis(400)).await;
            waited += Duration::from_millis(400);
        }
        if !answered {
            tokio::time::sleep(settle).await;
        }
        let shot = browser
            .call("hanzo.screenshot", HashMap::from([("tabId".into(), id.clone()), ("fullPage".into(), "true".into())]))
            .await
            .ok()?;
        let data = find(&shot, "data")?.as_str()?;
        let data = data.split_once("base64,").map_or(data, |(_, b)| b);
        let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).ok()?;
        let ext = picture(&bytes)?;
        Some((bytes, ext))
    }
    .await;
    let _ = browser.call("Target.closeTarget", HashMap::from([("targetId".into(), id)])).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    const PAGE: &str = r##"<!doctype html><html><head>
      <title>Acme &amp; Sons — Plumbing</title>
      <meta name="description" content="Plumbers you can  trust, since 1982.">
      <link rel="stylesheet" href="/css/site.css">
      <link rel="preload" href="/font.woff2">
      <link rel="stylesheet" href="https://cdn.example.net/ui.css">
      <style>body{color:red}</style><script>var secret = 1;</script></head>
      <body><header><nav><a href="/">Home</a> <a href="/about">About us</a> <a href="#top">Top</a></nav></header>
      <main><h1>Fast <em>fixes</em></h1><p>Call us any time &mdash; we answer.</p>
      <ul><li>Leaks</li><li><a href="https://x.test/p?a=1&amp;b=2">Pipes</a></li></ul>
      <a href="/img"><img src="/logo.png" alt=""></a>
      <img src="/van.jpg" alt="Our  van"><img src="data:image/png;base64,AAAA" alt="inline">
      <pre>  keep
   this</pre>
      <p>One <b>bold</b> word.</p><!-- hidden --><noscript>enable js</noscript></main></body></html>"##;

    #[test]
    fn reads_what_a_page_is() {
        let p = read(at("https://acme.test/start/"), PAGE);
        assert_eq!(p.title, "Acme & Sons — Plumbing");
        assert_eq!(p.description, "Plumbers you can trust, since 1982.");
        assert_eq!(
            p.sheets,
            vec![at("https://acme.test/css/site.css"), at("https://cdn.example.net/ui.css")]
        );
        assert_eq!(
            p.images,
            vec![
                ("https://acme.test/logo.png".to_string(), String::new()),
                ("https://acme.test/van.jpg".to_string(), "Our van".to_string()),
            ]
        );
    }

    #[test]
    fn the_words_come_in_reading_order_without_the_machinery() {
        let text = readable(PAGE);
        assert!(!text.contains("secret") && !text.contains("color:red") && !text.contains("hidden") && !text.contains("enable js"), "{text}");
        assert!(text.contains("[Home](/) [About us](/about)"), "{text}");
        assert!(!text.contains("Top]"), "an anchor link is not a destination: {text}");
        assert!(text.contains("# Fast fixes"), "{text}");
        assert!(text.contains("Call us any time — we answer."), "{text}");
        assert!(text.contains("- Leaks\n- [Pipes](https://x.test/p?a=1&b=2)"), "{text}");
        assert!(text.contains("[image: Our van]"), "{text}");
        assert!(text.contains("  keep\n   this"), "preformatted text keeps its shape: {text}");
        assert!(text.contains("One bold word."), "{text}");
        assert!(!text.contains("\n\n\n"), "{text}");
    }

    #[test]
    fn a_doctype_is_not_a_word() {
        assert_eq!(readable("<!doctype html><?xml version=\"1.0\"?><html><body><p>Hi</p></body></html>"), "Hi");
    }

    #[test]
    fn an_empty_link_leaves_no_brackets() {
        assert_eq!(readable(r#"<p>a</p><a href="/x"><img src="/y.png"></a><p>b</p>"#), "a\n\nb");
    }

    #[test]
    fn character_references_are_decoded() {
        assert_eq!(decode("a&amp;b &lt;c&gt; &#65;&#x42; &unknown; &quot;q&quot;"), "a&b <c> AB &unknown; \"q\"");
    }

    #[test]
    fn long_pages_are_cut_off_on_a_boundary() {
        let long = format!("<p>{}</p>", "é".repeat(TEXT_LIMIT));
        let text = readable(&long);
        assert!(text.ends_with("[The rest of the page is cut off.]"));
        assert!(text.len() < TEXT_LIMIT + 64);
    }

    #[test]
    fn a_copy_replaces_the_last_and_leaves_the_rest_of_the_folder_alone() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("keep.txt"), "mine").unwrap();
        let old = dir.path().join(REFERENCE);
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("stale.css"), "old").unwrap();

        let p = read(at("https://acme.test/"), PAGE);
        let sheets = vec![(at("https://acme.test/css/site.css"), b"h1{margin:0}".to_vec())];
        let saved = save(dir.path(), &p, &sheets, Some((b"\x89PNG\r\n\x1a\nxx".to_vec(), "png"))).unwrap();
        assert_eq!(saved.files, vec!["page.html", "text.md", "style-1.css", "screenshot.png"]);
        assert!(saved.screenshot);
        assert!(!old.join("stale.css").exists());
        assert_eq!(std::fs::read_to_string(dir.path().join("keep.txt")).unwrap(), "mine");
        assert_eq!(std::fs::read_to_string(old.join("page.html")).unwrap(), PAGE);
        assert_eq!(std::fs::read_to_string(old.join("style-1.css")).unwrap(), "/* https://acme.test/css/site.css */\nh1{margin:0}");
        let digest = std::fs::read_to_string(old.join("text.md")).unwrap();
        assert!(digest.starts_with("# Acme & Sons — Plumbing\n\nAddress: https://acme.test/\nDescription: Plumbers you can trust"), "{digest}");
        assert!(digest.contains("- style-1.css: https://acme.test/css/site.css"), "{digest}");
        assert!(digest.contains("- screenshot.png: how the page looks"), "{digest}");
        assert!(digest.contains("- Our van: https://acme.test/van.jpg"), "{digest}");
        assert!(digest.contains("# Fast fixes"), "{digest}");
    }

    #[test]
    fn no_screenshot_is_said_by_saying_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let p = read(at("https://acme.test/"), "<title>x</title><p>hi</p>");
        let saved = save(dir.path(), &p, &[], None).unwrap();
        assert_eq!(saved.files, vec!["page.html", "text.md"]);
        assert!(!saved.screenshot);
        assert!(!std::fs::read_to_string(dir.path().join(REFERENCE).join("text.md")).unwrap().contains("screenshot"));
    }

    #[test]
    fn pictures_are_known_by_their_bytes() {
        assert_eq!(picture(b"\x89PNG\r\n\x1a\nrest"), Some("png"));
        assert_eq!(picture(&[0xFF, 0xD8, 0xFF, 0xE0, 0]), Some("jpg"));
        assert_eq!(picture(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
        assert_eq!(picture(b"<html>"), None);
        assert_eq!(picture(b""), None);
    }

    mod browser {
        use std::sync::Mutex;

        use base64::Engine;
        use serde_json::{json, Value};

        use super::super::*;

        /// A browser that answers like the extension: a tab id, a ready state, a picture, a closed tab.
        struct Fake {
            calls: Mutex<Vec<(String, HashMap<String, String>)>>,
            ready_after: usize,
            picture: Vec<u8>,
        }

        impl Browse for Fake {
            async fn call(&self, method: &str, params: HashMap<String, String>) -> Result<Value, String> {
                let mut calls = self.calls.lock().unwrap();
                calls.push((method.to_string(), params));
                match method {
                    "Target.createTarget" => Ok(json!({ "result": { "targetId": "tab-7", "tabId": 7 } })),
                    "Runtime.evaluate" => {
                        let asked = calls.iter().filter(|(m, _)| m == "Runtime.evaluate").count();
                        let state = if asked > self.ready_after { "complete" } else { "loading" };
                        Ok(json!({ "result": { "result": { "type": "string", "value": state } } }))
                    }
                    "hanzo.screenshot" => Ok(json!({ "data": base64::engine::general_purpose::STANDARD.encode(&self.picture) })),
                    "Target.closeTarget" => Ok(json!({ "success": true })),
                    other => Err(format!("unknown method {other}")),
                }
            }
        }

        fn names(f: &Fake) -> Vec<String> {
            f.calls.lock().unwrap().iter().map(|(m, _)| m.clone()).collect()
        }

        #[tokio::test]
        async fn takes_a_picture_once_the_page_is_ready_and_closes_the_tab() {
            let f = Fake { calls: Mutex::default(), ready_after: 2, picture: b"\x89PNG\r\n\x1a\nbytes".to_vec() };
            let got = shoot(&f, "https://acme.test/", Duration::from_millis(1), Duration::from_secs(5)).await.unwrap();
            assert_eq!(got, (b"\x89PNG\r\n\x1a\nbytes".to_vec(), "png"));
            assert_eq!(
                names(&f),
                vec!["Target.createTarget", "Runtime.evaluate", "Runtime.evaluate", "Runtime.evaluate", "hanzo.screenshot", "Target.closeTarget"]
            );
            let calls = f.calls.lock().unwrap();
            assert_eq!(calls[0].1["url"], "https://acme.test/");
            let shot = calls.iter().find(|(m, _)| m == "hanzo.screenshot").unwrap();
            assert_eq!(shot.1["tabId"], "tab-7");
            assert_eq!(calls.last().unwrap().1["targetId"], "tab-7");
        }

        #[tokio::test]
        async fn a_picture_that_is_not_one_is_no_picture_and_the_tab_is_still_closed() {
            let f = Fake { calls: Mutex::default(), ready_after: 0, picture: b"not an image".to_vec() };
            assert!(shoot(&f, "https://acme.test/", Duration::from_millis(1), Duration::from_secs(5)).await.is_none());
            assert_eq!(names(&f).last().unwrap(), "Target.closeTarget");
        }

        #[tokio::test]
        async fn no_browser_is_no_picture() {
            assert!(shoot(&Nobody, "https://acme.test/", Duration::from_millis(1), Duration::from_secs(1)).await.is_none());
        }
    }
}
