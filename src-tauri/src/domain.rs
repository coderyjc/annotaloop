use serde::{Deserialize, Serialize};

pub type AppResult<T> = Result<T, String>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub view_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSummary {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub view_mode: String,
    pub created_at: String,
    pub updated_at: String,
    pub chapter_count: i64,
    pub annotation_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub id: String,
    pub book_id: String,
    pub file_path: String,
    pub title: String,
    pub sort_index: i64,
    pub current_version_id: String,
    pub is_missing: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterVersion {
    pub id: String,
    pub chapter_id: String,
    pub content_hash: String,
    pub version_number: i64,
    pub label: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub book_id: String,
    pub chapter_id: String,
    pub chapter_version_id: String,
    pub selected_text: String,
    pub start_offset: i64,
    pub end_offset: i64,
    pub rendered_start_offset: Option<i64>,
    pub rendered_end_offset: Option<i64>,
    pub context_before: String,
    pub context_after: String,
    pub heading_path: String,
    pub highlight_color: String,
    pub comment: String,
    pub tags: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteItem {
    pub id: String,
    pub book_id: String,
    pub book_name: String,
    pub chapter_id: String,
    pub chapter_title: String,
    pub chapter_version_id: String,
    pub selected_text: String,
    pub heading_path: String,
    pub highlight_color: String,
    pub comment: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentSearchResult {
    pub book_id: String,
    pub book_name: String,
    pub chapter_id: String,
    pub chapter_title: String,
    pub chapter_version_id: String,
    pub excerpt: String,
    pub matched_text: String,
    pub start_offset: i64,
    pub end_offset: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineItem {
    pub level: i64,
    pub title: String,
    pub offset: i64,
    pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookWithChapters {
    pub book: Book,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadChapterResponse {
    pub chapter: Chapter,
    pub version: ChapterVersion,
    pub versions: Vec<ChapterVersion>,
    pub content: String,
    pub outline: Vec<OutlineItem>,
    pub annotations: Vec<Annotation>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationPayload {
    pub book_id: String,
    pub chapter_id: String,
    pub chapter_version_id: String,
    pub selected_text: String,
    pub start_offset: i64,
    pub end_offset: i64,
    pub rendered_start_offset: Option<i64>,
    pub rendered_end_offset: Option<i64>,
    pub context_before: String,
    pub context_after: String,
    pub heading_path: String,
    pub highlight_color: String,
    pub comment: String,
    pub tags: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationPatch {
    pub highlight_color: Option<String>,
    pub comment: Option<String>,
    pub tags: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationScope {
    pub book_id: Option<String>,
    pub chapter_id: Option<String>,
    pub chapter_version_id: Option<String>,
    pub annotation_ids: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub annotation_context_chars: i64,
    pub theme: String,
    pub font_family: String,
    pub font_size: i64,
    pub line_height: f64,
    pub content_width: i64,
    pub page_padding: i64,
    pub paragraph_spacing: i64,
    pub surface: String,
    pub border_style: String,
    pub shortcut_bindings: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPreset {
    pub id: String,
    pub name: String,
    pub base_template_id: String,
    pub system_prompt: String,
    pub task_prompt: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPresetPayload {
    pub name: String,
    pub base_template_id: String,
    pub system_prompt: String,
    pub task_prompt: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub annotation_context_chars: Option<i64>,
    pub theme: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<i64>,
    pub line_height: Option<f64>,
    pub content_width: Option<i64>,
    pub page_padding: Option<i64>,
    pub paragraph_spacing: Option<i64>,
    pub surface: Option<String>,
    pub border_style: Option<String>,
    pub shortcut_bindings: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgressPayload {
    pub book_id: String,
    pub chapter_id: String,
    pub chapter_version_id: String,
    pub scroll_top: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub book_id: String,
    pub chapter_id: String,
    pub chapter_version_id: String,
    pub scroll_top: f64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncReport {
    pub added: i64,
    pub missing: i64,
    pub changed: i64,
    pub renamed: i64,
    pub unchanged: i64,
    pub messages: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
}

#[derive(Debug)]
pub struct ExportRow {
    pub annotation: Annotation,
    pub chapter_title: String,
    pub chapter_sort_index: i64,
}
