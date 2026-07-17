import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FolderPlus,
  Grid3X3,
  Highlighter,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  Search,
  Settings,
  Square,
  X,
} from "lucide-react";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { availableMonitors, cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  importBookSelection,
  listBooks,
  listChapters,
  listExportPresets,
  listNoteItems,
  markAnnotationsStatus,
  openBookFolder,
  pickBookFolder,
  previewImportBookFolder,
  readChapter,
  readChapterVersion,
  reorderChapters,
  restoreBackup,
  saveReadingProgress,
  syncBookFolder,
  updateBookName,
  updateBookPinned,
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
  ImportBookModal,
  NoteDetailModal,
  RenameBookModal,
  type RenameBookState,
  SearchModal,
  SyncReportModal,
  VersionManagerModal,
} from "./components/home/HomeModals";
import {
  AnnotationCard,
  AnnotationContextMenu,
  AnnotationDetailModal,
  ExportModal,
  NewAnnotationModal,
  SettingsPanel,
  SortChaptersModal,
  TopNotice,
  type SelectionDraft,
} from "./components/reader/ReaderComponents";
import { defaultSettings, getDefaultThemeForSeries, getEffectiveThemeSeries, highlightColors } from "./constants";
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
  ImportBookPreview,
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

type AnnotationMenuState = ContextMenuState & { annotation: Annotation };
type ReaderBook = Book | BookSummary;

interface ReaderSearchMatch {
  id: string;
  startOffset: number;
  endOffset: number;
  matchedText: string;
  excerpt: string;
}

interface FullscreenReveal {
  top: boolean;
  left: boolean;
  right: boolean;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

const uiExitMs = 150;
const readerMotionMs = 220;
const noticeAutoDismissMs = 2000;
const fullscreenEdgePx = 24;
const fullscreenTopKeepPx = 126;
const fullscreenSideKeepPaddingPx = 36;
const fullscreenTopPollMs = 80;
const fullscreenTopCursorPx = 8;
const windowPlacementStorageKey = "annotaloop.windowPlacement.v1";
const windowPlacementSaveDelayMs = 320;
const minimumRestoredWindowSize = 360;

interface SavedWindowPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  savedAt: number;
}

function AppTitlebar({ title, subtitle }: { title: string; subtitle: string }) {
  function handleDrag(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const appWindow = getCurrentWindow();
    if (event.detail >= 2) {
      void appWindow.toggleMaximize();
      return;
    }
    void appWindow.startDragging();
  }

  return (
    <div className="desktop-titlebar" onMouseDown={handleDrag}>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-mark" aria-hidden="true" />
        <div className="titlebar-copy">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <div className="window-controls">
        <button
          type="button"
          className="window-control"
          title="最小化"
          aria-label="最小化"
          onClick={() => void getCurrentWindow().minimize()}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="window-control"
          title="最大化或还原"
          aria-label="最大化或还原"
          onClick={() => void getCurrentWindow().toggleMaximize()}
        >
          <Square size={13} />
        </button>
        <button
          type="button"
          className="window-control close"
          title="关闭"
          aria-label="关闭"
          onClick={() => void getCurrentWindow().close()}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function deriveImportBookName(preview: ImportBookPreview, filePaths: string[]) {
  if (filePaths.length === 1) {
    return preview.files.find((file) => file.path === filePaths[0])?.name ?? preview.defaultName;
  }
  return preview.defaultName;
}

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
  const [workbenchNoteDetail, setWorkbenchNoteDetail] = useState<NoteItem | null>(null);
  const [importDragActive, setImportDragActive] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportBookPreview | null>(null);
  const [importBookName, setImportBookName] = useState("");
  const [importBookNameEdited, setImportBookNameEdited] = useState(false);
  const [selectedImportFilePaths, setSelectedImportFilePaths] = useState<string[]>([]);
  const [importModalClosing, setImportModalClosing] = useState(false);
  const [activeBook, setActiveBook] = useState<ReaderBook | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [reader, setReader] = useState<ReadChapterResponse | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [homeSettingsOpen, setHomeSettingsOpen] = useState(false);
  const [homeSettingsClosing, setHomeSettingsClosing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [bookMenu, setBookMenu] = useState<BookMenuState | null>(null);
  const [bookMenuClosing, setBookMenuClosing] = useState(false);
  const [renameBookDraft, setRenameBookDraft] = useState<RenameBookState | null>(null);
  const [renameBookClosing, setRenameBookClosing] = useState(false);
  const [deleteBookDraft, setDeleteBookDraft] = useState<BookSummary | null>(null);
  const [deleteBookClosing, setDeleteBookClosing] = useState(false);
  const [syncReport, setSyncReport] = useState<FolderSyncReport | null>(null);
  const [syncReportClosing, setSyncReportClosing] = useState(false);
  const [versionManagerBook, setVersionManagerBook] = useState<BookSummary | null>(null);
  const [versionManagerClosing, setVersionManagerClosing] = useState(false);
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  const [batchExportClosing, setBatchExportClosing] = useState(false);
  const [batchExportText, setBatchExportText] = useState("");
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [pendingDraft, setPendingDraft] = useState<SelectionDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuClosing, setContextMenuClosing] = useState(false);
  const [annotationMenu, setAnnotationMenu] = useState<AnnotationMenuState | null>(null);
  const [annotationMenuClosing, setAnnotationMenuClosing] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [detailAnnotationId, setDetailAnnotationId] = useState<string | null>(null);
  const [detailAnnotationClosing, setDetailAnnotationClosing] = useState(false);
  const [activeSearchHighlight, setActiveSearchHighlight] = useState<
    (SearchHighlight & { chapterVersionId: string }) | null
  >(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortClosing, setSortClosing] = useState(false);
  const [sortDraft, setSortDraft] = useState<Chapter[]>([]);
  const [sortDragChapterId, setSortDragChapterId] = useState<string | null>(null);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isReadingFullscreen, setIsReadingFullscreen] = useState(false);
  const [fullscreenReveal, setFullscreenReveal] = useState<FullscreenReveal>({
    top: false,
    left: false,
    right: false,
  });
  const [leftPaneWidth, setLeftPaneWidth] = useState(284);
  const [rightPaneWidth, setRightPaneWidth] = useState(344);
  const [chapterPaneHeight, setChapterPaneHeight] = useState(320);
  const [readerSearchPaneHeight, setReaderSearchPaneHeight] = useState(260);
  const [resizeTarget, setResizeTarget] = useState<
    "left" | "right" | "chapters" | "readerSearch" | null
  >(null);
  const [readerSearchQuery, setReaderSearchQuery] = useState("");
  const [readerSearchMatches, setReaderSearchMatches] = useState<ReaderSearchMatch[]>([]);
  const [activeReaderSearchIndex, setActiveReaderSearchIndex] = useState(-1);
  const [readerMotion, setReaderMotion] = useState<"content" | "jump" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportClosing, setExportClosing] = useState(false);
  const [exportTemplate, setExportTemplate] = useState<ExportTemplate>("reading-notes");
  const [exportTaskGoal, setExportTaskGoal] = useState<ExportTaskGoal>("rewrite");
  const [exportPresetId, setExportPresetId] = useState("");
  const [exportScope, setExportScope] = useState<"chapter" | "book">("chapter");
  const [exportIncludeEmptyAnnotations, setExportIncludeEmptyAnnotations] = useState(true);
  const [exportText, setExportText] = useState("");
  const [copied, setCopied] = useState(false);
  const [draftClosing, setDraftClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [topNoticeClosing, setTopNoticeClosing] = useState(false);
  const [pendingScroll, setPendingScroll] = useState<number | null>(null);
  const [noteDetailClosing, setNoteDetailClosing] = useState(false);

  const articleRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const readerLeftRef = useRef<HTMLElement | null>(null);
  const readerRightRef = useRef<HTMLElement | null>(null);
  const readerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const bookCollectionRef = useRef<HTMLElement | null>(null);
  const readerMotionTimerRef = useRef<number | null>(null);
  const latestSettingsRef = useRef<AppSettings>(defaultSettings);
  const searchThemeSnapshotRef = useRef<Pick<AppSettings, "themeSeries" | "theme"> | null>(null);

  latestSettingsRef.current = settings;

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisteners: Array<() => void> = [];
    let cancelled = false;
    let restored = false;
    let saveTimer: number | null = null;

    async function restoreWindowPlacement() {
      const saved = readSavedWindowPlacement();
      if (!saved) return;
      const monitors = await availableMonitors();
      if (!isWindowPlacementVisible(saved, monitors)) return;
      await appWindow.setSize(new PhysicalSize(saved.width, saved.height));
      await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
    }

    async function saveWindowPlacement() {
      saveTimer = null;
      try {
        const [isMaximized, isFullscreen] = await Promise.all([
          appWindow.isMaximized(),
          appWindow.isFullscreen(),
        ]);
        if (isMaximized || isFullscreen) return;
        const [position, size] = await Promise.all([
          appWindow.outerPosition(),
          appWindow.outerSize(),
        ]);
        writeSavedWindowPlacement({
          x: Math.round(position.x),
          y: Math.round(position.y),
          width: Math.round(size.width),
          height: Math.round(size.height),
          savedAt: Date.now(),
        });
      } catch {
        // Window placement is a convenience; failure should not interrupt reading.
      }
    }

    function scheduleSaveWindowPlacement() {
      if (!restored || cancelled) return;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        void saveWindowPlacement();
      }, windowPlacementSaveDelayMs);
    }

    void restoreWindowPlacement()
      .catch(() => {
        localStorage.removeItem(windowPlacementStorageKey);
      })
      .finally(() => {
        if (cancelled) return;
        restored = true;
        void appWindow.onMoved(() => scheduleSaveWindowPlacement()).then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlisteners.push(unlisten);
          }
        });
        void appWindow.onResized(() => scheduleSaveWindowPlacement()).then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlisteners.push(unlisten);
          }
        });
      });

    return () => {
      cancelled = true;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (readerMotionTimerRef.current !== null) {
        window.clearTimeout(readerMotionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!notice && !error) return;
    setTopNoticeClosing(false);
    const closeTimer = window.setTimeout(() => {
      setTopNoticeClosing(true);
    }, noticeAutoDismissMs);
    const clearTimer = window.setTimeout(() => {
      setError("");
      setNotice("");
      setTopNoticeClosing(false);
    }, noticeAutoDismissMs + uiExitMs);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [notice, error]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const shellBackground = shell
        ? getComputedStyle(shell).getPropertyValue("--shell-bg").trim()
        : "";
      document.documentElement.style.setProperty(
        "--app-root-bg",
        shellBackground || "#eef0ea",
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [settings.theme, settings.themeSeries, activeBook]);

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
    if (activeBook || !isReadingFullscreen) return;
    setIsReadingFullscreen(false);
    setFullscreenReveal({ top: false, left: false, right: false });
    void getCurrentWindow()
      .setFullscreen(false)
      .catch((err) => setError(readError(err)));
  }, [activeBook, isReadingFullscreen]);

  useEffect(() => {
    if (!isReadingFullscreen) return;

    let cancelled = false;
    let sampling = false;
    const appWindow = getCurrentWindow();

    async function sampleTopEdge() {
      if (cancelled || sampling) return;
      sampling = true;
      try {
        const [cursor, windowPosition] = await Promise.all([
          cursorPosition(),
          appWindow.outerPosition(),
        ]);
        if (cancelled) return;
        if (cursor.y - windowPosition.y <= fullscreenTopCursorPx) {
          revealFullscreenChrome("top");
        }
      } catch {
        // Edge reveal still works through pointer events when cursor sampling is unavailable.
      } finally {
        sampling = false;
      }
    }

    void sampleTopEdge();
    const timer = window.setInterval(() => {
      void sampleTopEdge();
    }, fullscreenTopPollMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isReadingFullscreen]);

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
    const close = () => closeSelectionContextMenu();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!bookMenu) return;
    const close = () => closeBookMenu();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [bookMenu]);

  useEffect(() => {
    if (!annotationMenu) return;
    const close = () => closeAnnotationMenu();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [annotationMenu]);

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
      const activeMark =
        articleRef.current?.querySelector<HTMLElement>('[data-search-id="global-search"]') ?? mark;
      activeMark?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSearchHighlight, reader]);

  useEffect(() => {
    if (!reader || activeReaderSearchIndex < 0 || !articleRef.current) return;
    const match = readerSearchMatches[activeReaderSearchIndex];
    if (!match) return;
    const frame = window.requestAnimationFrame(() => {
      const mark = articleRef.current?.querySelector<HTMLElement>(
        `[data-search-id="${match.id}"]`,
      );
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeReaderSearchIndex, reader, readerSearchMatches]);

  const renderedHtml = useMemo(() => {
    if (!reader) return "";
    return renderMarkdownWithAnnotations(reader.content, reader.chapter.filePath);
  }, [reader]);

  const readerStats = useMemo(() => getReadingStats(reader?.content ?? ""), [reader?.content]);

  const currentChapterIndex = useMemo(() => {
    if (!reader) return -1;
    return chapters.findIndex((chapter) => chapter.id === reader.chapter.id);
  }, [chapters, reader]);

  const previousChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1
      ? chapters[currentChapterIndex + 1]
      : null;

  const activeGlobalSearchHighlight = useMemo<SearchHighlight | null>(() => {
    if (!reader || activeSearchHighlight?.chapterVersionId !== reader.version.id) return null;
    return {
      id: "global-search",
      startOffset: activeSearchHighlight.startOffset,
      endOffset: activeSearchHighlight.endOffset,
      matchedText: activeSearchHighlight.matchedText,
      active: true,
    };
  }, [activeSearchHighlight, reader]);

  const readerSearchHighlights = useMemo<SearchHighlight[]>(
    () =>
      readerSearchMatches.map((match, index) => ({
        id: match.id,
        startOffset: match.startOffset,
        endOffset: match.endOffset,
        matchedText: match.matchedText,
        active: index === activeReaderSearchIndex,
      })),
    [activeReaderSearchIndex, readerSearchMatches],
  );

  const visibleSearchHighlights = useMemo(
    () => [
      ...(activeGlobalSearchHighlight ? [activeGlobalSearchHighlight] : []),
      ...readerSearchHighlights,
    ],
    [activeGlobalSearchHighlight, readerSearchHighlights],
  );

  useEffect(() => {
    if (!reader || !articleRef.current) {
      setReaderSearchMatches([]);
      setActiveReaderSearchIndex(-1);
      return;
    }
    const nextMatches = buildReaderSearchMatches(
      articleRef.current.textContent ?? "",
      readerSearchQuery,
    );
    setReaderSearchMatches(nextMatches);
    setActiveReaderSearchIndex(-1);
  }, [reader?.version.id, readerSearchQuery, renderedHtml]);

  useEffect(() => {
    if (!reader || !articleRef.current) return;
    applyDomHighlights(articleRef.current, reader.annotations, visibleSearchHighlights);
  }, [reader, renderedHtml, visibleSearchHighlights]);

  const detailAnnotation = useMemo(() => {
    if (!reader || !detailAnnotationId) return null;
    return reader.annotations.find((annotation) => annotation.id === detailAnnotationId) ?? null;
  }, [detailAnnotationId, reader]);

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
      if (event.key === "Escape" && closeTopModal()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === "Escape" && isReadingFullscreen) {
        event.preventDefault();
        event.stopPropagation();
        exitReadingFullscreen();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        return;
      }
      if (
        activeBook &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        focusReaderSearchInput();
        return;
      }
      if (shouldIgnoreShortcut(event)) return;
      const action = matchShortcut(event, shortcutBindings);
      if (!action) return;
      event.preventDefault();
      runShortcutAction(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    shortcutBindings,
    activeBook,
    reader,
    chapters,
    pendingDraft,
    detailAnnotationId,
    draft,
    contextMenu,
    annotationMenu,
    searchOpen,
    settingsOpen,
    exportOpen,
    sortOpen,
    batchExportOpen,
    workbenchNoteDetail,
    homeSettingsOpen,
    versionManagerBook,
    syncReport,
    deleteBookDraft,
    renameBookDraft,
    bookMenu,
    importPreview,
    isReadingFullscreen,
  ]);

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
        "--reader-search-height": `${readerSearchPaneHeight}px`,
      }) as CSSProperties,
    [chapterPaneHeight, leftPaneWidth, readerSearchPaneHeight, rightPaneWidth, settings],
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
        await openImportPreview(selected);
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
      await openImportPreview(folderPath);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function isImportDropPosition(position: { x: number; y: number }) {
    const shelf = bookCollectionRef.current;
    if (!shelf) return false;
    const rect = shelf.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const x = position.x / scale;
    const y = position.y / scale;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  async function openImportPreview(path: string) {
    const preview = await previewImportBookFolder(path);
    const initialFilePaths = preview.files.map((file) => file.path);
    setImportPreview(preview);
    setImportBookNameEdited(false);
    setImportBookName(deriveImportBookName(preview, initialFilePaths));
    setSelectedImportFilePaths(initialFilePaths);
    setImportModalClosing(false);
  }

  function updateImportBookName(name: string) {
    setImportBookNameEdited(true);
    setImportBookName(name);
  }

  function updateImportFileSelection(filePaths: string[]) {
    setSelectedImportFilePaths(filePaths);
    if (!importBookNameEdited && importPreview) {
      setImportBookName(deriveImportBookName(importPreview, filePaths));
    }
  }

  async function confirmImportBook() {
    if (!importPreview) return;
    setError("");
    setBusy(true);
    try {
      const imported = await importBookSelection({
        rootPath: importPreview.rootPath,
        bookName: importBookName.trim(),
        filePaths: selectedImportFilePaths,
      });
      await refreshBooks();
      setNotice(`已导入《${imported.book.name}》，共 ${imported.chapters.length} 个章节。`);
      closeImportModal();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openBook(book: ReaderBook) {
    setBusy(true);
    setError("");
    setExportText("");
    setExportOpen(false);
    setSortOpen(false);
    setDraft(null);
    setActiveSearchHighlight(null);
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
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
      runViewTransition(() => {
        setActiveBook(book);
        setChapters(nextChapters);
        setReader(nextReader);
      });
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
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    try {
      const nextChapters = await listChapters(note.bookId);
      const nextReader = await readChapterVersion(note.chapterVersionId).catch(() =>
        readChapter(note.chapterId),
      );
      const book = books.find((item) => item.id === note.bookId);
      runViewTransition(() => {
        setActiveBook(
          book ?? {
            id: note.bookId,
            name: note.bookName,
            rootPath: "",
            viewMode: "grid",
            isPinned: false,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            chapterCount: nextChapters.length,
            annotationCount: notes.filter((item) => item.bookId === note.bookId).length,
          },
        );
        setChapters(nextChapters);
        setReader(nextReader);
      });
      selectReaderAnnotation(note.id);
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
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    try {
      const nextChapters = await listChapters(result.bookId);
      const nextReader = await readChapterVersion(result.chapterVersionId).catch(() =>
        readChapter(result.chapterId),
      );
      const book = books.find((item) => item.id === result.bookId);
      runViewTransition(() => {
        setActiveBook(
          book ?? {
            id: result.bookId,
            name: result.bookName,
            rootPath: "",
            viewMode: "grid",
            isPinned: false,
            createdAt: "",
            updatedAt: "",
            chapterCount: nextChapters.length,
            annotationCount: notes.filter((item) => item.bookId === result.bookId).length,
          },
        );
        setChapters(nextChapters);
        setReader(nextReader);
      });
      setActiveSearchHighlight({
        chapterVersionId: result.chapterVersionId,
        startOffset: result.startOffset,
        endOffset: result.endOffset,
        matchedText: result.matchedText,
      });
      playReaderMotion("jump");
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
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    try {
      const nextReader = await readChapter(chapterId);
      playReaderMotion("content");
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
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    try {
      const nextReader = await readChapterVersion(chapterVersionId);
      playReaderMotion("content");
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
    closeSelectionContextMenu();
  }

  function handleReaderContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (!articleRef.current) return;
    event.preventDefault();
    const nextDraft = buildDraftFromSelection(true) ?? pendingDraft;
    if (!nextDraft) {
      closeSelectionContextMenu();
      return;
    }
    setPendingDraft(nextDraft);
    setContextMenuClosing(false);
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
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
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
    setDraftClosing(false);
    setDraft(pendingDraft);
    closeSelectionContextMenu();
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
        annotations: sortReaderAnnotations([...reader.annotations, annotation]),
      });
      setPendingDraft(null);
      closeDraftModal();
      closeSelectionContextMenu();
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
      if (detailAnnotationId === annotationId) setDetailAnnotationId(null);
      void refreshNotes();
    } catch (err) {
      setError(readError(err));
    }
  }

  async function handleUpdateAnnotation(
    annotation: Annotation,
    patch: Partial<Annotation>,
    options: { closeDetail?: boolean } = { closeDetail: true },
  ) {
    if (!reader) return false;
    try {
      const updated = await updateAnnotation(annotation.id, {
        highlightColor: patch.highlightColor,
        comment: patch.comment,
        tags: patch.tags,
        status: patch.status,
        isPinned: patch.isPinned,
      });
      setReader({
        ...reader,
        annotations: sortReaderAnnotations(
          reader.annotations.map((item) => (item.id === updated.id ? updated : item)),
        ),
      });
      if (options.closeDetail ?? true) closeReaderAnnotationDetail();
      void refreshNotes();
      return true;
    } catch (err) {
      setError(readError(err));
      return false;
    }
  }

  function handleAnnotationClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const mark = target.closest<HTMLElement>("[data-annotation-id]");
    if (mark) {
      const annotationId = mark.dataset.annotationId;
      if (annotationId) openReaderAnnotationDetail(annotationId);
    }
  }

  function handleAnnotationContextMenu(
    event: ReactMouseEvent<HTMLButtonElement>,
    annotation: Annotation,
  ) {
    event.preventDefault();
    event.stopPropagation();
    closeSelectionContextMenu();
    setAnnotationMenuClosing(false);
    setAnnotationMenu({
      annotation,
      x: Math.min(event.clientX, window.innerWidth - 188),
      y: Math.min(event.clientY, window.innerHeight - 92),
    });
  }

  async function toggleAnnotationPinned(annotation: Annotation) {
    const nextPinned = !annotation.isPinned;
    closeAnnotationMenu();
    const saved = await handleUpdateAnnotation(annotation, { isPinned: nextPinned }, { closeDetail: false });
    if (saved) setNotice(nextPinned ? "批注已置顶。" : "批注已取消置顶。");
  }

  function deleteAnnotationFromMenu(annotation: Annotation) {
    closeAnnotationMenu();
    void handleDeleteAnnotation(annotation.id);
  }

  function openSortModal() {
    setSortDraft(chapters);
    setSortDragChapterId(null);
    setSortClosing(false);
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
      closeSortModal();
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
        playReaderMotion("jump");
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
        exportIncludeEmptyAnnotations,
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

  function startReaderSearchResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !readerRightRef.current) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = readerSearchPaneHeight;
    const rightRect = readerRightRef.current.getBoundingClientRect();
    const maxHeight = Math.max(180, rightRect.height - 42 - 150 - 8);

    setResizeTarget("readerSearch");
    document.body.classList.add("pane-resize-active", "pane-resize-row");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextHeight = clamp(startHeight - (moveEvent.clientY - startY), 156, maxHeight);
      setReaderSearchPaneHeight(nextHeight);
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
    setBookMenuClosing(false);
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
      closeRenameBookModal();
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
    closeBookMenu();
    try {
      await openBookFolder(book.id);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookPinned(book: BookSummary) {
    const nextPinned = !book.isPinned;
    setBusy(true);
    setError("");
    closeBookMenu();
    try {
      await updateBookPinned(book.id, nextPinned);
      await refreshBooks();
      setNotice(nextPinned ? `已置顶《${book.name}》。` : `已取消置顶《${book.name}》。`);
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
      closeDeleteBookModal();
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
    closeBookMenu();
    try {
      const report = await syncBookFolder(book.id);
      setSyncReportClosing(false);
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
        undefined,
        true,
      );
      setBatchExportText(markdown);
      setBatchExportClosing(false);
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

  function openSearchModal() {
    const latestSettings = latestSettingsRef.current;
    searchThemeSnapshotRef.current = {
      themeSeries: latestSettings.themeSeries,
      theme: latestSettings.theme,
    };
    setSearchQuery("");
    setSearchClosing(false);
    setSearchOpen(true);
  }

  function closeSearchModal() {
    const snapshot = searchThemeSnapshotRef.current;
    if (snapshot) {
      setSettings((current) => ({ ...current, ...snapshot }));
      searchThemeSnapshotRef.current = null;
    }
    animateClose(setSearchClosing, () => {
      setSearchOpen(false);
      setSearchQuery("");
    });
  }

  function previewSearchTheme(themeSeries: string, theme?: string) {
    const previewTheme = theme ?? getDefaultThemeForSeries(themeSeries);
    if (!searchThemeSnapshotRef.current) {
      const latestSettings = latestSettingsRef.current;
      searchThemeSnapshotRef.current = {
        themeSeries: latestSettings.themeSeries,
        theme: latestSettings.theme,
      };
    }
    setSettings((current) => {
      if (current.themeSeries === themeSeries && current.theme === previewTheme) return current;
      return { ...current, themeSeries, theme: previewTheme };
    });
  }

  function commitSearchTheme(themeSeries: string, theme: string) {
    searchThemeSnapshotRef.current = null;
    applySettings({ themeSeries, theme });
  }

  function openHomeSettingsModal() {
    setHomeSettingsClosing(false);
    setHomeSettingsOpen(true);
  }

  function closeHomeSettingsModal() {
    animateClose(setHomeSettingsClosing, () => setHomeSettingsOpen(false));
  }

  function openReaderSettingsPanel() {
    setSettingsClosing(false);
    setSettingsOpen(true);
  }

  function closeReaderSettingsPanel() {
    animateClose(setSettingsClosing, () => setSettingsOpen(false));
  }

  function openExportModal() {
    setExportClosing(false);
    setExportText("");
    setExportOpen(true);
  }

  function closeExportModal() {
    animateClose(setExportClosing, () => setExportOpen(false));
  }

  async function toggleReadingFullscreen() {
    const next = !isReadingFullscreen;
    setIsReadingFullscreen(next);
    setFullscreenReveal({ top: false, left: false, right: false });
    try {
      await getCurrentWindow().setFullscreen(next);
    } catch (err) {
      setIsReadingFullscreen(!next);
      setError(readError(err));
    }
  }

  function exitReadingFullscreen() {
    setIsReadingFullscreen(false);
    setFullscreenReveal({ top: false, left: false, right: false });
    void getCurrentWindow()
      .setFullscreen(false)
      .catch((err) => setError(readError(err)));
  }

  function handleReadingFullscreenPointerMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isReadingFullscreen) return;

    const { clientX, clientY } = event;
    const viewportWidth = window.innerWidth;

    setFullscreenReveal((current) => {
      const next = {
        top: clientY <= fullscreenEdgePx || (current.top && clientY <= fullscreenTopKeepPx),
        left:
          clientX <= fullscreenEdgePx ||
          (current.left && clientX <= leftPaneWidth + fullscreenSideKeepPaddingPx),
        right:
          clientX >= viewportWidth - fullscreenEdgePx ||
          (current.right && clientX >= viewportWidth - rightPaneWidth - fullscreenSideKeepPaddingPx),
      };

      if (next.top === current.top && next.left === current.left && next.right === current.right) {
        return current;
      }

      return next;
    });
  }

  function hideReadingFullscreenChrome() {
    if (!isReadingFullscreen) return;
    setFullscreenReveal({ top: false, left: false, right: false });
  }

  function revealFullscreenChrome(edge: keyof FullscreenReveal) {
    setFullscreenReveal((current) => (current[edge] ? current : { ...current, [edge]: true }));
  }

  function closeWorkbenchNoteDetail() {
    animateClose(setNoteDetailClosing, () => setWorkbenchNoteDetail(null));
  }

  function openWorkbenchNoteDetail(note: NoteItem) {
    setNoteDetailClosing(false);
    setWorkbenchNoteDetail(note);
  }

  function closeImportModal() {
    if (!importPreview) return;
    animateClose(setImportModalClosing, () => {
      setImportPreview(null);
      setImportBookName("");
      setImportBookNameEdited(false);
      setSelectedImportFilePaths([]);
    });
  }

  function closeRenameBookModal() {
    if (!renameBookDraft) return;
    animateClose(setRenameBookClosing, () => setRenameBookDraft(null));
  }

  function closeDeleteBookModal() {
    if (!deleteBookDraft) return;
    animateClose(setDeleteBookClosing, () => setDeleteBookDraft(null));
  }

  function closeSyncReportModal() {
    if (!syncReport) return;
    animateClose(setSyncReportClosing, () => setSyncReport(null));
  }

  function closeVersionManagerModal() {
    if (!versionManagerBook) return;
    animateClose(setVersionManagerClosing, () => setVersionManagerBook(null));
  }

  function closeBatchExportModal() {
    if (!batchExportOpen) return;
    animateClose(setBatchExportClosing, () => setBatchExportOpen(false));
  }

  function closeSortModal() {
    if (!sortOpen) return;
    animateClose(setSortClosing, () => {
      setSortOpen(false);
      setSortDragChapterId(null);
    });
  }

  function closeDraftModal() {
    if (!draft) return;
    animateClose(setDraftClosing, () => {
      setDraft(null);
      window.getSelection()?.removeAllRanges();
    });
  }

  function closeTopNotice() {
    if (!notice && !error) return;
    animateClose(setTopNoticeClosing, () => {
      setError("");
      setNotice("");
    });
  }

  function closeBookMenu() {
    if (!bookMenu) return;
    animateClose(setBookMenuClosing, () => setBookMenu(null));
  }

  function closeSelectionContextMenu() {
    if (!contextMenu) return;
    animateClose(setContextMenuClosing, () => setContextMenu(null));
  }

  function closeAnnotationMenu() {
    if (!annotationMenu) return;
    animateClose(setAnnotationMenuClosing, () => setAnnotationMenu(null));
  }

  function closeReaderAnnotationDetail() {
    if (!detailAnnotationId) return;
    animateClose(setDetailAnnotationClosing, () => setDetailAnnotationId(null));
  }

  function closeTopModal() {
    if (activeBook) {
      if (detailAnnotationId) {
        closeReaderAnnotationDetail();
        return true;
      }
      if (draft) {
        closeDraftModal();
        return true;
      }
      if (annotationMenu) {
        closeAnnotationMenu();
        return true;
      }
      if (contextMenu) {
        closeSelectionContextMenu();
        return true;
      }
      if (searchOpen) {
        closeSearchModal();
        return true;
      }
      if (settingsOpen) {
        closeReaderSettingsPanel();
        return true;
      }
      if (exportOpen) {
        closeExportModal();
        return true;
      }
      if (sortOpen) {
        closeSortModal();
        return true;
      }
      return false;
    }

    if (batchExportOpen) {
      closeBatchExportModal();
      return true;
    }
    if (importPreview) {
      closeImportModal();
      return true;
    }
    if (searchOpen) {
      closeSearchModal();
      return true;
    }
    if (workbenchNoteDetail) {
      closeWorkbenchNoteDetail();
      return true;
    }
    if (homeSettingsOpen) {
      closeHomeSettingsModal();
      return true;
    }
    if (versionManagerBook) {
      closeVersionManagerModal();
      return true;
    }
    if (syncReport) {
      closeSyncReportModal();
      return true;
    }
    if (deleteBookDraft) {
      closeDeleteBookModal();
      return true;
    }
    if (renameBookDraft) {
      closeRenameBookModal();
      return true;
    }
    if (bookMenu) {
      closeBookMenu();
      return true;
    }
    return false;
  }

  function runViewTransition(callback: () => void) {
    const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
    if (typeof startViewTransition === "function") {
      startViewTransition.call(document, callback);
      return;
    }
    callback();
  }

  function animateClose(setClosing: (closing: boolean) => void, finish: () => void) {
    setClosing(true);
    window.setTimeout(() => {
      finish();
      setClosing(false);
    }, uiExitMs);
  }

  function playReaderMotion(kind: "content" | "jump") {
    if (readerMotionTimerRef.current !== null) {
      window.clearTimeout(readerMotionTimerRef.current);
    }
    setReaderMotion(null);
    window.requestAnimationFrame(() => {
      setReaderMotion(kind);
      readerMotionTimerRef.current = window.setTimeout(() => {
        setReaderMotion(null);
        readerMotionTimerRef.current = null;
      }, readerMotionMs);
    });
  }

  function focusReaderSearchInput() {
    setIsRightCollapsed(false);
    if (isReadingFullscreen) {
      setFullscreenReveal((current) => ({ ...current, right: true }));
    }
    window.setTimeout(() => {
      readerSearchInputRef.current?.focus();
      readerSearchInputRef.current?.select();
    }, 0);
  }

  function updateReaderSearchQuery(query: string) {
    setReaderSearchQuery(query);
    setActiveReaderSearchIndex(-1);
    setActiveSearchHighlight(null);
  }

  function selectReaderSearchMatch(index: number) {
    if (!readerSearchMatches[index]) return;
    playReaderMotion("jump");
    setActiveSearchHighlight(null);
    setActiveReaderSearchIndex(index);
  }

  function selectReaderAnnotation(annotationId: string) {
    playReaderMotion("jump");
    setActiveAnnotationId(annotationId);
  }

  function openReaderAnnotationDetail(annotationId: string) {
    selectReaderAnnotation(annotationId);
    setDetailAnnotationClosing(false);
    setDetailAnnotationId(annotationId);
  }

  function handleReaderSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      updateReaderSearchQuery("");
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectReaderSearchMatch(activeReaderSearchIndex >= 0 ? activeReaderSearchIndex : 0);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!readerSearchMatches.length) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        activeReaderSearchIndex < 0
          ? direction > 0
            ? 0
            : readerSearchMatches.length - 1
          : (activeReaderSearchIndex + direction + readerSearchMatches.length) %
            readerSearchMatches.length;
      selectReaderSearchMatch(nextIndex);
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
      openSearchModal();
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
        setDraftClosing(false);
        setDraft(nextDraft);
      }
      return;
    }
    if (action === "export") {
      if (reader) openExportModal();
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

  const effectiveThemeSeries = getEffectiveThemeSeries(settings.themeSeries);

  if (!activeBook) {
    return (
      <div
        className={`app-shell home-shell series-${effectiveThemeSeries} theme-${settings.theme}`}
        onContextMenu={suppressNativeContextMenu}
      >
        <AppTitlebar title="AnnotaLoop" subtitle="首页" />
        <TopNotice error={error} notice={notice} closing={topNoticeClosing} onClose={closeTopNotice} />
        <header className="home-header">
          <div>
            <p className="eyebrow">Local Markdown Annotation Studio</p>
            <h1>AnnotaLoop</h1>
            <p className="home-subtitle">把 AI 生成的 Markdown 文档读完、批注好，再导出成下一轮 AI 可以直接消化的材料。</p>
          </div>
          <div className="header-actions">
            <button
              className={`icon-button ${homeView === "grid" ? "active" : ""}`}
              title="画廊视图"
              onClick={() => runViewTransition(() => setHomeView("grid"))}
            >
              <Grid3X3 size={18} />
            </button>
            <button
              className={`icon-button ${homeView === "notes" ? "active" : ""}`}
              title="笔记视图"
              onClick={() => {
                runViewTransition(() => setHomeView("notes"));
                void refreshNotes();
              }}
            >
              <MessageSquare size={18} />
            </button>
            <button className="icon-button" title="设置" onClick={openHomeSettingsModal}>
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
            onOpenNote={openWorkbenchNoteDetail}
            onExportSelected={() => void exportSelectedNotes()}
            onMarkStatus={(status) => void updateSelectedNoteStatus(status)}
          />
        ) : (
          <main
            ref={bookCollectionRef}
            className={`book-collection ${homeView} ${importDragActive ? "is-import-drag-active" : ""}`}
          >
            {books.map((book) => (
              <button
                key={book.id}
                className={`book-card book-entry ${book.isPinned ? "is-pinned" : ""}`}
                onClick={() => void openBook(book)}
                onContextMenu={(event) => handleBookContextMenu(event, book)}
              >
                <strong>{book.name}</strong>
                <span>{book.chapterCount} 章 · {book.annotationCount} 条批注</span>
                <small>{book.rootPath}</small>
              </button>
            ))}
            <button
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
            closing={bookMenuClosing}
            onTogglePinned={() => void toggleBookPinned(bookMenu.book)}
            onRename={() => {
              setRenameBookClosing(false);
              setRenameBookDraft({ book: bookMenu.book, name: bookMenu.book.name });
              closeBookMenu();
            }}
            onOpenFolder={() => void openBookInExplorer(bookMenu.book)}
            onSync={() => void syncBook(bookMenu.book)}
            onVersions={() => {
              setVersionManagerClosing(false);
              setVersionManagerBook(bookMenu.book);
              closeBookMenu();
            }}
            onDelete={() => {
              setDeleteBookClosing(false);
              setDeleteBookDraft(bookMenu.book);
              closeBookMenu();
            }}
          />
        )}
        {importPreview && (
          <ImportBookModal
            closing={importModalClosing}
            preview={importPreview}
            bookName={importBookName}
            selectedFilePaths={selectedImportFilePaths}
            busy={busy}
            onBookNameChange={updateImportBookName}
            onSelectionChange={updateImportFileSelection}
            onClose={closeImportModal}
            onImport={() => void confirmImportBook()}
          />
        )}
        {renameBookDraft && (
          <RenameBookModal
            closing={renameBookClosing}
            draft={renameBookDraft}
            busy={busy}
            onChange={(name) => setRenameBookDraft({ ...renameBookDraft, name })}
            onClose={closeRenameBookModal}
            onSave={() => void saveBookRename()}
          />
        )}
        {deleteBookDraft && (
          <DeleteBookModal
            closing={deleteBookClosing}
            book={deleteBookDraft}
            busy={busy}
            onClose={closeDeleteBookModal}
            onConfirm={() => void confirmDeleteBook()}
          />
        )}
        {syncReport && (
          <SyncReportModal
            closing={syncReportClosing}
            report={syncReport}
            onClose={closeSyncReportModal}
          />
        )}
        {versionManagerBook && (
          <VersionManagerModal
            closing={versionManagerClosing}
            book={versionManagerBook}
            onClose={closeVersionManagerModal}
            onError={setError}
          />
        )}
        {homeSettingsOpen && (
          <HomeSettingsModal
            closing={homeSettingsClosing}
            settings={settings}
            exportPresets={exportPresets}
            busy={busy}
            onBackupExport={() => void runBackupExport()}
            onBackupRestore={() => void runBackupRestore()}
            onChange={applySettings}
            onSaveExportPreset={saveExportPreset}
            onDeleteExportPreset={removeExportPreset}
            onClose={closeHomeSettingsModal}
          />
        )}
        {workbenchNoteDetail && (
          <NoteDetailModal
            closing={noteDetailClosing}
            note={workbenchNoteDetail}
            onClose={closeWorkbenchNoteDetail}
            onJump={() => {
              const note = workbenchNoteDetail;
              closeWorkbenchNoteDetail();
              void openNote(note);
            }}
          />
        )}
        {searchOpen && (
          <SearchModal
            closing={searchClosing}
            query={searchQuery}
            books={books}
            notes={notes}
            settings={settings}
            onQueryChange={setSearchQuery}
            onClose={closeSearchModal}
            onPreviewTheme={previewSearchTheme}
            onCommitTheme={commitSearchTheme}
            onOpenBook={(book) => {
              closeSearchModal();
              void openBook(book);
            }}
            onOpenNote={(note) => {
              closeSearchModal();
              void openNote(note);
            }}
            onOpenContentResult={(result) => {
              closeSearchModal();
              void openContentSearchResult(result);
            }}
          />
        )}
        {batchExportOpen && (
          <BatchExportModal
            closing={batchExportClosing}
            text={batchExportText}
            copied={copied}
            onCopy={() => void copyBatchExport()}
            onClose={closeBatchExportModal}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`app-shell reader-shell series-${effectiveThemeSeries} theme-${settings.theme} ${
        isLeftCollapsed ? "left-collapsed" : ""
      } ${isRightCollapsed ? "right-collapsed" : ""} ${
        resizeTarget ? "resizing-panes" : ""
      } ${isReadingFullscreen ? "reading-fullscreen" : ""} ${
        fullscreenReveal.top ? "fullscreen-top-open" : ""
      } ${fullscreenReveal.left ? "fullscreen-left-open" : ""} ${
        fullscreenReveal.right ? "fullscreen-right-open" : ""
      }`}
      style={readerStyle}
      onContextMenu={suppressNativeContextMenu}
      onMouseMove={handleReadingFullscreenPointerMove}
      onMouseLeave={hideReadingFullscreenChrome}
    >
      <AppTitlebar title={activeBook.name} subtitle={reader?.chapter.title ?? "AnnotaLoop"} />
      <TopNotice error={error} notice={notice} closing={topNoticeClosing} onClose={closeTopNotice} />
      {isReadingFullscreen && (
        <>
          <div
            className="fullscreen-edge fullscreen-edge-top"
            aria-hidden="true"
            onMouseEnter={() => revealFullscreenChrome("top")}
          />
          <div
            className="fullscreen-edge fullscreen-edge-left"
            aria-hidden="true"
            onMouseEnter={() => revealFullscreenChrome("left")}
          />
          <div
            className="fullscreen-edge fullscreen-edge-right"
            aria-hidden="true"
            onMouseEnter={() => revealFullscreenChrome("right")}
          />
        </>
      )}
      <aside className="reader-left" ref={readerLeftRef}>
        <div className="reader-bookbar">
          <button className="icon-button" title="返回首页" onClick={() => {
            runViewTransition(() => {
              setActiveBook(null);
              setReader(null);
            });
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
              onClick={openExportModal}
            >
              <Download size={18} />
            </button>
            <button
              className={`icon-button ${isReadingFullscreen ? "active" : ""}`}
              title={isReadingFullscreen ? "退出全屏阅读 (Esc)" : "全屏阅读"}
              onClick={() => void toggleReadingFullscreen()}
            >
              {isReadingFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button className="icon-button" title="阅读器设置" onClick={openReaderSettingsPanel}>
              <Settings size={18} />
            </button>
          </div>
        </header>

        <div
          className={`reading-surface border-${settings.borderStyle} ${
            readerMotion ? `reader-motion-${readerMotion}` : ""
          }`}
          ref={scrollRef}
        >
          {reader && (
            <div className="reading-stats" aria-live="polite">
              <span>本文共 {readerStats.wordCount.toLocaleString()} 字</span>
              <span>阅读需要 {readerStats.minutes} 分钟</span>
            </div>
          )}
          <article
            ref={articleRef}
            className={`markdown-body ${settings.focusMode ? "focus-mode" : ""}`}
            onMouseUp={handleTextSelection}
            onContextMenu={handleReaderContextMenu}
            onClick={handleAnnotationClick}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
          {reader && (
            <nav className="chapter-bottom-nav" aria-label="章节导航">
              <button
                type="button"
                onClick={() => previousChapter && void selectChapter(previousChapter.id)}
                disabled={!previousChapter || busy}
              >
                <ChevronLeft size={17} />
                <span>上一篇</span>
              </button>
              <span className="chapter-bottom-index">
                {currentChapterIndex >= 0 ? currentChapterIndex + 1 : 0} / {chapters.length}
              </span>
              <button
                type="button"
                onClick={() => nextChapter && void selectChapter(nextChapter.id)}
                disabled={!nextChapter || busy}
              >
                <span>下一篇</span>
                <ChevronRight size={17} />
              </button>
            </nav>
          )}
        </div>
      </main>

      <div
        className="reader-column-resizer right-resizer"
        role="separator"
        aria-label="调整右栏宽度"
        onPointerDown={(event) => startReaderColumnResize("right", event)}
      />

      <aside className="reader-right" ref={readerRightRef}>
        <section className="reader-annotations-panel">
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
                  onSelect={() => selectReaderAnnotation(annotation.id)}
                  onOpen={() => openReaderAnnotationDetail(annotation.id)}
                  onContextMenu={(event) => handleAnnotationContextMenu(event, annotation)}
                />
              ))
            ) : (
              <div className="empty-panel">
                <MessageSquare size={28} />
                <p>选中正文后可以创建高亮和评论。</p>
              </div>
            )}
          </div>
        </section>

        <div
          className="reader-section-resizer reader-search-resizer"
          role="separator"
          aria-label="调整批注和搜索面板高度"
          onPointerDown={startReaderSearchResize}
        />

        <section className="reader-search-panel">
          <div className="pane-header reader-search-heading">
            <span>正文搜索</span>
            <small>{readerSearchQuery.trim() ? `${readerSearchMatches.length} 处` : "Ctrl+F"}</small>
          </div>
          <label className="reader-search-box">
            <Search size={15} />
            <input
              ref={readerSearchInputRef}
              value={readerSearchQuery}
              onChange={(event) => updateReaderSearchQuery(event.target.value)}
              onKeyDown={handleReaderSearchKeyDown}
              placeholder="搜索当前章节"
            />
          </label>
          <div className="reader-search-results">
            {!readerSearchQuery.trim() ? (
              <p className="reader-search-empty">输入关键词后会在正文中标出所有命中。</p>
            ) : readerSearchMatches.length ? (
              readerSearchMatches.map((match, index) => (
                <button
                  key={match.id}
                  className={`reader-search-result ${
                    index === activeReaderSearchIndex ? "active" : ""
                  }`}
                  onClick={() => selectReaderSearchMatch(index)}
                >
                  <span>{index + 1}</span>
                  <em>{match.excerpt}</em>
                </button>
              ))
            ) : (
              <p className="reader-search-empty">没有找到匹配内容。</p>
            )}
          </div>
        </section>
      </aside>

      {sortOpen && (
        <SortChaptersModal
          closing={sortClosing}
          chapters={sortDraft}
          activeChapterId={reader?.chapter.id}
          dragChapterId={sortDragChapterId}
          busy={busy}
          onDragStart={setSortDragChapterId}
          onMove={moveSortDraft}
          onClose={closeSortModal}
          onSave={() => void saveSortDraft()}
        />
      )}
      {exportOpen && (
        <ExportModal
          closing={exportClosing}
          scope={exportScope}
          template={exportTemplate}
          taskGoal={exportTaskGoal}
          presets={exportPresets}
          presetId={exportPresetId}
          includeEmptyAnnotations={exportIncludeEmptyAnnotations}
          exportText={exportText}
          copied={copied}
          busy={busy}
          onScopeChange={setExportScope}
          onTemplateChange={setExportTemplate}
          onTaskGoalChange={setExportTaskGoal}
          onPresetChange={setExportPresetId}
          onIncludeEmptyAnnotationsChange={setExportIncludeEmptyAnnotations}
          onExport={() => void handleExport()}
          onCopy={() => void copyExport()}
          onClose={closeExportModal}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          closing={settingsClosing}
          settings={settings}
          onChange={applySettings}
          onClose={closeReaderSettingsPanel}
        />
      )}
      {searchOpen && (
        <SearchModal
          closing={searchClosing}
          query={searchQuery}
          books={books}
          notes={notes}
          settings={settings}
          onQueryChange={setSearchQuery}
          onClose={closeSearchModal}
          onPreviewTheme={previewSearchTheme}
          onCommitTheme={commitSearchTheme}
          onOpenBook={(book) => {
            closeSearchModal();
            void openBook(book);
          }}
          onOpenNote={(note) => {
            closeSearchModal();
            void openNote(note);
          }}
          onOpenContentResult={(result) => {
            closeSearchModal();
            void openContentSearchResult(result);
          }}
        />
      )}
      {contextMenu && pendingDraft && (
        <div
          className={`selection-menu ${contextMenuClosing ? "is-closing" : ""}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={openPendingDraft}>
            <Highlighter size={16} />
            添加批注
          </button>
        </div>
      )}
      {annotationMenu && (
        <AnnotationContextMenu
          annotation={annotationMenu.annotation}
          x={annotationMenu.x}
          y={annotationMenu.y}
          closing={annotationMenuClosing}
          onTogglePinned={() => void toggleAnnotationPinned(annotationMenu.annotation)}
          onDelete={() => deleteAnnotationFromMenu(annotationMenu.annotation)}
        />
      )}
      {draft && (
        <NewAnnotationModal
          closing={draftClosing}
          draft={draft}
          onChange={setDraft}
          onCancel={closeDraftModal}
          onSave={() => void saveDraft()}
        />
      )}
      {detailAnnotation && (
        <AnnotationDetailModal
          closing={detailAnnotationClosing}
          annotation={detailAnnotation}
          onClose={closeReaderAnnotationDetail}
          onDelete={() => void handleDeleteAnnotation(detailAnnotation.id)}
          onSave={(patch) => void handleUpdateAnnotation(detailAnnotation, patch)}
        />
      )}
    </div>
  );
}

function readError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return translateErrorMessage(message);
}

function translateErrorMessage(message: string) {
  const exactMessages: Record<string, string> = {
    "Selected path is not a folder.": "选择的路径不是文件夹。",
    "No Markdown files were found in this folder.": "这个文件夹中没有找到 Markdown 文件。",
    "Book folder no longer exists.": "书籍文件夹不存在或已被移动。",
    "Book root folder is missing.": "书籍根文件夹不存在或已被移动。",
    "Book was not found.": "没有找到这本书。",
    "Book name cannot be empty.": "书籍名称不能为空。",
    "Current chapter version cannot be deleted. Switch to or create another current version first.":
      "当前章节版本不能删除，请先切换或创建另一个当前版本。",
    "Preset name cannot be empty.": "预设名称不能为空。",
    "Backup path cannot be the active database file.": "备份路径不能是当前正在使用的数据库文件。",
    "Database lock is poisoned.": "数据库锁状态异常，请重启应用后再试。",
    "Unknown annotation status.": "未知的批注状态。",
    "Unknown export template.": "未知的导出模板。",
  };
  if (exactMessages[message]) return exactMessages[message];

  const prefixes: Array<[string, string]> = [
    ["Failed to open folder picker:", "打开文件夹选择器失败："],
    ["Folder picker failed:", "文件夹选择器失败："],
    ["Failed to open backup save dialog:", "打开备份保存窗口失败："],
    ["Backup save dialog failed:", "备份保存窗口失败："],
    ["Failed to open backup file dialog:", "打开备份文件窗口失败："],
    ["Backup file dialog failed:", "备份文件窗口失败："],
    ["Failed to resolve folder path:", "解析文件夹路径失败："],
    ["Failed to read book folder:", "读取书籍文件夹失败："],
    ["Failed to read folder entry:", "读取文件夹条目失败："],
    ["Failed to resolve chapter path:", "解析章节路径失败："],
    ["Failed to open folder in Explorer:", "在资源管理器中打开文件夹失败："],
    ["Failed to open folder:", "打开文件夹失败："],
    ["Failed to update pinned state:", "更新置顶状态失败："],
    ["Failed to save chapter order:", "保存章节顺序失败："],
    ["Failed to update annotation:", "更新批注失败："],
    ["Failed to update annotation status:", "更新批注状态失败："],
    ["Failed to save annotation status:", "保存批注状态失败："],
    ["Failed to update export preset:", "更新导出预设失败："],
    ["Failed to export backup:", "导出备份失败："],
    ["Failed to open backup database:", "打开备份数据库失败："],
    ["Failed to restore backup:", "恢复备份失败："],
    ["Failed to restore annotation anchors:", "恢复批注锚点失败："],
    ["Failed to restore focus mode setting:", "恢复聚焦模式设置失败："],
    ["Failed to restore theme series setting:", "恢复主题系列设置失败："],
    ["Failed to restore pinned books:", "恢复置顶书籍失败："],
    ["Failed to restore pinned annotations:", "恢复置顶批注失败："],
    ["Failed to restore export presets:", "恢复导出预设失败："],
    ["Failed to update settings:", "更新设置失败："],
    ["Failed to save reading progress:", "保存阅读进度失败："],
    ["Failed to start import transaction:", "启动导入事务失败："],
    ["Failed to create book:", "创建书籍失败："],
    ["Failed to create chapter:", "创建章节失败："],
    ["Failed to create chapter version:", "创建章节版本失败："],
    ["Failed to finish import:", "完成导入失败："],
    ["Failed to rename book:", "重命名书籍失败："],
    ["Failed to read ", "读取文件失败："],
    ["Failed to update renamed chapter:", "更新改名章节失败："],
    ["Failed to add new chapter:", "添加新章节失败："],
    ["Failed to add new chapter version:", "添加新章节版本失败："],
    ["Failed to start version transaction:", "启动版本事务失败："],
    ["Failed to update current chapter version:", "更新当前章节版本失败："],
    ["Failed to save new chapter version:", "保存新章节版本失败："],
    ["Book not found:", "没有找到书籍："],
    ["Chapter not found:", "没有找到章节："],
    ["Chapter version not found:", "没有找到章节版本："],
    ["Chapter snapshot not found:", "没有找到章节快照："],
    ["Export preset not found:", "没有找到导出预设："],
    ["Annotation not found:", "没有找到批注："],
    ["Database error:", "数据库错误："],
  ];
  for (const [prefix, translatedPrefix] of prefixes) {
    if (message.startsWith(prefix)) {
      return `${translatedPrefix}${message.slice(prefix.length).trimStart()}`;
    }
  }
  return message;
}

function clamp(value: number, min: number, max: number) {
  const upper = Math.max(min, max);
  return Math.min(Math.max(value, min), upper);
}

function readSavedWindowPlacement() {
  try {
    const raw = localStorage.getItem(windowPlacementStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedWindowPlacement>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number" ||
      parsed.width < minimumRestoredWindowSize ||
      parsed.height < minimumRestoredWindowSize
    ) {
      return null;
    }
    return {
      x: Math.round(parsed.x),
      y: Math.round(parsed.y),
      width: Math.round(parsed.width),
      height: Math.round(parsed.height),
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeSavedWindowPlacement(placement: SavedWindowPlacement) {
  localStorage.setItem(windowPlacementStorageKey, JSON.stringify(placement));
}

function isWindowPlacementVisible(
  placement: SavedWindowPlacement,
  monitors: Array<{ position: PhysicalPosition; workArea: { position: PhysicalPosition; size: PhysicalSize } }>,
) {
  return monitors.some((monitor) => {
    const area = monitor.workArea;
    const left = area.position.x;
    const top = area.position.y;
    const right = left + area.size.width;
    const bottom = top + area.size.height;
    return (
      placement.x + minimumRestoredWindowSize > left &&
      placement.x < right - minimumRestoredWindowSize &&
      placement.y + minimumRestoredWindowSize > top &&
      placement.y < bottom - minimumRestoredWindowSize
    );
  });
}

function sortReaderAnnotations(annotations: Annotation[]) {
  return [...annotations].sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    if (left.startOffset !== right.startOffset) return left.startOffset - right.startOffset;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function getReadingStats(content: string) {
  const plainText = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-|[\]()`]/g, " ");
  const cjkCount = plainText.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latinWordCount =
    plainText
      .replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ")
      .match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const wordCount = cjkCount + latinWordCount;
  return {
    wordCount,
    minutes: wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 500)),
  };
}

function buildReaderSearchMatches(rootText: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const haystack = rootText.toLowerCase();
  const needle = trimmed.toLowerCase();
  const matches: ReaderSearchMatch[] = [];
  let cursor = 0;

  while (cursor <= haystack.length && matches.length < 200) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    const endOffset = index + needle.length;
    const matchedText = rootText.slice(index, endOffset);
    matches.push({
      id: `reader-search-${matches.length}-${index}`,
      startOffset: index,
      endOffset,
      matchedText,
      excerpt: buildReaderSearchExcerpt(rootText, index, endOffset),
    });
    cursor = Math.max(endOffset, index + 1);
  }

  return matches;
}

function buildReaderSearchExcerpt(rootText: string, startOffset: number, endOffset: number) {
  const before = rootText.slice(Math.max(0, startOffset - 54), startOffset);
  const match = rootText.slice(startOffset, endOffset);
  const after = rootText.slice(endOffset, Math.min(rootText.length, endOffset + 86));
  const prefix = startOffset > 54 ? "..." : "";
  const suffix = endOffset + 86 < rootText.length ? "..." : "";
  return collapseReaderSearchWhitespace(`${prefix}${before}${match}${after}${suffix}`);
}

function collapseReaderSearchWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
