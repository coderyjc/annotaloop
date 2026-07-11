export interface Book {
  id: string;
  name: string;
  rootPath: string;
  viewMode: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface ChapterVersion {
  id: string;
  chapterId: string;
  contentHash: string;
  versionNumber: number;
  createdAt: string;
}

export interface Annotation {
  id: string;
  bookId: string;
  chapterId: string;
  chapterVersionId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  contextBefore: string;
  contextAfter: string;
  headingPath: string;
  highlightColor: string;
  comment: string;
  tags: string;
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
  createdAt: string;
  updatedAt: string;
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

export interface AppSettings {
  annotationContextChars: number;
  theme: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  pagePadding: number;
  paragraphSpacing: number;
  surface: string;
  borderStyle: string;
}

export interface AnnotationPayload {
  bookId: string;
  chapterId: string;
  chapterVersionId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
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
}

export interface ReadingProgress {
  bookId: string;
  chapterId: string;
  chapterVersionId: string;
  scrollTop: number;
  updatedAt: string;
}

export type ExportTemplate = "reading-notes" | "ai-pack" | "question-list" | "annotation-index";
