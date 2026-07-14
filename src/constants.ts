import type { AppSettings, ShortcutBindings } from "./types";

export const highlightColors = ["#f7d86a", "#83d9b7", "#f2a0a1", "#9db7ff", "#d7b7ff"];

export const themeSeriesOptions = [
  {
    id: "classic",
    label: "经典纸书",
    description: "当前所有主题，保留温和的纸面阅读感。",
    defaultTheme: "paper",
    previewBg: "#fffdf7",
    previewInk: "#20211d",
    accent: "#c3452b",
  },
  {
    id: "archive",
    label: "档案馆",
    description: "像在整理馆藏、卡片和旧档案。",
    defaultTheme: "archive",
    previewBg: "#f5ecd8",
    previewInk: "#241f19",
    accent: "#8a3d2d",
  },
  {
    id: "atelier",
    label: "工作台",
    description: "更锋利的网格、面板和工具感。",
    defaultTheme: "blueprint",
    previewBg: "#eef4f7",
    previewInk: "#15232d",
    accent: "#286f9d",
  },
  {
    id: "terminal",
    label: "低光终端",
    description: "低照度、高对比，适合沉浸批注。",
    defaultTheme: "console",
    previewBg: "#101513",
    previewInk: "#d8f2df",
    accent: "#60d394",
  },
  {
    id: "poster",
    label: "拼贴海报",
    description: "斜切色块、纸张拼贴和强烈视觉节奏。",
    defaultTheme: "riso",
    previewBg: "#fff056",
    previewInk: "#151515",
    accent: "#ff4d38",
  },
  {
    id: "glass",
    label: "光谱玻璃",
    description: "柔光色层、半透明面板和轻盈漂浮感。",
    defaultTheme: "prism",
    previewBg: "#eef8f5",
    previewInk: "#142023",
    accent: "#ff7a70",
  },
] as const;

export const visibleThemeSeriesOptions = themeSeriesOptions.filter(
  (series) => !["archive", "atelier", "terminal"].includes(series.id),
);

export const themeOptions = [
  {
    value: "paper",
    series: "classic",
    label: "纸张日间",
    description: "暖白纸面",
    previewBg: "#fffdf7",
    previewInk: "#20211d",
    accent: "#c3452b",
  },
  {
    value: "daylight",
    series: "classic",
    label: "清亮日间",
    description: "冷白通透",
    previewBg: "#ffffff",
    previewInk: "#172126",
    accent: "#126c86",
  },
  {
    value: "mint",
    series: "classic",
    label: "薄荷日间",
    description: "柔和绿色",
    previewBg: "#fbfffc",
    previewInk: "#16221e",
    accent: "#2f7c5f",
  },
  {
    value: "focus",
    series: "classic",
    label: "专注日间",
    description: "低噪阅读",
    previewBg: "#fbfffd",
    previewInk: "#151b1c",
    accent: "#226f68",
  },
  {
    value: "night",
    series: "classic",
    label: "暖黑夜读",
    description: "暖色暗面",
    previewBg: "#23241f",
    previewInk: "#f1ede0",
    accent: "#e18a62",
  },
  {
    value: "midnight",
    series: "classic",
    label: "深蓝夜读",
    description: "蓝黑低光",
    previewBg: "#151b22",
    previewInk: "#e9f0f5",
    accent: "#76b7d8",
  },
  {
    value: "graphite",
    series: "classic",
    label: "石墨夜读",
    description: "中性深灰",
    previewBg: "#1d1e1a",
    previewInk: "#efefea",
    accent: "#d8b45a",
  },
  {
    value: "archive",
    series: "classic",
    label: "馆藏纸页",
    description: "纸纹、签条、墨色",
    previewBg: "#f5ecd8",
    previewInk: "#241f19",
    accent: "#8a3d2d",
  },
  {
    value: "catalog",
    series: "classic",
    label: "索引卡片",
    description: "卡片柜与蓝绿标签",
    previewBg: "#edf0e5",
    previewInk: "#1f2a24",
    accent: "#2f6f73",
  },
  {
    value: "umber",
    series: "classic",
    label: "褐墨夜档",
    description: "低光档案室",
    previewBg: "#211b16",
    previewInk: "#efe2c9",
    accent: "#c88345",
  },
  {
    value: "blueprint",
    series: "classic",
    label: "蓝图工作台",
    description: "网格、冷光、工程感",
    previewBg: "#eef4f7",
    previewInk: "#15232d",
    accent: "#286f9d",
  },
  {
    value: "studio",
    series: "classic",
    label: "白板工作台",
    description: "干净面板与红色标记",
    previewBg: "#f7f7f2",
    previewInk: "#20242a",
    accent: "#d04f35",
  },
  {
    value: "basalt",
    series: "classic",
    label: "玄武岩工作台",
    description: "深灰金属与蓝绿光",
    previewBg: "#15191d",
    previewInk: "#e6edf0",
    accent: "#49b8ad",
  },
  {
    value: "console",
    series: "classic",
    label: "荧光终端",
    description: "绿色低光",
    previewBg: "#101513",
    previewInk: "#d8f2df",
    accent: "#60d394",
  },
  {
    value: "amber",
    series: "classic",
    label: "琥珀终端",
    description: "暖黄字符与深棕底",
    previewBg: "#17120d",
    previewInk: "#ffe5b3",
    accent: "#ffb454",
  },
  {
    value: "aurora",
    series: "classic",
    label: "极光终端",
    description: "蓝绿光晕与深夜底",
    previewBg: "#0d1420",
    previewInk: "#e4f4ff",
    accent: "#6ee7d8",
  },
  {
    value: "riso",
    series: "poster",
    label: "双色孔版",
    description: "明黄、朱红与粗黑边",
    previewBg: "#fff056",
    previewInk: "#151515",
    accent: "#ff4d38",
  },
  {
    value: "cutout",
    series: "poster",
    label: "剪报拼贴",
    description: "白纸、青绿与番茄红",
    previewBg: "#faf7ee",
    previewInk: "#161616",
    accent: "#00a38a",
  },
  {
    value: "noir",
    series: "poster",
    label: "黑刊霓虹",
    description: "黑底、柠檬黄与热红",
    previewBg: "#111111",
    previewInk: "#f7f1d0",
    accent: "#f7dd36",
  },
  {
    value: "xerox",
    series: "poster",
    label: "复印蓝红",
    description: "高反差复印、青蓝和热粉",
    previewBg: "#f7f7f0",
    previewInk: "#111111",
    accent: "#00a6ff",
  },
  {
    value: "tabloid",
    series: "poster",
    label: "小报头版",
    description: "新闻纸、深蓝与醒目红",
    previewBg: "#f3ecd8",
    previewInk: "#171b26",
    accent: "#e33b2f",
  },
  {
    value: "sticker",
    series: "poster",
    label: "贴纸墙",
    description: "酸橙、莓粉与黑色描边",
    previewBg: "#dfff4f",
    previewInk: "#151515",
    accent: "#ff4fa3",
  },
  {
    value: "prism",
    series: "glass",
    label: "棱镜晨光",
    description: "透明柔光与珊瑚色焦点",
    previewBg: "#eef8f5",
    previewInk: "#142023",
    accent: "#ff7a70",
  },
  {
    value: "frost",
    series: "glass",
    label: "雾面玻璃",
    description: "冷雾面、墨绿和淡金光",
    previewBg: "#edf5f0",
    previewInk: "#182622",
    accent: "#4f9f83",
  },
  {
    value: "dusk",
    series: "glass",
    label: "暮色玻璃",
    description: "暗色玻璃、玫瑰和湖蓝",
    previewBg: "#111827",
    previewInk: "#eef6f2",
    accent: "#ff8c9a",
  },
] as const;

export function getThemesForSeries(seriesId: string) {
  const effectiveSeriesId = getEffectiveThemeSeries(seriesId);
  const themes = themeOptions.filter((theme) => theme.series === effectiveSeriesId);
  return themes.length ? themes : themeOptions.filter((theme) => theme.series === "classic");
}

export function getEffectiveThemeSeries(seriesId: string) {
  return visibleThemeSeriesOptions.some((series) => series.id === seriesId) ? seriesId : "classic";
}

export function getDefaultThemeForSeries(seriesId: string) {
  const effectiveSeriesId = getEffectiveThemeSeries(seriesId);
  return (
    visibleThemeSeriesOptions.find((series) => series.id === effectiveSeriesId)?.defaultTheme ??
    visibleThemeSeriesOptions[0].defaultTheme
  );
}

export const defaultShortcutBindings: ShortcutBindings = {
  search: "Ctrl+K",
  nextChapter: "N",
  previousChapter: "P",
  highlight: "H",
  export: "E",
  toggleLeft: "[",
  toggleRight: "]",
};

export const defaultSettings: AppSettings = {
  annotationContextChars: 100,
  themeSeries: "classic",
  theme: "paper",
  fontFamily: "Literata, Georgia, serif",
  fontSize: 18,
  lineHeight: 1.72,
  contentWidth: 820,
  pagePadding: 52,
  paragraphSpacing: 18,
  surface: "warm",
  borderStyle: "hairline",
  focusMode: false,
  shortcutBindings: JSON.stringify(defaultShortcutBindings),
};
