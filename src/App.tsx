import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  FolderPlus,
  Grid3X3,
  GripVertical,
  Highlighter,
  LayoutList,
  MessageSquare,
  Save,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  createAnnotation,
  deleteAnnotation,
  exportAnnotations,
  getLatestReadingProgress,
  getSettings,
  importBookFolder,
  listBooks,
  listChapters,
  listNoteItems,
  pickBookFolder,
  readChapter,
  readChapterVersion,
  reorderChapters,
  saveReadingProgress,
  updateAnnotation,
  updateSettings,
} from "./api";
import {
  findSelectionOffset,
  getContext,
  getHeadingPath,
  renderMarkdownWithAnnotations,
} from "./markdown";
import type {
  Annotation,
  AnnotationPayload,
  AppSettings,
  Book,
  BookSummary,
  Chapter,
  ExportTemplate,
  NoteItem,
  ReadChapterResponse,
} from "./types";

const highlightColors = ["#f7d86a", "#83d9b7", "#f2a0a1", "#9db7ff", "#d7b7ff"];

const defaultSettings: AppSettings = {
  annotationContextChars: 100,
  theme: "paper",
  fontFamily: "Literata, Georgia, serif",
  fontSize: 18,
  lineHeight: 1.72,
  contentWidth: 820,
  pagePadding: 52,
  paragraphSpacing: 18,
  surface: "warm",
  borderStyle: "hairline",
};

interface SelectionDraft {
  selectedText: string;
  startOffset: number;
  endOffset: number;
  highlightColor: string;
  comment: string;
}

interface ContextMenuState {
  x: number;
  y: number;
}

type ReaderBook = Book | BookSummary;

export default function App() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [homeView, setHomeView] = useState<"grid" | "list" | "notes">("grid");
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [manualPath, setManualPath] = useState("");
  const [activeBook, setActiveBook] = useState<ReaderBook | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [reader, setReader] = useState<ReadChapterResponse | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [pendingDraft, setPendingDraft] = useState<SelectionDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortDraft, setSortDraft] = useState<Chapter[]>([]);
  const [sortDragChapterId, setSortDragChapterId] = useState<string | null>(null);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTemplate, setExportTemplate] = useState<ExportTemplate>("reading-notes");
  const [exportScope, setExportScope] = useState<"chapter" | "book">("chapter");
  const [exportText, setExportText] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingScroll, setPendingScroll] = useState<number | null>(null);

  const articleRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void boot();
  }, []);

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

  const renderedHtml = useMemo(() => {
    if (!reader) return "";
    return renderMarkdownWithAnnotations(
      reader.content,
      reader.annotations,
      reader.chapter.filePath,
    );
  }, [reader]);

  const activeAnnotation = useMemo(() => {
    if (!reader || !activeAnnotationId) return null;
    return reader.annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null;
  }, [activeAnnotationId, reader]);

  const readerStyle = useMemo(
    () =>
      ({
        "--reader-font-family": settings.fontFamily,
        "--reader-font-size": `${settings.fontSize}px`,
        "--reader-line-height": settings.lineHeight,
        "--reader-width": `${settings.contentWidth}px`,
        "--reader-padding": `${settings.pagePadding}px`,
        "--reader-paragraph-spacing": `${settings.paragraphSpacing}px`,
      }) as CSSProperties,
    [settings],
  );

  async function boot() {
    setError("");
    try {
      const [nextBooks, nextSettings, nextNotes] = await Promise.all([
        listBooks(),
        getSettings(),
        listNoteItems(),
      ]);
      setBooks(nextBooks);
      setSettings(nextSettings);
      setNotes(nextNotes);
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

  async function handleManualImport() {
    if (!manualPath.trim()) return;
    setBusy(true);
    try {
      await importAndOpen(manualPath.trim());
      setManualPath("");
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
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

  async function selectChapter(chapterId: string) {
    setBusy(true);
    setDraft(null);
    setExportText("");
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

  function buildDraftFromSelection(showError: boolean): SelectionDraft | null {
    if (!reader || !articleRef.current) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!articleRef.current.contains(range.commonAncestorContainer)) return null;
    const selectedText = selection.toString().trim();
    if (selectedText.length < 2) return null;
    const startOffset = findSelectionOffset(reader.content, selectedText);
    if (startOffset < 0) {
      if (showError) {
        setError("没有在章节源码中稳定定位到这段文本，请尝试少选一点上下文。");
      }
      return null;
    }
    setError("");
    setActiveAnnotationId(null);
    return {
      selectedText,
      startOffset,
      endOffset: startOffset + selectedText.length,
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
    const context = getContext(
      reader.content,
      draft.startOffset,
      draft.endOffset,
      settings.annotationContextChars,
    );
    const payload: AnnotationPayload = {
      bookId: reader.chapter.bookId,
      chapterId: reader.chapter.id,
      chapterVersionId: reader.version.id,
      selectedText: draft.selectedText,
      startOffset: draft.startOffset,
      endOffset: draft.endOffset,
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
      const scope =
        exportScope === "book"
          ? { bookId: activeBook.id }
          : { chapterId: reader.chapter.id, chapterVersionId: reader.version.id };
      const markdown = await exportAnnotations(scope, exportTemplate);
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

  if (!activeBook) {
    return (
      <div className={`app-shell home-shell theme-${settings.theme} surface-${settings.surface}`}>
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
              className={`icon-button ${homeView === "list" ? "active" : ""}`}
              title="列表视图"
              onClick={() => setHomeView("list")}
            >
              <LayoutList size={18} />
            </button>
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
            <button className="icon-button" title="设置" onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </button>
          </div>
        </header>

        <section className="import-band">
          <div>
            <h2>导入一本本地书</h2>
            <p>选择包含 `.md` 章节文件的文件夹。原文件留在原处，Loop Book 只保存索引、版本和批注。</p>
          </div>
          <div className="import-actions">
            <button className="primary-button" onClick={handleChooseFolder} disabled={busy}>
              <FolderPlus size={18} />
              选择文件夹
            </button>
            <div className="manual-import">
              <input
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
                placeholder="或粘贴文件夹路径"
              />
              <button onClick={handleManualImport} disabled={busy || !manualPath.trim()}>
                导入
              </button>
            </div>
          </div>
        </section>

        {homeView === "notes" ? (
          <main className="notes-board">
            <div className="notes-board-header">
              <div>
                <p className="eyebrow">Notes</p>
                <h2>全部笔记</h2>
              </div>
              <span>{notes.length} 条</span>
            </div>
            {notes.length === 0 ? (
              <div className="empty-state">
                <MessageSquare size={42} />
                <h2>还没有笔记</h2>
                <p>在阅读器中选中文本并添加批注后，所有笔记会汇总到这里。</p>
              </div>
            ) : (
              <div className="note-grid">
                {notes.map((note) => (
                  <button key={note.id} className="note-card" onClick={() => void openNote(note)}>
                    <span className="note-color" style={{ background: note.highlightColor }} />
                    <strong>{note.comment.trim() || "无评论批注"}</strong>
                    <small>{note.bookName} / {note.chapterTitle}</small>
                    <p>{note.selectedText}</p>
                  </button>
                ))}
              </div>
            )}
          </main>
        ) : (
          <main className={`book-collection ${homeView}`}>
            {books.length === 0 ? (
              <div className="empty-state">
                <BookOpen size={42} />
                <h2>还没有书籍</h2>
                <p>导入一个 Markdown 文件夹后，这里会显示书籍、章节数量和批注数量。</p>
              </div>
            ) : (
              books.map((book) => (
                <button key={book.id} className="book-card" onClick={() => void openBook(book)}>
                  <span className="book-mark" />
                  <strong>{book.name}</strong>
                  <span>{book.chapterCount} 章 · {book.annotationCount} 条批注</span>
                  <small>{book.rootPath}</small>
                </button>
              ))
            )}
          </main>
        )}

        {settingsOpen && (
          <SettingsPanel
            settings={settings}
            onChange={applySettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`app-shell reader-shell theme-${settings.theme} surface-${settings.surface} ${
        isLeftCollapsed ? "left-collapsed" : ""
      } ${isRightCollapsed ? "right-collapsed" : ""}`}
      style={readerStyle}
    >
      <TopNotice error={error} notice={notice} onClose={() => {
        setError("");
        setNotice("");
      }} />
      <aside className="reader-left">
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
          exportText={exportText}
          copied={copied}
          busy={busy}
          onScopeChange={setExportScope}
          onTemplateChange={setExportTemplate}
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

function AnnotationCard({
  annotation,
  active,
  onOpen,
}: {
  annotation: Annotation;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button className={`annotation-card compact ${active ? "active" : ""}`} onClick={onOpen}>
      <span className="annotation-dot" style={{ background: annotation.highlightColor }} />
      <span className="annotation-summary">{annotation.comment.trim() || "无评论批注"}</span>
    </button>
  );
}

function SortChaptersModal({
  chapters,
  activeChapterId,
  dragChapterId,
  busy,
  onDragStart,
  onMove,
  onClose,
  onSave,
}: {
  chapters: Chapter[];
  activeChapterId?: string;
  dragChapterId: string | null;
  busy: boolean;
  onDragStart: (chapterId: string | null) => void;
  onMove: (targetChapterId: string, movedChapterId?: string | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const dragIdRef = useRef<string | null>(null);

  useEffect(() => {
    dragIdRef.current = dragChapterId;
  }, [dragChapterId]);

  useEffect(() => {
    if (!dragChapterId) return;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const row = element?.closest<HTMLElement>("[data-sort-chapter-id]");
      const targetChapterId = row?.dataset.sortChapterId;
      if (targetChapterId) {
        onMove(targetChapterId, dragIdRef.current);
      }
    };

    const handlePointerEnd = () => {
      dragIdRef.current = null;
      onDragStart(null);
    };

    document.body.classList.add("sorting-drag-active");
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      document.body.classList.remove("sorting-drag-active");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [dragChapterId, onDragStart, onMove]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="annotation-modal sort-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Chapter Order</p>
            <h2>调整章节顺序</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="sort-list">
          {chapters.map((chapter, index) => (
            <div
              key={chapter.id}
              data-sort-chapter-id={chapter.id}
              className={`sort-row ${chapter.id === activeChapterId ? "active" : ""} ${
                chapter.id === dragChapterId ? "dragging" : ""
              }`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                dragIdRef.current = chapter.id;
                onDragStart(chapter.id);
              }}
            >
              <span className="sort-index">{String(index + 1).padStart(2, "0")}</span>
              <GripVertical size={16} />
              <strong>{chapterFileName(chapter)}</strong>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-button" onClick={onSave} disabled={busy || chapters.length === 0}>
            <Save size={17} />
            保存顺序
          </button>
        </div>
      </section>
    </div>
  );
}

function ExportModal({
  scope,
  template,
  exportText,
  copied,
  busy,
  onScopeChange,
  onTemplateChange,
  onExport,
  onCopy,
  onClose,
}: {
  scope: "chapter" | "book";
  template: ExportTemplate;
  exportText: string;
  copied: boolean;
  busy: boolean;
  onScopeChange: (scope: "chapter" | "book") => void;
  onTemplateChange: (template: ExportTemplate) => void;
  onExport: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="annotation-modal export-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Export</p>
            <h2>导出批注包</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="segmented">
          <button className={scope === "chapter" ? "active" : ""} onClick={() => onScopeChange("chapter")}>
            本章
          </button>
          <button className={scope === "book" ? "active" : ""} onClick={() => onScopeChange("book")}>
            全书
          </button>
        </div>
        <label className="modal-field">
          模板
          <select value={template} onChange={(event) => onTemplateChange(event.target.value as ExportTemplate)}>
            <option value="reading-notes">阅读笔记模板</option>
            <option value="ai-pack">AI 修改包模板</option>
            <option value="question-list">问题清单模板</option>
            <option value="annotation-index">全书批注索引</option>
          </select>
        </label>
        <div className="modal-actions export-actions">
          <button onClick={onExport} disabled={busy}>
            <FileText size={16} />
            生成 Markdown
          </button>
          <button onClick={onCopy} disabled={!exportText}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <textarea
          className="export-output"
          value={exportText}
          readOnly
          placeholder="生成后的 Markdown 会显示在这里"
          aria-label="导出内容"
        />
      </section>
    </div>
  );
}

function NewAnnotationModal({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: SelectionDraft;
  onChange: (draft: SelectionDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section className="annotation-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">New Note</p>
            <h2>添加批注</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>
        <blockquote>{draft.selectedText}</blockquote>
        <ColorSwatches
          value={draft.highlightColor}
          onChange={(highlightColor) => onChange({ ...draft, highlightColor })}
        />
        <textarea
          autoFocus
          value={draft.comment}
          onChange={(event) => onChange({ ...draft, comment: event.target.value })}
          placeholder="写下评论、修改意图或想追问 AI 的问题"
        />
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary-button" onClick={onSave}>
            <Save size={17} />
            保存批注
          </button>
        </div>
      </section>
    </div>
  );
}

function AnnotationDetailModal({
  annotation,
  onClose,
  onDelete,
  onSave,
}: {
  annotation: Annotation;
  onClose: () => void;
  onDelete: () => void;
  onSave: (patch: Partial<Annotation>) => void;
}) {
  const [comment, setComment] = useState(annotation.comment);
  const [highlightColor, setHighlightColor] = useState(annotation.highlightColor);

  useEffect(() => {
    setComment(annotation.comment);
    setHighlightColor(annotation.highlightColor);
  }, [annotation]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="annotation-modal detail" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Note Detail</p>
            <h2>批注详情</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="annotation-meta">
          <span style={{ background: highlightColor }} />
          <small>{annotation.headingPath || "无标题路径"}</small>
        </div>
        <blockquote>{annotation.selectedText}</blockquote>
        <ColorSwatches value={highlightColor} onChange={setHighlightColor} />
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
        <div className="modal-actions">
          <button className="danger" onClick={onDelete}>
            <Trash2 size={16} />
            删除
          </button>
          <button className="primary-button" onClick={() => onSave({ comment, highlightColor })}>
            <Save size={17} />
            保存
          </button>
        </div>
      </section>
    </div>
  );
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="color-swatches">
      {highlightColors.map((color) => (
        <button
          key={color}
          className={value === color ? "active" : ""}
          style={{ background: color }}
          title={color}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="settings-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Settings</p>
            <h2>阅读器设置</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label>
          主题
          <select value={settings.theme} onChange={(event) => onChange({ theme: event.target.value })}>
            <option value="paper">纸张日间</option>
            <option value="daylight">清亮日间</option>
            <option value="mint">薄荷日间</option>
            <option value="focus">专注日间</option>
            <option value="night">暖黑夜读</option>
            <option value="midnight">深蓝夜读</option>
            <option value="graphite">石墨夜读</option>
          </select>
        </label>

        <label>
          字体
          <select value={settings.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
            <option value="Literata, Georgia, serif">Literata / Georgia</option>
            <option value="'Noto Serif SC', 'Songti SC', serif">宋体阅读</option>
            <option value="'IBM Plex Sans', 'Segoe UI', sans-serif">Plex Sans</option>
            <option value="'JetBrains Mono', Consolas, monospace">Mono</option>
          </select>
        </label>

        <RangeControl label="上下文字数" min={20} max={300} step={10} value={settings.annotationContextChars} onChange={(value) => onChange({ annotationContextChars: value })} />
        <RangeControl label="字号" min={14} max={24} step={1} value={settings.fontSize} onChange={(value) => onChange({ fontSize: value })} />
        <RangeControl label="行距" min={1.35} max={2.1} step={0.05} value={settings.lineHeight} onChange={(value) => onChange({ lineHeight: value })} />
        <RangeControl label="正文宽度" min={620} max={1040} step={20} value={settings.contentWidth} onChange={(value) => onChange({ contentWidth: value })} />
        <RangeControl label="页边距" min={24} max={88} step={4} value={settings.pagePadding} onChange={(value) => onChange({ pagePadding: value })} />
        <RangeControl label="段落间距" min={8} max={30} step={1} value={settings.paragraphSpacing} onChange={(value) => onChange({ paragraphSpacing: value })} />

        <label>
          页面质感
          <select value={settings.surface} onChange={(event) => onChange({ surface: event.target.value })}>
            <option value="warm">温润纸面</option>
            <option value="plain">简洁白底</option>
            <option value="ink">墨色底</option>
          </select>
        </label>

        <label>
          边框
          <select value={settings.borderStyle} onChange={(event) => onChange({ borderStyle: event.target.value })}>
            <option value="hairline">细线</option>
            <option value="rail">侧栏线</option>
            <option value="none">无边框</option>
          </select>
        </label>
      </section>
    </div>
  );
}

function RangeControl({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TopNotice({
  error,
  notice,
  onClose,
}: {
  error: string;
  notice: string;
  onClose: () => void;
}) {
  const text = error || notice;
  if (!text) return null;
  return (
    <div className={`top-notice ${error ? "error" : ""}`}>
      <span>{text}</span>
      <button className="icon-button small" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

function chapterFileName(chapter: Chapter) {
  const normalizedPath = chapter.filePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").filter(Boolean).pop();
  return fileName || chapter.title;
}

function readError(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}
