# 任务 Spec：Tissue Desktop（Electron 桌面版）

> 文件位置：`docs/specs/2026-06-17-tissue-desktop-electron.md`

---

## 1. 需求背景（Why）

- **用户原始需求**：将 `/Volumes/hamelin-ssd/开发/Jav工具/tissue` 移植为 mac/Windows 桌面应用，开发目录为 `/Volumes/hamelin-ssd/开发/Jav工具/tissue desktop`。
- **痛点/动机**：原项目仅提供 Docker 部署，桌面用户需要更轻量的安装方式；Docker 版本为上游项目，本仓库为独立桌面版本，需避免破坏原项目结构以便上游更新后维护。
- **预期收益**：用户无需 Docker 即可在 mac/Windows 上运行完整的 Tissue 功能。

---

## 2. 范围边界（What & How Much）

- **目标**：基于 Electron 构建一个桌面应用，完整复用现有 React 前端和 FastAPI 后端功能。
- **MVP 范围**：
  - Electron 主进程 + 预加载脚本 + 渲染进程。
  - 将 Python FastAPI 后端作为 sidecar 随 Electron 启动/关闭。
  - 前端通过 IPC 获取后端地址，复用现有 UI。
  - 桌面版数据库、日志、配置存放到用户应用数据目录。
  - 开发模式可本地热更新。
- **明确不做**：
  - 不改上游 `tissue` 原仓库。
  - 不替换或大幅重构后端业务逻辑。
  - 本次不做 Linux 桌面版（可先留扩展接口）。
- **后续迭代**：
  - 自动更新（auto-updater）。
  - 安装包签名（macOS notarization、Windows 证书）。
  - 更深度的系统托盘/菜单集成。

---

## 3. 技术约束

- **能否加依赖**：可以。Electron、electron-builder、concurrently、wait-on 等桌面相关依赖允许新增。
- **能否改现有接口**：可以，但**必须**在副本 `tissue desktop` 内修改，且优先新增文件而非修改原文件。
- **能否动配置文件**：可以新增 `electron/`、`desktop/` 等目录和配置文件，尽量少改原 `frontend/`、`app/` 文件。
- **技术栈限制**：
  - 桌面框架：**Electron**。
  - 前端：复用现有 Vite + React + TS。
  - 后端：复用现有 FastAPI + SQLite + Alembic。
  - 打包：`electron-builder`，后端使用 Python 源码运行或 PyInstaller 打包。

---

## 4. 验收标准（Definition of Done）

- [ ] **功能验收**：
  - 桌面应用可在 macOS 和 Windows 上启动。
  - 登录页面正常显示，默认账号 `admin` / `password` 可登录。
  - 媒体库扫描、刮削、设置等核心功能可用。
- [ ] **测试要求**：
  - 开发模式 `npm run dev` 能同时启动后端和 Electron。
  - 生产构建 `npm run build` 能生成前端资源并打包 Electron。
  - 至少在一个平台上完成安装包构建（macOS 或 Windows）。
- [ ] **代码质量**：
  - 不引入未使用的依赖。
  - 修改原项目文件的地方必须注释说明 `// DESKTOP-MODIFIED: ...`。
  - 类型检查、ESLint 无新增错误。
- [ ] **交付物**：
  - 更新 `README.md`（桌面版运行/构建说明）。
  - 更新 `AGENTS.md`（桌面版开发约定）。
  - 维护 `docs/specs/` 下的本 Spec。
- [ ] **验证方式**：
  - 提供开发模式启动截图。
  - 提供构建产物目录截图或构建日志。

---

## 5. 关联影响

- **影响模块**：
  - 新增 `electron/` 目录（主进程、预加载脚本、构建配置）。
  - 新增/修改根目录 `package.json`、`tsconfig.json` 等。
  - 可能微调 `frontend/src/configs/` 增加 `desktop.ts` 模式。
  - 可能新增 `app/desktop.py` 或类似入口，用于桌面版后端启动。
- **数据库变更**：无 schema 变更，仅数据目录从 `/app/config` 改为用户应用数据目录。
- **接口变更**：无 REST API 变更。
- **依赖任务**：无。
- **冲突风险**：
  - 多 Agent 并行时，需避免同时修改同一份原项目文件。
  - 接口约定（如 IPC 通道名、后端端口获取方式）需先达成一致。

---

## 6. 多 Agent 协作

- [x] 当前项目是否多 Agent 并行？<!-- 是 / 否 --> 是
- [x] 是否已配置独立 commit 身份？<!-- 是 / 否 --> 是（当前 Agent 已配置为 `Kimi-CLI`）
- [ ] 分支名称：`agent/<Agent名>/<功能>`
- [ ] 是否已确认无分支冲突？<!-- 是 / 否 -->

> **协作约定**：每个 Agent 从 `main` 切出独立分支，完成后合并回 `main`；禁止跨 Agent 分支直接提交。

---

## 7. 实现方案（开工后填写）

### 7.1 架构概览

```
┌─────────────────────────────────────────────┐
│  Electron Main Process (Node.js)            │
│  - 启动 Python FastAPI sidecar              │
│  - 管理窗口生命周期                          │
│  - 提供 IPC: getBackendUrl, openDirectory   │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Electron Preload (isolated context)          │
│  - 暴露安全的 window.electronAPI              │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Renderer (React + Vite frontend)             │
│  - 复用现有 UI                                │
│  - 通过 electronAPI 获取后端地址              │
│  - Axios 请求本地 FastAPI                     │
└─────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Python FastAPI Sidecar                       │
│  - 监听 127.0.0.1:<随机端口>                  │
│  - SQLite 数据库在用户应用数据目录            │
│  - 启动时运行 alembic upgrade head            │
└─────────────────────────────────────────────┘
```

### 7.2 关键设计决策

1. **Electron 而非 Tauri**：用户明确指定 Electron，生态成熟，便于打包和调试。
2. **Python sidecar 而非重写后端**：完整复用原 FastAPI 后端，避免业务逻辑分叉。
3. **动态后端端口**：主进程启动后端时分配空闲端口，避免端口冲突；通过 IPC 通知前端。
4. **用户应用数据目录**：
   - macOS: `~/Library/Application Support/tissue-desktop/`
   - Windows: `%APPDATA%/tissue-desktop/`
5. **最小化原文件修改**：
   - 新增 `frontend/src/configs/desktop.ts` 而不是改 `docker.ts`。
   - 新增 `app/desktop_main.py` 而不是改 `app/main.py`。
   - 如必须修改原文件，使用 `// DESKTOP-MODIFIED: <原因>` 注释。

### 7.3 文件变更清单（预估）

| 类型 | 路径 | 说明 |
|------|------|------|
| 新增 | `electron/main/index.ts` | Electron 主进程 |
| 新增 | `electron/preload/index.ts` | 预加载脚本 |
| 新增 | `electron/builder.config.cjs` | electron-builder 配置 |
| 新增 | `electron/resources/` | 图标等静态资源 |
| 新增 | `app/desktop_main.py` | 桌面版后端入口 |
| 新增 | `frontend/src/configs/desktop.ts` | 桌面版前端配置 |
| 修改 | `frontend/src/configs/index.ts` | 增加 desktop 模式导出 |
| 修改 | `frontend/package.json` | 增加 desktop 构建脚本 |
| 新增 | `package.json` | 根目录 Electron 工作区配置 |
| 修改 | `.gitignore` | 忽略 Electron/Python 构建产物 |
| 修改 | `README.md` | 桌面版说明 |
| 修改 | `AGENTS.md` | 桌面版开发约定 |

### 7.4 风险点

- **Python 依赖打包**：`curl_cffi`、`lxml`、`pillow` 等可能涉及原生二进制，PyInstaller 打包可能失败。
- **前端路径引用**：原前端在 Docker 中通过 Nginx 反向代理 `/api`，桌面版需要改为直接请求后端端口。
- **文件系统权限**：桌面版需要访问用户选择的媒体目录，需使用 Electron `dialog` 或 Node.js 权限。
- **Alembic 路径**：桌面版运行环境改变，Alembic 需能定位到正确的 SQLite 路径和 migrations 目录。

### 7.5 回滚策略

- 保留 `main` 分支干净，所有改动在 `agent/<Agent名>/<功能>` 分支上进行。
- 合并前通过 `git diff main` 审查改动范围。
- 如打包失败，可回退到仅源码运行的开发模式。

---

## 8. Spec 追溯记录

| 日期 | 变更内容 | 变更人 | 关联 PR |
|------|---------|--------|---------|
| 2026-06-17 | 创建初始 Spec | Kimi-CLI | - |
|      |         |        |         |
