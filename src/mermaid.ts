import type { MermaidConfig } from "mermaid";

let mermaidRenderId = 0;
let mermaidImport: Promise<typeof import("mermaid")> | null = null;

export async function renderMermaidDiagrams(root: HTMLElement) {
  const diagrams = Array.from(root.querySelectorAll<HTMLElement>(".mermaid-diagram"));
  if (diagrams.length === 0) return;

  const mermaid = await loadMermaid();
  mermaid.initialize(createMermaidConfig(root));

  for (const diagram of diagrams) {
    const source = readMermaidSource(diagram);
    if (!source.trim()) continue;

    diagram.classList.remove("is-rendered", "is-error");
    diagram.removeAttribute("data-mermaid-error");

    try {
      mermaidRenderId += 1;
      const { svg, bindFunctions } = await mermaid.render(
        `auroramd-mermaid-${Date.now()}-${mermaidRenderId}`,
        source,
        diagram,
      );
      diagram.innerHTML = svg;
      bindFunctions?.(diagram);
      diagram.classList.add("is-rendered");
    } catch (err) {
      diagram.innerHTML = renderMermaidError(source, readErrorMessage(err));
      diagram.dataset.mermaidError = "true";
      diagram.classList.add("is-error");
    }
  }
}

async function loadMermaid() {
  mermaidImport ??= import("mermaid");
  const mermaidModule = await mermaidImport;
  return mermaidModule.default;
}

function createMermaidConfig(root: HTMLElement): MermaidConfig {
  const style = getComputedStyle(root);
  const ink = readCssValue(style, "--ink", "#20211d");
  const muted = readCssValue(style, "--muted", "#686b61");
  const line = readCssValue(style, "--line", "#d8d9cf");
  const paper = readCssValue(style, "--paper", "#fffdf7");
  const paperStrong = readCssValue(style, "--paper-strong", "#ffffff");
  const accent = readCssValue(style, "--accent", "#c3452b");
  const blue = readCssValue(style, "--blue", "#3757a6");
  const fontFamily = readCssValue(style, "--reader-font-family", "Georgia, serif");

  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      background: paper,
      primaryColor: paperStrong,
      primaryBorderColor: accent,
      primaryTextColor: ink,
      secondaryColor: paper,
      secondaryBorderColor: line,
      secondaryTextColor: ink,
      tertiaryColor: paperStrong,
      tertiaryBorderColor: line,
      tertiaryTextColor: muted,
      lineColor: line,
      textColor: ink,
      mainBkg: paperStrong,
      nodeBorder: accent,
      clusterBkg: paper,
      clusterBorder: line,
      titleColor: ink,
      edgeLabelBackground: paper,
      actorBkg: paperStrong,
      actorBorder: accent,
      actorTextColor: ink,
      labelTextColor: ink,
      signalColor: ink,
      signalTextColor: ink,
      noteBkgColor: paperStrong,
      noteTextColor: ink,
      noteBorderColor: line,
      activationBkgColor: blue,
      activationBorderColor: blue,
      fontFamily,
    },
    flowchart: {
      htmlLabels: false,
      curve: "basis",
    },
    sequence: {
      mirrorActors: false,
    },
  };
}

function readMermaidSource(diagram: HTMLElement) {
  const encodedSource = diagram.dataset.mermaidSource;
  if (!encodedSource) return diagram.textContent ?? "";
  try {
    return decodeURIComponent(encodedSource);
  } catch {
    return encodedSource;
  }
}

function renderMermaidError(source: string, message: string) {
  return [
    `<div class="mermaid-error-title">Mermaid 渲染失败</div>`,
    `<div class="mermaid-error-message">${escapeHtml(message)}</div>`,
    `<pre><code class="language-mermaid">${escapeHtml(source)}</code></pre>`,
  ].join("");
}

function readCssValue(style: CSSStyleDeclaration, variable: string, fallback: string) {
  return style.getPropertyValue(variable).trim() || fallback;
}

function readErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
