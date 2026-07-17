# AnnotaLoop

AnnotaLoop 是一个本地优先的 Markdown 桌面阅读器，适合阅读按章节拆分的本地书稿、课程讲义、研究笔记和 AI 生成的长文档。它把阅读、高亮、批注、章节版本快照和面向 AI 工作流的导出放在同一个桌面应用里。

原始 Markdown 文件会保留在原目录。AnnotaLoop 只维护本地索引、章节快照、批注、阅读进度和阅读器设置。

![](./assets/banner.png)

## 功能亮点

- 本地导入 Markdown 文件夹，导入前可在层级目录中勾选 Markdown 文件并修改书名。
- 以 gallery 书籍卡片管理本地书稿，支持把文件夹拖入书架区域或点击选择文件夹导入。
- 阅读 Markdown 内容，支持相对路径图片在 Tauri 桌面环境中显示。
- 自动提取章节标题和大纲，支持章节列表、大纲跳转、上一篇/下一篇导航。
- 选中文本后创建跨行高亮批注，保存渲染文本锚点、上下文、标题路径、颜色和评论。
- 首页批注工作台支持按书籍、章节、状态筛选，支持批量选择、批量导出和批量标记。
- 章节版本管理支持内容快照、版本别名、版本 Diff、旧批注定位检查和左侧章节拖拽排序。
- 阅读器支持当前章节搜索，`Ctrl+F` 激活，正文高亮，结果摘要和点击跳转。
- 阅读器支持全屏阅读，隐藏标题栏、顶部工具栏和左右栏，鼠标贴近屏幕顶部或左右边缘可唤出对应栏，按 `Esc` 可退出。
- `Ctrl+K` 命令面板支持搜索和主题切换，主题切换可实时预览。
- 多套主题系列皮肤，包括经典纸书、拼贴海报、光谱玻璃、夜航仪表、东方书斋、暗房胶片、故障霓屏、解构杂志和透明系统。
- 阅读器可调整左右栏、正文区、章节/大纲分隔线和搜索面板高度。
- 聚焦模式可淡化非当前阅读区域，帮助沉浸阅读。
- 批注可导出为阅读笔记、AI 修改包、问题清单和全书批注索引；无评论批注可按需导出，生成内容会用代码块隔离原文块。
- 应用会记住上次窗口位置和大小，首次启动默认居中；显示器环境变化导致旧位置不可见时会回退到安全位置。
- 支持本地 SQLite 数据库备份与恢复。

## 下载

Windows 用户可以在 [Releases](https://github.com/coderyjc/annotaloop/releases) 页面下载安装包。

当前版本：`v0.4.3`

常见构建产物名称：

```text
AnnotaLoop_0.4.3_x64-setup.exe
```

## 技术栈

- 桌面框架：Tauri 2
- 前端：React 18、TypeScript、Vite
- Markdown 渲染：markdown-it
- 图标：lucide-react
- 后端：Rust
- 本地存储：SQLite（rusqlite bundled）

## 本地开发

环境要求：

- Node.js 和 npm
- Rust 工具链
- Tauri 2 所需系统依赖
- Windows WebView2 Runtime

安装依赖：

```powershell
npm.cmd install
```

启动 Tauri 开发环境：

```powershell
npm.cmd run tauri dev
```

只启动 Vite 前端：

```powershell
npm.cmd run dev
```

前端开发服务器默认运行在：

```text
http://127.0.0.1:1420
```

## 构建

构建前端和 Tauri 桌面应用：

```powershell
npm.cmd run tauri -- build
```

当前 Windows 打包目标为 NSIS。构建完成后，常见输出位置包括：

```text
src-tauri/target/release/loop-book.exe
src-tauri/target/release/bundle/nsis/AnnotaLoop_0.4.3_x64-setup.exe
```

## v0.4.3 更新摘要

- 书籍导入改为先弹出导入模态框，可用层级目录和复选框选择要导入的 Markdown 文件，支持全选、反选和导入前修改书名。
- 将文件夹拖到主页书架 gallery 区域即可触发导入，不再要求精确拖到导入卡片。
- 导入单个 Markdown 时，默认书名和章节标题会取最终文件名，避免出现 `subfolder/1.md` 这类路径名。
- 主页书籍右键菜单中的“版本管理”改名为“管理”，并调整菜单顺序。
- 管理模态框左侧章节列表支持拖拽排序，松手后自动保存；左侧列表独立滚动，并可拖动中间分隔条调整左右栏宽度。
- 顶部提示气泡统一中文化、2 秒自动消失，并带有主题适配的环形倒计时和进出场动画。
- 新增并统一多处模态框的打开和关闭动画。
- 应用名称、窗口标题和安装包名称统一为 AnnotaLoop。
- 新增全屏阅读模式，支持顶部栏、左栏和右栏按屏幕边缘唤出，并支持 `Esc` 退出。
- 新增窗口位置和大小记忆；首次启动默认居中，后续启动优先恢复上次窗口位置。
- “导出批注”功能更新导出模板：无评论批注不再输出 `_Empty_`，导出时间改为 `YYYY-MM-DD HH:mm:ss`，Reading Notes 中的原文块统一用代码块包裹。
- 阅读器设置移除主题/主题系列、上下文字数和页面质感设置；主题切换保留在主页设置和命令面板中。
- 修复经典纸书暗色主题的批注空状态和暗色页面切换时的浅色闪烁。

## 常用脚本

```text
npm.cmd run dev          # 启动 Vite 开发服务器
npm.cmd run build        # TypeScript 检查并构建前端
npm.cmd run preview      # 预览前端构建结果
npm.cmd run tauri dev    # 启动 Tauri 开发环境
npm.cmd run tauri -- build
                          # 构建桌面应用安装包
```

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+K` | 打开命令面板，搜索书籍/批注/正文或切换主题 |
| `Ctrl+F` | 在阅读器中搜索当前章节 |
| `N` | 下一章 |
| `P` | 上一章 |
| `H` | 添加高亮 |
| `E` | 导出批注 |
| `[` / `]` | 收起或展开左右栏 |

`Ctrl+P` 已在应用内屏蔽，避免误触系统打印。

## 数据存储

AnnotaLoop 会在系统应用数据目录下创建本地 SQLite 数据库：

```text
loop-book.sqlite3
```

数据库中保存：

- 书籍和章节索引
- 章节内容快照和版本号
- 批注、高亮、评论和上下文
- 阅读进度
- 阅读器排版设置、首页主题系列/主题皮肤、快捷键和聚焦模式开关

窗口位置和大小保存在前端 `localStorage` 的 `annotaloop.windowPlacement.v1` 中，不写入 SQLite。

导入的 Markdown 文件不会被移动或复制，仍保留在原始文件夹中。

## 项目结构

```text
.
|-- src/                  # React 前端
|   |-- App.tsx           # 应用状态、页面编排和主要交互流程
|   |-- api.ts            # Tauri invoke API 封装
|   |-- constants.ts      # 默认设置、快捷键、高亮颜色和主题常量
|   |-- markdown.ts       # Markdown 渲染、批注标记、标题路径工具
|   |-- styles.css        # 应用样式
|   |-- types.ts          # 前后端共享的 TypeScript 类型
|   |-- components/
|   |   |-- home/         # 首页、批注工作台、设置、搜索、书籍菜单
|   |   `-- reader/       # 阅读器批注卡片、导出、排序、设置
|   `-- utils/            # 章节、批注、快捷键、版本 Diff 等工具函数
|-- src-tauri/            # Tauri/Rust 后端
|   |-- src/lib.rs        # Tauri commands 和业务编排
|   |-- src/domain.rs     # 后端数据模型和 DTO
|   |-- src/db.rs         # SQLite 初始化与迁移
|   |-- src/exporter.rs   # 批注导出模板渲染
|   |-- src/utils.rs      # 文件扫描、hash、时间、ID、大纲等工具
|   |-- src/main.rs       # 桌面入口
|   |-- Cargo.toml        # Rust 依赖
|   `-- tauri.conf.json   # Tauri 应用配置
|-- index.html
|-- package.json
|-- tsconfig.json
`-- vite.config.ts
```

## 给维护者

原 README 中偏内部开发、Codex 接续和环境排坑的内容已移到 [codex.md](./codex.md)。
