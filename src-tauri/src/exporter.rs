use crate::domain::{ExportPreset, ExportRow};
use chrono::Local;

pub fn render_export(
    template_id: &str,
    task_goal: Option<&str>,
    preset: Option<&ExportPreset>,
    rows: &[ExportRow],
) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "# Loop Book Export\n\nGenerated at: {}\n\n",
        export_timestamp()
    ));

    let body_template_id = preset
        .map(|preset| preset.base_template_id.as_str())
        .unwrap_or(template_id);

    if let Some(preset) = preset {
        out.push_str(&format!("## Prompt Preset\n\n{}\n\n", preset.name));
        if !preset.system_prompt.trim().is_empty() {
            out.push_str("## AI System Instruction\n\n");
            out.push_str(preset.system_prompt.trim());
            out.push_str("\n\n");
        }
        if !preset.task_prompt.trim().is_empty() {
            out.push_str("## Task Prompt\n\n");
            out.push_str(preset.task_prompt.trim());
            out.push_str("\n\n");
        }
    } else if let Some(goal) = task_goal.and_then(normalize_task_goal) {
        out.push_str("## AI System Instruction\n\n");
        out.push_str(ai_system_instruction(goal));
        out.push_str("\n\n");
        out.push_str("## Task Goal\n\n");
        out.push_str(task_goal_label(goal));
        out.push_str("\n\n");
    }

    if rows.is_empty() {
        out.push_str("_No annotations found for this scope._\n");
        return out;
    }

    match body_template_id {
        "ai-pack" => {
            out.push_str("## AI Revision Packet\n\n");
            for row in rows {
                push_annotation_header(&mut out, row);
                out.push_str("### Original Selection\n\n");
                push_selection_quote(&mut out, &row.annotation.selected_text);
                let has_comment = if let Some(comment) = trimmed(&row.annotation.comment) {
                    out.push_str("### Reader Comment\n\n");
                    out.push_str(comment);
                    out.push_str("\n\n");
                    true
                } else {
                    false
                };
                out.push_str("### Suggested AI Task\n\n");
                if has_comment {
                    out.push_str("Revise the selected passage using the reader comment while preserving the chapter's voice and structure.\n\n");
                } else {
                    out.push_str("Review the selected passage while preserving the chapter's voice and structure.\n\n");
                }
            }
        }
        "question-list" => {
            out.push_str("## Question List\n\n");
            for row in rows {
                if let Some(comment) = trimmed(&row.annotation.comment) {
                    out.push_str(&format!(
                        "- **{}** / {}: {}\n",
                        row.chapter_title,
                        fallback_heading(&row.annotation.heading_path),
                        comment
                    ));
                } else {
                    out.push_str(&format!(
                        "- **{}** / {}: {}\n",
                        row.chapter_title,
                        fallback_heading(&row.annotation.heading_path),
                        inline_text(&row.annotation.selected_text)
                    ));
                }
            }
        }
        "annotation-index" => {
            out.push_str("## Full Annotation Index\n\n");
            for row in rows {
                push_annotation_header(&mut out, row);
                out.push_str(&format!(
                    "- Range: `{}..{}`\n- Color: `{}`\n",
                    row.annotation.start_offset,
                    row.annotation.end_offset,
                    row.annotation.highlight_color
                ));
                if let Some(tags) = trimmed(&row.annotation.tags) {
                    out.push_str(&format!("- Tags: `{tags}`\n"));
                }
                out.push('\n');
                push_selection_quote(&mut out, &row.annotation.selected_text);
                if let Some(comment) = trimmed(&row.annotation.comment) {
                    out.push_str(comment);
                    out.push_str("\n\n");
                }
            }
        }
        _ => {
            out.push_str("## Reading Notes\n\n");
            for row in rows {
                push_reading_note_block(&mut out, row);
                if let Some(comment) = trimmed(&row.annotation.comment) {
                    out.push_str(comment);
                    out.push_str("\n\n");
                }
            }
        }
    }

    out
}

fn export_timestamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn normalize_task_goal(goal: &str) -> Option<&str> {
    match goal {
        "polish" | "rewrite" | "expand" | "questions" | "creative" => Some(goal),
        _ => None,
    }
}

fn task_goal_label(goal: &str) -> &str {
    match goal {
        "polish" => "Polish this chapter",
        "rewrite" => "Rewrite according to annotations",
        "expand" => "Expand selected passages",
        "questions" => "Generate a question list",
        "creative" => "Create a derivative writing brief",
        _ => "General revision",
    }
}

fn ai_system_instruction(goal: &str) -> &'static str {
    match goal {
        "polish" => "You will receive Markdown reading annotations from Loop Book. Polish the relevant chapter text according to the comments while preserving the author's structure, terminology, and intent. Do not invent facts.",
        "rewrite" => "You will receive Markdown reading annotations from Loop Book. Rewrite the chapter sections referenced by the annotations. Treat reader comments as requirements, keep useful original ideas, and explain any major structural changes.",
        "expand" => "You will receive Markdown reading annotations from Loop Book. Expand only the passages that need elaboration. Add examples, transitions, or clarifications where comments ask for them, and avoid changing unrelated passages.",
        "questions" => "You will receive Markdown reading annotations from Loop Book. Convert comments and highlighted passages into a clear issue list and follow-up questions for revision. Group related concerns when possible.",
        "creative" => "You will receive Markdown reading annotations from Loop Book. Use the highlighted passages and comments as source constraints for a derivative writing brief. Preserve the core ideas while making the output ready for a new creative draft.",
        _ => "You will receive Markdown reading annotations from Loop Book. Use the selected text and comments as grounded instructions. Keep version boundaries intact and avoid mixing unrelated chapters.",
    }
}

fn push_annotation_header(out: &mut String, row: &ExportRow) {
    out.push_str(&format!(
        "## {}. {}\n\n",
        row.chapter_sort_index + 1,
        row.chapter_title
    ));
    if !row.annotation.heading_path.trim().is_empty() {
        out.push_str(&format!("Path: `{}`\n\n", row.annotation.heading_path));
    }
}

fn push_reading_note_block(out: &mut String, row: &ExportRow) {
    out.push_str("````\n");
    out.push_str(&format!(
        "## {}. {}\n\n",
        row.chapter_sort_index + 1,
        row.chapter_title
    ));
    if !row.annotation.heading_path.trim().is_empty() {
        out.push_str(&format!("Path: `{}`\n\n", row.annotation.heading_path));
    }
    out.push_str("> ");
    out.push_str(&row.annotation.selected_text.replace('\n', "\n> "));
    out.push_str("\n````\n\n");
}

fn fallback_heading(heading_path: &str) -> &str {
    if heading_path.trim().is_empty() {
        "No heading"
    } else {
        heading_path
    }
}

fn push_selection_quote(out: &mut String, selected_text: &str) {
    out.push_str("> ");
    out.push_str(&selected_text.replace('\n', "\n> "));
    out.push_str("\n\n");
}

fn trimmed(value: &str) -> Option<&str> {
    let value = value.trim();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn inline_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}
