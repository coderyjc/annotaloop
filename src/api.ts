import { invoke } from "@tauri-apps/api/core";
import type {
  Annotation,
  AnnotationPayload,
  AnnotationScope,
  AppSettings,
  Book,
  BookSummary,
  Chapter,
  ExportTemplate,
  NoteItem,
  ReadChapterResponse,
  ReadingProgress,
} from "./types";

export async function pickBookFolder() {
  return invoke<string | null>("pick_book_folder");
}

export async function importBookFolder(path: string) {
  return invoke<{ book: Book; chapters: Chapter[] }>("import_book_folder", { path });
}

export async function listBooks() {
  return invoke<BookSummary[]>("list_books");
}

export async function getBook(bookId: string) {
  return invoke<Book>("get_book", { bookId });
}

export async function listChapters(bookId: string) {
  return invoke<Chapter[]>("list_chapters", { bookId });
}

export async function reorderChapters(bookId: string, chapterIdsInOrder: string[]) {
  return invoke<Chapter[]>("reorder_chapters", { bookId, chapterIdsInOrder });
}

export async function readChapter(chapterId: string) {
  return invoke<ReadChapterResponse>("read_chapter", { chapterId });
}

export async function readChapterVersion(chapterVersionId: string) {
  return invoke<ReadChapterResponse>("read_chapter_version", { chapterVersionId });
}

export async function createAnnotation(payload: AnnotationPayload) {
  return invoke<Annotation>("create_annotation", { payload });
}

export async function updateAnnotation(
  annotationId: string,
  patch: Partial<Pick<Annotation, "highlightColor" | "comment" | "tags">>,
) {
  return invoke<Annotation>("update_annotation", { annotationId, patch });
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

export async function exportAnnotations(scope: AnnotationScope, templateId: ExportTemplate) {
  return invoke<string>("export_annotations", { scope, templateId });
}

export async function getSettings() {
  return invoke<AppSettings>("get_settings");
}

export async function updateSettings(patch: Partial<AppSettings>) {
  return invoke<AppSettings>("update_settings", { patch });
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
