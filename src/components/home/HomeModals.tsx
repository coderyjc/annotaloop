import { AlertTriangle, Archive, ArrowRight, BookOpen, Check, Copy, Database, Download, FileText, FolderOpen, GripVertical, Keyboard, MessageSquare, Palette, Pencil, Pin, PinOff, Plus, RefreshCw, Save, Search, Trash2, Type, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteChapterVersion,
  listChapterVersions,
  listChapters,
  readChapterVersion,
  reorderChapters,
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
import { FontPicker } from "../FontPicker";
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
  ImportBookPreview,
  ImportPreviewFile,
  NoteItem,
  ReadChapterResponse,
  ShortcutAction,
  SystemFont,
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
type CommandSearchResultItem = { id: "command:theme"; kind: "command"; label: string; description: string };
type ThemeSeriesOption = (typeof visibleThemeSeriesOptions)[number];
type ThemeSkinOption = ReturnType<typeof getThemesForSeries>[number];
type ThemeSeriesSearchResultItem = { id: string; kind: "theme-series"; series: ThemeSeriesOption };
type ThemeSkinSearchResultItem = { id: string; kind: "theme"; theme: ThemeSkinOption };
type SearchResultItem =
  | CommandSearchResultItem
  | BookSearchResultItem
  | NoteSearchResultItem
  | ContentSearchResultItem
  | ThemeSeriesSearchResultItem
  | ThemeSkinSearchResultItem;
type SearchMode = "search" | "theme-series" | "theme";

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
    "你将收到 AuroraMD 导出的 Markdown 批注。请严格基于选中文本和读者评论工作，不要编造原文不存在的信息。",
  taskPrompt:
    "根据批注完成下一轮修改。优先处理读者评论中明确提出的问题，并在输出中保留可追溯的章节结构。",
};

const exportTemplateLabels: Record<ExportTemplate, string> = {
  "reading-notes": "阅读笔记模板",
  "ai-pack": "AI 修改包模板",
  "question-list": "问题清单模板",
  "annotation-index": "全书批注索引",
};

interface ImportTreeNode {
  id: string;
  name: string;
  file?: ImportPreviewFile;
  children: ImportTreeNode[];
  filePaths: string[];
}

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
      <button onClick={onVersions}>
        <Archive size={15} /> 管理
      </button>
      <button onClick={onRename}>
        <Pencil size={15} /> 重命名书籍
      </button>
      <button onClick={onSync}>
        <RefreshCw size={15} /> 同步文件夹
      </button>
      <button onClick={onOpenFolder}>
        <FolderOpen size={15} /> 在资源管理器打开
      </button>
      <button className="danger" onClick={onDelete}>
        <Trash2 size={15} /> 删除书籍
      </button>
    </div>
  );
}

export function RenameBookModal({
  closing,
  draft,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  closing: boolean;
  draft: RenameBookState;
  busy: boolean;
  onChange: (name: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
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
  closing,
  book,
  busy,
  onClose,
  onConfirm,
}: {
  closing: boolean;
  book: BookSummary;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
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
            <p>将从 AuroraMD 中删除这本书的索引、章节版本、阅读进度和批注。原始 Markdown 文件夹不会被删除。</p>
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

export function SyncReportModal({
  closing,
  report,
  onClose,
}: {
  closing: boolean;
  report: FolderSyncReport;
  onClose: () => void;
}) {
  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
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

export function ImportBookModal({
  closing,
  preview,
  bookName,
  selectedFilePaths,
  busy,
  onBookNameChange,
  onSelectionChange,
  onClose,
  onImport,
}: {
  closing: boolean;
  preview: ImportBookPreview;
  bookName: string;
  selectedFilePaths: string[];
  busy: boolean;
  onBookNameChange: (name: string) => void;
  onSelectionChange: (paths: string[]) => void;
  onClose: () => void;
  onImport: () => void;
}) {
  const selectedSet = useMemo(() => new Set(selectedFilePaths), [selectedFilePaths]);
  const tree = useMemo(() => buildImportTree(preview.files), [preview.files]);
  const selectedCount = preview.files.filter((file) => selectedSet.has(file.path)).length;

  const normalizeSelection = (nextSet: Set<string>) =>
    preview.files.filter((file) => nextSet.has(file.path)).map((file) => file.path);

  const toggleFile = (path: string, checked: boolean) => {
    const nextSet = new Set(selectedSet);
    if (checked) {
      nextSet.add(path);
    } else {
      nextSet.delete(path);
    }
    onSelectionChange(normalizeSelection(nextSet));
  };

  const toggleGroup = (paths: string[], checked: boolean) => {
    const nextSet = new Set(selectedSet);
    paths.forEach((path) => {
      if (checked) {
        nextSet.add(path);
      } else {
        nextSet.delete(path);
      }
    });
    onSelectionChange(normalizeSelection(nextSet));
  };

  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="annotation-modal import-book-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Import</p>
            <h2>导入书籍</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="import-book-summary">
          <label className="modal-field">
            书籍名称
            <input
              value={bookName}
              onChange={(event) => onBookNameChange(event.target.value)}
              autoFocus
            />
          </label>
          <div>
            <small>来源文件夹</small>
            <strong>{preview.rootPath}</strong>
          </div>
        </div>

        <div className="import-tree-toolbar">
          <span>
            已选择 <strong>{selectedCount}</strong> / {preview.files.length} 个 Markdown 文件
          </span>
          <div>
            <button onClick={() => onSelectionChange(preview.files.map((file) => file.path))}>
              <Check size={15} /> 全选
            </button>
            <button
              onClick={() => {
                const nextSet = new Set(preview.files.map((file) => file.path));
                selectedFilePaths.forEach((path) => nextSet.delete(path));
                onSelectionChange(normalizeSelection(nextSet));
              }}
            >
              <RefreshCw size={15} /> 反选
            </button>
          </div>
        </div>

        <div className="import-file-tree" role="tree" aria-label="选择要导入的 Markdown 文件">
          <ImportTreeRows
            nodes={tree.children}
            level={0}
            selectedSet={selectedSet}
            onToggleFile={toggleFile}
            onToggleGroup={toggleGroup}
          />
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button
            className="primary-button"
            onClick={onImport}
            disabled={busy || selectedCount === 0 || !bookName.trim()}
          >
            <Save size={16} /> 导入选中文件
          </button>
        </div>
      </section>
    </div>
  );
}

export function HomeSettingsModal({
  closing,
  settings,
  systemFonts,
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
  systemFonts: SystemFont[];
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
            <Type size={16} /> 字体
          </h3>
          <div className="font-setting-grid">
            <FontPicker
              label="主界面字体"
              description="用于首页、标题栏、按钮、菜单和批注列表。"
              value={settings.interfaceFontFamily}
              fallbackGeneric="sans-serif"
              systemFonts={systemFonts}
              onChange={(value) => onChange({ interfaceFontFamily: value })}
            />
            <FontPicker
              label="阅读器字体"
              description="用于阅读器正文。也可以在阅读器设置里单独调整。"
              value={settings.readerFontFamily}
              fallbackGeneric="serif"
              systemFonts={systemFonts}
              onChange={(value) => onChange({ readerFontFamily: value })}
            />
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

function ImportTreeRows({
  nodes,
  level,
  selectedSet,
  onToggleFile,
  onToggleGroup,
}: {
  nodes: ImportTreeNode[];
  level: number;
  selectedSet: Set<string>;
  onToggleFile: (path: string, checked: boolean) => void;
  onToggleGroup: (paths: string[], checked: boolean) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isFile = Boolean(node.file);
        const selectedChildren = node.filePaths.filter((path) => selectedSet.has(path)).length;
        const checked = isFile
          ? Boolean(node.file && selectedSet.has(node.file.path))
          : selectedChildren === node.filePaths.length && node.filePaths.length > 0;
        const indeterminate = !isFile && selectedChildren > 0 && selectedChildren < node.filePaths.length;
        return (
          <div key={node.id} role="treeitem" aria-selected={checked}>
            <label
              className={`import-tree-row ${isFile ? "file" : "folder"}`}
              style={{ paddingLeft: `${12 + level * 18}px` }}
            >
              <TreeCheckbox
                checked={checked}
                indeterminate={indeterminate}
                onChange={(nextChecked) =>
                  node.file
                    ? onToggleFile(node.file.path, nextChecked)
                    : onToggleGroup(node.filePaths, nextChecked)
                }
              />
              {isFile ? <FileText size={15} /> : <FolderOpen size={15} />}
              <span>
                <strong>{node.name}</strong>
                {node.file ? (
                  <small>{formatBytes(node.file.size)}</small>
                ) : (
                  <small>{node.filePaths.length} 个 Markdown 文件</small>
                )}
              </span>
            </label>
            {!isFile && node.children.length > 0 && (
              <ImportTreeRows
                nodes={node.children}
                level={level + 1}
                selectedSet={selectedSet}
                onToggleFile={onToggleFile}
                onToggleGroup={onToggleGroup}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function TreeCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  );
}

function buildImportTree(files: ImportPreviewFile[]): ImportTreeNode {
  const root: ImportTreeNode = {
    id: "root",
    name: "root",
    children: [],
    filePaths: files.map((file) => file.path),
  };

  for (const file of files) {
    const parts = file.relativePath.split(/[\\/]+/).filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        current.children.push({
          id: file.path,
          name: part || file.name,
          file,
          children: [],
          filePaths: [file.path],
        });
        return;
      }
      let next = current.children.find((child) => !child.file && child.name === part);
      if (!next) {
        next = {
          id: `${current.id}/${part}`,
          name: part,
          children: [],
          filePaths: [],
        };
        current.children.push(next);
      }
      next.filePaths.push(file.path);
      current = next;
    });
  }

  sortImportTree(root);
  return root;
}

function sortImportTree(node: ImportTreeNode) {
  node.children.sort((left, right) => {
    if (left.file && !right.file) return 1;
    if (!left.file && right.file) return -1;
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });
  node.children.forEach(sortImportTree);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
  settings,
  onQueryChange,
  onClose,
  onPreviewTheme,
  onCommitTheme,
  onOpenBook,
  onOpenNote,
  onOpenContentResult,
}: {
  closing: boolean;
  query: string;
  books: BookSummary[];
  notes: NoteItem[];
  settings: AppSettings;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onPreviewTheme: (themeSeries: string, theme?: string) => void;
  onCommitTheme: (themeSeries: string, theme: string) => void;
  onOpenBook: (book: BookSummary) => void;
  onOpenNote: (note: NoteItem) => void;
  onOpenContentResult: (result: ContentSearchResult) => void;
}) {
  const [mode, setMode] = useState<SearchMode>("search");
  const [selectedThemeSeriesId, setSelectedThemeSeriesId] = useState(getEffectiveThemeSeries(settings.themeSeries));
  const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
  const [contentSearchBusy, setContentSearchBusy] = useState(false);
  const [contentSearchError, setContentSearchError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const normalized = query.trim().toLowerCase();
  const selectedThemeSeries =
    visibleThemeSeriesOptions.find((series) => series.id === selectedThemeSeriesId) ?? visibleThemeSeriesOptions[0];
  const commandItems = useMemo<CommandSearchResultItem[]>(
    () => [
      {
        id: "command:theme",
        kind: "command",
        label: "切换主题",
        description: "选择主题系列和主题皮肤",
      },
    ],
    [],
  );
  const themeSeriesItems = useMemo<ThemeSeriesSearchResultItem[]>(
    () =>
      visibleThemeSeriesOptions
        .filter((series) => matchesSearchText([series.id, series.label, series.description], normalized))
        .map((series) => ({ id: `theme-series:${series.id}`, kind: "theme-series", series })),
    [normalized],
  );
  const themeItems = useMemo<ThemeSkinSearchResultItem[]>(
    () =>
      getThemesForSeries(selectedThemeSeriesId)
        .filter((theme) => matchesSearchText([theme.value, theme.label, theme.description], normalized))
        .map((theme) => ({ id: `theme:${theme.value}`, kind: "theme", theme })),
    [normalized, selectedThemeSeriesId],
  );
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
      mode === "search" && normalized.length >= 2
        ? contentResults.map((result, index) => ({
            id: `content:${result.chapterVersionId}:${result.startOffset}:${index}`,
            kind: "content",
            result,
          }))
        : [],
    [contentResults, mode, normalized.length],
  );
  const resultItems = useMemo<SearchResultItem[]>(
    () => {
      if (mode === "theme-series") return themeSeriesItems;
      if (mode === "theme") return themeItems;
      return [...commandItems, ...bookItems, ...noteItems, ...contentItems];
    },
    [bookItems, commandItems, contentItems, mode, noteItems, themeItems, themeSeriesItems],
  );
  const resultIndexById = useMemo(
    () => new Map(resultItems.map((item, index) => [item.id, index])),
    [resultItems],
  );

  useEffect(() => {
    if (mode !== "search") {
      setContentResults([]);
      setContentSearchBusy(false);
      setContentSearchError("");
      return;
    }
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
  }, [mode, query]);

  useEffect(() => {
    setActiveIndex(resultItems.length ? 0 : -1);
  }, [mode, query, selectedThemeSeriesId, resultItems.length]);

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

  function matchesSearchText(values: Array<string | undefined>, searchText: string) {
    if (!searchText) return true;
    return values.filter(Boolean).join(" ").toLowerCase().includes(searchText);
  }

  function previewSearchResult(item?: SearchResultItem) {
    if (!item) return;
    if (item.kind === "theme-series") {
      onPreviewTheme(item.series.id, getDefaultThemeForSeries(item.series.id));
      return;
    }
    if (item.kind === "theme") {
      onPreviewTheme(item.theme.series, item.theme.value);
    }
  }

  function setActiveResult(index: number, preview = false) {
    if (index < 0 || index >= resultItems.length) return;
    setActiveIndex(index);
    if (preview) previewSearchResult(resultItems[index]);
  }

  function enterThemeSeriesMode() {
    const currentSeriesId = getEffectiveThemeSeries(settings.themeSeries);
    const currentIndex = visibleThemeSeriesOptions.findIndex((series) => series.id === currentSeriesId);
    setSelectedThemeSeriesId(currentSeriesId);
    setMode("theme-series");
    onQueryChange("");
    setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
  }

  function enterThemeMode(series: ThemeSeriesOption) {
    const firstTheme = getThemesForSeries(series.id)[0];
    setSelectedThemeSeriesId(series.id);
    setMode("theme");
    onQueryChange("");
    setActiveIndex(0);
    if (firstTheme) onPreviewTheme(series.id, firstTheme.value);
  }

  function commitTheme(theme: ThemeSkinOption) {
    onCommitTheme(theme.series, theme.value);
    onClose();
  }

  function openSearchResult(item: SearchResultItem) {
    if (item.kind === "command") {
      enterThemeSeriesMode();
      return;
    }
    if (item.kind === "theme-series") {
      enterThemeMode(item.series);
      return;
    }
    if (item.kind === "theme") {
      commitTheme(item.theme);
      return;
    }
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
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!resultItems.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const start = activeIndex < 0 ? (direction > 0 ? -1 : 0) : activeIndex;
      setActiveResult((start + direction + resultItems.length) % resultItems.length, true);
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
      onMouseEnter: () => setActiveResult(index, true),
      onClick: () => openSearchResult(item),
    };
  }

  const placeholder =
    mode === "theme-series"
      ? "选择主题系列"
      : mode === "theme"
        ? `选择${selectedThemeSeries.label}的主题`
        : "搜索书籍、批注、正文或指令";

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
            placeholder={placeholder}
          />
          <button className="icon-button small" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="search-results">
          {mode === "search" && commandItems.length > 0 && (
            <>
              <h3>指令</h3>
              {commandItems.map((item) => (
                <button key={item.id} {...resultButtonProps(item, "command-search-result")}>
                  <Palette size={15} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </>
          )}
          {mode === "search" && bookItems.length > 0 && (
            <>
              <h3>书籍</h3>
              {bookItems.map((item) => (
                <button key={item.id} {...resultButtonProps(item)}>
                  <BookOpen size={15} /> <span>{item.book.name}</span>
                </button>
              ))}
            </>
          )}
          {mode === "search" && noteItems.length > 0 && (
            <>
              <h3>批注</h3>
              {noteItems.map((item) => (
                <button key={item.id} {...resultButtonProps(item)}>
                  <MessageSquare size={15} /> <span>{item.note.comment.trim() || item.note.selectedText}</span>
                </button>
              ))}
            </>
          )}
          {mode === "search" && (contentSearchBusy || contentSearchError || contentItems.length > 0) && (
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
          {mode === "theme-series" && (
            <>
              <h3>主题系列</h3>
              {themeSeriesItems.map((item) => {
                const isCurrent = getEffectiveThemeSeries(settings.themeSeries) === item.series.id;
                return (
                  <button key={item.id} {...resultButtonProps(item, "theme-search-result")}>
                    <span
                      className="theme-preview series-preview"
                      style={{
                        backgroundColor: item.series.previewBg,
                        borderColor: item.series.accent,
                        color: item.series.previewInk,
                      }}
                    >
                      <i style={{ backgroundColor: item.series.accent }} />
                      <i />
                      <i />
                    </span>
                    <span>
                      <strong>{item.series.label}</strong>
                      <small>{item.series.description}</small>
                    </span>
                    {isCurrent ? <Check size={14} /> : <ArrowRight size={14} />}
                  </button>
                );
              })}
            </>
          )}
          {mode === "theme" && (
            <>
              <h3>{selectedThemeSeries.label}</h3>
              {themeItems.map((item) => {
                const isCurrent = settings.themeSeries === item.theme.series && settings.theme === item.theme.value;
                return (
                  <button key={item.id} {...resultButtonProps(item, "theme-search-result")}>
                    <span
                      className="theme-preview"
                      style={{
                        backgroundColor: item.theme.previewBg,
                        borderColor: item.theme.accent,
                        color: item.theme.previewInk,
                      }}
                    >
                      <i style={{ backgroundColor: item.theme.accent }} />
                      <i />
                      <i />
                    </span>
                    <span>
                      <strong>{item.theme.label}</strong>
                      <small>{item.theme.description}</small>
                    </span>
                    {isCurrent && <Check size={14} />}
                  </button>
                );
              })}
            </>
          )}
          {!resultItems.length && <p className="search-empty">没有匹配结果</p>}
        </div>
      </section>
    </div>
  );
}

export function BatchExportModal({
  closing,
  text,
  copied,
  onCopy,
  onClose,
}: {
  closing: boolean;
  text: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
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
  closing,
  book,
  onClose,
  onError,
}: {
  closing: boolean;
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
  const [dragChapterId, setDragChapterId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const managerRef = useRef<HTMLDivElement | null>(null);
  const chaptersRef = useRef<Chapter[]>([]);
  const dragChapterIdRef = useRef<string | null>(null);
  const orderDirtyRef = useRef(false);

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

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  useEffect(() => {
    dragChapterIdRef.current = dragChapterId;
  }, [dragChapterId]);

  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId);
  const diffBaseVersion = versions.find((version) => version.id === diffBaseVersionId) ?? null;
  const diffTargetVersion = versions.find((version) => version.id === diffTargetVersionId) ?? null;
  const managerStyle = { "--version-sidebar-width": `${sidebarWidth}px` } as CSSProperties;

  function clampSidebarWidth(width: number) {
    const manager = managerRef.current;
    if (!manager) return width;
    const rect = manager.getBoundingClientRect();
    const maxWidth = rect.width * 0.4;
    const minWidth = Math.min(220, maxWidth);
    return Math.round(Math.min(Math.max(width, minWidth), maxWidth));
  }

  function startSidebarResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setSidebarResizing(true);
  }

  useEffect(() => {
    const handleResize = () => {
      setSidebarWidth((current) => clampSidebarWidth(current));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!sidebarResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const manager = managerRef.current;
      if (!manager) return;
      event.preventDefault();
      const rect = manager.getBoundingClientRect();
      setSidebarWidth(clampSidebarWidth(event.clientX - rect.left));
    };

    const handlePointerEnd = () => {
      setSidebarResizing(false);
    };

    document.body.classList.add("version-sidebar-resize-active");
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      document.body.classList.remove("version-sidebar-resize-active");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [sidebarResizing]);

  function moveChapterOrder(targetChapterId: string, movedChapterId?: string | null) {
    if (!movedChapterId || movedChapterId === targetChapterId) return;
    const current = chaptersRef.current;
    const from = current.findIndex((chapter) => chapter.id === movedChapterId);
    const to = current.findIndex((chapter) => chapter.id === targetChapterId);
    if (from < 0 || to < 0) return;

    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    chaptersRef.current = next;
    orderDirtyRef.current = true;
    setChapters(next);
  }

  async function saveChapterOrder(nextChapters: Chapter[]) {
    if (nextChapters.length === 0) return;
    setBusy(true);
    try {
      const saved = await reorderChapters(
        book.id,
        nextChapters.map((chapter) => chapter.id),
      );
      chaptersRef.current = saved;
      setChapters(saved);
    } catch (err) {
      onError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!dragChapterId) return;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const row = element?.closest<HTMLElement>("[data-version-chapter-id]");
      const targetChapterId = row?.dataset.versionChapterId;
      if (targetChapterId) {
        moveChapterOrder(targetChapterId, dragChapterIdRef.current);
      }
    };

    const handlePointerEnd = () => {
      const shouldSave = orderDirtyRef.current;
      const nextChapters = chaptersRef.current;
      dragChapterIdRef.current = null;
      orderDirtyRef.current = false;
      setDragChapterId(null);
      if (shouldSave) {
        void saveChapterOrder(nextChapters);
      }
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
  }, [dragChapterId]);

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
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
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
        <div
          ref={managerRef}
          className={`version-manager ${sidebarResizing ? "is-resizing" : ""}`}
          style={managerStyle}
        >
          <aside>
            {chapters.map((chapter, index) => (
              <button
                key={chapter.id}
                data-version-chapter-id={chapter.id}
                className={`version-chapter-row ${chapter.id === selectedChapterId ? "active" : ""} ${
                  chapter.id === dragChapterId ? "dragging" : ""
                }`}
                onClick={() => setSelectedChapterId(chapter.id)}
                onPointerDown={(event) => {
                  if (event.button !== 0 || busy) return;
                  event.preventDefault();
                  dragChapterIdRef.current = chapter.id;
                  setSelectedChapterId(chapter.id);
                  setDragChapterId(chapter.id);
                }}
              >
                <span className="version-chapter-index">{String(index + 1).padStart(2, "0")}</span>
                <GripVertical size={15} />
                <span>{chapterFileName(chapter)}</span>
              </button>
            ))}
          </aside>
          <button
            type="button"
            className="version-resizer"
            role="separator"
            aria-label="调整章节列表宽度"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            onPointerDown={startSidebarResize}
          />
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
  return (
    <pre className={prefix === "+" ? "added-lines" : "removed-lines"}>
      {lines.map((line, index) => (
        <code key={`${index}-${line}`}>
          <span>{prefix}</span>
          {line || " "}
        </code>
      ))}
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
