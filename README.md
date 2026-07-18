# AuroraMD

AuroraMD 是一个颜值优先的本地 Markdown 阅读器。它把书架、阅读器、主题皮肤、批注和章节管理做成一个安静、顺手、适合长时间阅读的桌面应用。

它适合阅读本地书稿、课程讲义、研究笔记、知识库和按章节拆分的 Markdown 文档。原始文件会保留在原目录，AuroraMD 只维护本地索引、章节快照、批注、阅读进度和阅读器设置。

![](./assets/banner.png)

## 功能亮点

- 阅读界面：多套主题系列、纸书感排版、可调字体、聚焦模式和全屏阅读。
- 本地书架管理：导入 Markdown 文件夹，按书籍和章节组织文档，支持拖拽导入。
- 顺手的阅读体验：章节列表、大纲跳转、上一篇/下一篇、正文搜索和阅读进度恢复。
- 轻量批注系统：跨行高亮、评论、批注工作台、状态筛选和批量整理。
- 章节版本管理：内容快照、版本别名、版本 Diff、章节拖拽排序。
- 本地优先存储：SQLite 数据库保存索引和设置，Markdown 原文不被移动或复制。
- 批注导出：可导出阅读笔记、问题清单和全书批注索引，方便后续整理。

## 下载

Windows 用户可以在 [Releases](https://github.com/coderyjc/AuroraMD/releases) 页面下载安装包。

当前版本：`v0.4.3`

常见构建产物名称：

```text
AuroraMD_0.4.3_x64-setup.exe
```

## 使用方式

1. 打开 AuroraMD。
2. 拖入包含 `.md` 文件的文件夹，或点击导入入口选择文件夹。
3. 在导入窗口中勾选要加入书籍的 Markdown 文件，并修改书名。
4. 进入阅读器后，可以阅读、搜索、批注、切换主题或进入全屏阅读。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+K` | 打开命令面板，搜索书籍/批注/正文或切换主题 |
| `Ctrl+F` | 搜索当前章节 |
| `N` | 下一章 |
| `P` | 上一章 |
| `H` | 添加高亮 |
| `E` | 导出批注 |
| `[` / `]` | 收起或展开左右栏 |
| `Esc` | 退出全屏阅读或关闭当前浮层 |

`Ctrl+P` 已在应用内屏蔽，避免误触系统打印。

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
src-tauri/target/release/auroramd.exe
src-tauri/target/release/bundle/nsis/AuroraMD_0.4.3_x64-setup.exe
```

## 数据存储

AuroraMD 会在系统应用数据目录下创建本地 SQLite 数据库：

```text
auroramd.sqlite3
```

数据库中保存：

- 书籍和章节索引
- 章节内容快照和版本号
- 批注、高亮、评论和上下文
- 阅读进度
- 阅读器排版设置、主界面字体、阅读器字体、主题、快捷键和聚焦模式开关

窗口位置和大小保存在前端 `localStorage` 的 `auroramd.windowPlacement.v1` 中，不写入 SQLite。

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
|-- assets/
|-- index.html
|-- package.json
|-- tsconfig.json
`-- vite.config.ts
```

## 给维护者

偏内部开发、Codex 接续和环境排坑的内容放在 [codex.md](./codex.md)。
