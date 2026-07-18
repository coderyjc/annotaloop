use chrono::Utc;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::domain::{AppResult, OutlineItem};

pub fn extract_outline(content: &str) -> Vec<OutlineItem> {
    let mut outline = Vec::new();
    let mut offset = 0usize;
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') {
            let level = trimmed.chars().take_while(|char| *char == '#').count();
            if (1..=6).contains(&level) && trimmed.chars().nth(level) == Some(' ') {
                let title = trimmed[level..].trim().to_string();
                outline.push(OutlineItem {
                    level: level as i64,
                    offset: offset as i64,
                    id: slugify(&title, outline.len()),
                    title,
                });
            }
        }
        offset += line.len() + 1;
    }
    outline
}

pub fn collect_rows<T, F>(rows: rusqlite::MappedRows<'_, F>) -> AppResult<Vec<T>>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
{
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn scan_markdown_files(root_path: &Path) -> AppResult<Vec<PathBuf>> {
    let mut md_files = Vec::new();
    scan_markdown_files_inner(root_path, &mut md_files)?;
    md_files.sort();
    Ok(md_files)
}

fn scan_markdown_files_inner(folder_path: &Path, md_files: &mut Vec<PathBuf>) -> AppResult<()> {
    let entries = fs::read_dir(folder_path)
        .map_err(|error| format!("Failed to read book folder: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to read folder entry: {error}"))?;
        let entry_path = entry.path();
        if entry_path.is_dir() {
            scan_markdown_files_inner(&entry_path, md_files)?;
        } else if entry_path.is_file() && is_markdown_path(&entry_path) {
            md_files.push(
                entry_path
                    .canonicalize()
                    .map_err(|error| format!("Failed to resolve chapter path: {error}"))?,
            );
        }
    }
    Ok(())
}

pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
        .unwrap_or(false)
}

pub fn chapter_title_from_path(path: &Path, index: usize) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .or_else(|| {
            path.file_stem()
                .and_then(|stem| stem.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| format!("Chapter {}", index + 1))
}

pub fn chapter_title_from_root(_root_path: &Path, path: &Path, index: usize) -> String {
    chapter_title_from_path(path, index)
}

pub fn chapter_file_name_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| path.to_string())
}

pub fn repeat_placeholders(count: usize) -> String {
    std::iter::repeat("?")
        .take(count)
        .collect::<Vec<_>>()
        .join(",")
}

pub fn validate_annotation_status(status: &str) -> AppResult<()> {
    match status {
        "pending" | "processed" | "exported" | "ignored" => Ok(()),
        _ => Err("Unknown annotation status.".to_string()),
    }
}

pub fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub fn hash_content(content: &str) -> String {
    let digest = Sha256::digest(content.as_bytes());
    format!("{digest:x}")
}

pub fn now() -> String {
    Utc::now().to_rfc3339()
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn db_error(error: rusqlite::Error) -> String {
    format!("Database error: {error}")
}

fn slugify(title: &str, index: usize) -> String {
    let mut slug = title
        .chars()
        .filter_map(|char| {
            if char.is_alphanumeric() {
                Some(char.to_ascii_lowercase())
            } else if char.is_whitespace() || char == '-' || char == '_' {
                Some('-')
            } else {
                None
            }
        })
        .collect::<String>();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        format!("heading-{index}")
    } else {
        format!("{slug}-{index}")
    }
}
