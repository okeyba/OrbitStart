# OrbitStart 程序架构梳理

> 基于源码精读整理 · 2026-06-25

---

## 一、项目定位

OrbitStart 是一个 **本地优先、可扩展的 Windows 桌面启动工作台**（个人启动中枢）。
把应用、网址、文件、文件夹、工作区、脚本、插件、动作链汇聚到一个统一资源中心，按真实任务组织数字资源。

- **版本**：0.6.0（package.json / tauri.conf.json / Cargo.toml 已同步）
- **协议**：MIT
- **平台**：Windows 10/11（主要）
- **当前开发重点**：首次引导（onboarding）、Obsidian 集成、桌面外壳体验

---

## 二、技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面框架 | Tauri 2 | 框架主体，窗口/托盘/全局快捷键/自动更新 |
| 前端 | React 18 + TypeScript + Vite | 单页应用，4972 行 App.tsx 主壳 |
| 后端 | Rust（src-tauri/） | 单文件 main.rs（5846 行），61 个 Tauri 命令 |
| 存储 | SQLite | 运行时数据 `%APPDATA%\OrbitStart\orbit.db` |
| 图标 | Lucide React + 本地提取应用图标 | |
| 拖拽 | @dnd-kit/core + sortable | 资源/分组排序 |
| 测试 | Playwright (E2E) + 自定义 harness | tests/ |
| 自动更新 | tauri-plugin-updater | 拉取 `latest.json` 校验签名后更新 |

---

## 三、目录结构

```
OrbitStart/
├── src/                      # 前端
│   ├── main.tsx              # React 入口（createRoot）
│   ├── App.tsx               # 主壳 4972 行（所有视图 + 状态机）
│   ├── types.ts              # 257 行 TypeScript 类型定义
│   ├── styles.css            # 7491 行样式（含 Local Galaxy 主题）
│   ├── components/           # 组件
│   │   ├── OnboardingWizard.tsx      # 首次引导向导
│   │   ├── TripPanel.tsx             # Trip 笔记侧边面板
│   │   ├── TripEditor.tsx            # Trip 编辑器
│   │   └── LocalGalaxyBackdrop.tsx   # Local Galaxy 主题背景层
│   ├── data/catalog.ts       # 浏览器降级快照（31KB，Tauri 不可用时回退）
│   ├── lib/                  # 工具层
│   │   ├── native.ts         # 前端→Rust 桥接（1030+ 行，65+ 个 export async function）
│   │   ├── onboarding.ts     # 首次引导状态机 + 6 个场景模板定义
│   │   ├── searchEngine.ts   # 模糊匹配 + 拼音首字母 + 搜索评分
│   │   ├── tripTemplates.ts  # Trip 分类标签
│   │   └── markdown.ts       # Markdown 工具
│   ├── desktop/              # 桌面外壳模块
│   │   ├── desktopShell.ts   # 安装托盘事件桥、快捷键、外链拦截
│   │   ├── windowControls.ts # 最小化/最大化/关闭/拖拽
│   │   ├── contextMenu.ts    # 右键菜单
│   │   ├── keyboardShortcuts.ts
│   │   └── externalOpen.ts   # 外部链接拦截
│   ├── plugin/               # 插件宿主
│   │   ├── api.ts            # PluginContext + createOrbitPluginHost
│   │   └── workerRuntime.ts  # Worker 插件运行时
│   └── theme/localGalaxyAssets.ts  # Local Galaxy 主题图片资产
├── src-tauri/                # Rust 后端
│   ├── src/main.rs           # 5846 行单文件，所有 Tauri 命令
│   ├── Cargo.toml            # 依赖：rusqlite / serde / base64 / tauri-plugins
│   ├── tauri.conf.json       # 窗口 1280×820 / NSIS / updater
│   ├── capabilities/default.json
│   └── icons/
├── design/                   # Local Galaxy 设计素材（PNG）
├── docs/                     # 插件/主题/验证文档
├── plugins/                  # 示例插件（hello-command / trips-search / obsidian-search）
├── registry/                 # 示例 registry（plugins.json / themes.json / update-channel.json）
├── themes/                   # 示例主题包
├── tests/                    # Playwright + 自定义 harness
├── tools/                    # 打包脚本
└── orbitstart-video/         # 演示视频素材
```

---

## 四、运行时数据流

### 4.1 启动流程

```
Tauri Builder::default()
  .invoke_handler![61 个命令]    ← src-tauri/src/main.rs:5741
  .setup(|app| {
      open_db()                  ← 初始化/迁移 SQLite schema
      setup_global_shortcut()    ← Ctrl+Alt+Space 全局热键
      setup_tray()               ← 系统托盘 + 右键菜单
      tauri_plugin_updater       ← 自动更新插件
      tauri_plugin_process       ← 进程管理插件
  })
  .on_window_event()             ← 关闭行为（托盘/退出）
  .run()
```

### 4.2 前端启动

```
main.tsx
  └── <App />                    ← src/App.tsx
        ├── useState × 40+       ← 731-770 行声明全部状态
        ├── useEffect: reload()  ← 1104 行，loadSnapshot() 拉全量数据
        ├── installDesktopShell()← 1316 行，托盘事件桥 + 快捷键
        ├── shouldShowOnboarding() ← 检查 localStorage，首次启动显示 Wizard
        └── render 视图：
              ├── dashboard      ← 资源中心主界面
              ├── trips          ← Trip 笔记搜索
              ├── obsidian       ← Obsidian 集成
              ├── settings       ← 设置（含插件/主题/dev）
              └── logs           ← 插件运行日志
```

### 4.3 前后端通信

前端 `src/lib/native.ts` 是**唯一的桥接层**，65+ 个 `export async function` 全部走 `invokeNative()` → `@tauri-apps/api/core.invoke()`。

关键设计：**双写降级**。每个函数 try/catch Tauri 调用，失败时回退到 localStorage（`orbitstart.browser.*` keys），让前端在浏览器预览（`vite dev`）下也能跑。

```
React 组件
  └── native.ts (createItem / loadSnapshot / ...)
        ├── 成功：invoke("create_item", {...})  → Rust
        └── 失败：localStorage 读写（浏览器降级）
```

---

## 五、SQLite 数据库 Schema

`src-tauri/src/main.rs:357 init_db()` 创建 8 张表：

| 表名 | 用途 | 关键字段 |
|---|---|---|
| `items` | 资源（应用/网址/文件/动作链等） | id, title, kind, group_id, target, favorite, launch_count, sort_order |
| `groups` | 分组/标签 | id, title, icon, custom, sort_order |
| `trips` | Trip 笔记（挂在 item 下，最多 50 条/item） | id, item_id, category, status, pinned, tags_json |
| `plugin_states` | 插件启用状态 + manifest | id, enabled, manifest_json, builtin |
| `plugin_logs` | 插件运行日志 | plugin_id, level, message |
| `settings` | KV 设置（主题/密度/热键/关闭行为等） | key, value |
| `obsidian_vaults` | Obsidian vault 配置 | id, name, path, enabled, file_count, task_count |
| `obsidian_notes` | Obsidian 笔记索引 | vault_id, title, relative_path, tags_json, favorite |
| `obsidian_tasks` | Obsidian checkbox 任务 | note_id, line_number, raw_text, completed, due_date |

### 默认数据（init_db 时 seed）

**默认分组**（`default_groups()`，main.rs:669）：
`all` / `apps` / `work` / `web` / `scripts` / `plugins`

**默认设置**（`ensure_default_settings()`，main.rs:561）：
- `active_theme_id` = `local-galaxy`
- `global_hotkey` = `Ctrl+Alt+Space`
- `close_behavior` = `tray`
- `density` = `comfortable`
- `display_mode` = `simple`
- `hotkey_behavior` = `command_bar`

**默认插件**（`default_plugins()`，main.rs:791）：14 个内置插件
core-command-palette / core-items / core-websites / core-shortcuts / core-bookmarks / core-actions / core-themes / core-backup / core-plugin-dev / core-clipboard / core-window-switcher / core-everything / core-obsidian / hotkey-binder

---

## 六、核心模块详解

### 6.1 资源中心（Dashboard）

- **数据源**：`items` 表 + `groups` 表
- **状态**：`items` / `groups` / `activeGroup` / `query`
- **交互**：
  - 搜索框 → `searchEngine.ts` 模糊匹配（拼音首字母 + 评分排序）
  - 拖拽排序 → `@dnd-kit/sortable` → `reorder_items` / `reorder_groups` 命令
  - 拖拽创建 → `dragDropEnabled: true` → `create_items_from_paths`
  - 批量管理 → `batchMode` + `selectedIds`
- **生命周期**：所有写操作走 `createItem/updateItem/deleteItem` → Rust 写库 → emit `orbit://refresh-resources` → 前端 `reload()`

### 6.2 首次引导（Onboarding）

- **触发条件**：`localStorage.getItem("orbitstart_onboarding_v1")` 为 null（`src/lib/onboarding.ts:155`）
- **状态机**：`template-select` → `tags-created` → 完成/跳过
- **6 个场景模板**（`SCENARIO_TEMPLATES`）：
  - student（学生）/ editor（剪辑）/ developer（开发者）
  - researcher（科研）/ data-analyst（数据分析）/ general（极简）
- **每个模板声明**：`groups[]`（自定义分组）+ `tags[]`（示例资源）
- **触发流程**（App.tsx:3731 `onTemplateSelected`）：
  1. 根据模板 `groups` 调用 `createCustomGroup()` 创建分组
  2. 循环调用 `createItem()` 把每个 tag 写入 SQLite
  3. `reload()` 从数据库重新加载
  4. 路径占位符 `[user]` 替换为实际用户名

### 6.3 Trip 笔记

- **数据源**：`trips` 表（挂在 item 下，每个资源最多 50 条）
- **分类**：shortcut / workflow / note / status / reference
- **状态**：todo / in-progress / done / needs-update
- **组件**：`TripPanel`（侧边面板）+ `TripEditor`（编辑器）
- **搜索**：`search_trips` 命令跨资源搜索

### 6.4 Obsidian 集成

- **数据源**：`obsidian_vaults` / `obsidian_notes` / `obsidian_tasks` 三张表
- **核心命令**：
  - `pick_obsidian_vault_path` / `add_obsidian_vault` / `scan_obsidian_vault`（vault 管理）
  - `list_obsidian_notes` / `list_obsidian_tasks` / `list_obsidian_note_tasks`（查询）
  - `toggle_obsidian_task_completion`（**双向同步**：点击 checkbox → 修改 Markdown 文件 `- [ ]` ↔ `- [x]` → 更新 DB）
  - `open_obsidian_note`（通过 `obsidian://open` 协议跳转）
  - `open_obsidian_todo_window`（弹出独立 Todo 面板窗口，340×740 瘦长型，吸附主窗口右侧）
  - `set_todo_window_always_on_top`（置顶）

### 6.5 插件系统

- **Manifest 驱动**：`OrbitPluginManifest`（id/name/version/permissions/contributes）
- **宿主 API**：`src/plugin/api.ts` 的 `PluginContext`
  - `commands.registerCommand()` / `commands.run()`
  - `search.registerProvider()` / `search.query()`
  - `ui.toast()`
- **运行时**：`WorkerPluginRuntime`（Web Worker 隔离执行）
- **内置插件**：14 个（core-* 开头），在 Rust 侧 `default_plugins()` 声明，前端 `createOrbitPluginHost` 注册命令
- **用户插件**：`plugins/` 目录下的 manifest + main.ts，`read_plugin_runtime` 读取源码注入 Worker

### 6.6 桌面外壳

- **窗口**：`decorations: false` 自定义标题栏，`windowControls.ts` 控制最小化/最大化/关闭/拖拽
- **托盘**：Rust 侧 `setup_tray()`，左键显示窗口、右键菜单
- **全局快捷键**：`Ctrl+Alt+Space`（可配置），行为由 `hotkey_behavior` 设置决定（command_bar / open_only）
- **事件桥**：`desktopShell.ts` 监听 Rust emit 的事件（`orbit://focus-search` 等）
- **外链拦截**：`externalOpen.ts` 拦截 `_blank` 链接，用系统浏览器打开

### 6.7 主题系统

- **默认主题**：`local-galaxy`（深空星系风格）
- **主题资产**：`src/theme/localGalaxyAssets.ts`（PNG 图片）
- **主题切换**：`set_active_theme` 命令 → 写 `settings` 表 → emit 事件 → 前端 `data-theme` 属性切换
- **CSS**：`:root[data-theme="local-galaxy"]` 和 `:root:not([data-theme="local-galaxy"])` 两套样式

---

## 七、Tauri 命令清单（61 个）

按功能分组：

| 分组 | 命令 |
|---|---|
| **快照/加载** | `catalog_snapshot` |
| **资源 CRUD** | `create_item` / `create_items_from_paths` / `update_item` / `delete_item` / `reorder_items` |
| **分组 CRUD** | `create_group` / `create_custom_group` / `delete_group` / `reorder_groups` |
| **分组热键** | `get_group_hotkeys` / `update_group_hotkey` |
| **Trip CRUD** | `list_trips` / `create_trip` / `update_trip` / `mark_trip_viewed` / `delete_trip` / `search_trips` / `trip_count_for_items` |
| **Obsidian vault** | `pick_obsidian_vault_path` / `list_obsidian_vaults` / `add_obsidian_vault` / `remove_obsidian_vault` / `scan_obsidian_vault` |
| **Obsidian 查询** | `list_obsidian_tasks` / `list_obsidian_notes` / `list_obsidian_note_tasks` / `search_obsidian` |
| **Obsidian 操作** | `toggle_obsidian_note_favorite` / `toggle_obsidian_task_completion` / `open_obsidian_note` / `open_obsidian_todo_window` / `set_todo_window_always_on_top` |
| **启动** | `launch_item` / `launch_target` / `reveal_target` |
| **扫描导入** | `scan_shortcuts` / `scan_browser_bookmarks` / `preview_scan_shortcuts` / `preview_scan_browser_bookmarks` / `import_scanned_items` |
| **设置** | `set_active_theme` / `set_density` / `set_close_behavior` / `set_safe_mode` / `set_auto_pinned_mode` / `set_display_mode` / `set_hotkey_behavior` / `update_global_hotkey` |
| **插件** | `set_plugin_enabled` / `read_plugin_runtime` / `record_plugin_runtime_event` / `create_plugin_template` |
| **备份** | `export_catalog_json` / `import_catalog_json` |
| **系统** | `pick_resource_input` / `pick_icon_image` / `open_data_directory` / `open_aux_window` / `get_autostart_enabled` / `set_autostart_enabled` |

---

## 八、关键路径（调试/重置必看）

| 用途 | 路径 |
|---|---|
| SQLite 数据库 | `%APPDATA%\OrbitStart\orbit.db` |
| WebView2 数据（localStorage） | `%LOCALAPPDATA%\local.orbitstart\EBWebView\Default\Local Storage\leveldb\` |
| 首次引导状态 | localStorage key `orbitstart_onboarding_v1` |
| 构建产物 exe | `src-tauri\target\release\orbitstart.exe` |
| NSIS 安装包 | `src-tauri\target\release\bundle\nsis\OrbitStart_x.x.x_x64-setup.exe` |
| 自动更新源 | `https://raw.githubusercontent.com/xuxinxi14/OrbitStart/main/latest.json` |

---

## 九、常用命令

```bash
npm run dev            # 前端开发服务器 (127.0.0.1:1420)
npm run tauri:dev      # Tauri 桌面应用（开发模式）
npm run build          # tsc --noEmit && vite build
npm run tauri:build    # 构建桌面安装包
npm run test:e2e       # Playwright
npm run test:custom    # 自定义 harness
```

---

## 十、已知边界

- 插件执行隔离早期阶段（Worker 驱动原型，无完整沙箱）
- Everything 搜索/窗口切换等有入口但缺原生 provider
- 自动更新/签名/release channel 已接入但未正式发布
- 主要面向 Windows（macOS/Linux 未适配）
- `App.tsx` 单文件 4972 行，后续可考虑拆分
