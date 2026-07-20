# AuroraMD

AuroraMD 是一个本地优先的 Markdown 桌面阅读器，用来阅读按章节拆分的 Markdown 书稿，并在阅读过程中完成高亮、批注、章节版本隔离和面向 AI 工作流的批注导出。

它适合处理本地书稿、AI 生成的长文档、课程讲义、研究笔记等内容：原始 Markdown 文件保留在原目录，应用只维护索引、版本快照、批注、阅读进度和阅读器设置。

## 后续会话接续说明

如果重开 Codex 会话，请先读本节和下面的“开发踩坑记录”。当前项目状态以本 README 为准。

- 当前版本：`v0.5.0`。
- 当前工作区：`E:\code\github\annotaloop`。
- 用户验证入口：`src-tauri/target/release/auroramd.exe`。完成功能或修复后，默认直接执行 `npm.cmd run tauri -- build`，不要只停在前端构建或 dev server。
- 最近一次 release 构建输出为 `src-tauri/target/release/auroramd.exe` 和 `src-tauri/target/release/bundle/nsis/AuroraMD_0.5.0_x64-setup.exe`。
- 目前窗口已改为 Tauri 无原生装饰窗口：`src-tauri/tauri.conf.json` 中 `decorations` 为 `false`，应用内标题栏在 `src/App.tsx` 的 `AppTitlebar` 和 `src/styles.css` 的 `.desktop-titlebar`。
- 主窗口首次启动居中，后续会从 `localStorage` 的 `auroramd.windowPlacement.v1` 恢复窗口位置和大小；旧的 `annotaloop.windowPlacement.v1` 会被兼容读取一次并迁移。Tauri 权限需要保留 `core:window:allow-set-position` 和 `core:window:allow-set-size`。
- 阅读器全屏阅读通过 Tauri `setFullscreen` 实现，顶部/左右栏通过 `.fullscreen-edge-*` 热区唤出；顶部栏还用 `cursorPosition()` 和 `outerPosition()` 做快速贴边轮询补偿，避免鼠标高速移动到屏幕顶端时漏触发。
- 暗色主题页面切换闪烁由根节点浅色背景暴露导致；当前用 `--app-root-bg` 同步 `.app-shell` 的 `--shell-bg`，不要把 `:root`、`html`、`body`、`#root` 固定回浅色背景。
- 字体设置已拆成 `interface_font_family` 和 `reader_font_family`；旧 `font_family` 字段继续保留并同步为阅读器字体，用于旧库和旧备份兼容。系统字体通过 Tauri 命令 `list_system_fonts` 读取。
- Markdown 阅读器支持 fenced `mermaid` 代码块，前端会懒加载 Mermaid 并按当前主题渲染 SVG；搜索和批注的正文偏移会跳过 `.mermaid-figure`，不要把 Mermaid SVG 文本重新纳入正文锚点计算。
- 首页 gallery 书籍置顶不是图钉方案，而是左侧渐变色条；对应样式是 `.book-entry::before` 和 `.book-entry.is-pinned::before`。
- 阅读器正文上方显示“本文共 xx 字 / 阅读需要 xx 分钟”，正文底部有“上一篇 / 下一篇”导航。
- UI/UX 规则：所有模态框打开时都要有打开动画，关闭时都要有消失动画；新增或改造模态框时必须接入 `closing` 状态和 `.is-closing` 样式，不要直接从 DOM 中硬移除。
- README 中 PowerShell 中文乱码、Tauri 构建缓存、release exe 被占用等坑已经记录在“开发踩坑记录”，遇到相似问题优先按那里排查。

## 功能

- 在首页 gallery 中以书籍卡片管理本地 Markdown 书稿；支持把文件夹拖入书架 gallery 区域或点击导入卡片选择文件夹。
- 导入包含 `.md` 文件的本地文件夹时，会先弹出导入书籍模态框，用层级目录和复选框选择要导入的 Markdown 文件，并可在导入前修改书名；原始文件保留在原处。
- gallery 书籍卡片支持右键菜单：置顶/取消置顶、管理、重命名、同步文件夹、在资源管理器打开和删除本地索引；置顶书籍显示在最前，并用左侧渐变色条标识。
- 应用窗口使用随主题变化的自定义标题栏，支持拖动窗口、双击最大化、最小化、最大化/还原和关闭，并会记住上次窗口位置和大小。
- 首页批注工作台支持按书籍、章节、状态筛选，批量选择、批量导出和批量标记；点击批注先打开详情模态框，再手动跳转到阅读位置。
- 阅读 Markdown 内容，支持相对路径图片在 Tauri 桌面环境中显示。
- 支持 `mermaid` 代码块渲染为主题适配的 SVG 图表。
- 自动提取章节标题和大纲，支持章节列表和大纲跳转。
- 选中文本后创建跨行高亮批注，保存渲染文本锚点、上下文、标题路径、颜色和评论。
- 按章节维护内容快照，原始 Markdown 变更后会生成新的章节版本。
- 管理模态框支持选择两个章节版本做 Diff，对新增、删除、修改进行分组展示，并检查旧批注是否仍能定位到目标版本；左侧章节列表支持拖拽排序、独立滚动和拖动分隔条调节左右栏宽度。
- 保存阅读进度，重新打开书籍时恢复最近阅读位置。
- 支持拖拽调整章节顺序。
- 阅读器左栏、正文区、右栏宽度可拖拽调整；左栏内“大纲/章节”的分隔位置也可拖拽调整。
- 阅读器正文上方显示当前章节字数和预计阅读时间，底部提供上一篇/下一篇导航。
- 阅读器搜索位于批注栏下半部分，支持拖拽调节高度；也可以在阅读器内按 `Ctrl+F` 激活搜索。输入关键词后，正文中会显示区别于批注的搜索高亮，结果列表最多显示两行摘要，点击可跳转到对应段落。
- 阅读器支持全屏阅读：进入后隐藏标题栏、顶部工具栏和左右栏，鼠标贴近屏幕顶部/左侧/右侧时分别唤出对应栏，点击全屏按钮或按 `Esc` 退出。
- 阅读器设置包含聚焦模式、字体、字号、行距、正文宽度、页边距、段落间距和边框样式；主题系列和主题皮肤只保留在首页设置与 `Ctrl+K` 命令面板中。
- 聚焦模式开启后，鼠标悬浮正文元素时仅当前元素及相邻元素正常显示，其余上下文淡化；悬浮正文空白处时整体淡化。
- 首页设置支持主题系列/主题皮肤选择、快捷键录制、本地备份和恢复；主题设置使用左侧系列、右侧子主题的双栏布局。
- 首页设置支持分别设置主界面字体和阅读器字体，字体来源于系统字体库并支持搜索选择；阅读器设置中只能修改阅读器字体。
- 主题系统支持多套系列皮肤，包括经典纸书、拼贴海报、光谱玻璃、夜航仪表、东方书斋、暗房胶片、故障霓屏、解构杂志和透明系统等系列；不同系列会同时改变背景、前景、卡片、界面质感和关键控件风格。
- `Ctrl+K` 搜索框已扩展为命令面板：默认不展开批注列表，支持上下箭头选择、回车跳转、`Esc` 退出，并提供“切换主题”指令。主题切换流程仿照 VS Code，可先预览系列默认主题，再预览子主题；确认前按 `Esc` 会恢复原主题。
- `Ctrl+P` 已被屏蔽，避免在阅读器或主页误触系统打印。
- “导出批注”可汇总全书批注，并按多种模板导出 Markdown；无评论批注默认可导出但不会生成 `_Empty_` 评论，Reading Notes 的原文块统一用代码块包裹，避免和 prompt 原有目录层级混淆：
  - 阅读笔记
  - AI 修改包
  - 问题清单
  - 全书批注索引
- 在没有自定义右键功能的区域禁用默认右键菜单，避免误弹系统菜单。

## 技术栈

- 桌面框架：Tauri 2
- 前端：React 18、TypeScript、Vite
- Markdown 渲染：markdown-it
- 图表渲染：Mermaid
- 图标：lucide-react
- 后端：Rust
- 本地存储：SQLite（rusqlite bundled）

## 目录结构

```text
.
|-- src/                  # React 前端
|   |-- App.tsx           # 应用状态、页面编排和主要交互流程
|   |-- api.ts            # Tauri invoke API 封装
|   |-- constants.ts      # 默认设置、快捷键、高亮颜色等常量
|   |-- markdown.ts       # Markdown 渲染、批注标记、标题路径工具
|   |-- styles.css        # 应用样式
|   |-- types.ts          # 前后端共享的 TypeScript 类型
|   |-- components/
|   |   |-- home/         # 首页批注工作台、设置、搜索、书籍菜单等组件
|   |   `-- reader/       # 阅读器批注卡片、导出、排序、设置等组件
|   `-- utils/            # 章节、批注、快捷键、版本 Diff 等前端工具函数
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

## 代码分层说明

当前代码按“命令编排、领域模型、基础设施、展示组件、工具函数”拆分：

- `src/App.tsx` 负责应用级状态、页面路由式切换、Tauri API 调用和事件编排。
- `src/components/home/` 放首页相关 UI，包括批注工作台、书籍右键菜单、搜索、批量导出、版本管理和主页设置。
- `src/components/reader/` 放阅读器相关 UI，包括章节排序弹窗、批注创建/详情弹窗、导出弹窗、阅读器设置和顶部通知。
- `src/utils/` 放前端纯工具函数，避免把章节名、批注状态、快捷键解析、版本 Diff 等逻辑散落在组件里。
- `src-tauri/src/domain.rs` 定义 Rust 侧统一数据结构，尽量让命令函数只处理流程，不重复写 DTO。
- `src-tauri/src/db.rs` 负责数据库建表与迁移，避免 schema 逻辑继续堆在 `lib.rs`。
- `src-tauri/src/exporter.rs` 专注导出 Markdown/AI 包模板，后续新增导出格式优先改这里。
- `src-tauri/src/utils.rs` 放后端通用工具，例如扫描 `.md`、计算 hash、生成 ID、解析大纲和数据库错误格式化。

后续新增功能时，优先沿用这个边界：UI 组件不直接写复杂业务规则，命令层不直接堆模板字符串，数据库 schema 变更集中放在 `db.rs`。

## 环境要求

- Node.js 和 npm
- Rust 工具链
- Tauri 2 所需的系统依赖

Windows 下还需要可用的 WebView2 Runtime。Tauri 的完整系统依赖可参考官方安装文档。

## 安装依赖

```powershell
npm.cmd install
```

## 本地开发

启动 Tauri 桌面开发环境：

```powershell
npm.cmd run tauri dev
```

前端开发服务器默认运行在：

```text
http://127.0.0.1:1420
```

也可以只启动 Vite 前端：

```powershell
npm.cmd run dev
```

## 构建

构建前端和 Tauri 桌面包：

```powershell
npm.cmd run tauri -- build
```

当前 Tauri 配置的默认 Windows 打包目标是 NSIS。构建完成后，常见输出位置包括：

```text
src-tauri/target/release/auroramd.exe
src-tauri/target/release/bundle/nsis/AuroraMD_0.5.0_x64-setup.exe
```

## 数据存储

应用会在系统应用数据目录下创建本地 SQLite 数据库：

```text
auroramd.sqlite3
```

数据库中保存：

- 书籍和章节索引
- 章节内容快照和版本号
- 批注、高亮、评论和上下文
- 阅读进度
- 阅读器排版设置、主界面字体、阅读器字体、首页主题系列/主题皮肤、快捷键和聚焦模式开关

窗口位置和大小保存在前端 `localStorage` 的 `auroramd.windowPlacement.v1` 中，不写入 SQLite。

导入的 Markdown 文件不会被移动或复制，仍保留在原始文件夹中。

## 常用脚本

```text
npm.cmd run dev          # 启动 Vite 开发服务器
npm.cmd run build        # TypeScript 检查并构建前端
npm.cmd run preview      # 预览前端构建结果
npm.cmd run tauri dev    # 启动 Tauri 开发环境
npm.cmd run tauri -- build
                          # 构建桌面应用安装包
```

## 版本控制建议

建议提交源码、配置文件和锁文件：

- `package-lock.json`
- `src-tauri/Cargo.lock`

不要提交：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- 本地数据库、日志、缓存和 IDE 临时文件

## 开发踩坑记录

下面这些是当前会话中已经踩到或确认过的环境坑，后续维护时优先排查这些点。

### PowerShell 与命令行

- PowerShell 终端里直接 `Get-Content README.md`、`Get-Content src/App.tsx` 时，中文可能显示成乱码。这通常是终端输出编码问题，不代表文件内容已经损坏。不要把终端里的乱码文案复制回源码；需要确认内容时，优先用编辑器、浏览器页面、`rg -n "中文关键词" 文件名` 或构建结果验证。
- 在当前 Codex/PowerShell 环境中，带正则 alternation 的命令要小心，例如 `rg -n "foo|bar" ...` 可能被外层命令解析误拆。更稳的写法是用单引号：`rg -n 'foo|bar' src\App.tsx src\styles.css`，或者拆成多次 `rg`。
- 不要在复杂命令里随手串联大量 `|`、`;`、`&&`。这个环境会按 shell 控制符拆命令段，容易让参数被误判。排查时尽量一条命令做一件事。
- `README*` 这类通配路径在 Windows/PowerShell + `rg` 组合里可能被当成非法路径。查 README 时用 `rg -n '关键词' README.md`，或者 `rg -n '关键词' . -g 'README*'`。

### 本地开发服务器

- `npm.cmd run dev` 是长时间运行的 Vite 服务。命令超时不一定是失败；如果输出里出现 `VITE ready` 和 `http://127.0.0.1:1420/`，说明服务已经启动。
- 在受限沙箱里用 `Start-Process` 启动后台进程，可能返回成功但进程没有真正留下来，也不会写出日志。需要验证时先前台运行看输出；如果必须后台常驻，再用已授权/提权的方式启动。
- `Invoke-WebRequest http://127.0.0.1:1420` 失败通常只说明 Vite 没起来或还没监听端口，不一定是前端代码问题。可以同时检查 `dev-server.log` 和端口监听。
- `Get-NetTCPConnection -LocalPort 1420` 没有输出或返回非零状态，表示当前没有监听者；这不是异常栈，可以当作“服务未启动”的信号。

### 网络与依赖

- 当前执行环境的网络是受限的。已经安装好 `node_modules` 时，`npm.cmd run build`、`cargo check`、`cargo test`、`npm.cmd run tauri -- build` 都不需要联网。
- 如果后续需要 `npm.cmd install`、下载 Rust/Tauri 依赖、访问 registry 或联网查文档，遇到 DNS、registry、连接失败时，先按权限流程申请联网/提权，不要立刻判断为项目代码问题。
- Tauri 打包会再次触发前端构建，所以看到 `npm.cmd run build` 输出两次是正常现象。

### Git 与差异查看

- 先用 `git rev-parse --is-inside-work-tree` 判断当前目录是不是 Git 工作区。不要默认 `git status` 一定可用。
- 如果当前目录不是 Git 仓库，`git diff -- src\App.tsx src\styles.css` 可能退化成 no-index 文件对比，把两个文件互相比出一大坨无意义 diff。此时应改用编辑器、`rg` 定位，或先确认仓库状态。

### 打包与验证

- 后续完成功能或修复后，默认直接执行 `npm.cmd run tauri -- build`，构建可测试的桌面 exe。用户优先打开下面这个 release 文件验证，不再只停留在前端构建或 dev server：

```text
src-tauri/target/release/auroramd.exe
```

- 如果 Tauri 打包失败并提示无法删除 `src-tauri/target/release/auroramd.exe` 或 `Access is denied`，通常是旧的 AuroraMD 测试程序还开着。后续遇到这类情况，默认直接结束当前 `auroramd` 测试进程（必要时强制 `Stop-Process -Force`），然后重新执行 `npm.cmd run tauri -- build`，不要改用独立 target 目录规避默认构建。
- 常规验证顺序建议：
  1. `npm.cmd run build`
  2. `cargo check`（在 `src-tauri/` 下）
  3. `cargo test`（在 `src-tauri/` 下）
  4. `npm.cmd run tauri -- build`
- 当前 v0.5.0 UI/UX 导入与管理模态框优化后已通过：
  - `npm.cmd run build`
  - `npm.cmd run tauri -- build`
- 最近一次 v0.5.0 release 构建输出：
  - `src-tauri/target/release/auroramd.exe`
  - `src-tauri/target/release/bundle/nsis/AuroraMD_0.5.0_x64-setup.exe`
- 最近一次自定义标题栏更新后已通过：
  - `npm.cmd run build`
  - `npm.cmd run tauri -- build`
- 最近一次全屏阅读、窗口位置记忆、导出批注模板、阅读器设置删减、暗色主题底色同步和经典纸书暗色空状态样式更新后已通过：
  - `npm.cmd run build`
  - `npm.cmd run tauri -- build`
- 最近一次系统字体读取、主界面/阅读器字体拆分和字体搜索选择更新后已通过：
  - `npm.cmd run build`
  - `npm.cmd run tauri -- build`
- Windows 安装包输出位置通常是：

```text
src-tauri/target/release/bundle/nsis/AuroraMD_0.5.0_x64-setup.exe
```
- 如果 `cargo check` 或 Tauri 打包时报错，提示去读取另一个旧目录下的 `target/.../permissions/...app_hide.toml`，通常是 Tauri/Rust 构建缓存里残留了旧绝对路径。排查时可以临时使用独立 target 目录：

```powershell
$env:CARGO_TARGET_DIR='E:\code\github\annotaloop\src-tauri\target-codex-check'
cargo check
```

清理临时目录前先确认路径仍在当前工作区内，必要时把只读属性归一化后再删，避免误删工作区外文件或被 Windows 文件属性拦住。

## v0.5.0 功能摘要

- 书籍导入流程改为先打开导入书籍模态框，使用层级目录和复选框选择要导入的 Markdown 文件，支持全选、反选和导入前修改书名。
- 文件夹拖拽导入范围扩大到主页书架 gallery 区域，不再需要精确拖到导入卡片。
- 导入单个 Markdown 文件时，默认书名和章节标题取最终文件名，避免把 `subfolder/1.md` 这样的相对路径作为名称。
- 主页书籍右键菜单中“版本管理”改名为“管理”，菜单顺序调整为置顶、管理、重命名、同步文件夹、在资源管理器打开，删除仍在末尾。
- 管理模态框左侧章节列表支持拖拽排序，松手后自动保存；左侧列表独立滚动，左右栏之间可拖动调节宽度，左栏最多占 40%。
- 顶部提示气泡统一中文化、2 秒自动消失，并带有主题适配的环形倒计时和进出场动画。
- 新增并统一重命名、导入、删除、同步报告、版本管理等模态框的打开和关闭动画。
- 应用名称、窗口标题和安装包名称统一为 AuroraMD。
- 新增全屏阅读模式：顶部按钮栏在“导出”和“设置”之间提供入口，进入后标题栏/工具栏/左右栏收起，屏幕顶部和左右边缘可唤出对应栏，`Esc` 可退出。
- 新增窗口位置和大小记忆，首次启动居中，后续启动恢复上次窗口状态；旧位置不可见时回退到安全位置。
- “导出批注”替代“导出批注包”，导出栏布局更紧凑，支持“导出空批注”，无评论批注不再输出 `_Empty_`，导出时间格式改为 `YYYY-MM-DD HH:mm:ss`，阅读笔记模板用代码块包裹原文块。
- AI 修改包模板、问题清单模板和全书批注模板已跟随阅读笔记模板更新，避免导出的原文层级干扰 prompt 结构。
- 阅读器设置移除主题/主题系列、上下文字数和页面质感；聚焦模式移动到设置列表顶部。
- 修复经典纸书暗色主题下批注工作台和阅读器批注空状态的浅色样式，并同步根节点背景，避免夜间主题页面切换时闪白。
- 新增系统字体库读取和可搜索字体选择器；主页设置可以分别修改主界面字体与阅读器字体，阅读器设置只修改阅读器字体。

## v0.4.2 功能摘要

- `Ctrl+K` 已从单纯搜索升级为命令面板。第一栏为“指令”，目前支持“切换主题”；后续仍保留书籍等搜索结果入口。
- “切换主题”支持键盘驱动的两级流程：先选择主题系列并预览该系列第一个主题，再选择具体子主题并实时预览；按回车或点击才提交，按 `Esc` 直接退出并恢复进入命令面板前的主题。
- 修复了通过 `Ctrl+K` 或设置切换主题后，再次打开 `Ctrl+K` 并按 `Esc` 会错误回到第一个系列第一个子主题的问题。
- 屏蔽 `Ctrl+P`，防止用户误触系统打印。
- 主题系列的子主题重新排序为日间主题在前、夜间主题在后。
- 主题系统补充了多组系列皮肤：经典纸书、拼贴海报、光谱玻璃、夜航仪表、东方书斋、暗房胶片、故障霓屏、解构杂志、透明系统等，并让不同系列在背景、前景、卡片、控件和界面质感上形成明显差异。
- 设置中的主题选择改为左侧系列列表、右侧子主题卡片的双栏结构，并适配主题系列列表滚动条。
- 阅读器新增搜索面板：位于批注栏下半部分，可调节高度，支持 `Ctrl+F` 激活、正文搜索高亮、结果摘要列表和点击跳转。
- 多处界面关闭、切换和跳转补充快速流畅的过渡动画，包括 `Ctrl+K`、主页设置、批注详情、右键菜单、导出弹窗、主页/阅读器切换、视图切换、章节/搜索/批注跳转等场景。
- 下拉列表的下拉部分已统一美化并遵循当前主题，同时保持下拉框本体样式不被额外染色。
- 顶部通知气泡改为 2 秒自动消失，并带有随主题适配的环形倒计时和进出场动画，例如“已取消置顶”这类提示。

## v0.3.0 功能摘要

- 首页保留 gallery 视图并移除列表视图；导入 Markdown 文件夹变成 gallery 末尾卡片，支持拖入文件夹或点击选择文件夹。
- 首页 gallery 支持书籍置顶/取消置顶，置顶书籍排在最前；视觉标识采用书籍卡片左侧渐变色条，不再使用图钉图标，避免卡片布局偏移。
- 首页新增主题设置，快捷键编辑改为点击输入框后录制用户实际按键。
- 首页批注工作台点击批注时先打开详情模态框，用户可在详情底部点击“跳转到对应位置”。
- 首页 gallery 书籍卡片右键菜单支持重命名、在资源管理器打开、同步文件夹、版本管理和删除本地索引；删除前会弹出确认窗口。
- 同步文件夹支持检测新增章节、缺失章节、内容变更和疑似改名；内容变更会继续按章节生成 v2/v3 版本快照。
- 章节版本管理支持按书选择章节、查看版本列表、给版本添加别名、删除非当前版本，并可选择两个版本进行 Diff 对比。
- 版本 Diff 展示新增、删除、修改块，并检查批注在目标版本中是否仍能定位。
- 批注锚点升级为渲染文本偏移，支持跨行高亮批注。
- 阅读器左栏/正文/右栏宽度可拖拽调整，左栏内“大纲/章节”分隔位置也可拖拽调整。
- 阅读器设置新增聚焦模式，开启后正文悬浮区域及相邻元素保持正常显示，其余上下文淡化。
- 阅读器正文上方显示当前章节字数和预计阅读时间，正文底部提供“上一篇 / 下一篇”导航。
- 窗口顶部改为自定义主题标题栏，取代原生 Windows 标题栏；标题栏随应用主题变化，并支持拖动、双击最大化、最小化、最大化/还原和关闭。
- 导出功能增加任务目标：润色这一章、根据批注重写、扩展段落、生成问题清单、生成二次创作指令；导出 Markdown 会自动包含给 AI 的系统说明。
- 首页设置与阅读器设置分离：主页设置使用模态框，包含主题、快捷键绑定和本地备份/恢复；阅读器设置继续保留字体、行距、边距、主题、聚焦模式等阅读体验设置。
- 新增默认快捷键：`Ctrl+K` 搜索、`N` 下一章、`P` 上一章、`H` 添加高亮、`E` 导出、`[`/`]` 收起展开左右栏。
- 本地备份/恢复支持导出和恢复 SQLite 数据库备份文件。
- 增加右键菜单、模态框、搜索框、侧栏/弹窗、聚焦模式等轻量 UI 动画，并在无自定义右键功能区域禁用默认菜单。
