use rusqlite::Connection;
use std::path::Path;

pub fn init_database(db_path: &Path) -> Result<Connection, rusqlite::Error> {
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
            is_missing INTEGER NOT NULL DEFAULT 0,
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
            label TEXT NOT NULL DEFAULT '',
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
            rendered_start_offset INTEGER,
            rendered_end_offset INTEGER,
            context_before TEXT NOT NULL,
            context_after TEXT NOT NULL,
            heading_path TEXT NOT NULL,
            highlight_color TEXT NOT NULL,
            comment TEXT NOT NULL,
            tags TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
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
            border_style TEXT NOT NULL,
            shortcut_bindings TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS export_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            base_template_id TEXT NOT NULL,
            system_prompt TEXT NOT NULL,
            task_prompt TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
    )?;

    ensure_column(
        &conn,
        "chapters",
        "is_missing",
        "ALTER TABLE chapters ADD COLUMN is_missing INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &conn,
        "chapter_versions",
        "version_number",
        "ALTER TABLE chapter_versions ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1",
    )?;
    ensure_column(
        &conn,
        "chapter_versions",
        "label",
        "ALTER TABLE chapter_versions ADD COLUMN label TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        &conn,
        "annotations",
        "status",
        "ALTER TABLE annotations ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
    )?;
    ensure_column(
        &conn,
        "annotations",
        "rendered_start_offset",
        "ALTER TABLE annotations ADD COLUMN rendered_start_offset INTEGER",
    )?;
    ensure_column(
        &conn,
        "annotations",
        "rendered_end_offset",
        "ALTER TABLE annotations ADD COLUMN rendered_end_offset INTEGER",
    )?;
    ensure_column(
        &conn,
        "settings",
        "shortcut_bindings",
        "ALTER TABLE settings ADD COLUMN shortcut_bindings TEXT NOT NULL DEFAULT '{\"search\":\"Ctrl+K\",\"nextChapter\":\"N\",\"previousChapter\":\"P\",\"highlight\":\"H\",\"export\":\"E\",\"toggleLeft\":\"[\",\"toggleRight\":\"]\"}'",
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
            border_style,
            shortcut_bindings
        ) VALUES (1, 100, 'paper', 'Literata, Georgia, serif', 18, 1.72, 820, 52, 18, 'warm', 'hairline', '{"search":"Ctrl+K","nextChapter":"N","previousChapter":"P","highlight":"H","export":"E","toggleLeft":"[","toggleRight":"]"}')
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
