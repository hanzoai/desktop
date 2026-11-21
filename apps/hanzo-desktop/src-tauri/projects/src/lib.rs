//! The project folders on this computer, found where people keep them.
//!
//! A run on this computer works in a folder, and the person should not have to browse for it: Auto
//! picks the one the ask is about (build's `local.ts`), from the folders Hanzo opened and the ones
//! found here. A folder is a project when it holds something projects hold (a git checkout, a
//! package manifest, a page), and it is looked for in the usual places under the home folder (`PLACES`), at most
//! two folders down (`~/work/app`, `~/work/org/app`), never inside another project and never in a
//! hidden or generated folder. Only names and times are read; no file's contents are.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// The places under the home folder projects usually live in.
///
/// Not Documents or Desktop: macOS asks the person's permission the first time an app reads them, and a
/// folder there is rarely a project. A project kept anywhere else is found once it has been opened in Hanzo.
pub const PLACES: &[&str] = &["code", "dev", "src", "Projects", "work", "git"];

/// What a project folder holds: a git checkout, a manifest of a language's tooling, or a page.
pub const MARKERS: &[&str] = &[
    ".git",
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "Gemfile",
    "composer.json",
    "pom.xml",
    "build.gradle",
    "deno.json",
    "mix.exs",
    "CMakeLists.txt",
    "index.html",
];

/// Folders that hold what is built or installed, never a person's project.
const GENERATED: &[&str] = &["node_modules", "target", "dist", "build", "vendor", "venv", "__pycache__", "out"];

/// How many folders are looked at in all, so a home folder with thousands of checkouts answers promptly.
const BUDGET: usize = 4000;

/// How many projects are answered.
pub const LIMIT: usize = 50;

/// A project folder, as the desktop hands it to the app.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub name: String,
    pub path: PathBuf,
    /// When it was last touched (ms since the epoch): the newest of the folder and what marks it a project.
    pub modified: u64,
}

fn millis(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn visible(name: &str) -> bool {
    !name.starts_with('.') && !GENERATED.contains(&name)
}

/// The project at `dir`, or `None` when it holds none of the [`MARKERS`].
fn project(dir: &Path) -> Option<Project> {
    let mut found = false;
    let mut modified = millis(dir);
    for marker in MARKERS {
        let path = dir.join(marker);
        if path.exists() {
            found = true;
            modified = modified.max(millis(&path));
        }
    }
    let name = dir.file_name()?.to_string_lossy().into_owned();
    found.then(|| Project { name, path: dir.to_path_buf(), modified })
}

fn subfolders(dir: &Path) -> Vec<PathBuf> {
    let Ok(read) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<PathBuf> = read
        .flatten()
        .filter(|e| visible(&e.file_name().to_string_lossy()))
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    out.sort();
    out
}

/// The projects in `places` (folders under `home`), at most two folders down, newest first. `limit` caps the answer.
pub fn discover_in(home: &Path, places: &[&str], limit: usize) -> Vec<Project> {
    let mut seen = 0usize;
    let mut found: Vec<Project> = Vec::new();
    'places: for place in places {
        let root = home.join(place);
        for child in subfolders(&root) {
            seen += 1;
            if seen > BUDGET {
                break 'places;
            }
            if let Some(p) = project(&child) {
                found.push(p);
                continue;
            }
            for grandchild in subfolders(&child) {
                seen += 1;
                if seen > BUDGET {
                    break 'places;
                }
                if let Some(p) = project(&grandchild) {
                    found.push(p);
                }
            }
        }
    }
    found.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.path.cmp(&b.path)));
    found.dedup_by(|a, b| a.path == b.path);
    found.truncate(limit);
    found
}

/// The projects under `home`, in the usual places ([`PLACES`]), newest first, at most [`LIMIT`].
pub fn discover(home: &Path) -> Vec<Project> {
    discover_in(home, PLACES, LIMIT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};

    fn now() -> u64 {
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
    }

    fn touch(path: &Path, age: u64) {
        let file = fs::OpenOptions::new().write(true).open(path).unwrap();
        file.set_modified(SystemTime::now() - Duration::from_secs(age)).unwrap();
    }

    fn mark(dir: &Path, marker: &str, age: u64) {
        fs::create_dir_all(dir).unwrap();
        let path = dir.join(marker);
        fs::write(&path, b"{}").unwrap();
        touch(&path, age);
        let folder = fs::File::open(dir).unwrap();
        folder.set_modified(SystemTime::now() - Duration::from_secs(age)).unwrap();
    }

    fn names(found: &[Project]) -> Vec<&str> {
        found.iter().map(|p| p.name.as_str()).collect()
    }

    #[test]
    fn finds_projects_one_and_two_folders_down_newest_first() {
        let home = tempfile::tempdir().unwrap();
        mark(&home.path().join("work/shop"), "package.json", 300);
        mark(&home.path().join("work/hanzo/desktop"), "Cargo.toml", 100);
        mark(&home.path().join("src/blog"), "index.html", 200);
        let found = discover(home.path());
        assert_eq!(names(&found), ["desktop", "blog", "shop"]);
        assert_eq!(found[0].path, home.path().join("work/hanzo/desktop"));
        assert!(found[0].modified > found[1].modified);
    }

    #[test]
    fn looks_in_the_six_usual_places_and_nowhere_else() {
        let home = tempfile::tempdir().unwrap();
        for (i, place) in ["code", "dev", "src", "Projects", "work", "git"].iter().enumerate() {
            mark(&home.path().join(place).join(format!("p{i}")), "package.json", 10 + i as u64);
        }
        // Documents and Desktop are never read, nor is any other folder under home.
        for place in ["Documents", "Desktop", "Developer", "repos", "Downloads", "Sites"] {
            mark(&home.path().join(place).join("elsewhere"), "package.json", 5);
        }
        assert_eq!(PLACES, ["code", "dev", "src", "Projects", "work", "git"]);
        assert_eq!(names(&discover(home.path())), ["p0", "p1", "p2", "p3", "p4", "p5"]);
    }

    #[test]
    fn a_git_checkout_counts_and_a_folder_of_notes_does_not() {
        let home = tempfile::tempdir().unwrap();
        fs::create_dir_all(home.path().join("code/api/.git")).unwrap();
        fs::create_dir_all(home.path().join("code/notes")).unwrap();
        fs::write(home.path().join("code/notes/todo.txt"), b"x").unwrap();
        assert_eq!(names(&discover(home.path())), ["api"]);
    }

    #[test]
    fn never_looks_inside_a_project_nor_deeper_than_two_folders() {
        let home = tempfile::tempdir().unwrap();
        mark(&home.path().join("work/mono"), "package.json", 10);
        mark(&home.path().join("work/mono/packages/inner"), "package.json", 5);
        mark(&home.path().join("work/a/b/too-deep"), "package.json", 5);
        assert_eq!(names(&discover(home.path())), ["mono"]);
    }

    #[test]
    fn skips_hidden_and_generated_folders_and_places_that_are_not_there() {
        let home = tempfile::tempdir().unwrap();
        mark(&home.path().join("work/.cache/hidden"), "package.json", 5);
        mark(&home.path().join("work/vendor"), "package.json", 5);
        mark(&home.path().join("work/ok/node_modules"), "package.json", 5);
        mark(&home.path().join("Library/Caches/x"), "package.json", 5);
        mark(&home.path().join("work/real"), "package.json", 5);
        assert_eq!(names(&discover(home.path())), ["real"]);
        assert!(discover(&home.path().join("missing")).is_empty());
    }

    #[test]
    fn answers_at_most_the_limit_keeping_the_newest() {
        let home = tempfile::tempdir().unwrap();
        for i in 0..8u64 {
            mark(&home.path().join(format!("work/p{i}")), "package.json", 100 + i * 10);
        }
        let found = discover_in(home.path(), PLACES, 3);
        assert_eq!(names(&found), ["p0", "p1", "p2"]);
    }

    #[test]
    fn a_folder_in_two_places_is_listed_once() {
        let home = tempfile::tempdir().unwrap();
        mark(&home.path().join("work/shop"), "package.json", 5);
        let found = discover_in(home.path(), &["work", "work"], LIMIT);
        assert_eq!(names(&found), ["shop"]);
    }

    #[test]
    fn a_projects_time_is_the_newest_of_it_and_its_marker() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join("work/shop");
        mark(&dir, "package.json", 1000);
        touch(&dir.join("package.json"), 10);
        let found = discover(home.path());
        assert!(now() - found[0].modified < 60_000);
    }
}
