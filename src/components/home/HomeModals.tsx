import { AlertTriangle, Archive, BookOpen, Check, Copy, Database, Download, FileText, FolderOpen, Keyboard, MessageSquare, Palette, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useState } from "react";
import {
  deleteChapterVersion,
  listChapterVersions,
  listChapters,
  searchBookContent,
  updateChapterVersionLabel,
} from "../../api";
import { defaultShortcutBindings } from "../../constants";
import type {
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
  ShortcutAction,
} from "../../types";
import { chapterFileName } from "../../utils/chapters";
import { parseShortcutBindings, shortcutActionLabel } from "../../utils/shortcuts";

interface ContextMenuState {
  x: number;
  y: number;
}

export type BookMenuState = ContextMenuState & { book: BookSummary };
export type RenameBookState = { book: BookSummary; name: string };

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
  onRename,
  onOpenFolder,
  onSync,
  onVersions,
  onDelete,
}: {
  menu: BookMenuState;
  onRename: () => void;
  onOpenFolder: () => void;
  onSync: () => void;
  onVersions: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
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
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
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
          <div className="theme-choice-grid">
            {themeOptions.map((option) => (
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
  query,
  books,
  notes,
  onQueryChange,
  onClose,
  onOpenBook,
  onOpenNote,
  onOpenContentResult,
}: {
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
  const normalized = query.trim().toLowerCase();
  const matchedBooks = normalized
    ? books.filter((book) => `${book.name} ${book.rootPath}`.toLowerCase().includes(normalized))
    : books.slice(0, 5);
  const matchedNotes = normalized
    ? notes.filter((note) =>
        `${note.bookName} ${note.chapterTitle} ${note.selectedText} ${note.comment}`.toLowerCase().includes(normalized),
      )
    : notes.slice(0, 8);

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

  return (
    <div className="modal-backdrop search-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="search-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} autoFocus placeholder="搜索书籍、批注、正文" />
          <button className="icon-button small" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="search-results">
          <h3>书籍</h3>
          {matchedBooks.map((book) => (
            <button key={book.id} onClick={() => onOpenBook(book)}>
              <BookOpen size={15} /> <span>{book.name}</span>
            </button>
          ))}
          <h3>批注</h3>
          {matchedNotes.map((note) => (
            <button key={note.id} onClick={() => onOpenNote(note)}>
              <MessageSquare size={15} /> <span>{note.comment.trim() || note.selectedText}</span>
            </button>
          ))}
          <h3>正文 {contentSearchBusy ? "搜索中" : contentResults.length ? contentResults.length : ""}</h3>
          {contentSearchError && <p className="search-error">{contentSearchError}</p>}
          {!contentSearchError &&
            contentResults.map((result, index) => (
              <button
                key={`${result.chapterVersionId}-${result.startOffset}-${index}`}
                className="content-search-result"
                onClick={() => onOpenContentResult(result)}
              >
                <FileText size={15} />
                <span>
                  <strong>{result.chapterTitle}</strong>
                  <small>{result.bookName}</small>
                  <em>{result.excerpt}</em>
                </span>
              </button>
            ))}
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
        if (!cancelled) setVersions(nextVersions);
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
      setVersions((current) => current.filter((item) => item.id !== version.id));
    } catch (err) {
      onError(readError(err));
    } finally {
      setBusy(false);
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
              {busy && <small>处理中...</small>}
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
          </section>
        </div>
      </section>
    </div>
  );
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
