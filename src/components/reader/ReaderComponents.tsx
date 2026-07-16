import { Check, Copy, FileText, GripVertical, Pin, PinOff, Save, Trash2, X } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";

import { highlightColors } from "../../constants";
import type { Annotation, AppSettings, Chapter, ExportPreset, ExportTaskGoal, ExportTemplate } from "../../types";
import { chapterFileName } from "../../utils/chapters";

export interface SelectionDraft {
  selectedText: string;
  startOffset: number;
  endOffset: number;
  renderedStartOffset: number;
  renderedEndOffset: number;
  renderedText: string;
  highlightColor: string;
  comment: string;
}

export function AnnotationCard({
  annotation,
  active,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  annotation: Annotation;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const comment = annotation.comment.trim();
  const summary = comment || annotation.selectedText.replace(/\s+/g, " ").trim();

  return (
    <button
      className={`annotation-card compact ${active ? "active" : ""} ${
        annotation.isPinned ? "is-pinned" : ""
      }`}
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.preventDefault();
        onOpen();
      }}
      onContextMenu={onContextMenu}
      title="单击跳转，双击查看详情"
    >
      <span className="annotation-dot" style={{ background: annotation.highlightColor }} />
      <span className={`annotation-summary ${comment ? "" : "source-preview"}`}>{summary}</span>
      {annotation.isPinned && <Pin className="annotation-pin-icon" size={13} aria-hidden="true" />}
    </button>
  );
}

export function AnnotationContextMenu({
  annotation,
  x,
  y,
  closing,
  onTogglePinned,
  onDelete,
}: {
  annotation: Annotation;
  x: number;
  y: number;
  closing: boolean;
  onTogglePinned: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`context-menu annotation-context-menu ${closing ? "is-closing" : ""}`}
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button onClick={onTogglePinned}>
        {annotation.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
        {annotation.isPinned ? "取消置顶" : "置顶"}
      </button>
      <button className="danger" onClick={onDelete}>
        <Trash2 size={15} /> 删除
      </button>
    </div>
  );
}

export function SortChaptersModal({
  closing,
  chapters,
  activeChapterId,
  dragChapterId,
  busy,
  onDragStart,
  onMove,
  onClose,
  onSave,
}: {
  closing: boolean;
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
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
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

export function ExportModal({
  closing,
  scope,
  template,
  taskGoal,
  presets,
  presetId,
  includeEmptyAnnotations,
  exportText,
  copied,
  busy,
  onScopeChange,
  onTemplateChange,
  onTaskGoalChange,
  onPresetChange,
  onIncludeEmptyAnnotationsChange,
  onExport,
  onCopy,
  onClose,
}: {
  closing: boolean;
  scope: "chapter" | "book";
  template: ExportTemplate;
  taskGoal: ExportTaskGoal;
  presets: ExportPreset[];
  presetId: string;
  includeEmptyAnnotations: boolean;
  exportText: string;
  copied: boolean;
  busy: boolean;
  onScopeChange: (scope: "chapter" | "book") => void;
  onTemplateChange: (template: ExportTemplate) => void;
  onTaskGoalChange: (goal: ExportTaskGoal) => void;
  onPresetChange: (presetId: string) => void;
  onIncludeEmptyAnnotationsChange: (enabled: boolean) => void;
  onExport: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? null;

  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
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
            <h2>导出批注</h2>
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
        <div className="export-control-grid">
          <label className="modal-field">
            Prompt 预设
            <select value={presetId} onChange={(event) => onPresetChange(event.target.value)}>
              <option value="">使用内置任务目标</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-field">
            模板
            <select
              value={selectedPreset?.baseTemplateId ?? template}
              onChange={(event) => onTemplateChange(event.target.value as ExportTemplate)}
              disabled={Boolean(selectedPreset)}
            >
              <option value="reading-notes">阅读笔记模板</option>
              <option value="ai-pack">AI 修改包模板</option>
              <option value="question-list">问题清单模板</option>
              <option value="annotation-index">全书批注索引</option>
            </select>
          </label>
          <label className="modal-field">
            任务目标
            <select
              value={taskGoal}
              onChange={(event) => onTaskGoalChange(event.target.value as ExportTaskGoal)}
              disabled={Boolean(selectedPreset)}
            >
              <option value="polish">润色这一章</option>
              <option value="rewrite">根据批注重写</option>
              <option value="expand">扩展某些段落</option>
              <option value="questions">生成问题清单</option>
              <option value="creative">生成二次创作指令</option>
            </select>
          </label>
        </div>
        {selectedPreset && (
          <div className="preset-export-summary">
            <strong>{selectedPreset.name}</strong>
            <span>正文结构：{exportTemplateLabel(selectedPreset.baseTemplateId)}</span>
          </div>
        )}
        <label className="export-option-row">
          <input
            type="checkbox"
            checked={includeEmptyAnnotations}
            onChange={(event) => onIncludeEmptyAnnotationsChange(event.target.checked)}
          />
          导出空批注
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

export function NewAnnotationModal({
  closing,
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  closing: boolean;
  draft: SelectionDraft;
  onChange: (draft: SelectionDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
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

export function AnnotationDetailModal({
  closing,
  annotation,
  onClose,
  onDelete,
  onSave,
}: {
  closing: boolean;
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
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
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

export function SettingsPanel({
  closing,
  settings,
  onChange,
  onClose,
}: {
  closing: boolean;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={`settings-backdrop ${closing ? "is-closing" : ""}`}
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

        <label className="settings-toggle">
          <span>
            <strong>聚焦模式</strong>
            <small>悬浮正文时，仅当前段落与相邻段落保持清晰。</small>
          </span>
          <input
            type="checkbox"
            checked={settings.focusMode}
            onChange={(event) => onChange({ focusMode: event.target.checked })}
          />
          <i aria-hidden="true" />
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

        <RangeControl
          label="字号"
          min={14}
          max={24}
          step={1}
          value={settings.fontSize}
          onChange={(value) => onChange({ fontSize: value })}
        />
        <RangeControl
          label="行距"
          min={1.35}
          max={2.1}
          step={0.05}
          value={settings.lineHeight}
          onChange={(value) => onChange({ lineHeight: value })}
        />
        <RangeControl
          label="正文宽度"
          min={620}
          max={1040}
          step={20}
          value={settings.contentWidth}
          onChange={(value) => onChange({ contentWidth: value })}
        />
        <RangeControl
          label="页边距"
          min={24}
          max={88}
          step={4}
          value={settings.pagePadding}
          onChange={(value) => onChange({ pagePadding: value })}
        />
        <RangeControl
          label="段落间距"
          min={8}
          max={30}
          step={1}
          value={settings.paragraphSpacing}
          onChange={(value) => onChange({ paragraphSpacing: value })}
        />

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

export function TopNotice({
  error,
  notice,
  closing,
  onClose,
}: {
  error: string;
  notice: string;
  closing: boolean;
  onClose: () => void;
}) {
  const text = error || notice;
  if (!text) return null;
  return (
    <div
      className={`top-notice ${error ? "error" : ""} ${closing ? "is-closing" : ""}`}
      role={error ? "alert" : "status"}
    >
      <span>{text}</span>
      <svg className="notice-ring" viewBox="0 0 18 18" aria-hidden="true">
        <circle className="notice-ring-track" cx="9" cy="9" r="7" />
        <circle className="notice-ring-progress" cx="9" cy="9" r="7" />
      </svg>
      <button className="icon-button small" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

function exportTemplateLabel(templateId: ExportTemplate) {
  const labels: Record<ExportTemplate, string> = {
    "reading-notes": "阅读笔记模板",
    "ai-pack": "AI 修改包模板",
    "question-list": "问题清单模板",
    "annotation-index": "全书批注索引",
  };
  return labels[templateId];
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
