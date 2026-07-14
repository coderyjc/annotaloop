use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

mod db;
mod domain;
mod exporter;
mod utils;

use db::init_database;
use domain::*;
use exporter::render_export;
use utils::{
    chapter_file_name_from_path, chapter_title_from_root, collect_rows, db_error, extract_outline,
    hash_content, new_id, now, path_to_string, repeat_placeholders, scan_markdown_files,
    validate_annotation_status,
};

struct AppState {
    conn: Mutex<Connection>,
    db_path: PathBuf,
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
                db_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_book_folder,
            import_book_folder,
            list_books,
            get_book,
            update_book_name,
            update_book_pinned,
            delete_book,
            open_book_folder,
            sync_book_folder,
            list_chapters,
            reorder_chapters,
            list_chapter_versions,
            update_chapter_version_label,
            delete_chapter_version,
            read_chapter,
            read_chapter_version,
            refresh_chapter_version,
            create_annotation,
            update_annotation,
            delete_annotation,
            mark_annotations_status,
            list_annotations,
            list_note_items,
            search_book_content,
            list_export_presets,
            create_export_preset,
            update_export_preset,
            delete_export_preset,
            export_annotations,
            export_backup,
            restore_backup,
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
        use std::os::windows::process::CommandExt;

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
            .creation_flags(0x08000000)
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

fn open_folder_path(path: &PathBuf) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        std::process::Command::new("explorer.exe")
            .arg(path)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|error| format!("Failed to open folder in Explorer: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open folder: {error}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open folder: {error}"))?;
        Ok(())
    }
}

fn pick_backup_save_path() -> AppResult<Option<PathBuf>> {
    #[cfg(target_os = "windows")]
    {
        let timestamp = now()
            .chars()
            .filter(|char| char.is_ascii_digit())
            .take(14)
            .collect::<String>();
        let default_name = format!("loop-book-backup-{timestamp}.sqlite3");
        let script = format!(
            r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Title = 'Export Loop Book backup'
$dialog.Filter = 'SQLite backup (*.sqlite3)|*.sqlite3|All files (*.*)|*.*'
$dialog.FileName = '{}'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
  [Console]::Out.Write($dialog.FileName)
}}
"#,
            default_name.replace('\'', "''")
        );
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-STA", "-Command", &script])
            .output()
            .map_err(|error| format!("Failed to open backup save dialog: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "Backup save dialog failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(selected)))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

fn pick_backup_open_path() -> AppResult<Option<PathBuf>> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Restore Loop Book backup'
$dialog.Filter = 'SQLite backup (*.sqlite3)|*.sqlite3|All files (*.*)|*.*'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.FileName)
}
"#;
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-STA", "-Command", script])
            .output()
            .map_err(|error| format!("Failed to open backup file dialog: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "Backup file dialog failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(selected)))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
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

    let md_files = scan_markdown_files(&root_path)?;

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
        let title = chapter_title_from_root(&root_path, file_path, index);
        let chapter_id = new_id();
        let version_id = new_id();
        let content_hash = hash_content(&content);
        let file_path_text = path_to_string(file_path);

        tx.execute(
            r#"
            INSERT INTO chapters (
                id, book_id, file_path, title, sort_index, current_version_id, is_missing, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7)
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
                b.is_pinned,
                b.created_at,
                b.updated_at,
                COUNT(DISTINCT c.id) AS chapter_count,
                COUNT(DISTINCT a.id) AS annotation_count
            FROM books b
            LEFT JOIN chapters c ON c.book_id = b.id
            LEFT JOIN annotations a ON a.book_id = b.id
            GROUP BY b.id
            ORDER BY b.is_pinned DESC, b.updated_at DESC, b.created_at DESC
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
                is_pinned: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                chapter_count: row.get(7)?,
                annotation_count: row.get(8)?,
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
fn update_book_name(book_id: String, name: String, state: State<AppState>) -> AppResult<Book> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Book name cannot be empty.".to_string());
    }

    let conn = lock_conn(&state)?;
    conn.execute(
        "UPDATE books SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![trimmed, now(), book_id],
    )
    .map_err(|error| format!("Failed to rename book: {error}"))?;
    get_book_by_id(&conn, &book_id)
}

#[tauri::command]
fn update_book_pinned(
    book_id: String,
    is_pinned: bool,
    state: State<AppState>,
) -> AppResult<Book> {
    let conn = lock_conn(&state)?;
    let changed = conn
        .execute(
            "UPDATE books SET is_pinned = ?1 WHERE id = ?2",
            params![if is_pinned { 1 } else { 0 }, book_id],
        )
        .map_err(|error| format!("Failed to update pinned state: {error}"))?;
    if changed == 0 {
        Err("Book was not found.".to_string())
    } else {
        get_book_by_id(&conn, &book_id)
    }
}

#[tauri::command]
fn delete_book(book_id: String, state: State<AppState>) -> AppResult<()> {
    let conn = lock_conn(&state)?;
    let changed = conn
        .execute("DELETE FROM books WHERE id = ?1", params![book_id])
        .map_err(|error| format!("Failed to delete book: {error}"))?;
    if changed == 0 {
        Err("Book was not found.".to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
fn open_book_folder(book_id: String, state: State<AppState>) -> AppResult<()> {
    let conn = lock_conn(&state)?;
    let book = get_book_by_id(&conn, &book_id)?;
    drop(conn);

    let root_path = PathBuf::from(&book.root_path);
    if !root_path.is_dir() {
        return Err("Book folder no longer exists.".to_string());
    }

    open_folder_path(&root_path)
}

#[tauri::command]
fn sync_book_folder(book_id: String, state: State<AppState>) -> AppResult<FolderSyncReport> {
    let mut conn = lock_conn(&state)?;
    sync_book_folder_inner(&mut conn, &book_id)
}

#[tauri::command]
fn list_chapters(book_id: String, state: State<AppState>) -> AppResult<Vec<Chapter>> {
    let conn = lock_conn(&state)?;
    load_chapters(&conn, &book_id)
}

#[tauri::command]
fn list_chapter_versions(
    chapter_id: String,
    state: State<AppState>,
) -> AppResult<Vec<ChapterVersion>> {
    let conn = lock_conn(&state)?;
    load_chapter_versions(&conn, &chapter_id)
}

#[tauri::command]
fn update_chapter_version_label(
    chapter_version_id: String,
    label: String,
    state: State<AppState>,
) -> AppResult<ChapterVersion> {
    let conn = lock_conn(&state)?;
    conn.execute(
        "UPDATE chapter_versions SET label = ?1 WHERE id = ?2",
        params![label.trim(), chapter_version_id],
    )
    .map_err(|error| format!("Failed to rename chapter version: {error}"))?;
    get_chapter_version_by_id(&conn, &chapter_version_id)
}

#[tauri::command]
fn delete_chapter_version(chapter_version_id: String, state: State<AppState>) -> AppResult<()> {
    let conn = lock_conn(&state)?;
    let version = get_chapter_version_by_id(&conn, &chapter_version_id)?;
    let chapter = get_chapter_by_id(&conn, &version.chapter_id)?;
    if chapter.current_version_id == chapter_version_id {
        return Err("Current chapter version cannot be deleted. Switch to or create another current version first.".to_string());
    }

    conn.execute(
        "DELETE FROM chapter_versions WHERE id = ?1",
        params![chapter_version_id],
    )
    .map_err(|error| format!("Failed to delete chapter version: {error}"))?;
    Ok(())
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
            rendered_start_offset,
            rendered_end_offset,
            context_before,
            context_after,
            heading_path,
            highlight_color,
            comment,
            tags,
            status,
            created_at,
            updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'pending', ?16, ?16)
        "#,
        params![
            id,
            payload.book_id,
            payload.chapter_id,
            payload.chapter_version_id,
            payload.selected_text,
            payload.start_offset,
            payload.end_offset,
            payload.rendered_start_offset,
            payload.rendered_end_offset,
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
    if let Some(status) = &patch.status {
        validate_annotation_status(status)?;
    }
    let now = now();
    conn.execute(
        r#"
        UPDATE annotations
        SET highlight_color = ?1, comment = ?2, tags = ?3, status = ?4, updated_at = ?5
        WHERE id = ?6
        "#,
        params![
            patch.highlight_color.unwrap_or(existing.highlight_color),
            patch.comment.unwrap_or(existing.comment),
            patch.tags.unwrap_or(existing.tags),
            patch.status.unwrap_or(existing.status),
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
fn mark_annotations_status(
    annotation_ids: Vec<String>,
    status: String,
    state: State<AppState>,
) -> AppResult<()> {
    validate_annotation_status(&status)?;
    if annotation_ids.is_empty() {
        return Ok(());
    }

    let mut conn = lock_conn(&state)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("Failed to start status transaction: {error}"))?;
    let now = now();
    for annotation_id in annotation_ids {
        tx.execute(
            "UPDATE annotations SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, annotation_id],
        )
        .map_err(|error| format!("Failed to update annotation status: {error}"))?;
    }
    tx.commit()
        .map_err(|error| format!("Failed to save annotation status: {error}"))?;
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
                a.status,
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
                status: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(db_error)?;

    collect_rows(rows)
}

#[tauri::command]
fn search_book_content(
    query: String,
    limit: Option<i64>,
    state: State<AppState>,
) -> AppResult<Vec<ContentSearchResult>> {
    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return Ok(Vec::new());
    }

    let result_limit = limit.unwrap_or(60).clamp(1, 200) as usize;
    let query_lower = trimmed_query.to_lowercase();
    let conn = lock_conn(&state)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                b.id,
                b.name,
                c.id,
                c.title,
                c.current_version_id,
                v.content_snapshot
            FROM chapters c
            JOIN books b ON b.id = c.book_id
            JOIN chapter_versions v ON v.id = c.current_version_id
            WHERE c.is_missing = 0
            ORDER BY b.updated_at DESC, c.sort_index ASC, c.created_at ASC
            "#,
        )
        .map_err(db_error)?;
    let mut rows = stmt.query([]).map_err(db_error)?;
    let mut results = Vec::new();

    while let Some(row) = rows.next().map_err(db_error)? {
        let book_id: String = row.get(0).map_err(db_error)?;
        let book_name: String = row.get(1).map_err(db_error)?;
        let chapter_id: String = row.get(2).map_err(db_error)?;
        let chapter_title: String = row.get(3).map_err(db_error)?;
        let chapter_version_id: String = row.get(4).map_err(db_error)?;
        let content: String = row.get(5).map_err(db_error)?;
        let (content_lower, lower_to_original) = lowercase_with_byte_map(&content);

        let mut search_from = 0usize;
        let mut matches_in_chapter = 0usize;
        while search_from <= content_lower.len() {
            let Some(relative_index) = content_lower[search_from..].find(&query_lower) else {
                break;
            };
            let lower_start = search_from + relative_index;
            let lower_end = lower_start + query_lower.len();
            let original_start = original_byte_from_lower(&lower_to_original, lower_start, content.len());
            let original_end = original_byte_from_lower(&lower_to_original, lower_end, content.len());
            if original_start <= original_end
                && original_end <= content.len()
                && content.is_char_boundary(original_start)
                && content.is_char_boundary(original_end)
            {
                let matched_text = content[original_start..original_end].to_string();
                results.push(ContentSearchResult {
                    book_id: book_id.clone(),
                    book_name: book_name.clone(),
                    chapter_id: chapter_id.clone(),
                    chapter_title: chapter_title.clone(),
                    chapter_version_id: chapter_version_id.clone(),
                    excerpt: build_search_excerpt(&content, original_start, original_end),
                    matched_text,
                    start_offset: byte_to_utf16_offset(&content, original_start),
                    end_offset: byte_to_utf16_offset(&content, original_end),
                });
                if results.len() >= result_limit {
                    return Ok(results);
                }
            }

            matches_in_chapter += 1;
            if matches_in_chapter >= 8 {
                break;
            }
            search_from = lower_end.max(lower_start + 1);
        }
    }

    Ok(results)
}

#[tauri::command]
fn list_export_presets(state: State<AppState>) -> AppResult<Vec<ExportPreset>> {
    let conn = lock_conn(&state)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, base_template_id, system_prompt, task_prompt, created_at, updated_at
            FROM export_presets
            ORDER BY updated_at DESC, created_at DESC
            "#,
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], map_export_preset)
        .map_err(db_error)?;
    collect_rows(rows)
}

#[tauri::command]
fn create_export_preset(
    payload: ExportPresetPayload,
    state: State<AppState>,
) -> AppResult<ExportPreset> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Preset name cannot be empty.".to_string());
    }
    validate_export_template(&payload.base_template_id)?;

    let conn = lock_conn(&state)?;
    let id = new_id();
    let timestamp = now();
    conn.execute(
        r#"
        INSERT INTO export_presets (
            id, name, base_template_id, system_prompt, task_prompt, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
        "#,
        params![
            id,
            name,
            payload.base_template_id,
            payload.system_prompt,
            payload.task_prompt,
            timestamp
        ],
    )
    .map_err(|error| format!("Failed to create export preset: {error}"))?;
    get_export_preset_by_id(&conn, &id)
}

#[tauri::command]
fn update_export_preset(
    preset_id: String,
    payload: ExportPresetPayload,
    state: State<AppState>,
) -> AppResult<ExportPreset> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Preset name cannot be empty.".to_string());
    }
    validate_export_template(&payload.base_template_id)?;

    let conn = lock_conn(&state)?;
    conn.execute(
        r#"
        UPDATE export_presets
        SET name = ?1,
            base_template_id = ?2,
            system_prompt = ?3,
            task_prompt = ?4,
            updated_at = ?5
        WHERE id = ?6
        "#,
        params![
            name,
            payload.base_template_id,
            payload.system_prompt,
            payload.task_prompt,
            now(),
            preset_id
        ],
    )
    .map_err(|error| format!("Failed to update export preset: {error}"))?;
    get_export_preset_by_id(&conn, &preset_id)
}

#[tauri::command]
fn delete_export_preset(preset_id: String, state: State<AppState>) -> AppResult<()> {
    let conn = lock_conn(&state)?;
    conn.execute("DELETE FROM export_presets WHERE id = ?1", params![preset_id])
        .map_err(|error| format!("Failed to delete export preset: {error}"))?;
    Ok(())
}

#[tauri::command]
fn export_annotations(
    scope: AnnotationScope,
    template_id: String,
    task_goal: Option<String>,
    prompt_preset_id: Option<String>,
    state: State<AppState>,
) -> AppResult<String> {
    let conn = lock_conn(&state)?;
    let rows = load_export_rows(&conn, &scope)?;
    let preset = match prompt_preset_id {
        Some(preset_id) if !preset_id.trim().is_empty() => {
            Some(get_export_preset_by_id(&conn, preset_id.trim())?)
        }
        _ => None,
    };
    Ok(render_export(
        &template_id,
        task_goal.as_deref(),
        preset.as_ref(),
        &rows,
    ))
}

#[tauri::command]
fn export_backup(state: State<AppState>) -> AppResult<BackupResult> {
    let target_path = pick_backup_save_path()?;
    let Some(target_path) = target_path else {
        return Err("Backup export was cancelled.".to_string());
    };

    if target_path == state.db_path {
        return Err("Backup path cannot be the active database file.".to_string());
    }
    if target_path.exists() {
        fs::remove_file(&target_path)
            .map_err(|error| format!("Failed to replace existing backup file: {error}"))?;
    }

    let conn = lock_conn(&state)?;
    conn.execute("VACUUM main INTO ?1", params![path_to_string(&target_path)])
        .map_err(|error| format!("Failed to export backup: {error}"))?;
    Ok(BackupResult {
        path: path_to_string(&target_path),
    })
}

#[tauri::command]
fn restore_backup(state: State<AppState>) -> AppResult<BackupResult> {
    let source_path = pick_backup_open_path()?;
    let Some(source_path) = source_path else {
        return Err("Backup restore was cancelled.".to_string());
    };
    if !source_path.is_file() {
        return Err("Selected backup file does not exist.".to_string());
    }

    let conn = lock_conn(&state)?;
    conn.execute("ATTACH DATABASE ?1 AS backup", params![path_to_string(&source_path)])
        .map_err(|error| format!("Failed to open backup database: {error}"))?;
    let restore_result = conn.execute_batch(
        r#"
        PRAGMA foreign_keys = OFF;
        BEGIN;
        DELETE FROM reading_progress;
        DELETE FROM annotations;
        DELETE FROM chapter_versions;
        DELETE FROM chapters;
        DELETE FROM books;
        DELETE FROM settings;
        DELETE FROM export_presets;

        INSERT INTO books (id, name, root_path, view_mode, created_at, updated_at)
        SELECT id, name, root_path, view_mode, created_at, updated_at FROM backup.books;

        INSERT INTO chapters (id, book_id, file_path, title, sort_index, current_version_id, is_missing, created_at, updated_at)
        SELECT id, book_id, file_path, title, sort_index, current_version_id, is_missing, created_at, updated_at FROM backup.chapters;

        INSERT INTO chapter_versions (id, chapter_id, content_hash, version_number, content_snapshot, label, created_at)
        SELECT id, chapter_id, content_hash, version_number, content_snapshot, label, created_at FROM backup.chapter_versions;

        INSERT INTO annotations (
            id, book_id, chapter_id, chapter_version_id, selected_text, start_offset, end_offset,
            context_before, context_after, heading_path, highlight_color, comment, tags, status,
            created_at, updated_at
        )
        SELECT
            id, book_id, chapter_id, chapter_version_id, selected_text, start_offset, end_offset,
            context_before, context_after, heading_path, highlight_color, comment, tags, status,
            created_at, updated_at
        FROM backup.annotations;

        INSERT INTO reading_progress (book_id, chapter_id, chapter_version_id, scroll_top, updated_at)
        SELECT book_id, chapter_id, chapter_version_id, scroll_top, updated_at FROM backup.reading_progress;

        INSERT INTO settings (
            id, annotation_context_chars, theme, font_family, font_size, line_height,
            content_width, page_padding, paragraph_spacing, surface, border_style, shortcut_bindings
        )
        SELECT
            id, annotation_context_chars, theme, font_family, font_size, line_height,
            content_width, page_padding, paragraph_spacing, surface, border_style, shortcut_bindings
        FROM backup.settings;
        COMMIT;
        PRAGMA foreign_keys = ON;
        "#,
    );
    let rendered_anchor_restore_result = if restore_result.is_ok()
        && backup_has_column(&conn, "annotations", "rendered_start_offset")?
        && backup_has_column(&conn, "annotations", "rendered_end_offset")?
    {
        conn.execute_batch(
            r#"
            UPDATE annotations
            SET
                rendered_start_offset = (
                    SELECT rendered_start_offset
                    FROM backup.annotations
                    WHERE backup.annotations.id = annotations.id
                ),
                rendered_end_offset = (
                    SELECT rendered_end_offset
                    FROM backup.annotations
                    WHERE backup.annotations.id = annotations.id
                )
            WHERE EXISTS (
                SELECT 1
                FROM backup.annotations
                WHERE backup.annotations.id = annotations.id
            );
            "#,
        )
    } else {
        Ok(())
    };
    let focus_mode_restore_result = if restore_result.is_ok()
        && backup_has_column(&conn, "settings", "focus_mode")?
    {
        conn.execute_batch(
            r#"
            UPDATE settings
            SET focus_mode = (
                SELECT focus_mode
                FROM backup.settings
                WHERE backup.settings.id = settings.id
            )
            WHERE EXISTS (
                SELECT 1
                FROM backup.settings
                WHERE backup.settings.id = settings.id
            );
            "#,
        )
    } else {
        Ok(())
    };
    let theme_series_restore_result = if restore_result.is_ok()
        && backup_has_column(&conn, "settings", "theme_series")?
    {
        conn.execute_batch(
            r#"
            UPDATE settings
            SET theme_series = (
                SELECT theme_series
                FROM backup.settings
                WHERE backup.settings.id = settings.id
            )
            WHERE EXISTS (
                SELECT 1
                FROM backup.settings
                WHERE backup.settings.id = settings.id
            );
            "#,
        )
    } else {
        Ok(())
    };
    let pinned_restore_result = if restore_result.is_ok()
        && backup_has_column(&conn, "books", "is_pinned")?
    {
        conn.execute_batch(
            r#"
            UPDATE books
            SET is_pinned = (
                SELECT is_pinned
                FROM backup.books
                WHERE backup.books.id = books.id
            )
            WHERE EXISTS (
                SELECT 1
                FROM backup.books
                WHERE backup.books.id = books.id
            );
            "#,
        )
    } else {
        Ok(())
    };
    let preset_restore_result = if restore_result.is_ok() && backup_has_table(&conn, "export_presets")? {
        conn.execute_batch(
            r#"
            INSERT INTO export_presets (
                id, name, base_template_id, system_prompt, task_prompt, created_at, updated_at
            )
            SELECT
                id, name, base_template_id, system_prompt, task_prompt, created_at, updated_at
            FROM backup.export_presets;
            "#,
        )
    } else {
        Ok(())
    };
    let detach_result = conn.execute_batch("DETACH DATABASE backup;");
    restore_result.map_err(|error| format!("Failed to restore backup: {error}"))?;
    rendered_anchor_restore_result
        .map_err(|error| format!("Failed to restore annotation anchors: {error}"))?;
    focus_mode_restore_result
        .map_err(|error| format!("Failed to restore focus mode setting: {error}"))?;
    theme_series_restore_result
        .map_err(|error| format!("Failed to restore theme series setting: {error}"))?;
    pinned_restore_result
        .map_err(|error| format!("Failed to restore pinned books: {error}"))?;
    preset_restore_result.map_err(|error| format!("Failed to restore export presets: {error}"))?;
    detach_result.map_err(|error| format!("Failed to close backup database: {error}"))?;

    Ok(BackupResult {
        path: path_to_string(&source_path),
    })
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
            theme_series = ?2,
            theme = ?3,
            font_family = ?4,
            font_size = ?5,
            line_height = ?6,
            content_width = ?7,
            page_padding = ?8,
            paragraph_spacing = ?9,
            surface = ?10,
            border_style = ?11,
            focus_mode = ?12,
            shortcut_bindings = ?13
        WHERE id = 1
        "#,
        params![
            patch
                .annotation_context_chars
                .unwrap_or(current.annotation_context_chars),
            patch.theme_series.unwrap_or(current.theme_series),
            patch.theme.unwrap_or(current.theme),
            patch.font_family.unwrap_or(current.font_family),
            patch.font_size.unwrap_or(current.font_size),
            patch.line_height.unwrap_or(current.line_height),
            patch.content_width.unwrap_or(current.content_width),
            patch.page_padding.unwrap_or(current.page_padding),
            patch.paragraph_spacing.unwrap_or(current.paragraph_spacing),
            patch.surface.unwrap_or(current.surface),
            patch.border_style.unwrap_or(current.border_style),
            patch.focus_mode.unwrap_or(current.focus_mode),
            patch.shortcut_bindings.unwrap_or(current.shortcut_bindings)
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

fn validate_export_template(template_id: &str) -> AppResult<()> {
    match template_id {
        "reading-notes" | "ai-pack" | "question-list" | "annotation-index" => Ok(()),
        _ => Err("Unknown export template.".to_string()),
    }
}

fn backup_has_table(conn: &Connection, table_name: &str) -> AppResult<bool> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM backup.sqlite_master WHERE type = 'table' AND name = ?1",
            params![table_name],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    Ok(count > 0)
}

fn backup_has_column(conn: &Connection, table_name: &str, column_name: &str) -> AppResult<bool> {
    let sql = format!("PRAGMA backup.table_info({table_name})");
    let mut stmt = conn.prepare(&sql).map_err(db_error)?;
    let mut rows = stmt.query([]).map_err(db_error)?;
    while let Some(row) = rows.next().map_err(db_error)? {
        let name: String = row.get(1).map_err(db_error)?;
        if name == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn lowercase_with_byte_map(content: &str) -> (String, Vec<usize>) {
    let mut lowered = String::new();
    let mut lower_to_original = Vec::new();
    for (byte_index, character) in content.char_indices() {
        for lower_character in character.to_lowercase() {
            let mut buffer = [0; 4];
            let encoded = lower_character.encode_utf8(&mut buffer);
            lowered.push_str(encoded);
            for _ in 0..encoded.len() {
                lower_to_original.push(byte_index);
            }
        }
    }
    lower_to_original.push(content.len());
    (lowered, lower_to_original)
}

fn original_byte_from_lower(map: &[usize], lower_byte_index: usize, content_len: usize) -> usize {
    map.get(lower_byte_index).copied().unwrap_or(content_len)
}

fn byte_to_utf16_offset(content: &str, byte_index: usize) -> i64 {
    content[..byte_index].encode_utf16().count() as i64
}

fn build_search_excerpt(content: &str, start_byte: usize, end_byte: usize) -> String {
    let before_chars = content[..start_byte]
        .chars()
        .rev()
        .take(48)
        .collect::<Vec<_>>();
    let before = before_chars.into_iter().rev().collect::<String>();
    let matched = &content[start_byte..end_byte];
    let after = content[end_byte..].chars().take(72).collect::<String>();
    let prefix = if start_byte > 0 { "..." } else { "" };
    let suffix = if end_byte < content.len() { "..." } else { "" };
    collapse_excerpt_whitespace(&format!("{prefix}{before}{matched}{after}{suffix}"))
}

fn collapse_excerpt_whitespace(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn sync_book_folder_inner(conn: &mut Connection, book_id: &str) -> AppResult<FolderSyncReport> {
    let book = get_book_by_id(conn, book_id)?;
    let root_path = PathBuf::from(&book.root_path);
    if !root_path.is_dir() {
        return Err("Book root folder is missing.".to_string());
    }

    let scanned_files = scan_markdown_files(&root_path)?;
    let chapters = load_chapters(conn, book_id)?;
    let existing_paths = chapters
        .iter()
        .map(|chapter| chapter.file_path.clone())
        .collect::<HashSet<_>>();
    let mut file_candidates = Vec::new();

    for file_path in scanned_files {
        let file_path_text = path_to_string(&file_path);
        if existing_paths.contains(&file_path_text) {
            continue;
        }
        let content = fs::read_to_string(&file_path)
            .map_err(|error| format!("Failed to read {}: {error}", file_path_text))?;
        let content_hash = hash_content(&content);
        file_candidates.push((file_path, file_path_text, content, content_hash));
    }

    let mut report = FolderSyncReport {
        added: 0,
        missing: 0,
        changed: 0,
        renamed: 0,
        unchanged: 0,
        messages: Vec::new(),
    };

    for chapter in &chapters {
        let chapter_path = PathBuf::from(&chapter.file_path);
        if chapter_path.is_file() {
            let before_version = get_chapter_version_by_id(conn, &chapter.current_version_id)?;
            let content = fs::read_to_string(&chapter_path)
                .map_err(|error| format!("Failed to read {}: {error}", chapter.file_path))?;
            if hash_content(&content) != before_version.content_hash {
                ensure_current_chapter_version(conn, &chapter.id)?;
                report.changed += 1;
                report
                    .messages
                    .push(format!("Changed: {}", chapter_file_name_from_path(&chapter.file_path)));
            } else {
                report.unchanged += 1;
            }
            if chapter.is_missing {
                conn.execute(
                    "UPDATE chapters SET is_missing = 0, updated_at = ?1 WHERE id = ?2",
                    params![now(), chapter.id],
                )
                .map_err(db_error)?;
            }
            continue;
        }

        let current_version = get_chapter_version_by_id(conn, &chapter.current_version_id)?;
        if let Some(index) = file_candidates
            .iter()
            .position(|(_, _, _, hash)| *hash == current_version.content_hash)
        {
            let (file_path, file_path_text, _, _) = file_candidates.remove(index);
            let title = chapter_title_from_root(&root_path, &file_path, report.added as usize);
            conn.execute(
                r#"
                UPDATE chapters
                SET file_path = ?1, title = ?2, is_missing = 0, updated_at = ?3
                WHERE id = ?4
                "#,
                params![file_path_text, title, now(), chapter.id],
            )
            .map_err(|error| format!("Failed to update renamed chapter: {error}"))?;
            report.renamed += 1;
            report
                .messages
                .push(format!("Renamed: {} -> {}", chapter.title, title));
        } else {
            conn.execute(
                "UPDATE chapters SET is_missing = 1, updated_at = ?1 WHERE id = ?2",
                params![now(), chapter.id],
            )
            .map_err(db_error)?;
            report.missing += 1;
            report
                .messages
                .push(format!("Missing: {}", chapter_file_name_from_path(&chapter.file_path)));
        }
    }

    let mut next_sort_index: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_index), -1) + 1 FROM chapters WHERE book_id = ?1",
            params![book_id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    let timestamp = now();
    for (index, (file_path, file_path_text, content, content_hash)) in
        file_candidates.into_iter().enumerate()
    {
        let chapter_id = new_id();
        let version_id = new_id();
        let title = chapter_title_from_root(&root_path, &file_path, index);
        conn.execute(
            r#"
            INSERT INTO chapters (
                id, book_id, file_path, title, sort_index, current_version_id, is_missing, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7)
            "#,
            params![
                chapter_id,
                book_id,
                file_path_text,
                title,
                next_sort_index,
                version_id,
                timestamp
            ],
        )
        .map_err(|error| format!("Failed to add new chapter: {error}"))?;
        conn.execute(
            r#"
            INSERT INTO chapter_versions (id, chapter_id, content_hash, version_number, content_snapshot, label, created_at)
            VALUES (?1, ?2, ?3, 1, ?4, '', ?5)
            "#,
            params![version_id, chapter_id, content_hash, content, timestamp],
        )
        .map_err(|error| format!("Failed to add new chapter version: {error}"))?;
        next_sort_index += 1;
        report.added += 1;
        report.messages.push(format!("Added: {title}"));
    }

    conn.execute(
        "UPDATE books SET updated_at = ?1 WHERE id = ?2",
        params![now(), book_id],
    )
    .map_err(db_error)?;

    Ok(report)
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
            annotation_ids: None,
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
        "SELECT id, name, root_path, view_mode, is_pinned, created_at, updated_at FROM books WHERE root_path = ?1",
        params![root_path],
        map_book,
    )
    .optional()
    .map_err(db_error)
}

fn get_book_by_id(conn: &Connection, book_id: &str) -> AppResult<Book> {
    conn.query_row(
        "SELECT id, name, root_path, view_mode, is_pinned, created_at, updated_at FROM books WHERE id = ?1",
        params![book_id],
        map_book,
    )
    .map_err(|error| format!("Book not found: {error}"))
}

fn get_chapter_by_id(conn: &Connection, chapter_id: &str) -> AppResult<Chapter> {
    conn.query_row(
        r#"
        SELECT id, book_id, file_path, title, sort_index, current_version_id, is_missing, created_at, updated_at
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
            SELECT id, book_id, file_path, title, sort_index, current_version_id, is_missing, created_at, updated_at
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
        "SELECT id, chapter_id, content_hash, version_number, label, created_at FROM chapter_versions WHERE id = ?1",
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
            SELECT id, chapter_id, content_hash, version_number, label, created_at
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

fn get_export_preset_by_id(conn: &Connection, preset_id: &str) -> AppResult<ExportPreset> {
    conn.query_row(
        r#"
        SELECT id, name, base_template_id, system_prompt, task_prompt, created_at, updated_at
        FROM export_presets
        WHERE id = ?1
        "#,
        params![preset_id],
        map_export_preset,
    )
    .map_err(|error| format!("Export preset not found: {error}"))
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
            rendered_start_offset,
            rendered_end_offset,
            context_before,
            context_after,
            heading_path,
            highlight_color,
            comment,
            tags,
            status,
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
    if let Some(annotation_ids) = &scope.annotation_ids {
        return query_annotations_by_ids(conn, annotation_ids);
    }

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

fn query_annotations_by_ids(conn: &Connection, annotation_ids: &[String]) -> AppResult<Vec<Annotation>> {
    if annotation_ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = repeat_placeholders(annotation_ids.len());
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
            rendered_start_offset,
            rendered_end_offset,
            context_before,
            context_after,
            heading_path,
            highlight_color,
            comment,
            tags,
            status,
            created_at,
            updated_at
        FROM annotations
        WHERE id IN ({placeholders})
        ORDER BY created_at DESC
        "#
    );
    let mut stmt = conn.prepare(&sql).map_err(db_error)?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(annotation_ids.iter()), map_annotation)
        .map_err(db_error)?;
    collect_rows(rows)
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
            rendered_start_offset,
            rendered_end_offset,
            context_before,
            context_after,
            heading_path,
            highlight_color,
            comment,
            tags,
            status,
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
    if let Some(annotation_ids) = &scope.annotation_ids {
        if annotation_ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = repeat_placeholders(annotation_ids.len());
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
                a.rendered_start_offset,
                a.rendered_end_offset,
                a.context_before,
                a.context_after,
                a.heading_path,
                a.highlight_color,
                a.comment,
                a.tags,
                a.status,
                a.created_at,
                a.updated_at,
                c.title,
                c.sort_index
            FROM annotations a
            JOIN chapters c ON c.id = a.chapter_id
            WHERE a.id IN ({placeholders})
            ORDER BY c.sort_index ASC, a.start_offset ASC, a.created_at ASC
            "#
        );
        let mut stmt = conn.prepare(&sql).map_err(db_error)?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(annotation_ids.iter()), map_export_row)
            .map_err(db_error)?;
        return collect_rows(rows);
    }

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
            a.rendered_start_offset,
            a.rendered_end_offset,
            a.context_before,
            a.context_after,
            a.heading_path,
            a.highlight_color,
            a.comment,
            a.tags,
            a.status,
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
            theme_series,
            theme,
            font_family,
            font_size,
            line_height,
            content_width,
            page_padding,
            paragraph_spacing,
            surface,
            border_style,
            focus_mode,
            shortcut_bindings
        FROM settings
        WHERE id = 1
        "#,
        [],
        |row| {
            Ok(AppSettings {
                annotation_context_chars: row.get(0)?,
                theme_series: row.get(1)?,
                theme: row.get(2)?,
                font_family: row.get(3)?,
                font_size: row.get(4)?,
                line_height: row.get(5)?,
                content_width: row.get(6)?,
                page_padding: row.get(7)?,
                paragraph_spacing: row.get(8)?,
                surface: row.get(9)?,
                border_style: row.get(10)?,
                focus_mode: row.get(11)?,
                shortcut_bindings: row.get(12)?,
            })
        },
    )
    .map_err(db_error)
}

fn map_book(row: &rusqlite::Row<'_>) -> rusqlite::Result<Book> {
    Ok(Book {
        id: row.get(0)?,
        name: row.get(1)?,
        root_path: row.get(2)?,
        view_mode: row.get(3)?,
        is_pinned: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
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
        is_missing: row.get::<_, i64>(6)? != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn map_chapter_version(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChapterVersion> {
    Ok(ChapterVersion {
        id: row.get(0)?,
        chapter_id: row.get(1)?,
        content_hash: row.get(2)?,
        version_number: row.get(3)?,
        label: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn map_export_preset(row: &rusqlite::Row<'_>) -> rusqlite::Result<ExportPreset> {
    Ok(ExportPreset {
        id: row.get(0)?,
        name: row.get(1)?,
        base_template_id: row.get(2)?,
        system_prompt: row.get(3)?,
        task_prompt: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
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
        rendered_start_offset: row.get(7)?,
        rendered_end_offset: row.get(8)?,
        context_before: row.get(9)?,
        context_after: row.get(10)?,
        heading_path: row.get(11)?,
        highlight_color: row.get(12)?,
        comment: row.get(13)?,
        tags: row.get(14)?,
        status: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

fn map_export_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ExportRow> {
    Ok(ExportRow {
        annotation: map_annotation(row)?,
        chapter_title: row.get(18)?,
        chapter_sort_index: row.get(19)?,
    })
}
