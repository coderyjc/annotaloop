import {
  ArrowLeft,
  BookOpen,
  Download,
  FileText,
  FolderPlus,
  Grid3X3,
  Highlighter,
  MessageSquare,
  Settings,
} from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createAnnotation,
  createExportPreset,
  deleteAnnotation,
  deleteBook,
  deleteExportPreset,
  exportAnnotations,
  exportBackup,
  getLatestReadingProgress,
  getSettings,
  importBookFolder,
  listBooks,
  listChapters,
  listExportPresets,
  listNoteItems,
  markAnnotationsStatus,
  openBookFolder,
  pickBookFolder,
  readChapter,
  readChapterVersion,
  reorderChapters,
  restoreBackup,
  saveReadingProgress,
  syncBookFolder,
  updateBookName,
  updateAnnotation,
  updateExportPreset,
  updateSettings,
} from "./api";
import { AnnotationWorkbench, type NoteFilterStatus } from "./components/home/AnnotationWorkbench";
import {
  BatchExportModal,
  BookContextMenu,
  type BookMenuState,
  DeleteBookModal,
  HomeSettingsModal,
  RenameBookModal,
  type RenameBookState,
  SearchModal,
  SyncReportModal,
  VersionManagerModal,
} from "./components/home/HomeModals";
import {
  AnnotationCard,
  AnnotationDetailModal,
  ExportModal,
  NewAnnotationModal,
  SettingsPanel,
  SortChaptersModal,
  TopNotice,
  type SelectionDraft,
} from "./components/reader/ReaderComponents";
import { defaultSettings, highlightColors } from "./constants";
import {
  applyDomHighlights,
  findSelectionOffset,
  getContextFromText,
  getHeadingPath,
  getRenderedSelectionAnchor,
  renderMarkdownWithAnnotations,
  type SearchHighlight,
} from "./markdown";
import type {
  Annotation,
  AnnotationPayload,
  AnnotationStatus,
  AppSettings,
  BackupResult,
  Book,
  BookSummary,
  Chapter,
  ContentSearchResult,
  ExportPreset,
  ExportPresetPayload,
  ExportTaskGoal,
  ExportTemplate,
  FolderSyncReport,
  NoteItem,
  ReadChapterResponse,
  ShortcutAction,
} from "./types";
import { chapterFileName } from "./utils/chapters";
import { matchShortcut, parseShortcutBindings, shouldIgnoreShortcut } from "./utils/shortcuts";

interface ContextMenuState {
  x: number;
  y: number;
}

type ReaderBook = Book | BookSummary;

export default function App() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [homeView, setHomeView] = useState<"grid" | "notes">("grid");
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [exportPresets, setExportPresets] = useState<ExportPreset[]>([]);
  const [workbenchBookId, setWorkbenchBookId] = useState("all");
  const [workbenchChapterId, setWorkbenchChapterId] = useState("all");
  const [workbenchStatus, setWorkbenchStatus] = useState<NoteFilterStatus>("all");
  const [commentOnly, setCommentOnly] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [workbenchChapters, setWorkbenchChapters] = useState<Chapter[]>([]);
  const [importDragActive, setImportDragActive] = useState(false);
  const [activeBook, setActiveBook] = useState<ReaderBook | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [reader, setReader] = useState<ReadChapterResponse | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [homeSettingsOpen, setHomeSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [bookMenu, setBookMenu] = useState<BookMenuState | null>(null);
  const [renameBookDraft, setRenameBookDraft] = useState<RenameBookState | null>(null);
  const [deleteBookDraft, setDeleteBookDraft] = useState<BookSummary | null>(null);
  const [syncReport, setSyncReport] = useState<FolderSyncReport | null>(null);
  const [versionManagerBook, setVersionManagerBook] = useState<BookSummary | null>(null);
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  const [batchExportText, setBatchExportText] = useState("");
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [pendingDraft, setPendingDraft] = useState<SelectionDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [activeSearchHighlight, setActiveSearchHighlight] = useState<
    (SearchHighlight & { chapterVersionId: string }) | null
  >(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortDraft, setSortDraft] = useState<Chapter[]>([]);
  const [sortDragChapterId, setSortDragChapterId] = useState<string | null>(null);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [leftPaneWidth, setLeftPaneWidth] = useState(284);
  const [rightPaneWidth, setRightPaneWidth] = useState(344);
  const [chapterPaneHeight, setChapterPaneHeight] = useState(320);
  const [resizeTarget, setResizeTarget] = useState<"left" | "right" | "chapters" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTemplate, setExportTemplate] = useState<ExportTemplate>("reading-notes");
  const [exportTaskGoal, setExportTaskGoal] = useState<ExportTaskGoal>("rewrite");
  const [exportPresetId, setExportPresetId] = useState("");
  const [exportScope, setExportScope] = useState<"chapter" | "book">("chapter");
  const [exportText, setExportText] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingScroll, setPendingScroll] = useState<number | null>(null);

  const articleRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const readerLeftRef = useRef<HTMLElement | null>(null);
  const importDropRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    if (activeBook) {
      setImportDragActive(false);
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setImportDragActive(isImportDropPosition(payload.position));
          return;
        }
        if (payload.type === "leave") {
          setImportDragActive(false);
          return;
        }
        if (payload.type === "drop") {
          const shouldImport = isImportDropPosition(payload.position);
          setImportDragActive(false);
          if (shouldImport && payload.paths[0]) {
            void importFolderPath(payload.paths[0]);
          }
        }
      })
      .then((nextUnlisten) => {
        if (cancelled) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((err) => setError(readError(err)));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [activeBook, busy]);

  useEffect(() => {
    if (!reader || pendingScroll === null) return;
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = pendingScroll;
      }
      setPendingScroll(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reader, pendingScroll]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!bookMenu) return;
    const close = () => setBookMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [bookMenu]);

  useEffect(() => {
    if (workbenchBookId === "all") {
      setWorkbenchChapters([]);
      setWorkbenchChapterId("all");
      return;
    }

    let cancelled = false;
    void listChapters(workbenchBookId)
      .then((nextChapters) => {
        if (!cancelled) setWorkbenchChapters(nextChapters);
      })
      .catch((err) => {
        if (!cancelled) setError(readError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [workbenchBookId]);

  useEffect(() => {
    if (!reader || !activeBook || !scrollRef.current) return;
    const element = scrollRef.current;
    let timeout: number | undefined;
    const onScroll = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        void saveReadingProgress(
          activeBook.id,
          reader.chapter.id,
          reader.version.id,
          element.scrollTop,
        );
      }, 500);
    };
    element.addEventListener("scroll", onScroll);
    return () => {
      if (timeout) window.clearTimeout(timeout);
      element.removeEventListener("scroll", onScroll);
    };
  }, [activeBook, reader]);

  useEffect(() => {
    if (!reader || !activeAnnotationId || !articleRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const mark = articleRef.current?.querySelector<HTMLElement>(
        `[data-annotation-id="${activeAnnotationId}"]`,
      );
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeAnnotationId, reader]);

  useEffect(() => {
    if (!reader || !activeSearchHighlight || !articleRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const mark = articleRef.current?.querySelector<HTMLElement>("[data-search-hit='true']");
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSearchHighlight, reader]);

  const renderedHtml = useMemo(() => {
    if (!reader) return "";
    return renderMarkdownWithAnnotations(reader.content, reader.chapter.filePath);
  }, [reader]);

  useEffect(() => {
    if (!reader || !articleRef.current) return;
    applyDomHighlights(
      articleRef.current,
      reader.annotations,
      activeSearchHighlight?.chapterVersionId === reader.version.id ? activeSearchHighlight : null,
    );
  }, [activeSearchHighlight, reader, renderedHtml]);

  const activeAnnotation = useMemo(() => {
    if (!reader || !activeAnnotationId) return null;
    return reader.annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null;
  }, [activeAnnotationId, reader]);

  const shortcutBindings = useMemo(
    () => parseShortcutBindings(settings.shortcutBindings),
    [settings.shortcutBindings],
  );

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (workbenchBookId !== "all" && note.bookId !== workbenchBookId) return false;
      if (workbenchChapterId !== "all" && note.chapterId !== workbenchChapterId) return false;
      if (workbenchStatus !== "all" && note.status !== workbenchStatus) return false;
      if (commentOnly && !note.comment.trim()) return false;
      return true;
    });
  }, [commentOnly, notes, workbenchBookId, workbenchChapterId, workbenchStatus]);

  const selectedNotes = useMemo(
    () => filteredNotes.filter((note) => selectedNoteIds.includes(note.id)),
    [filteredNotes, selectedNoteIds],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event)) return;
      const action = matchShortcut(event, shortcutBindings);
      if (!action) return;
      event.preventDefault();
      runShortcutAction(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcutBindings, activeBook, reader, chapters, pendingDraft]);

  const readerStyle = useMemo(
    () =>
      ({
        "--reader-font-family": settings.fontFamily,
        "--reader-font-size": `${settings.fontSize}px`,
        "--reader-line-height": settings.lineHeight,
        "--reader-width": `${settings.contentWidth}px`,
        "--reader-padding": `${settings.pagePadding}px`,
        "--reader-paragraph-spacing": `${settings.paragraphSpacing}px`,
        "--reader-left-width": `${leftPaneWidth}px`,
        "--reader-right-width": `${rightPaneWidth}px`,
        "--chapter-list-height": `${chapterPaneHeight}px`,
      }) as CSSProperties,
    [chapterPaneHeight, leftPaneWidth, rightPaneWidth, settings],
  );

  async function boot() {
    setError("");
    try {
      const [nextBooks, nextSettings, nextNotes, nextExportPresets] = await Promise.all([
        listBooks(),
        getSettings(),
        listNoteItems(),
        listExportPresets(),
      ]);
      setBooks(nextBooks);
      setSettings(nextSettings);
      setNotes(nextNotes);
      setExportPresets(nextExportPresets);
    } catch (err) {
      setError(readError(err));
    }
  }

  async function refreshBooks() {
    const nextBooks = await listBooks();
    setBooks(nextBooks);
  }

  async function refreshNotes() {
    const nextNotes = await listNoteItems();
    setNotes(nextNotes);
  }

  async function refreshExportPresets() {
    const nextPresets = await listExportPresets();
    setExportPresets(nextPresets);
    if (exportPresetId && !nextPresets.some((preset) => preset.id === exportPresetId)) {
      setExportPresetId("");
    }
    return nextPresets;
  }

  async function handleChooseFolder() {
    setError("");
    setBusy(true);
    try {
      const selected = await pickBookFolder();
      if (selected) {
        await importAndOpen(selected);
      }
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function importFolderPath(path: string) {
    const folderPath = path.trim();
    if (!folderPath || busy) return;
    setError("");
    setBusy(true);
    try {
      await importAndOpen(folderPath);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function isImportDropPosition(position: { x: number; y: number }) {
    const dropZone = importDropRef.current;
    if (!dropZone) return false;
    const rect = dropZone.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const x = position.x / scale;
    const y = position.y / scale;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  async function importAndOpen(path: string) {
    const imported = await importBookFolder(path);
    await refreshBooks();
    await openBook({
      ...imported.book,
      chapterCount: imported.chapters.length,
      annotationCount: 0,
    });
  }

  async function openBook(book: ReaderBook) {
    setBusy(true);
    setError("");
    setExportText("");
    setExportOpen(false);
    setSortOpen(false);
    setDraft(null);
    setActiveSearchHighlight(null);
    try {
      const nextChapters = await listChapters(book.id);
      if (!nextChapters.length) {
        throw new Error("这本书没有可读章节。");
      }
      const progress = await getLatestReadingProgress(book.id);
      let nextReader: ReadChapterResponse;
      if (progress) {
        nextReader = await readChapterVersion(progress.chapterVersionId).catch(() =>
          readChapter(progress.chapterId),
        );
        setPendingScroll(progress.scrollTop);
      } else {
        nextReader = await readChapter(nextChapters[0].id);
        setPendingScroll(0);
      }
      setActiveBook(book);
      setChapters(nextChapters);
      setReader(nextReader);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openNote(note: NoteItem) {
    setBusy(true);
    setError("");
    setDraft(null);
    setExportText("");
    setExportOpen(false);
    setSortOpen(false);
    setActiveSearchHighlight(null);
    try {
      const nextChapters = await listChapters(note.bookId);
      const nextReader = await readChapterVersion(note.chapterVersionId).catch(() =>
        readChapter(note.chapterId),
      );
      const book = books.find((item) => item.id === note.bookId);
      setActiveBook(
        book ?? {
          id: note.bookId,
          name: note.bookName,
          rootPath: "",
          viewMode: "grid",
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          chapterCount: nextChapters.length,
          annotationCount: notes.filter((item) => item.bookId === note.bookId).length,
        },
      );
      setChapters(nextChapters);
      setReader(nextReader);
      setActiveAnnotationId(note.id);
      setPendingScroll(0);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openContentSearchResult(result: ContentSearchResult) {
    setBusy(true);
    setError("");
    setDraft(null);
    setExportText("");
    setExportOpen(false);
    setSortOpen(false);
    setSearchOpen(false);
    setActiveAnnotationId(null);
    try {
      const nextChapters = await listChapters(result.bookId);
      const nextReader = await readChapterVersion(result.chapterVersionId).catch(() =>
        readChapter(result.chapterId),
      );
      const book = books.find((item) => item.id === result.bookId);
      setActiveBook(
        book ?? {
          id: result.bookId,
          name: result.bookName,
          rootPath: "",
          viewMode: "grid",
          createdAt: "",
          updatedAt: "",
          chapterCount: nextChapters.length,
          annotationCount: notes.filter((item) => item.bookId === result.bookId).length,
        },
      );
      setChapters(nextChapters);
      setReader(nextReader);
      setActiveSearchHighlight({
        chapterVersionId: result.chapterVersionId,
        startOffset: result.startOffset,
        endOffset: result.endOffset,
        matchedText: result.matchedText,
      });
      setPendingScroll(null);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function selectChapter(chapterId: string) {
    setBusy(true);
    setDraft(null);
    setExportText("");
    setActiveSearchHighlight(null);
    try {
      const nextReader = await readChapter(chapterId);
      setReader(nextReader);
      setPendingScroll(0);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function selectVersion(chapterVersionId: string) {
    setBusy(true);
    setDraft(null);
    setActiveSearchHighlight(null);
    try {
      const nextReader = await readChapterVersion(chapterVersionId);
      setReader(nextReader);
      setPendingScroll(0);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleTextSelection() {
    const nextDraft = buildDraftFromSelection(false);
    setPendingDraft(nextDraft);
    setContextMenu(null);
  }

  function handleReaderContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (!articleRef.current) return;
    event.preventDefault();
    const nextDraft = buildDraftFromSelection(true) ?? pendingDraft;
    if (!nextDraft) {
      setContextMenu(null);
      return;
    }
    setPendingDraft(nextDraft);
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 156),
      y: Math.min(event.clientY, window.innerHeight - 56),
    });
  }

  function suppressNativeContextMenu(event: React.MouseEvent) {
    event.preventDefault();
  }

  function buildDraftFromSelection(showError: boolean): SelectionDraft | null {
    if (!reader || !articleRef.current) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!articleRef.current.contains(range.commonAncestorContainer)) return null;
    const renderedSelection = getRenderedSelectionAnchor(articleRef.current, selection);
    if (!renderedSelection) return null;
    const selectedText = renderedSelection.selectedText;
    if (selectedText.length < 2) return null;
    const sourceStartOffset = findSelectionOffset(reader.content, selectedText);
    if (sourceStartOffset < 0 && renderedSelection.startOffset < 0) {
      if (showError) {
        setError("没有在章节源码中稳定定位到这段文本，请尝试少选一点上下文。");
      }
      return null;
    }
    const startOffset = sourceStartOffset >= 0 ? sourceStartOffset : renderedSelection.startOffset;
    const endOffset =
      sourceStartOffset >= 0
        ? sourceStartOffset + selectedText.length
        : renderedSelection.endOffset;
    setError("");
    setActiveAnnotationId(null);
    return {
      selectedText,
      startOffset,
      endOffset,
      renderedStartOffset: renderedSelection.startOffset,
      renderedEndOffset: renderedSelection.endOffset,
      renderedText: renderedSelection.fullText,
      highlightColor: highlightColors[0],
      comment: "",
    };
  }

  function openPendingDraft() {
    if (!pendingDraft) return;
    setDraft(pendingDraft);
    setContextMenu(null);
  }

  async function saveDraft() {
    if (!reader || !draft) return;
    const context = getContextFromText(
      draft.renderedText,
      draft.renderedStartOffset,
      draft.renderedEndOffset,
      settings.annotationContextChars,
    );
    const payload: AnnotationPayload = {
      bookId: reader.chapter.bookId,
      chapterId: reader.chapter.id,
      chapterVersionId: reader.version.id,
      selectedText: draft.selectedText,
      startOffset: draft.startOffset,
      endOffset: draft.endOffset,
      renderedStartOffset: draft.renderedStartOffset,
      renderedEndOffset: draft.renderedEndOffset,
      contextBefore: context.before,
      contextAfter: context.after,
      headingPath: getHeadingPath(reader.content, draft.startOffset),
      highlightColor: draft.highlightColor,
      comment: draft.comment,
      tags: "",
    };

    try {
      const annotation = await createAnnotation(payload);
      setReader({
        ...reader,
        annotations: [...reader.annotations, annotation].sort(
          (left, right) => left.startOffset - right.startOffset,
        ),
      });
      setDraft(null);
      setPendingDraft(null);
      setContextMenu(null);
      window.getSelection()?.removeAllRanges();
      void refreshNotes();
    } catch (err) {
      setError(readError(err));
    }
  }

  async function handleDeleteAnnotation(annotationId: string) {
    if (!reader) return;
    try {
      await deleteAnnotation(annotationId);
      setReader({
        ...reader,
        annotations: reader.annotations.filter((annotation) => annotation.id !== annotationId),
      });
      if (activeAnnotationId === annotationId) setActiveAnnotationId(null);
      void refreshNotes();
    } catch (err) {
      setError(readError(err));
    }
  }

  async function handleUpdateAnnotation(annotation: Annotation, patch: Partial<Annotation>) {
    if (!reader) return;
    try {
      const updated = await updateAnnotation(annotation.id, {
        highlightColor: patch.highlightColor,
        comment: patch.comment,
      });
      setReader({
        ...reader,
        annotations: reader.annotations.map((item) => (item.id === updated.id ? updated : item)),
      });
      void refreshNotes();
    } catch (err) {
      setError(readError(err));
    }
  }

  function handleAnnotationClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const mark = target.closest<HTMLElement>("[data-annotation-id]");
    if (mark) {
      setActiveAnnotationId(mark.dataset.annotationId ?? null);
    }
  }

  function openSortModal() {
    setSortDraft(chapters);
    setSortDragChapterId(null);
    setSortOpen(true);
  }

  function moveSortDraft(targetChapterId: string, movedChapterId?: string | null) {
    if (!movedChapterId || movedChapterId === targetChapterId) return;
    setSortDraft((current) => {
      const from = current.findIndex((chapter) => chapter.id === movedChapterId);
      const to = current.findIndex((chapter) => chapter.id === targetChapterId);
      if (from < 0 || to < 0) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function saveSortDraft() {
    if (!activeBook) return;
    setBusy(true);
    setError("");
    try {
      const saved = await reorderChapters(
        activeBook.id,
        sortDraft.map((chapter) => chapter.id),
      );
      setChapters(saved);
      setSortOpen(false);
      setSortDragChapterId(null);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function scrollToHeading(title: string) {
    if (!articleRef.current) return;
    const headings = articleRef.current.querySelectorAll("h1, h2, h3, h4, h5, h6");
    for (const heading of headings) {
      if (heading.textContent?.trim() === title) {
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  }

  async function handleExport() {
    if (!activeBook || !reader) return;
    setBusy(true);
    setError("");
    try {
      const selectedPreset =
        exportPresets.find((preset) => preset.id === exportPresetId) ?? null;
      const scope =
        exportScope === "book"
          ? { bookId: activeBook.id }
          : { chapterId: reader.chapter.id, chapterVersionId: reader.version.id };
      const markdown = await exportAnnotations(
        scope,
        selectedPreset?.baseTemplateId ?? exportTemplate,
        selectedPreset ? undefined : exportTaskGoal,
        selectedPreset?.id,
      );
      setExportText(markdown);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyExport() {
    if (!exportText) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setNotice("当前环境无法直接写入剪贴板，可以手动复制导出内容。");
    }
  }

  function applySettings(patch: Partial<AppSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    void updateSettings(patch)
      .then(setSettings)
      .catch((err) => setError(readError(err)));
  }

  function startReaderColumnResize(
    target: "left" | "right",
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = target === "left" ? leftPaneWidth : rightPaneWidth;
    const siblingWidth =
      target === "left"
        ? isRightCollapsed ? 0 : rightPaneWidth
        : isLeftCollapsed ? 0 : leftPaneWidth;
    const minWidth = target === "left" ? 220 : 260;
    const maxWidth = Math.min(
      target === "left" ? 520 : 560,
      window.innerWidth - siblingWidth - 480,
    );

    setResizeTarget(target);
    document.body.classList.add("pane-resize-active", "pane-resize-column");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta =
        target === "left" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const nextWidth = clamp(startWidth + delta, minWidth, maxWidth);
      if (target === "left") {
        setLeftPaneWidth(nextWidth);
      } else {
        setRightPaneWidth(nextWidth);
      }
    };

    const stopResize = () => {
      setResizeTarget(null);
      document.body.classList.remove("pane-resize-active", "pane-resize-column");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function startChapterOutlineResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !readerLeftRef.current) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = chapterPaneHeight;
    const leftRect = readerLeftRef.current.getBoundingClientRect();
    const maxHeight = leftRect.height - 76 - 42 - 42 - 8 - 140;

    setResizeTarget("chapters");
    document.body.classList.add("pane-resize-active", "pane-resize-row");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextHeight = clamp(startHeight + moveEvent.clientY - startY, 120, maxHeight);
      setChapterPaneHeight(nextHeight);
    };

    const stopResize = () => {
      setResizeTarget(null);
      document.body.classList.remove("pane-resize-active", "pane-resize-row");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  async function saveExportPreset(
    presetId: string | null,
    payload: ExportPresetPayload,
  ): Promise<ExportPreset> {
    setBusy(true);
    setError("");
    try {
      const saved = presetId
        ? await updateExportPreset(presetId, payload)
        : await createExportPreset(payload);
      await refreshExportPresets();
      setNotice(presetId ? "导出预设已更新。" : "导出预设已创建。");
      return saved;
    } catch (err) {
      setError(readError(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function removeExportPreset(presetId: string) {
    setBusy(true);
    setError("");
    try {
      await deleteExportPreset(presetId);
      await refreshExportPresets();
      setNotice("导出预设已删除。");
    } catch (err) {
      setError(readError(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  function handleBookContextMenu(event: React.MouseEvent, book: BookSummary) {
    event.preventDefault();
    setBookMenu({
      book,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 160),
    });
  }

  async function saveBookRename() {
    if (!renameBookDraft) return;
    setBusy(true);
    setError("");
    try {
      await updateBookName(renameBookDraft.book.id, renameBookDraft.name);
      setRenameBookDraft(null);
      await refreshBooks();
      setNotice("书籍名称已更新。");
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openBookInExplorer(book: BookSummary) {
    setBusy(true);
    setError("");
    setBookMenu(null);
    try {
      await openBookFolder(book.id);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteBook() {
    if (!deleteBookDraft) return;
    const deletedBook = deleteBookDraft;
    setBusy(true);
    setError("");
    try {
      await deleteBook(deletedBook.id);
      setDeleteBookDraft(null);
      if (workbenchBookId === deletedBook.id) {
        setWorkbenchBookId("all");
        setWorkbenchChapterId("all");
        setSelectedNoteIds([]);
      }
      await Promise.all([refreshBooks(), refreshNotes()]);
      setNotice(`已删除《${deletedBook.name}》的本地索引。`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function syncBook(book: BookSummary) {
    setBusy(true);
    setError("");
    setBookMenu(null);
    try {
      const report = await syncBookFolder(book.id);
      setSyncReport(report);
      await refreshBooks();
      void refreshNotes();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleNoteSelection(noteId: string) {
    setSelectedNoteIds((current) =>
      current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId],
    );
  }

  function toggleAllFilteredNotes() {
    if (selectedNoteIds.length === filteredNotes.length) {
      setSelectedNoteIds([]);
    } else {
      setSelectedNoteIds(filteredNotes.map((note) => note.id));
    }
  }

  async function updateSelectedNoteStatus(status: AnnotationStatus) {
    if (selectedNoteIds.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await markAnnotationsStatus(selectedNoteIds, status);
      setSelectedNoteIds([]);
      await refreshNotes();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportSelectedNotes() {
    if (selectedNoteIds.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const markdown = await exportAnnotations(
        { annotationIds: selectedNoteIds },
        "ai-pack",
        exportTaskGoal,
      );
      setBatchExportText(markdown);
      setBatchExportOpen(true);
      await markAnnotationsStatus(selectedNoteIds, "exported");
      await refreshNotes();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyBatchExport() {
    if (!batchExportText) return;
    try {
      await navigator.clipboard.writeText(batchExportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setNotice("当前环境无法直接写入剪贴板，可以手动复制导出内容。");
    }
  }

  async function runBackupExport() {
    setBusy(true);
    setError("");
    try {
      const result = await exportBackup();
      setNotice(`备份已导出：${result.path}`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function runBackupRestore() {
    setBusy(true);
    setError("");
    try {
      const result: BackupResult = await restoreBackup();
      await boot();
      setNotice(`备份已恢复：${result.path}`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function selectAdjacentChapter(direction: 1 | -1) {
    if (!reader) return;
    const index = chapters.findIndex((chapter) => chapter.id === reader.chapter.id);
    const next = chapters[index + direction];
    if (next) void selectChapter(next.id);
  }

  function runShortcutAction(action: ShortcutAction) {
    if (action === "search") {
      setSearchOpen(true);
      return;
    }
    if (action === "nextChapter") {
      selectAdjacentChapter(1);
      return;
    }
    if (action === "previousChapter") {
      selectAdjacentChapter(-1);
      return;
    }
    if (action === "highlight") {
      const nextDraft = pendingDraft ?? buildDraftFromSelection(true);
      if (nextDraft) {
        setPendingDraft(nextDraft);
        setDraft(nextDraft);
      }
      return;
    }
    if (action === "export") {
      if (reader) setExportOpen(true);
      return;
    }
    if (action === "toggleLeft") {
      if (activeBook) setIsLeftCollapsed((value) => !value);
      return;
    }
    if (action === "toggleRight" && activeBook) {
      setIsRightCollapsed((value) => !value);
    }
  }

  if (!activeBook) {
    return (
      <div
        className={`app-shell home-shell theme-${settings.theme} surface-${settings.surface}`}
        onContextMenu={suppressNativeContextMenu}
      >
        <TopNotice error={error} notice={notice} onClose={() => {
          setError("");
          setNotice("");
        }} />
        <header className="home-header">
          <div>
            <p className="eyebrow">Local Markdown Annotation Studio</p>
            <h1>Loop Book</h1>
            <p className="home-subtitle">把 AI 生成的 Markdown 文档读完、批注好，再导出成下一轮 AI 可以直接消化的材料。</p>
          </div>
          <div className="header-actions">
            <button
              className={`icon-button ${homeView === "grid" ? "active" : ""}`}
              title="画廊视图"
              onClick={() => setHomeView("grid")}
            >
              <Grid3X3 size={18} />
            </button>
            <button
              className={`icon-button ${homeView === "notes" ? "active" : ""}`}
              title="笔记视图"
              onClick={() => {
                setHomeView("notes");
                void refreshNotes();
              }}
            >
              <MessageSquare size={18} />
            </button>
            <button className="icon-button" title="设置" onClick={() => setHomeSettingsOpen(true)}>
              <Settings size={18} />
            </button>
          </div>
        </header>

        {homeView === "notes" ? (
          <AnnotationWorkbench
            books={books}
            notes={filteredNotes}
            allNotesCount={notes.length}
            chapters={workbenchChapters}
            bookId={workbenchBookId}
            chapterId={workbenchChapterId}
            status={workbenchStatus}
            commentOnly={commentOnly}
            selectedIds={selectedNoteIds}
            selectedCount={selectedNotes.length}
            busy={busy}
            onBookChange={(bookId) => {
              setWorkbenchBookId(bookId);
              setWorkbenchChapterId("all");
              setSelectedNoteIds([]);
            }}
            onChapterChange={(chapterId) => {
              setWorkbenchChapterId(chapterId);
              setSelectedNoteIds([]);
            }}
            onStatusChange={(status) => {
              setWorkbenchStatus(status);
              setSelectedNoteIds([]);
            }}
            onCommentOnlyChange={setCommentOnly}
            onToggleNote={toggleNoteSelection}
            onToggleAll={toggleAllFilteredNotes}
            onOpenNote={(note) => void openNote(note)}
            onExportSelected={() => void exportSelectedNotes()}
            onMarkStatus={(status) => void updateSelectedNoteStatus(status)}
          />
        ) : (
          <main className={`book-collection ${homeView}`}>
            {books.map((book) => (
              <button
                key={book.id}
                className="book-card"
                onClick={() => void openBook(book)}
                onContextMenu={(event) => handleBookContextMenu(event, book)}
              >
                <span className="book-mark" />
                <strong>{book.name}</strong>
                <span>{book.chapterCount} 章 · {book.annotationCount} 条批注</span>
                <small>{book.rootPath}</small>
              </button>
            ))}
            <button
              ref={importDropRef}
              type="button"
              className={`book-card import-book-card ${importDragActive ? "drag-active" : ""}`}
              onClick={handleChooseFolder}
              disabled={busy}
            >
              <span className="import-card-icon">
                <FolderPlus size={23} />
              </span>
              <strong>{busy ? "正在导入" : "导入 Markdown 文件夹"}</strong>
              <span>拖入文件夹 / 点击选择</span>
              <small>作为画廊末尾的新书籍入口</small>
            </button>
          </main>
        )}

        {bookMenu && (
          <BookContextMenu
            menu={bookMenu}
            onRename={() => {
              setRenameBookDraft({ book: bookMenu.book, name: bookMenu.book.name });
              setBookMenu(null);
            }}
            onOpenFolder={() => void openBookInExplorer(bookMenu.book)}
            onSync={() => void syncBook(bookMenu.book)}
            onVersions={() => {
              setVersionManagerBook(bookMenu.book);
              setBookMenu(null);
            }}
            onDelete={() => {
              setDeleteBookDraft(bookMenu.book);
              setBookMenu(null);
            }}
          />
        )}
        {renameBookDraft && (
          <RenameBookModal
            draft={renameBookDraft}
            busy={busy}
            onChange={(name) => setRenameBookDraft({ ...renameBookDraft, name })}
            onClose={() => setRenameBookDraft(null)}
            onSave={() => void saveBookRename()}
          />
        )}
        {deleteBookDraft && (
          <DeleteBookModal
            book={deleteBookDraft}
            busy={busy}
            onClose={() => setDeleteBookDraft(null)}
            onConfirm={() => void confirmDeleteBook()}
          />
        )}
        {syncReport && <SyncReportModal report={syncReport} onClose={() => setSyncReport(null)} />}
        {versionManagerBook && (
          <VersionManagerModal
            book={versionManagerBook}
            onClose={() => setVersionManagerBook(null)}
            onError={setError}
          />
        )}
        {homeSettingsOpen && (
          <HomeSettingsModal
            settings={settings}
            exportPresets={exportPresets}
            busy={busy}
            onBackupExport={() => void runBackupExport()}
            onBackupRestore={() => void runBackupRestore()}
            onChange={applySettings}
            onSaveExportPreset={saveExportPreset}
            onDeleteExportPreset={removeExportPreset}
            onClose={() => setHomeSettingsOpen(false)}
          />
        )}
        {searchOpen && (
          <SearchModal
            query={searchQuery}
            books={books}
            notes={notes}
            onQueryChange={setSearchQuery}
            onClose={() => setSearchOpen(false)}
            onOpenBook={(book) => {
              setSearchOpen(false);
              void openBook(book);
            }}
            onOpenNote={(note) => {
              setSearchOpen(false);
              void openNote(note);
            }}
            onOpenContentResult={(result) => void openContentSearchResult(result)}
          />
        )}
        {batchExportOpen && (
          <BatchExportModal
            text={batchExportText}
            copied={copied}
            onCopy={() => void copyBatchExport()}
            onClose={() => setBatchExportOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`app-shell reader-shell theme-${settings.theme} surface-${settings.surface} ${
        isLeftCollapsed ? "left-collapsed" : ""
      } ${isRightCollapsed ? "right-collapsed" : ""} ${
        resizeTarget ? "resizing-panes" : ""
      }`}
      style={readerStyle}
      onContextMenu={suppressNativeContextMenu}
    >
      <TopNotice error={error} notice={notice} onClose={() => {
        setError("");
        setNotice("");
      }} />
      <aside className="reader-left" ref={readerLeftRef}>
        <div className="reader-bookbar">
          <button className="icon-button" title="返回首页" onClick={() => {
            setActiveBook(null);
            setReader(null);
            void refreshBooks();
            void refreshNotes();
          }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <strong>{activeBook.name}</strong>
            <span>{chapters.length} 章</span>
          </div>
        </div>

        <div className="pane-header">
          <span>章节</span>
          <button className="pane-action" onClick={openSortModal}>
            排序
          </button>
        </div>
        <div className="chapter-list">
          {chapters.map((chapter) => (
            <button
              key={chapter.id}
              className={`chapter-row ${reader?.chapter.id === chapter.id ? "active" : ""}`}
              onClick={() => void selectChapter(chapter.id)}
            >
              <FileText size={15} />
              <span>{chapterFileName(chapter)}</span>
            </button>
          ))}
        </div>

        <div
          className="reader-section-resizer"
          role="separator"
          aria-label="调整章节和大纲高度"
          onPointerDown={startChapterOutlineResize}
        />

        <div className="pane-header outline-heading">
          <span>大纲</span>
        </div>
        <div className="outline-list">
          {reader?.outline.length ? (
            reader.outline.map((item) => (
              <button
                key={item.id}
                style={{ paddingLeft: `${8 + item.level * 10}px` }}
                onClick={() => scrollToHeading(item.title)}
              >
                {item.title}
              </button>
            ))
          ) : (
            <p className="muted">当前章节没有标题。</p>
          )}
        </div>
      </aside>

      <div
        className="reader-column-resizer left-resizer"
        role="separator"
        aria-label="调整左栏宽度"
        onPointerDown={(event) => startReaderColumnResize("left", event)}
      />

      <main className="reader-main">
        <header className="reader-toolbar">
          <div>
            <p className="eyebrow">Chapter</p>
            <h2>{reader?.chapter.title}</h2>
          </div>
          <div className="toolbar-controls">
            {reader && (
              <select
                value={reader.version.id}
                onChange={(event) => void selectVersion(event.target.value)}
                title="章节版本"
              >
                {reader.versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.id === reader.chapter.currentVersionId
                      ? `当前版本 v${version.versionNumber}`
                      : `v${version.versionNumber}`}
                  </option>
                ))}
              </select>
            )}
            <button
              className={`icon-button ${!isLeftCollapsed ? "active" : ""}`}
              title={isLeftCollapsed ? "展开左栏" : "收起左栏"}
              onClick={() => setIsLeftCollapsed((value) => !value)}
            >
              <BookOpen size={18} />
            </button>
            <button
              className={`icon-button ${!isRightCollapsed ? "active" : ""}`}
              title={isRightCollapsed ? "展开右栏" : "收起右栏"}
              onClick={() => setIsRightCollapsed((value) => !value)}
            >
              <MessageSquare size={18} />
            </button>
            <button
              className="icon-button"
              title="导出批注"
              onClick={() => {
                setExportOpen(true);
                setExportText("");
              }}
            >
              <Download size={18} />
            </button>
            <button className="icon-button" title="阅读器设置" onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </button>
          </div>
        </header>

        <div className={`reading-surface border-${settings.borderStyle}`} ref={scrollRef}>
          <article
            ref={articleRef}
            className="markdown-body"
            onMouseUp={handleTextSelection}
            onContextMenu={handleReaderContextMenu}
            onClick={handleAnnotationClick}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>
      </main>

      <div
        className="reader-column-resizer right-resizer"
        role="separator"
        aria-label="调整右栏宽度"
        onPointerDown={(event) => startReaderColumnResize("right", event)}
      />

      <aside className="reader-right">
        <div className="pane-header">
          <span>批注</span>
          <small>{reader?.annotations.length ?? 0}</small>
        </div>

        <div className="annotation-list">
          {reader?.annotations.length ? (
            reader.annotations.map((annotation) => (
              <AnnotationCard
                key={annotation.id}
                annotation={annotation}
                active={annotation.id === activeAnnotationId}
                onOpen={() => setActiveAnnotationId(annotation.id)}
              />
            ))
          ) : (
            <div className="empty-panel">
              <MessageSquare size={28} />
              <p>选中正文后可以创建高亮和评论。</p>
            </div>
          )}
        </div>
      </aside>

      {sortOpen && (
        <SortChaptersModal
          chapters={sortDraft}
          activeChapterId={reader?.chapter.id}
          dragChapterId={sortDragChapterId}
          busy={busy}
          onDragStart={setSortDragChapterId}
          onMove={moveSortDraft}
          onClose={() => {
            setSortOpen(false);
            setSortDragChapterId(null);
          }}
          onSave={() => void saveSortDraft()}
        />
      )}
      {exportOpen && (
        <ExportModal
          scope={exportScope}
          template={exportTemplate}
          taskGoal={exportTaskGoal}
          presets={exportPresets}
          presetId={exportPresetId}
          exportText={exportText}
          copied={copied}
          busy={busy}
          onScopeChange={setExportScope}
          onTemplateChange={setExportTemplate}
          onTaskGoalChange={setExportTaskGoal}
          onPresetChange={setExportPresetId}
          onExport={() => void handleExport()}
          onCopy={() => void copyExport()}
          onClose={() => setExportOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={applySettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {searchOpen && (
        <SearchModal
          query={searchQuery}
          books={books}
          notes={notes}
          onQueryChange={setSearchQuery}
          onClose={() => setSearchOpen(false)}
          onOpenBook={(book) => {
            setSearchOpen(false);
            void openBook(book);
          }}
          onOpenNote={(note) => {
            setSearchOpen(false);
            void openNote(note);
          }}
          onOpenContentResult={(result) => void openContentSearchResult(result)}
        />
      )}
      {contextMenu && pendingDraft && (
        <div
          className="selection-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={openPendingDraft}>
            <Highlighter size={16} />
            添加批注
          </button>
        </div>
      )}
      {draft && (
        <NewAnnotationModal
          draft={draft}
          onChange={setDraft}
          onCancel={() => {
            setDraft(null);
            window.getSelection()?.removeAllRanges();
          }}
          onSave={() => void saveDraft()}
        />
      )}
      {activeAnnotation && (
        <AnnotationDetailModal
          annotation={activeAnnotation}
          onClose={() => setActiveAnnotationId(null)}
          onDelete={() => void handleDeleteAnnotation(activeAnnotation.id)}
          onSave={(patch) => void handleUpdateAnnotation(activeAnnotation, patch)}
        />
      )}
    </div>
  );
}

function readError(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}

function clamp(value: number, min: number, max: number) {
  const upper = Math.max(min, max);
  return Math.min(Math.max(value, min), upper);
}
