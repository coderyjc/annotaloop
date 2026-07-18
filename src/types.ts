export interface Book {
  id: string;
  name: string;
  rootPath: string;
  viewMode: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BookSummary extends Book {
  chapterCount: number;
  annotationCount: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  filePath: string;
  title: string;
  sortIndex: number;
  currentVersionId: string;
  isMissing: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterVersion {
  id: string;
  chapterId: string;
  contentHash: string;
  versionNumber: number;
  label: string;
  createdAt: string;
}

export type AnnotationStatus = "pending" | "processed" | "exported" | "ignored";

export interface Annotation {
  id: string;
  bookId: string;
  chapterId: string;
  chapterVersionId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  renderedStartOffset: number | null;
  renderedEndOffset: number | null;
  contextBefore: string;
  contextAfter: string;
  headingPath: string;
  highlightColor: string;
  comment: string;
  tags: string;
  status: AnnotationStatus;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteItem {
  id: string;
  bookId: string;
  bookName: string;
  chapterId: string;
  chapterTitle: string;
  chapterVersionId: string;
  selectedText: string;
  headingPath: string;
  highlightColor: string;
  comment: string;
  status: AnnotationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ContentSearchResult {
  bookId: string;
  bookName: string;
  chapterId: string;
  chapterTitle: string;
  chapterVersionId: string;
  excerpt: string;
  matchedText: string;
  startOffset: number;
  endOffset: number;
}

export interface OutlineItem {
  level: number;
  title: string;
  offset: number;
  id: string;
}

export interface ReadChapterResponse {
  chapter: Chapter;
  version: ChapterVersion;
  versions: ChapterVersion[];
  content: string;
  outline: OutlineItem[];
  annotations: Annotation[];
}

export interface ImportPreviewFile {
  path: string;
  relativePath: string;
  name: string;
  size: number;
}

export interface ImportBookPreview {
  rootPath: string;
  defaultName: string;
  files: ImportPreviewFile[];
}

export interface ImportBookPayload {
  rootPath: string;
  bookName: string;
  filePaths: string[];
}

export interface OpenMarkdownFileResult {
  book: Book;
  chapters: Chapter[];
  targetChapterId: string;
}

export interface AppSettings {
  annotationContextChars: number;
  themeSeries: string;
  theme: string;
  interfaceFontFamily: string;
  readerFontFamily: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  pagePadding: number;
  paragraphSpacing: number;
  surface: string;
  borderStyle: string;
  focusMode: boolean;
  shortcutBindings: string;
}

export interface SystemFont {
  family: string;
}

export interface AnnotationPayload {
  bookId: string;
  chapterId: string;
  chapterVersionId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  renderedStartOffset?: number | null;
  renderedEndOffset?: number | null;
  contextBefore: string;
  contextAfter: string;
  headingPath: string;
  highlightColor: string;
  comment: string;
  tags: string;
}

export interface AnnotationScope {
  bookId?: string;
  chapterId?: string;
  chapterVersionId?: string;
  annotationIds?: string[];
}

export interface ReadingProgress {
  bookId: string;
  chapterId: string;
  chapterVersionId: string;
  scrollTop: number;
  updatedAt: string;
}

export type ExportTemplate = "reading-notes" | "ai-pack" | "question-list" | "annotation-index";

export type ExportTaskGoal = "polish" | "rewrite" | "expand" | "questions" | "creative";

export interface ExportPreset {
  id: string;
  name: string;
  baseTemplateId: ExportTemplate;
  systemPrompt: string;
  taskPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export type ExportPresetPayload = Pick<
  ExportPreset,
  "name" | "baseTemplateId" | "systemPrompt" | "taskPrompt"
>;

export interface FolderSyncReport {
  added: number;
  missing: number;
  changed: number;
  renamed: number;
  unchanged: number;
  messages: string[];
}

export interface ChapterUploadReport {
  added: number;
  skipped: number;
  messages: string[];
  chapters: Chapter[];
}

export interface BackupResult {
  path: string;
}

export type ShortcutAction =
  | "search"
  | "nextChapter"
  | "previousChapter"
  | "highlight"
  | "export"
  | "toggleLeft"
  | "toggleRight";

export type ShortcutBindings = Record<ShortcutAction, string>;
