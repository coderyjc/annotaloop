import { AlertTriangle, Archive, ArrowRight, BookOpen, Check, Copy, Database, Download, FileText, FolderOpen, Keyboard, MessageSquare, Palette, Pencil, Pin, PinOff, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteChapterVersion,
  listChapterVersions,
  listChapters,
  readChapterVersion,
  searchBookContent,
  updateChapterVersionLabel,
} from "../../api";
import {
  defaultShortcutBindings,
  getEffectiveThemeSeries,
  getDefaultThemeForSeries,
  getThemesForSeries,
  visibleThemeSeriesOptions,
} from "../../constants";
import { locateAnnotationInText } from "../../markdown";
import type {
  Annotation,
  AppSettings,
  BackupResult,
  BookSummary,
  Chapter,
  ChapterVersion,
  ContentSearchResult,
  ExportPreset,
  ExportPresetPayload,
  ExportTemplate,
  FolderSyncReport,
  NoteItem,
  ReadChapterResponse,
  ShortcutAction,
} from "../../types";
import { annotationStatusLabel } from "../../utils/annotations";
import { chapterFileName } from "../../utils/chapters";
import { type DiffBlock, diffMarkdownLines } from "../../utils/diff";
import { parseShortcutBindings, shortcutActionLabel } from "../../utils/shortcuts";

interface ContextMenuState {
  x: number;
  y: number;
}

export type BookMenuState = ContextMenuState & { book: BookSummary };
export type RenameBookState = { book: BookSummary; name: string };

type BookSearchResultItem = { id: string; kind: "book"; book: BookSummary };
type NoteSearchResultItem = { id: string; kind: "note"; note: NoteItem };
type ContentSearchResultItem = { id: string; kind: "content"; result: ContentSearchResult };
type SearchResultItem = BookSearchResultItem | NoteSearchResultItem | ContentSearchResultItem;

interface VersionDiffResult {
  base: ReadChapterResponse;
  target: ReadChapterResponse;
  blocks: DiffBlock[];
  annotationChecks: AnnotationLocationCheck[];
}

interface AnnotationLocationCheck {
  annotation: Annotation;
  located: boolean;
  targetStartOffset?: number;
  method?: "source-offset" | "anchored-text";
}

const emptyExportPresetDraft: ExportPresetPayload = {
  name: "",
  baseTemplateId: "ai-pack",
  systemPrompt:
    "你将收到 Loop Book 导出的 Markdown 批注包。请严格基于选中文本、上下文和读者评论工作，不要编造原文不存在的信息。",
  taskPrompt:
    "根据批注完成下一轮修改。优先处理读者评论中明确提出的问题，并在输出中保留可追溯的章节结构。",
};

const exportTemplateLabels: Record<ExportTemplate, string> = {
  "reading-notes": "阅读笔记模板",
  "ai-pack": "AI 修改包模板",
  "question-list": "问题清单模板",
  "annotation-index": "全书批注索引",
};

const themeOptions = [
  {
    value: "paper",
    label: "纸张日间",
    description: "暖白纸面",
    previewBg: "#fffdf7",
    previewInk: "#20211d",
    accent: "#c3452b",
  },
  {
    value: "daylight",
    label: "清亮日间",
    description: "冷白通透",
    previewBg: "#ffffff",
    previewInk: "#172126",
    accent: "#126c86",
  },
  {
    value: "mint",
    label: "薄荷日间",
    description: "柔和绿色",
    previewBg: "#fbfffc",
    previewInk: "#16221e",
    accent: "#2f7c5f",
  },
  {
    value: "focus",
    label: "专注日间",
    description: "低噪阅读",
    previewBg: "#fbfffd",
    previewInk: "#151b1c",
    accent: "#226f68",
  },
  {
    value: "night",
    label: "暖黑夜读",
    description: "暖色暗面",
    previewBg: "#23241f",
    previewInk: "#f1ede0",
    accent: "#e18a62",
  },
  {
    value: "midnight",
    label: "深蓝夜读",
    description: "蓝黑低光",
    previewBg: "#151b22",
    previewInk: "#e9f0f5",
    accent: "#76b7d8",
  },
  {
    value: "graphite",
    label: "石墨夜读",
    description: "中性深灰",
    previewBg: "#1d1e1a",
    previewInk: "#efefea",
    accent: "#d8b45a",
  },
] as const;

export function BookContextMenu({
  menu,
  closing,
  onTogglePinned,
  onRename,
  onOpenFolder,
  onSync,
  onVersions,
  onDelete,
}: {
  menu: BookMenuState;
  closing: boolean;
  onTogglePinned: () => void;
  onRename: () => void;
  onOpenFolder: () => void;
  onSync: () => void;
  onVersions: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`context-menu ${closing ? "is-closing" : ""}`}
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button onClick={onTogglePinned}>
        {menu.book.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
        {menu.book.isPinned ? "取消置顶" : "置顶"}
      </button>
      <button onClick={onRename}>
        <Pencil size={15} /> 重命名书籍
      </button>
      <button onClick={onOpenFolder}>
        <FolderOpen size={15} /> 在资源管理器打开
      </button>
      <button onClick={onSync}>
        <RefreshCw size={15} /> 同步文件夹
      </button>
      <button onClick={onVersions}>
        <Archive size={15} /> 版本管理
      </button>
      <button className="danger" onClick={onDelete}>
        <Trash2 size={15} /> 删除书籍
      </button>
    </div>
  );
}

export function RenameBookModal({
  draft,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  draft: RenameBookState;
  busy: boolean;
  onChange: (name: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="annotation-modal compact-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Book</p>
            <h2>重命名书籍</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <label className="modal-field">
          显示名称
          <input value={draft.name} onChange={(event) => onChange(event.target.value)} autoFocus />
        </label>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-button" onClick={onSave} disabled={busy || !draft.name.trim()}>
            <Save size={16} /> 保存
          </button>
        </div>
      </section>
    </div>
  );
}

export function DeleteBookModal({
  book,
  busy,
  onClose,
  onConfirm,
}: {
  book: BookSummary;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="annotation-modal compact-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow danger-eyebrow">Danger Zone</p>
            <h2>删除书籍</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="delete-book-warning">
          <AlertTriangle size={22} />
          <div>
            <strong>{book.name}</strong>
            <p>将从 Loop Book 中删除这本书的索引、章节版本、阅读进度和批注。原始 Markdown 文件夹不会被删除。</p>
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="danger" onClick={onConfirm} disabled={busy}>
            <Trash2 size={16} /> 确认删除
          </button>
        </div>
      </section>
    </div>
  );
}

export function SyncReportModal({ report, onClose }: { report: FolderSyncReport; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="annotation-modal export-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Sync</p>
            <h2>同步结果</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="sync-metrics">
          <span>
            新增 <strong>{report.added}</strong>
          </span>
          <span>
            变更 <strong>{report.changed}</strong>
          </span>
          <span>
            改名 <strong>{report.renamed}</strong>
          </span>
          <span>
            缺失 <strong>{report.missing}</strong>
          </span>
          <span>
            未变 <strong>{report.unchanged}</strong>
          </span>
        </div>
        <div className="sync-log">
          {report.messages.length ? (
            report.messages.map((message) => <p key={message}>{message}</p>)
          ) : (
            <p>没有检测到需要同步的变化。</p>
          )}
        </div>
        <div className="modal-actions">
          <button className="primary-button" onClick={onClose}>
            完成
          </button>
        </div>
      </section>
    </div>
  );
}

export function HomeSettingsModal({
  closing,
  settings,
  exportPresets,
  busy,
  onChange,
  onBackupExport,
  onBackupRestore,
  onSaveExportPreset,
  onDeleteExportPreset,
  onClose,
}: {
  closing: boolean;
  settings: AppSettings;
  exportPresets: ExportPreset[];
  busy: boolean;
  onChange: (patch: Partial<AppSettings>) => void;
  onBackupExport: () => void;
  onBackupRestore: () => void;
  onSaveExportPreset: (
    presetId: string | null,
    payload: ExportPresetPayload,
  ) => Promise<ExportPreset>;
  onDeleteExportPreset: (presetId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetDraft, setPresetDraft] = useState<ExportPresetPayload>(emptyExportPresetDraft);
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null);
  const bindings = parseShortcutBindings(settings.shortcutBindings);
  const updateBinding = (action: ShortcutAction, value: string) => {
    onChange({ shortcutBindings: JSON.stringify({ ...bindings, [action]: value.trim() }) });
  };
  const captureBinding = (action: ShortcutAction, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (recordingAction !== action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecordingAction(null);
      return;
    }
    const value = formatShortcutFromEvent(event);
    if (!value) return;
    updateBinding(action, value);
    setRecordingAction(null);
  };
  const selectedPreset =
    exportPresets.find((preset) => preset.id === editingPresetId) ?? null;
  const activeThemeSeries = getEffectiveThemeSeries(settings.themeSeries);
  const activeSeriesOption =
    visibleThemeSeriesOptions.find((series) => series.id === activeThemeSeries) ??
    visibleThemeSeriesOptions[0];
  const availableThemes = getThemesForSeries(activeThemeSeries);

  useEffect(() => {
    if (!editingPresetId) return;
    const nextPreset = exportPresets.find((preset) => preset.id === editingPresetId);
    if (!nextPreset) {
      setEditingPresetId(null);
      setPresetDraft(emptyExportPresetDraft);
      return;
    }
    setPresetDraft({
      name: nextPreset.name,
      baseTemplateId: nextPreset.baseTemplateId,
      systemPrompt: nextPreset.systemPrompt,
      taskPrompt: nextPreset.taskPrompt,
    });
  }, [editingPresetId, exportPresets]);

  const startNewPreset = () => {
    setEditingPresetId(null);
    setPresetDraft(emptyExportPresetDraft);
  };

  const selectPreset = (preset: ExportPreset) => {
    setEditingPresetId(preset.id);
    setPresetDraft({
      name: preset.name,
      baseTemplateId: preset.baseTemplateId,
      systemPrompt: preset.systemPrompt,
      taskPrompt: preset.taskPrompt,
    });
  };

  const savePreset = async () => {
    try {
      const saved = await onSaveExportPreset(editingPresetId, {
        ...presetDraft,
        name: presetDraft.name.trim(),
      });
      setEditingPresetId(saved.id);
      setPresetDraft({
        name: saved.name,
        baseTemplateId: saved.baseTemplateId,
        systemPrompt: saved.systemPrompt,
        taskPrompt: saved.taskPrompt,
      });
    } catch {
      // App-level notice handles the user-facing error.
    }
  };

  const deletePreset = async () => {
    if (!editingPresetId) return;
    try {
      await onDeleteExportPreset(editingPresetId);
      startNewPreset();
    } catch {
      // App-level notice handles the user-facing error.
    }
  };

  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="annotation-modal home-settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Global Settings</p>
            <h2>主页设置</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <section className="settings-section">
          <h3>
            <Palette size={16} /> 主题
          </h3>
          <div className="theme-picker-layout">
          <aside className="theme-series-list" aria-label="主题系列">
            {visibleThemeSeriesOptions.map((series) => (
              <button
                key={series.id}
                type="button"
                className={`theme-choice series-choice ${
                  activeThemeSeries === series.id ? "active" : ""
                }`}
                onClick={() =>
                  onChange({
                    themeSeries: series.id,
                    theme: getDefaultThemeForSeries(series.id),
                  })
                }
              >
                <span
                  className="theme-preview series-preview"
                  style={{
                    background: series.previewBg,
                    color: series.previewInk,
                    borderColor: series.accent,
                  }}
                >
                  <i style={{ background: series.accent }} />
                  <i />
                </span>
                <span>
                  <strong>{series.label}</strong>
                  <small>{series.description}</small>
                </span>
                {activeThemeSeries === series.id && <Check size={15} />}
              </button>
            ))}
          </aside>
          <div className="theme-skin-panel">
            <div className="theme-skin-heading">
              <strong>{activeSeriesOption.label}</strong>
              <small>{activeSeriesOption.description}</small>
            </div>
            <div className="theme-choice-grid theme-skin-grid">
            {availableThemes.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`theme-choice ${settings.theme === option.value ? "active" : ""}`}
                onClick={() => onChange({ theme: option.value })}
              >
                <span
                  className="theme-preview"
                  style={{
                    background: option.previewBg,
                    color: option.previewInk,
                    borderColor: option.accent,
                  }}
                >
                  <i style={{ background: option.accent }} />
                  <i />
                </span>
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {settings.theme === option.value && <Check size={15} />}
              </button>
            ))}
            </div>
          </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>
            <Keyboard size={16} /> 快捷键
          </h3>
          <div className="shortcut-grid">
            {(Object.keys(defaultShortcutBindings) as ShortcutAction[]).map((action) => (
              <div className="shortcut-field" key={action}>
                <span>{shortcutActionLabel(action)}</span>
                <button
                  type="button"
                  className={`shortcut-capture ${recordingAction === action ? "recording" : ""}`}
                  onClick={() => setRecordingAction(action)}
                  onKeyDown={(event) => captureBinding(action, event)}
                  onBlur={() =>
                    setRecordingAction((current) => (current === action ? null : current))
                  }
                >
                  {recordingAction === action ? "按下新的快捷键" : bindings[action] || "未设置"}
                </button>
              </div>
            ))}
          </div>
          <p className="muted">点击快捷键框后按下新的组合键。按 Esc 可取消，冲突时后面的动作可能不会触发。</p>
        </section>

        <section className="settings-section">
          <h3>
            <FileText size={16} /> 导出 Prompt 预设
          </h3>
          <div className="prompt-preset-manager">
            <aside className="prompt-preset-list">
              <button
                className={!editingPresetId ? "active" : ""}
                onClick={startNewPreset}
              >
                <Plus size={15} /> 新建预设
              </button>
              {exportPresets.map((preset) => (
                <button
                  key={preset.id}
                  className={preset.id === editingPresetId ? "active" : ""}
                  onClick={() => selectPreset(preset)}
                >
                  <span>{preset.name}</span>
                  <small>{exportTemplateLabels[preset.baseTemplateId]}</small>
                </button>
              ))}
            </aside>
            <div className="prompt-preset-editor">
              <div className="preset-editor-heading">
                <strong>{selectedPreset ? "编辑预设" : "新建预设"}</strong>
                {selectedPreset && <small>{new Date(selectedPreset.updatedAt).toLocaleString()}</small>}
              </div>
              <label className="modal-field">
                预设名称
                <input
                  value={presetDraft.name}
                  onChange={(event) =>
                    setPresetDraft({ ...presetDraft, name: event.target.value })
                  }
                  placeholder="例如 发给 GPT 修改整章"
                />
              </label>
              <label className="modal-field">
                正文结构
                <select
                  value={presetDraft.baseTemplateId}
                  onChange={(event) =>
                    setPresetDraft({
                      ...presetDraft,
                      baseTemplateId: event.target.value as ExportTemplate,
                    })
                  }
                >
                  {(Object.keys(exportTemplateLabels) as ExportTemplate[]).map((templateId) => (
                    <option key={templateId} value={templateId}>
                      {exportTemplateLabels[templateId]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                系统提示词
                <textarea
                  value={presetDraft.systemPrompt}
                  onChange={(event) =>
                    setPresetDraft({ ...presetDraft, systemPrompt: event.target.value })
                  }
                />
              </label>
              <label className="modal-field">
                任务提示词
                <textarea
                  value={presetDraft.taskPrompt}
                  onChange={(event) =>
                    setPresetDraft({ ...presetDraft, taskPrompt: event.target.value })
                  }
                />
              </label>
              <div className="modal-actions preset-editor-actions">
                <button onClick={startNewPreset}>
                  <Plus size={16} /> 新建
                </button>
                <button
                  className="danger"
                  onClick={() => void deletePreset()}
                  disabled={busy || !editingPresetId}
                >
                  <Trash2 size={16} /> 删除
                </button>
                <button
                  className="primary-button"
                  onClick={() => void savePreset()}
                  disabled={busy || !presetDraft.name.trim()}
                >
                  <Save size={16} /> 保存预设
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>
            <Database size={16} /> 本地备份 / 数据迁移
          </h3>
          <div className="backup-actions">
            <button onClick={onBackupExport} disabled={busy}>
              <Download size={16} /> 导出备份
            </button>
            <button onClick={onBackupRestore} disabled={busy}>
              <Archive size={16} /> 恢复备份
            </button>
          </div>
        </section>
      </section>
    </div>
  );
}

function formatShortcutFromEvent(event: ReactKeyboardEvent) {
  const modifierKeys = new Set(["Control", "Shift", "Alt", "Meta"]);
  if (modifierKeys.has(event.key)) return "";
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(readableShortcutKey(event.key));
  return parts.join("+");
}

function readableShortcutKey(key: string) {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function SearchModal({
  closing,
  query,
  books,
  notes,
  onQueryChange,
  onClose,
  onOpenBook,
  onOpenNote,
  onOpenContentResult,
}: {
  closing: boolean;
  query: string;
  books: BookSummary[];
  notes: NoteItem[];
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onOpenBook: (book: BookSummary) => void;
  onOpenNote: (note: NoteItem) => void;
  onOpenContentResult: (result: ContentSearchResult) => void;
}) {
  const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
  const [contentSearchBusy, setContentSearchBusy] = useState(false);
  const [contentSearchError, setContentSearchError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const normalized = query.trim().toLowerCase();
  const matchedBooks = useMemo(
    () =>
      normalized
        ? books
            .filter((book) => `${book.name} ${book.rootPath}`.toLowerCase().includes(normalized))
            .slice(0, 12)
        : books.slice(0, 5),
    [books, normalized],
  );
  const matchedNotes = useMemo(
    () =>
      normalized
        ? notes
            .filter((note) =>
              `${note.bookName} ${note.chapterTitle} ${note.selectedText} ${note.comment}`
                .toLowerCase()
                .includes(normalized),
            )
            .slice(0, 12)
        : [],
    [notes, normalized],
  );
  const bookItems = useMemo<BookSearchResultItem[]>(
    () => matchedBooks.map((book) => ({ id: `book:${book.id}`, kind: "book", book })),
    [matchedBooks],
  );
  const noteItems = useMemo<NoteSearchResultItem[]>(
    () => matchedNotes.map((note) => ({ id: `note:${note.id}`, kind: "note", note })),
    [matchedNotes],
  );
  const contentItems = useMemo<ContentSearchResultItem[]>(
    () =>
      normalized.length >= 2
        ? contentResults.map((result, index) => ({
            id: `content:${result.chapterVersionId}:${result.startOffset}:${index}`,
            kind: "content",
            result,
          }))
        : [],
    [contentResults, normalized.length],
  );
  const resultItems = useMemo(
    () => [...bookItems, ...noteItems, ...contentItems],
    [bookItems, noteItems, contentItems],
  );
  const resultIndexById = useMemo(
    () => new Map(resultItems.map((item, index) => [item.id, index])),
    [resultItems],
  );

  useEffect(() => {
    const searchText = query.trim();
    if (searchText.length < 2) {
      setContentResults([]);
      setContentSearchBusy(false);
      setContentSearchError("");
      return;
    }

    let cancelled = false;
    setContentSearchBusy(true);
    setContentSearchError("");
    const timer = window.setTimeout(() => {
      void searchBookContent(searchText)
        .then((results) => {
          if (!cancelled) setContentResults(results);
        })
        .catch((err) => {
          if (!cancelled) setContentSearchError(readError(err));
        })
        .finally(() => {
          if (!cancelled) setContentSearchBusy(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    setActiveIndex(resultItems.length ? 0 : -1);
  }, [query]);

  useEffect(() => {
    setActiveIndex((current) => {
      if (!resultItems.length) return -1;
      if (current < 0) return 0;
      return Math.min(current, resultItems.length - 1);
    });
    resultRefs.current = resultRefs.current.slice(0, resultItems.length);
  }, [resultItems.length]);

  useEffect(() => {
    if (activeIndex < 0) return;
    resultRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function openSearchResult(item: SearchResultItem) {
    if (item.kind === "book") {
      onOpenBook(item.book);
      return;
    }
    if (item.kind === "note") {
      onOpenNote(item.note);
      return;
    }
    onOpenContentResult(item.result);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!resultItems.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const start = current < 0 ? (direction > 0 ? -1 : 0) : current;
        return (start + direction + resultItems.length) % resultItems.length;
      });
      return;
    }

    if (event.key === "Enter" && !(event.nativeEvent as KeyboardEvent).isComposing) {
      const item = resultItems[activeIndex >= 0 ? activeIndex : 0];
      if (!item) return;
      event.preventDefault();
      openSearchResult(item);
    }
  }

  function resultButtonProps(item: SearchResultItem, className = "") {
    const index = resultIndexById.get(item.id) ?? -1;
    const isActive = index === activeIndex;
    return {
      ref: (node: HTMLButtonElement | null) => {
        if (index >= 0) resultRefs.current[index] = node;
      },
      className: [className, isActive ? "is-active" : ""].filter(Boolean).join(" "),
      "aria-selected": isActive,
      onMouseEnter: () => setActiveIndex(index),
      onClick: () => openSearchResult(item),
    };
  }

  return (
    <div
      className={`modal-backdrop search-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="search-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
            placeholder="搜索书籍、批注、正文"
          />
          <button className="icon-button small" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="search-results">
          {bookItems.length > 0 && (
            <>
              <h3>书籍</h3>
              {bookItems.map((item) => (
                <button key={item.id} {...resultButtonProps(item)}>
                  <BookOpen size={15} /> <span>{item.book.name}</span>
                </button>
              ))}
            </>
          )}
          {noteItems.length > 0 && (
            <>
              <h3>批注</h3>
              {noteItems.map((item) => (
                <button key={item.id} {...resultButtonProps(item)}>
                  <MessageSquare size={15} /> <span>{item.note.comment.trim() || item.note.selectedText}</span>
                </button>
              ))}
            </>
          )}
          {(contentSearchBusy || contentSearchError || contentItems.length > 0) && (
            <>
              <h3>正文 {contentSearchBusy ? "搜索中" : contentItems.length ? contentItems.length : ""}</h3>
              {contentSearchError && <p className="search-error">{contentSearchError}</p>}
              {!contentSearchError &&
                contentItems.map((item) => (
                  <button key={item.id} {...resultButtonProps(item, "content-search-result")}>
                    <FileText size={15} />
                    <span>
                      <strong>{item.result.chapterTitle}</strong>
                      <small>{item.result.bookName}</small>
                      <em>{item.result.excerpt}</em>
                    </span>
                  </button>
                ))}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function BatchExportModal({
  text,
  copied,
  onCopy,
  onClose,
}: {
  text: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="annotation-modal export-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Batch Export</p>
            <h2>批量导出结果</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-actions export-actions">
          <button onClick={onCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <textarea className="export-output" value={text} readOnly />
      </section>
    </div>
  );
}

export function NoteDetailModal({
  closing,
  note,
  onClose,
  onJump,
}: {
  closing: boolean;
  note: NoteItem;
  onClose: () => void;
  onJump: () => void;
}) {
  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="annotation-modal note-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Annotation Detail</p>
            <h2>批注详情</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="note-detail-meta">
          <span>
            <small>书籍</small>
            <strong>{note.bookName}</strong>
          </span>
          <span>
            <small>章节</small>
            <strong>{note.chapterTitle}</strong>
          </span>
          <span>
            <small>状态</small>
            <strong>{annotationStatusLabel(note.status)}</strong>
          </span>
          <span>
            <small>创建时间</small>
            <strong>{new Date(note.createdAt).toLocaleString()}</strong>
          </span>
        </div>
        <div className="annotation-meta">
          <span style={{ background: note.highlightColor }} />
          <small>{note.headingPath || "无标题路径"}</small>
        </div>
        <section className="note-detail-section">
          <strong>选中文本</strong>
          <blockquote>{note.selectedText}</blockquote>
        </section>
        <section className="note-detail-section">
          <strong>评论</strong>
          <p>{note.comment.trim() || "无评论"}</p>
        </section>
        <div className="modal-actions">
          <button onClick={onClose}>关闭</button>
          <button className="primary-button" onClick={onJump}>
            <ArrowRight size={16} /> 跳转到对应位置
          </button>
        </div>
      </section>
    </div>
  );
}

export function VersionManagerModal({
  book,
  onClose,
  onError,
}: {
  book: BookSummary;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [diffBaseVersionId, setDiffBaseVersionId] = useState("");
  const [diffTargetVersionId, setDiffTargetVersionId] = useState("");
  const [diffResult, setDiffResult] = useState<VersionDiffResult | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listChapters(book.id)
      .then((nextChapters) => {
        if (cancelled) return;
        setChapters(nextChapters);
        setSelectedChapterId(nextChapters[0]?.id ?? "");
      })
      .catch((err) => {
        if (!cancelled) onError(readError(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [book.id, onError]);

  useEffect(() => {
    if (!selectedChapterId) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void listChapterVersions(selectedChapterId)
      .then((nextVersions) => {
        if (!cancelled) {
          setVersions(nextVersions);
          setDiffResult(null);
          setDiffTargetVersionId(nextVersions[0]?.id ?? "");
          setDiffBaseVersionId(nextVersions[nextVersions.length - 1]?.id ?? nextVersions[0]?.id ?? "");
        }
      })
      .catch((err) => {
        if (!cancelled) onError(readError(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedChapterId, onError]);

  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId);
  const diffBaseVersion = versions.find((version) => version.id === diffBaseVersionId) ?? null;
  const diffTargetVersion = versions.find((version) => version.id === diffTargetVersionId) ?? null;

  async function saveLabel(version: ChapterVersion, label: string) {
    setBusy(true);
    try {
      const updated = await updateChapterVersionLabel(version.id, label);
      setVersions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      onError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteVersion(version: ChapterVersion) {
    setBusy(true);
    try {
      await deleteChapterVersion(version.id);
      setVersions((current) => {
        const nextVersions = current.filter((item) => item.id !== version.id);
        if (diffBaseVersionId === version.id) {
          setDiffBaseVersionId(nextVersions[nextVersions.length - 1]?.id ?? nextVersions[0]?.id ?? "");
        }
        if (diffTargetVersionId === version.id) {
          setDiffTargetVersionId(nextVersions[0]?.id ?? "");
        }
        setDiffResult(null);
        return nextVersions;
      });
    } catch (err) {
      onError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function compareVersions() {
    if (!diffBaseVersionId || !diffTargetVersionId || diffBaseVersionId === diffTargetVersionId) return;
    setDiffBusy(true);
    try {
      const [base, target] = await Promise.all([
        readChapterVersion(diffBaseVersionId),
        readChapterVersion(diffTargetVersionId),
      ]);
      setDiffResult(buildVersionDiff(base, target));
    } catch (err) {
      onError(readError(err));
    } finally {
      setDiffBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="annotation-modal version-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Versions</p>
            <h2>{book.name} · 版本管理</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="version-manager">
          <aside>
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                className={chapter.id === selectedChapterId ? "active" : ""}
                onClick={() => setSelectedChapterId(chapter.id)}
              >
                {chapterFileName(chapter)}
              </button>
            ))}
          </aside>
          <section>
            <div className="version-heading">
              <strong>{selectedChapter ? chapterFileName(selectedChapter) : "选择章节"}</strong>
              {(busy || diffBusy) && <small>处理中...</small>}
            </div>
            {versions.map((version) => {
              const isCurrent = selectedChapter?.currentVersionId === version.id;
              return (
                <VersionRow
                  key={version.id}
                  version={version}
                  isCurrent={isCurrent}
                  busy={busy}
                  onSaveLabel={saveLabel}
                  onDelete={deleteVersion}
                />
              );
            })}
            <div className="version-diff-panel">
              <div className="version-diff-heading">
                <div>
                  <strong>章节版本 Diff</strong>
                  <small>选择两个快照，比较正文变化和批注定位状态。</small>
                </div>
                <button
                  className="primary-button"
                  onClick={() => void compareVersions()}
                  disabled={busy || diffBusy || versions.length < 2 || diffBaseVersionId === diffTargetVersionId}
                >
                  生成对比
                </button>
              </div>
              <div className="version-diff-controls">
                <label>
                  基准版本
                  <select
                    value={diffBaseVersionId}
                    onChange={(event) => {
                      setDiffBaseVersionId(event.target.value);
                      setDiffResult(null);
                    }}
                  >
                    {versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {formatVersionLabel(version, selectedChapter?.currentVersionId)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  目标版本
                  <select
                    value={diffTargetVersionId}
                    onChange={(event) => {
                      setDiffTargetVersionId(event.target.value);
                      setDiffResult(null);
                    }}
                  >
                    {versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {formatVersionLabel(version, selectedChapter?.currentVersionId)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {versions.length < 2 ? (
                <p className="muted">这个章节目前只有一个版本，暂时无法对比。</p>
              ) : diffBaseVersionId === diffTargetVersionId ? (
                <p className="muted">请选择两个不同版本进行对比。</p>
              ) : diffResult ? (
                <VersionDiffView
                  result={diffResult}
                  baseVersion={diffBaseVersion}
                  targetVersion={diffTargetVersion}
                />
              ) : (
                <p className="muted">点击“生成对比”查看新增、删除、修改，以及基准版本批注是否还能定位到目标版本。</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function buildVersionDiff(base: ReadChapterResponse, target: ReadChapterResponse): VersionDiffResult {
  return {
    base,
    target,
    blocks: diffMarkdownLines(base.content, target.content),
    annotationChecks: base.annotations.map((annotation) => {
      const location = locateAnnotationInText(target.content, annotation);
      return {
        annotation,
        located: Boolean(location),
        targetStartOffset: location?.startOffset,
        method: location?.method,
      };
    }),
  };
}

function VersionDiffView({
  result,
  baseVersion,
  targetVersion,
}: {
  result: VersionDiffResult;
  baseVersion: ChapterVersion | null;
  targetVersion: ChapterVersion | null;
}) {
  const added = result.blocks.filter((block) => block.type === "added").length;
  const removed = result.blocks.filter((block) => block.type === "removed").length;
  const modified = result.blocks.filter((block) => block.type === "modified").length;
  const locatedAnnotations = result.annotationChecks.filter((item) => item.located).length;

  return (
    <div className="version-diff-result">
      <div className="diff-summary-grid">
        <span>
          <small>基准</small>
          <strong>{baseVersion ? formatVersionLabel(baseVersion, result.base.chapter.currentVersionId) : "版本 A"}</strong>
        </span>
        <span>
          <small>目标</small>
          <strong>{targetVersion ? formatVersionLabel(targetVersion, result.target.chapter.currentVersionId) : "版本 B"}</strong>
        </span>
        <span>
          <small>新增</small>
          <strong>{added}</strong>
        </span>
        <span>
          <small>删除</small>
          <strong>{removed}</strong>
        </span>
        <span>
          <small>修改</small>
          <strong>{modified}</strong>
        </span>
        <span>
          <small>批注定位</small>
          <strong>
            {locatedAnnotations}/{result.annotationChecks.length}
          </strong>
        </span>
      </div>

      <section className="diff-section">
        <div className="diff-section-heading">
          <strong>正文差异</strong>
          <small>{result.blocks.length ? `${result.blocks.length} 个变化块` : "没有正文变化"}</small>
        </div>
        {result.blocks.length ? (
          <div className="diff-block-list">
            {result.blocks.map((block) => (
              <DiffBlockCard key={block.id} block={block} />
            ))}
          </div>
        ) : (
          <p className="muted">两个版本的正文快照一致。</p>
        )}
      </section>

      <section className="diff-section">
        <div className="diff-section-heading">
          <strong>批注定位</strong>
          <small>检查基准版本批注能否在目标版本中找到同一段文本</small>
        </div>
        {result.annotationChecks.length ? (
          <div className="annotation-location-list">
            {result.annotationChecks.map((item) => (
              <article key={item.annotation.id} className={item.located ? "located" : "lost"}>
                <span className="annotation-dot" style={{ background: item.annotation.highlightColor }} />
                <div>
                  <strong>{item.located ? "仍可定位" : "无法定位"}</strong>
                  <p>{item.annotation.selectedText}</p>
                  <small>
                    {item.located
                      ? `${item.method === "source-offset" ? "原始偏移" : "上下文锚点"} · 目标位置 ${item.targetStartOffset}`
                      : "目标版本中未稳定找到这段批注文本"}
                    {item.annotation.comment.trim() ? ` · ${item.annotation.comment.trim()}` : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">基准版本没有批注。</p>
        )}
      </section>
    </div>
  );
}

function DiffBlockCard({ block }: { block: DiffBlock }) {
  return (
    <article className={`diff-block ${block.type}`}>
      <header>
        <strong>{diffBlockLabel(block.type)}</strong>
        <small>
          原 {block.oldStart} · 新 {block.newStart}
        </small>
      </header>
      {block.type === "added" ? (
        <DiffLines lines={block.newLines} prefix="+" />
      ) : block.type === "removed" ? (
        <DiffLines lines={block.oldLines} prefix="-" />
      ) : (
        <div className="modified-lines">
          <DiffLines lines={block.oldLines} prefix="-" />
          <DiffLines lines={block.newLines} prefix="+" />
        </div>
      )}
    </article>
  );
}

function DiffLines({ lines, prefix }: { lines: string[]; prefix: "+" | "-" }) {
  const visibleLines = lines.slice(0, 12);
  const hiddenCount = Math.max(0, lines.length - visibleLines.length);
  return (
    <pre className={prefix === "+" ? "added-lines" : "removed-lines"}>
      {visibleLines.map((line, index) => (
        <code key={`${index}-${line}`}>
          <span>{prefix}</span>
          {line || " "}
        </code>
      ))}
      {hiddenCount > 0 && (
        <code>
          <span>…</span>
          另有 {hiddenCount} 行
        </code>
      )}
    </pre>
  );
}

function diffBlockLabel(type: DiffBlock["type"]) {
  const labels: Record<DiffBlock["type"], string> = {
    added: "新增",
    removed: "删除",
    modified: "修改",
  };
  return labels[type];
}

function formatVersionLabel(version: ChapterVersion, currentVersionId?: string) {
  const base = version.id === currentVersionId ? `当前版本 v${version.versionNumber}` : `v${version.versionNumber}`;
  return version.label.trim() ? `${base} · ${version.label.trim()}` : base;
}

function VersionRow({
  version,
  isCurrent,
  busy,
  onSaveLabel,
  onDelete,
}: {
  version: ChapterVersion;
  isCurrent: boolean;
  busy: boolean;
  onSaveLabel: (version: ChapterVersion, label: string) => void;
  onDelete: (version: ChapterVersion) => void;
}) {
  const [label, setLabel] = useState(version.label);

  useEffect(() => {
    setLabel(version.label);
  }, [version.label]);

  return (
    <article className="version-row">
      <div>
        <strong>{isCurrent ? `当前版本 v${version.versionNumber}` : `v${version.versionNumber}`}</strong>
        <small>{new Date(version.createdAt).toLocaleString()}</small>
      </div>
      <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="版本别名，例如 初稿" />
      <button onClick={() => onSaveLabel(version, label)} disabled={busy}>
        <Save size={15} /> 保存
      </button>
      <button className="danger" onClick={() => onDelete(version)} disabled={busy || isCurrent}>
        <Trash2 size={15} /> 删除
      </button>
    </article>
  );
}

function readError(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}
