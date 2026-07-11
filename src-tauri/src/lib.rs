use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State};
use uuid::Uuid;

type AppResult<T> = Result<T, String>;

struct AppState {
    conn: Mutex<Connection>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Book {
    id: String,
    name: String,
    root_path: String,
    view_mode: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BookSummary {
    id: String,
    name: String,
    root_path: String,
    view_mode: String,
    created_at: String,
    updated_at: String,
    chapter_count: i64,
    annotation_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Chapter {
    id: String,
    book_id: String,
    file_path: String,
    title: String,
    sort_index: i64,
    current_version_id: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChapterVersion {
    id: String,
    chapter_id: String,
    content_hash: String,
    version_number: i64,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Annotation {
    id: String,
    book_id: String,
    chapter_id: String,
    chapter_version_id: String,
    selected_text: String,
    start_offset: i64,
    end_offset: i64,
    context_before: String,
    context_after: String,
    heading_path: String,
    highlight_color: String,
    comment: String,
    tags: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteItem {
    id: String,
    book_id: String,
    book_name: String,
    chapter_id: String,
    chapter_title: String,
    chapter_version_id: String,
    selected_text: String,
    heading_path: String,
    highlight_color: String,
    comment: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutlineItem {
    level: i64,
    title: String,
    offset: i64,
    id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BookWithChapters {
    book: Book,
    chapters: Vec<Chapter>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadChapterResponse {
    chapter: Chapter,
    version: ChapterVersion,
    versions: Vec<ChapterVersion>,
    content: String,
    outline: Vec<OutlineItem>,
    annotations: Vec<Annotation>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationPayload {
    book_id: String,
    chapter_id: String,
    chapter_version_id: String,
    selected_text: String,
    start_offset: i64,
    end_offset: i64,
    context_before: String,
    context_after: String,
    heading_path: String,
    highlight_color: String,
    comment: String,
    tags: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationPatch {
    highlight_color: Option<String>,
    comment: Option<String>,
    tags: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationScope {
    book_id: Option<String>,
    chapter_id: Option<String>,
    chapter_version_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    annotation_context_chars: i64,
    theme: String,
    font_family: String,
    font_size: i64,
    line_height: f64,
    content_width: i64,
    page_padding: i64,
    paragraph_spacing: i64,
    surface: String,
    border_style: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsPatch {
    annotation_context_chars: Option<i64>,
    theme: Option<String>,
    font_family: Option<String>,
    font_size: Option<i64>,
    line_height: Option<f64>,
    content_width: Option<i64>,
    page_padding: Option<i64>,
    paragraph_spacing: Option<i64>,
    surface: Option<String>,
    border_style: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadingProgressPayload {
    book_id: String,
    chapter_id: String,
    chapter_version_id: String,
    scroll_top: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadingProgress {
    book_id: String,
    chapter_id: String,
    chapter_version_id: String,
    scroll_top: f64,
    updated_at: String,
}

#[derive(Debug)]
struct ExportRow {
    annotation: Annotation,
    chapter_title: String,
    chapter_sort_index: i64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("loop-book.sqlite3");
            let conn = init_database(&db_path)?;
            app.manage(AppState {
                conn: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_book_folder,
            import_book_folder,
            list_books,
            get_book,
            list_chapters,
            reorder_chapters,
            read_chapter,
            read_chapter_version,
            refresh_chapter_version,
            create_annotation,
            update_annotation,
            delete_annotation,
            list_annotations,
            list_note_items,
            export_annotations,
            get_settings,
            update_settings,
            save_reading_progress,
            get_latest_reading_progress
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Loop Book");
}

#[tauri::command]
fn pick_book_folder() -> AppResult<Option<String>> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select a Markdown book folder'
$dialog.ShowNewFolderButton = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.SelectedPath)
}
"#;
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-STA", "-Command", script])
            .output()
            .map_err(|error| format!("Failed to open folder picker: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Folder picker failed: {stderr}"));
        }

        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            Ok(None)
        } else {
            Ok(Some(selected))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

fn init_database(db_path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            view_mode TEXT NOT NULL DEFAULT 'grid',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            book_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            title TEXT NOT NULL,
            sort_index INTEGER NOT NULL,
            current_version_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(book_id, file_path),
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chapter_versions (
            id TEXT PRIMARY KEY,
            chapter_id TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            version_number INTEGER NOT NULL DEFAULT 1,
            content_snapshot TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS annotations (
            id TEXT PRIMARY KEY,
            book_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            chapter_version_id TEXT NOT NULL,
            selected_text TEXT NOT NULL,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            context_before TEXT NOT NULL,
            context_after TEXT NOT NULL,
            heading_path TEXT NOT NULL,
            highlight_color TEXT NOT NULL,
            comment TEXT NOT NULL,
            tags TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
            FOREIGN KEY(chapter_version_id) REFERENCES chapter_versions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reading_progress (
            book_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            chapter_version_id TEXT NOT NULL,
            scroll_top REAL NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(book_id, chapter_id, chapter_version_id),
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
            FOREIGN KEY(chapter_version_id) REFERENCES chapter_versions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            annotation_context_chars INTEGER NOT NULL,
            theme TEXT NOT NULL,
            font_family TEXT NOT NULL,
            font_size INTEGER NOT NULL,
            line_height REAL NOT NULL,
            content_width INTEGER NOT NULL,
            page_padding INTEGER NOT NULL,
            paragraph_spacing INTEGER NOT NULL,
            surface TEXT NOT NULL,
            border_style TEXT NOT NULL
        );
        "#,
    )?;

    ensure_column(
        &conn,
        "chapter_versions",
        "version_number",
        "ALTER TABLE chapter_versions ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1",
    )?;
    conn.execute_batch(
        r#"
        UPDATE chapter_versions
        SET version_number = (
            SELECT COUNT(*)
            FROM chapter_versions older
            WHERE older.chapter_id = chapter_versions.chapter_id
              AND (
                older.created_at < chapter_versions.created_at
                OR (older.created_at = chapter_versions.created_at AND older.id <= chapter_versions.id)
              )
        );
        "#,
    )?;

    conn.execute(
        r#"
        INSERT OR IGNORE INTO settings (
            id,
            annotation_context_chars,
            theme,
            font_family,
            font_size,
            line_height,
            content_width,
            page_padding,
            paragraph_spacing,
            surface,
            border_style
        ) VALUES (1, 100, 'paper', 'Literata, Georgia, serif', 18, 1.72, 820, 52, 18, 'warm', 'hairline')
        "#,
        [],
    )?;

    Ok(conn)
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    alter_sql: &str,
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(());
        }
    }
    conn.execute(alter_sql, [])?;
    Ok(())
}

#[tauri::command]
fn import_book_folder(path: String, state: State<AppState>) -> AppResult<BookWithChapters> {
    let root = PathBuf::from(path);
    if !root.is_dir() {
        return Err("Selected path is not a folder.".to_string());
    }

    let root_path = root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve folder path: {error}"))?;
    let root_path_text = path_to_string(&root_path);
    let mut conn = lock_conn(&state)?;

    if let Some(book) = get_book_by_root_path(&conn, &root_path_text)? {
        let chapters = load_chapters(&conn, &book.id)?;
        return Ok(BookWithChapters { book, chapters });
    }

    let mut md_files = Vec::new();
    let entries = fs::read_dir(&root_path)
        .map_err(|error| format!("Failed to read selected folder: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to read folder entry: {error}"))?;
        let entry_path = entry.path();
        if entry_path.is_file()
            && entry_path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        {
            md_files.push(entry_path);
        }
    }

    if md_files.is_empty() {
        return Err("No Markdown files were found in this folder.".to_string());
    }

    let now = now();
    let book_id = new_id();
    let book_name = root_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled Book")
        .to_string();

    let tx = conn
        .transaction()
        .map_err(|error| format!("Failed to start import transaction: {error}"))?;
    tx.execute(
        r#"
        INSERT INTO books (id, name, root_path, view_mode, created_at, updated_at)
        VALUES (?1, ?2, ?3, 'grid', ?4, ?4)
        "#,
        params![book_id, book_name, root_path_text, now],
    )
    .map_err(|error| format!("Failed to create book: {error}"))?;

    for (index, file_path) in md_files.iter().enumerate() {
        let content = fs::read_to_string(file_path)
            .map_err(|error| format!("Failed to read {}: {error}", path_to_string(file_path)))?;
        let title = extract_title(&content)
            .or_else(|| file_path.file_stem().and_then(|stem| stem.to_str()).map(str::to_string))
            .unwrap_or_else(|| format!("Chapter {}", index + 1));
        let chapter_id = new_id();
        let version_id = new_id();
        let content_hash = hash_content(&content);
        let file_path_text = path_to_string(file_path);

        tx.execute(
            r#"
            INSERT INTO chapters (
                id, book_id, file_path, title, sort_index, current_version_id, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            "#,
            params![
                chapter_id,
                book_id,
                file_path_text,
                title,
                index as i64,
                version_id,
                now
            ],
        )
        .map_err(|error| format!("Failed to create chapter: {error}"))?;

        tx.execute(
            r#"
            INSERT INTO chapter_versions (id, chapter_id, content_hash, version_number, content_snapshot, created_at)
            VALUES (?1, ?2, ?3, 1, ?4, ?5)
            "#,
            params![version_id, chapter_id, content_hash, content, now],
        )
        .map_err(|error| format!("Failed to create chapter version: {error}"))?;
    }

    tx.commit()
        .map_err(|error| format!("Failed to finish import: {error}"))?;

    let book = get_book_by_id(&conn, &book_id)?;
    let chapters = load_chapters(&conn, &book_id)?;
    Ok(BookWithChapters { book, chapters })
}

#[tauri::command]
fn list_books(state: State<AppState>) -> AppResult<Vec<BookSummary>> {
    let conn = lock_conn(&state)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                b.id,
                b.name,
                b.root_path,
                b.view_mode,
                b.created_at,
                b.updated_at,
                COUNT(DISTINCT c.id) AS chapter_count,
                COUNT(DISTINCT a.id) AS annotation_count
            FROM books b
            LEFT JOIN chapters c ON c.book_id = b.id
            LEFT JOIN annotations a ON a.book_id = b.id
            GROUP BY b.id
            ORDER BY b.updated_at DESC
            "#,
        )
        .map_err(db_error)?;

    let rows = stmt
        .query_map([], |row| {
            Ok(BookSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                root_path: row.get(2)?,
                view_mode: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                chapter_count: row.get(6)?,
                annotation_count: row.get(7)?,
            })
        })
        .map_err(db_error)?;

    collect_rows(rows)
}

#[tauri::command]
fn get_book(book_id: String, state: State<AppState>) -> AppResult<Book> {
    let conn = lock_conn(&state)?;
    get_book_by_id(&conn, &book_id)
}

#[tauri::command]
fn list_chapters(book_id: String, state: State<AppState>) -> AppResult<Vec<Chapter>> {
    let conn = lock_conn(&state)?;
    load_chapters(&conn, &book_id)
}

#[tauri::command]
fn reorder_chapters(
    book_id: String,
    chapter_ids_in_order: Vec<String>,
    state: State<AppState>,
) -> AppResult<Vec<Chapter>> {
    let mut conn = lock_conn(&state)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("Failed to start reorder transaction: {error}"))?;
    let now = now();

    for (index, chapter_id) in chapter_ids_in_order.iter().enumerate() {
        tx.execute(
            "UPDATE chapters SET sort_index = ?1, updated_at = ?2 WHERE id = ?3 AND book_id = ?4",
            params![index as i64, now, chapter_id, book_id],
        )
        .map_err(|error| format!("Failed to reorder chapter: {error}"))?;
    }

    tx.execute(
        "UPDATE books SET updated_at = ?1 WHERE id = ?2",
        params![now, book_id],
    )
    .map_err(db_error)?;

    tx.commit()
        .map_err(|error| format!("Failed to save chapter order: {error}"))?;

    load_chapters(&conn, &book_id)
}

#[tauri::command]
fn read_chapter(chapter_id: String, state: State<AppState>) -> AppResult<ReadChapterResponse> {
    let mut conn = lock_conn(&state)?;
    ensure_current_chapter_version(&mut conn, &chapter_id)?;
    let chapter = get_chapter_by_id(&conn, &chapter_id)?;
    read_chapter_payload(&conn, &chapter.current_version_id)
}

#[tauri::command]
fn read_chapter_version(
    chapter_version_id: String,
    state: State<AppState>,
) -> AppResult<ReadChapterResponse> {
    let conn = lock_conn(&state)?;
    read_chapter_payload(&conn, &chapter_version_id)
}

#[tauri::command]
fn refresh_chapter_version(
    chapter_id: String,
    state: State<AppState>,
) -> AppResult<ChapterVersion> {
    let mut conn = lock_conn(&state)?;
    ensure_current_chapter_version(&mut conn, &chapter_id)?;
    let chapter = get_chapter_by_id(&conn, &chapter_id)?;
    get_chapter_version_by_id(&conn, &chapter.current_version_id)
}

#[tauri::command]
fn create_annotation(
    payload: AnnotationPayload,
    state: State<AppState>,
) -> AppResult<Annotation> {
    let conn = lock_conn(&state)?;
    let id = new_id();
    let now = now();
    conn.execute(
        r#"
        INSERT INTO annotations (
            id,
            book_id,
            chapter_id,
            chapter_version_id,
            selected_text,
            start_offset,
            end_offset,
            context_before,
            context_after,
            heading_path,
            highlight_color,
            comment,
            tags,
            created_at,
            updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
        "#,
        params![
            id,
            payload.book_id,
            payload.chapter_id,
            payload.chapter_version_id,
            payload.selected_text,
            payload.start_offset,
            payload.end_offset,
            payload.context_before,
            payload.context_after,
            payload.heading_path,
            payload.highlight_color,
            payload.comment,
            payload.tags,
            now
        ],
    )
    .map_err(|error| format!("Failed to create annotation: {error}"))?;

    get_annotation_by_id(&conn, &id)
}

#[tauri::command]
fn update_annotation(
    annotation_id: String,
    patch: AnnotationPatch,
    state: State<AppState>,
) -> AppResult<Annotation> {
    let conn = lock_conn(&state)?;
    let existing = get_annotation_by_id(&conn, &annotation_id)?;
    let now = now();
    conn.execute(
        r#"
        UPDATE annotations
        SET highlight_color = ?1, comment = ?2, tags = ?3, updated_at = ?4
        WHERE id = ?5
        "#,
        params![
            patch.highlight_color.unwrap_or(existing.highlight_color),
            patch.comment.unwrap_or(existing.comment),
            patch.tags.unwrap_or(existing.tags),
            now,
            annotation_id
        ],
    )
    .map_err(|error| format!("Failed to update annotation: {error}"))?;

    get_annotation_by_id(&conn, &annotation_id)
}

#[tauri::command]
fn delete_annotation(annotation_id: String, state: State<AppState>) -> AppResult<()> {
    let conn = lock_conn(&state)?;
    conn.execute("DELETE FROM annotations WHERE id = ?1", params![annotation_id])
        .map_err(|error| format!("Failed to delete annotation: {error}"))?;
    Ok(())
}

#[tauri::command]
fn list_annotations(
    scope: AnnotationScope,
    state: State<AppState>,
) -> AppResult<Vec<Annotation>> {
    let conn = lock_conn(&state)?;
    load_annotations(&conn, &scope)
}

#[tauri::command]
fn list_note_items(state: State<AppState>) -> AppResult<Vec<NoteItem>> {
    let conn = lock_conn(&state)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                a.id,
                a.book_id,
                b.name,
                a.chapter_id,
                c.title,
                a.chapter_version_id,
                a.selected_text,
                a.heading_path,
                a.highlight_color,
                a.comment,
                a.created_at,
                a.updated_at
            FROM annotations a
            JOIN books b ON b.id = a.book_id
            JOIN chapters c ON c.id = a.chapter_id
            ORDER BY a.updated_at DESC, a.created_at DESC
            "#,
        )
        .map_err(db_error)?;

    let rows = stmt
        .query_map([], |row| {
            Ok(NoteItem {
                id: row.get(0)?,
                book_id: row.get(1)?,
                book_name: row.get(2)?,
                chapter_id: row.get(3)?,
                chapter_title: row.get(4)?,
                chapter_version_id: row.get(5)?,
                selected_text: row.get(6)?,
                heading_path: row.get(7)?,
                highlight_color: row.get(8)?,
                comment: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(db_error)?;

    collect_rows(rows)
}

#[tauri::command]
fn export_annotations(
    scope: AnnotationScope,
    template_id: String,
    state: State<AppState>,
) -> AppResult<String> {
    let conn = lock_conn(&state)?;
    let rows = load_export_rows(&conn, &scope)?;
    Ok(render_export(&template_id, &rows))
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> AppResult<AppSettings> {
    let conn = lock_conn(&state)?;
    load_settings(&conn)
}

#[tauri::command]
fn update_settings(patch: SettingsPatch, state: State<AppState>) -> AppResult<AppSettings> {
    let conn = lock_conn(&state)?;
    let current = load_settings(&conn)?;
    conn.execute(
        r#"
        UPDATE settings
        SET
            annotation_context_chars = ?1,
            theme = ?2,
            font_family = ?3,
            font_size = ?4,
            line_height = ?5,
            content_width = ?6,
            page_padding = ?7,
            paragraph_spacing = ?8,
            surface = ?9,
            border_style = ?10
        WHERE id = 1
        "#,
        params![
            patch
                .annotation_context_chars
                .unwrap_or(current.annotation_context_chars),
            patch.theme.unwrap_or(current.theme),
            patch.font_family.unwrap_or(current.font_family),
            patch.font_size.unwrap_or(current.font_size),
            patch.line_height.unwrap_or(current.line_height),
            patch.content_width.unwrap_or(current.content_width),
            patch.page_padding.unwrap_or(current.page_padding),
            patch.paragraph_spacing.unwrap_or(current.paragraph_spacing),
            patch.surface.unwrap_or(current.surface),
            patch.border_style.unwrap_or(current.border_style)
        ],
    )
    .map_err(|error| format!("Failed to update settings: {error}"))?;
    load_settings(&conn)
}

#[tauri::command]
fn save_reading_progress(
    payload: ReadingProgressPayload,
    state: State<AppState>,
) -> AppResult<ReadingProgress> {
    let conn = lock_conn(&state)?;
    let now = now();
    conn.execute(
        r#"
        INSERT INTO reading_progress (
            book_id,
            chapter_id,
            chapter_version_id,
            scroll_top,
            updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(book_id, chapter_id, chapter_version_id) DO UPDATE SET
            scroll_top = excluded.scroll_top,
            updated_at = excluded.updated_at
        "#,
        params![
            payload.book_id,
            payload.chapter_id,
            payload.chapter_version_id,
            payload.scroll_top,
            now
        ],
    )
    .map_err(|error| format!("Failed to save reading progress: {error}"))?;

    Ok(ReadingProgress {
        book_id: payload.book_id,
        chapter_id: payload.chapter_id,
        chapter_version_id: payload.chapter_version_id,
        scroll_top: payload.scroll_top,
        updated_at: now,
    })
}

#[tauri::command]
fn get_latest_reading_progress(
    book_id: String,
    state: State<AppState>,
) -> AppResult<Option<ReadingProgress>> {
    let conn = lock_conn(&state)?;
    conn.query_row(
        r#"
        SELECT book_id, chapter_id, chapter_version_id, scroll_top, updated_at
        FROM reading_progress
        WHERE book_id = ?1
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
        params![book_id],
        |row| {
            Ok(ReadingProgress {
                book_id: row.get(0)?,
                chapter_id: row.get(1)?,
                chapter_version_id: row.get(2)?,
                scroll_top: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(db_error)
}

fn lock_conn<'a, 'b>(
    state: &'a State<'b, AppState>,
) -> AppResult<std::sync::MutexGuard<'a, Connection>> {
    state
        .conn
        .lock()
        .map_err(|_| "Database lock is poisoned.".to_string())
}

fn ensure_current_chapter_version(conn: &mut Connection, chapter_id: &str) -> AppResult<()> {
    let chapter = get_chapter_by_id(conn, chapter_id)?;
    let current_version = get_chapter_version_by_id(conn, &chapter.current_version_id)?;
    let file_content = match fs::read_to_string(&chapter.file_path) {
        Ok(content) => content,
        Err(_) => return Ok(()),
    };
    let file_hash = hash_content(&file_content);

    if file_hash == current_version.content_hash {
        return Ok(());
    }

    let version_id = new_id();
    let next_version_number: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM chapter_versions WHERE chapter_id = ?1",
            params![chapter_id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    let now = now();
    let tx = conn
        .transaction()
        .map_err(|error| format!("Failed to start version transaction: {error}"))?;
    tx.execute(
        r#"
        INSERT INTO chapter_versions (id, chapter_id, content_hash, version_number, content_snapshot, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![
            version_id,
            chapter_id,
            file_hash,
            next_version_number,
            file_content,
            now
        ],
    )
    .map_err(|error| format!("Failed to create chapter version: {error}"))?;

    tx.execute(
        "UPDATE chapters SET current_version_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![version_id, now, chapter_id],
    )
    .map_err(|error| format!("Failed to update current chapter version: {error}"))?;

    tx.execute(
        "UPDATE books SET updated_at = ?1 WHERE id = ?2",
        params![now, chapter.book_id],
    )
    .map_err(db_error)?;

    tx.commit()
        .map_err(|error| format!("Failed to save new chapter version: {error}"))?;

    Ok(())
}

fn read_chapter_payload(
    conn: &Connection,
    chapter_version_id: &str,
) -> AppResult<ReadChapterResponse> {
    let version = get_chapter_version_by_id(conn, chapter_version_id)?;
    let chapter = get_chapter_by_id(conn, &version.chapter_id)?;
    let content = get_chapter_snapshot(conn, chapter_version_id)?;
    let versions = load_chapter_versions(conn, &chapter.id)?;
    let annotations = load_annotations(
        conn,
        &AnnotationScope {
            book_id: Some(chapter.book_id.clone()),
            chapter_id: Some(chapter.id.clone()),
            chapter_version_id: Some(version.id.clone()),
        },
    )?;

    Ok(ReadChapterResponse {
        chapter,
        version,
        versions,
        outline: extract_outline(&content),
        content,
        annotations,
    })
}

fn get_book_by_root_path(conn: &Connection, root_path: &str) -> AppResult<Option<Book>> {
    conn.query_row(
        "SELECT id, name, root_path, view_mode, created_at, updated_at FROM books WHERE root_path = ?1",
        params![root_path],
        map_book,
    )
    .optional()
    .map_err(db_error)
}

fn get_book_by_id(conn: &Connection, book_id: &str) -> AppResult<Book> {
    conn.query_row(
        "SELECT id, name, root_path, view_mode, created_at, updated_at FROM books WHERE id = ?1",
        params![book_id],
        map_book,
    )
    .map_err(|error| format!("Book not found: {error}"))
}

fn get_chapter_by_id(conn: &Connection, chapter_id: &str) -> AppResult<Chapter> {
    conn.query_row(
        r#"
        SELECT id, book_id, file_path, title, sort_index, current_version_id, created_at, updated_at
        FROM chapters
        WHERE id = ?1
        "#,
        params![chapter_id],
        map_chapter,
    )
    .map_err(|error| format!("Chapter not found: {error}"))
}

fn load_chapters(conn: &Connection, book_id: &str) -> AppResult<Vec<Chapter>> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, book_id, file_path, title, sort_index, current_version_id, created_at, updated_at
            FROM chapters
            WHERE book_id = ?1
            ORDER BY sort_index ASC, created_at ASC
            "#,
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![book_id], map_chapter)
        .map_err(db_error)?;
    collect_rows(rows)
}

fn get_chapter_version_by_id(
    conn: &Connection,
    chapter_version_id: &str,
) -> AppResult<ChapterVersion> {
    conn.query_row(
        "SELECT id, chapter_id, content_hash, version_number, created_at FROM chapter_versions WHERE id = ?1",
        params![chapter_version_id],
        map_chapter_version,
    )
    .map_err(|error| format!("Chapter version not found: {error}"))
}

fn get_chapter_snapshot(conn: &Connection, chapter_version_id: &str) -> AppResult<String> {
    conn.query_row(
        "SELECT content_snapshot FROM chapter_versions WHERE id = ?1",
        params![chapter_version_id],
        |row| row.get(0),
    )
    .map_err(|error| format!("Chapter snapshot not found: {error}"))
}

fn load_chapter_versions(conn: &Connection, chapter_id: &str) -> AppResult<Vec<ChapterVersion>> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, chapter_id, content_hash, version_number, created_at
            FROM chapter_versions
            WHERE chapter_id = ?1
            ORDER BY version_number DESC, created_at DESC
            "#,
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![chapter_id], map_chapter_version)
        .map_err(db_error)?;
    collect_rows(rows)
}

fn get_annotation_by_id(conn: &Connection, annotation_id: &str) -> AppResult<Annotation> {
    conn.query_row(
        r#"
        SELECT
            id,
            book_id,
            chapter_id,
            chapter_version_id,
            selected_text,
            start_offset,
            end_offset,
            context_before,
            context_after,
            heading_path,
            highlight_color,
            comment,
            tags,
            created_at,
            updated_at
        FROM annotations
        WHERE id = ?1
        "#,
        params![annotation_id],
        map_annotation,
    )
    .map_err(|error| format!("Annotation not found: {error}"))
}

fn load_annotations(conn: &Connection, scope: &AnnotationScope) -> AppResult<Vec<Annotation>> {
    match (&scope.book_id, &scope.chapter_id, &scope.chapter_version_id) {
        (_, _, Some(version_id)) => query_annotations(
            conn,
            "WHERE chapter_version_id = ?1 ORDER BY start_offset ASC, created_at ASC",
            params![version_id],
        ),
        (_, Some(chapter_id), None) => query_annotations(
            conn,
            "WHERE chapter_id = ?1 ORDER BY start_offset ASC, created_at ASC",
            params![chapter_id],
        ),
        (Some(book_id), None, None) => query_annotations(
            conn,
            "WHERE book_id = ?1 ORDER BY created_at DESC",
            params![book_id],
        ),
        _ => query_annotations(conn, "ORDER BY created_at DESC", []),
    }
}

fn query_annotations<P>(
    conn: &Connection,
    suffix: &str,
    params: P,
) -> AppResult<Vec<Annotation>>
where
    P: rusqlite::Params,
{
    let sql = format!(
        r#"
        SELECT
            id,
            book_id,
            chapter_id,
            chapter_version_id,
            selected_text,
            start_offset,
            end_offset,
            context_before,
            context_after,
            heading_path,
            highlight_color,
            comment,
            tags,
            created_at,
            updated_at
        FROM annotations
        {suffix}
        "#
    );
    let mut stmt = conn.prepare(&sql).map_err(db_error)?;
    let rows = stmt.query_map(params, map_annotation).map_err(db_error)?;
    collect_rows(rows)
}

fn load_export_rows(conn: &Connection, scope: &AnnotationScope) -> AppResult<Vec<ExportRow>> {
    let (where_clause, bind_value) = if let Some(version_id) = &scope.chapter_version_id {
        ("a.chapter_version_id = ?1".to_string(), version_id.clone())
    } else if let Some(chapter_id) = &scope.chapter_id {
        ("a.chapter_id = ?1 AND a.chapter_version_id = c.current_version_id".to_string(), chapter_id.clone())
    } else if let Some(book_id) = &scope.book_id {
        ("a.book_id = ?1 AND a.chapter_version_id = c.current_version_id".to_string(), book_id.clone())
    } else {
        ("a.chapter_version_id = c.current_version_id".to_string(), String::new())
    };

    let sql = format!(
        r#"
        SELECT
            a.id,
            a.book_id,
            a.chapter_id,
            a.chapter_version_id,
            a.selected_text,
            a.start_offset,
            a.end_offset,
            a.context_before,
            a.context_after,
            a.heading_path,
            a.highlight_color,
            a.comment,
            a.tags,
            a.created_at,
            a.updated_at,
            c.title,
            c.sort_index
        FROM annotations a
        JOIN chapters c ON c.id = a.chapter_id
        WHERE {where_clause}
        ORDER BY c.sort_index ASC, a.start_offset ASC, a.created_at ASC
        "#
    );

    let mut stmt = conn.prepare(&sql).map_err(db_error)?;
    let rows = if bind_value.is_empty() && scope.book_id.is_none() && scope.chapter_id.is_none() && scope.chapter_version_id.is_none() {
        stmt.query_map([], map_export_row).map_err(db_error)?
    } else {
        stmt.query_map(params![bind_value], map_export_row)
            .map_err(db_error)?
    };

    collect_rows(rows)
}

fn load_settings(conn: &Connection) -> AppResult<AppSettings> {
    conn.query_row(
        r#"
        SELECT
            annotation_context_chars,
            theme,
            font_family,
            font_size,
            line_height,
            content_width,
            page_padding,
            paragraph_spacing,
            surface,
            border_style
        FROM settings
        WHERE id = 1
        "#,
        [],
        |row| {
            Ok(AppSettings {
                annotation_context_chars: row.get(0)?,
                theme: row.get(1)?,
                font_family: row.get(2)?,
                font_size: row.get(3)?,
                line_height: row.get(4)?,
                content_width: row.get(5)?,
                page_padding: row.get(6)?,
                paragraph_spacing: row.get(7)?,
                surface: row.get(8)?,
                border_style: row.get(9)?,
            })
        },
    )
    .map_err(db_error)
}

fn render_export(template_id: &str, rows: &[ExportRow]) -> String {
    let mut out = String::new();
    out.push_str(&format!("# Loop Book Export\n\nGenerated at: {}\n\n", now()));

    if rows.is_empty() {
        out.push_str("_No annotations found for this scope._\n");
        return out;
    }

    match template_id {
        "ai-pack" => {
            out.push_str("## AI Revision Packet\n\n");
            for row in rows {
                push_annotation_header(&mut out, row);
                out.push_str("### Original Selection\n\n");
                out.push_str("> ");
                out.push_str(&row.annotation.selected_text.replace('\n', "\n> "));
                out.push_str("\n\n### Context\n\n");
                out.push_str("```text\n");
                out.push_str(&format!(
                    "{}{}{}\n",
                    row.annotation.context_before,
                    row.annotation.selected_text,
                    row.annotation.context_after
                ));
                out.push_str("```\n\n### Reader Comment\n\n");
                out.push_str(empty_marker(&row.annotation.comment));
                out.push_str("\n\n### Suggested AI Task\n\n");
                out.push_str("Revise the selected passage using the reader comment while preserving the chapter's voice and structure.\n\n");
            }
        }
        "question-list" => {
            out.push_str("## Question List\n\n");
            for row in rows {
                out.push_str(&format!(
                    "- **{}** / {}: {}\n",
                    row.chapter_title,
                    fallback_heading(&row.annotation.heading_path),
                    empty_marker(&row.annotation.comment)
                ));
            }
        }
        "annotation-index" => {
            out.push_str("## Full Annotation Index\n\n");
            for row in rows {
                push_annotation_header(&mut out, row);
                out.push_str(&format!(
                    "- Range: `{}..{}`\n- Color: `{}`\n- Tags: `{}`\n\n",
                    row.annotation.start_offset,
                    row.annotation.end_offset,
                    row.annotation.highlight_color,
                    empty_marker(&row.annotation.tags)
                ));
                out.push_str(&format!(
                    "> {}\n\n{}\n\n",
                    row.annotation.selected_text.replace('\n', "\n> "),
                    empty_marker(&row.annotation.comment)
                ));
            }
        }
        _ => {
            out.push_str("## Reading Notes\n\n");
            for row in rows {
                push_annotation_header(&mut out, row);
                out.push_str(&format!(
                    "> {}\n\n{}\n\n",
                    row.annotation.selected_text.replace('\n', "\n> "),
                    empty_marker(&row.annotation.comment)
                ));
            }
        }
    }

    out
}

fn push_annotation_header(out: &mut String, row: &ExportRow) {
    out.push_str(&format!(
        "## {}. {}\n\n",
        row.chapter_sort_index + 1,
        row.chapter_title
    ));
    if !row.annotation.heading_path.trim().is_empty() {
        out.push_str(&format!("Path: `{}`\n\n", row.annotation.heading_path));
    }
}

fn fallback_heading(heading_path: &str) -> &str {
    if heading_path.trim().is_empty() {
        "No heading"
    } else {
        heading_path
    }
}

fn empty_marker(value: &str) -> &str {
    if value.trim().is_empty() {
        "_Empty_"
    } else {
        value
    }
}

fn extract_title(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') {
            let hashes = trimmed.chars().take_while(|char| *char == '#').count();
            if (1..=6).contains(&hashes) && trimmed.chars().nth(hashes) == Some(' ') {
                return Some(trimmed[hashes..].trim().to_string());
            }
        }
    }
    None
}

fn extract_outline(content: &str) -> Vec<OutlineItem> {
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

fn map_book(row: &rusqlite::Row<'_>) -> rusqlite::Result<Book> {
    Ok(Book {
        id: row.get(0)?,
        name: row.get(1)?,
        root_path: row.get(2)?,
        view_mode: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn map_chapter(row: &rusqlite::Row<'_>) -> rusqlite::Result<Chapter> {
    Ok(Chapter {
        id: row.get(0)?,
        book_id: row.get(1)?,
        file_path: row.get(2)?,
        title: row.get(3)?,
        sort_index: row.get(4)?,
        current_version_id: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn map_chapter_version(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChapterVersion> {
    Ok(ChapterVersion {
        id: row.get(0)?,
        chapter_id: row.get(1)?,
        content_hash: row.get(2)?,
        version_number: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn map_annotation(row: &rusqlite::Row<'_>) -> rusqlite::Result<Annotation> {
    Ok(Annotation {
        id: row.get(0)?,
        book_id: row.get(1)?,
        chapter_id: row.get(2)?,
        chapter_version_id: row.get(3)?,
        selected_text: row.get(4)?,
        start_offset: row.get(5)?,
        end_offset: row.get(6)?,
        context_before: row.get(7)?,
        context_after: row.get(8)?,
        heading_path: row.get(9)?,
        highlight_color: row.get(10)?,
        comment: row.get(11)?,
        tags: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn map_export_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ExportRow> {
    Ok(ExportRow {
        annotation: map_annotation(row)?,
        chapter_title: row.get(15)?,
        chapter_sort_index: row.get(16)?,
    })
}

fn collect_rows<T, F>(rows: rusqlite::MappedRows<'_, F>) -> AppResult<Vec<T>>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
{
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn hash_content(content: &str) -> String {
    let digest = Sha256::digest(content.as_bytes());
    format!("{digest:x}")
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn db_error(error: rusqlite::Error) -> String {
    format!("Database error: {error}")
}
