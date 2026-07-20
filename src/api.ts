import { invoke } from "@tauri-apps/api/core";
import type {
  Annotation,
  AnnotationPayload,
  AnnotationScope,
  AnnotationStatus,
  AppSettings,
  BackupResult,
  Book,
  BookSummary,
  Chapter,
  ChapterUploadReport,
  ChapterVersion,
  ContentSearchResult,
  ExportPreset,
  ExportPresetPayload,
  ExportTaskGoal,
  ExportTemplate,
  FolderSyncReport,
  ImportBookPayload,
  ImportBookPreview,
  NoteItem,
  OpenMarkdownFileResult,
  ReadChapterResponse,
  ReadingProgress,
  SystemFont,
} from "./types";

export async function pickBookFolder() {
  return invoke<string | null>("pick_book_folder");
}

export async function pickMarkdownFiles() {
  return invoke<string[]>("pick_markdown_files");
}

export async function listLaunchMarkdownPaths() {
  return invoke<string[]>("list_launch_markdown_paths");
}

export async function openMarkdownFile(path: string) {
  return invoke<OpenMarkdownFileResult>("open_markdown_file", { path });
}

export async function importBookFolder(path: string) {
  return invoke<{ book: Book; chapters: Chapter[] }>("import_book_folder", { path });
}

export async function previewImportBookFolder(path: string) {
  return invoke<ImportBookPreview>("preview_import_book_folder", { path });
}

export async function importBookSelection(payload: ImportBookPayload) {
  return invoke<{ book: Book; chapters: Chapter[] }>("import_book_selection", { payload });
}

export async function listBooks() {
  return invoke<BookSummary[]>("list_books");
}

export async function getBook(bookId: string) {
  return invoke<Book>("get_book", { bookId });
}

export async function updateBookName(bookId: string, name: string) {
  return invoke<Book>("update_book_name", { bookId, name });
}

export async function updateBookPinned(bookId: string, isPinned: boolean) {
  return invoke<Book>("update_book_pinned", { bookId, isPinned });
}

export async function deleteBook(bookId: string) {
  return invoke<void>("delete_book", { bookId });
}

export async function openBookFolder(bookId: string) {
  return invoke<void>("open_book_folder", { bookId });
}

export async function openChapterInExplorer(chapterId: string) {
  return invoke<void>("open_chapter_in_explorer", { chapterId });
}

export async function syncBookFolder(bookId: string) {
  return invoke<FolderSyncReport>("sync_book_folder", { bookId });
}

export async function listChapters(bookId: string) {
  return invoke<Chapter[]>("list_chapters", { bookId });
}

export async function reorderChapters(bookId: string, chapterIdsInOrder: string[]) {
  return invoke<Chapter[]>("reorder_chapters", { bookId, chapterIdsInOrder });
}

export async function uploadChaptersToBook(bookId: string, filePaths: string[]) {
  return invoke<ChapterUploadReport>("upload_chapters_to_book", { bookId, filePaths });
}

export async function deleteChapter(chapterId: string) {
  return invoke<Chapter[]>("delete_chapter", { chapterId });
}

export async function readChapter(chapterId: string) {
  return invoke<ReadChapterResponse>("read_chapter", { chapterId });
}

export async function readChapterVersion(chapterVersionId: string) {
  return invoke<ReadChapterResponse>("read_chapter_version", { chapterVersionId });
}

export async function refreshChapterVersion(chapterId: string) {
  return invoke<ChapterVersion>("refresh_chapter_version", { chapterId });
}

export async function listChapterVersions(chapterId: string) {
  return invoke<ChapterVersion[]>("list_chapter_versions", { chapterId });
}

export async function updateChapterVersionLabel(chapterVersionId: string, label: string) {
  return invoke<ChapterVersion>("update_chapter_version_label", { chapterVersionId, label });
}

export async function deleteChapterVersion(chapterVersionId: string) {
  return invoke<void>("delete_chapter_version", { chapterVersionId });
}

export async function createAnnotation(payload: AnnotationPayload) {
  return invoke<Annotation>("create_annotation", { payload });
}

export async function updateAnnotation(
  annotationId: string,
  patch: Partial<Pick<Annotation, "highlightColor" | "comment" | "tags" | "status" | "isPinned">>,
) {
  return invoke<Annotation>("update_annotation", { annotationId, patch });
}

export async function markAnnotationsStatus(annotationIds: string[], status: AnnotationStatus) {
  return invoke<void>("mark_annotations_status", { annotationIds, status });
}

export async function deleteAnnotation(annotationId: string) {
  return invoke<void>("delete_annotation", { annotationId });
}

export async function listAnnotations(scope: AnnotationScope) {
  return invoke<Annotation[]>("list_annotations", { scope });
}

export async function listNoteItems() {
  return invoke<NoteItem[]>("list_note_items");
}

export async function searchBookContent(query: string, limit = 60) {
  return invoke<ContentSearchResult[]>("search_book_content", { query, limit });
}

export async function listExportPresets() {
  return invoke<ExportPreset[]>("list_export_presets");
}

export async function createExportPreset(payload: ExportPresetPayload) {
  return invoke<ExportPreset>("create_export_preset", { payload });
}

export async function updateExportPreset(presetId: string, payload: ExportPresetPayload) {
  return invoke<ExportPreset>("update_export_preset", { presetId, payload });
}

export async function deleteExportPreset(presetId: string) {
  return invoke<void>("delete_export_preset", { presetId });
}

export async function exportAnnotations(
  scope: AnnotationScope,
  templateId: ExportTemplate,
  taskGoal?: ExportTaskGoal,
  promptPresetId?: string,
  includeEmptyAnnotations = true,
) {
  return invoke<string>("export_annotations", {
    scope,
    templateId,
    taskGoal,
    promptPresetId,
    includeEmptyAnnotations,
  });
}

export async function exportBackup() {
  return invoke<BackupResult>("export_backup");
}

export async function restoreBackup() {
  return invoke<BackupResult>("restore_backup");
}

export async function getSettings() {
  return invoke<AppSettings>("get_settings");
}

export async function updateSettings(patch: Partial<AppSettings>) {
  return invoke<AppSettings>("update_settings", { patch });
}

export async function listSystemFonts() {
  return invoke<SystemFont[]>("list_system_fonts");
}

export async function saveReadingProgress(
  bookId: string,
  chapterId: string,
  chapterVersionId: string,
  scrollTop: number,
) {
  return invoke<ReadingProgress>("save_reading_progress", {
    payload: { bookId, chapterId, chapterVersionId, scrollTop },
  });
}

export async function getLatestReadingProgress(bookId: string) {
  return invoke<ReadingProgress | null>("get_latest_reading_progress", { bookId });
}
