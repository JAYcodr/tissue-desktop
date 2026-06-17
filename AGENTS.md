# Agent Guide (Tissue Desktop)

> 本仓库是 [tissue](https://github.com/chris-2s/tissue) 的 Electron 桌面版。核心目标：**复用上游前后端代码，只做最小桌面化改造**，避免上游更新后难以合并。

This repo is a FastAPI + SQLite backend with a Vite/React frontend, wrapped in Electron for desktop use.

## Repo Map

- `app/`: FastAPI backend (mostly unchanged from upstream)
- `alembic/`, `alembic.ini`: DB migrations (SQLite by default)
- `frontend/`: Vite + React + TS + Ant Design UI (mostly unchanged from upstream)
- `electron/`: Electron main process, preload script, and builder configuration
- `scripts/`: build helpers, e.g. `build-backend.py` for PyInstaller
- `release/`: packaged Electron installers (treat as generated)
- `dist-electron/`: compiled Electron output (treat as generated)
- `backend_dist/`: PyInstaller-built backend executable (treat as generated)
- `nginx/`, `Dockerfile`, `entrypoint`: inherited from upstream, not used in desktop builds

## Build / Lint / Test Commands

### Desktop (Electron + Python sidecar)

From repository root:

- Install all deps: `npm install` (uses npm workspaces; installs frontend deps too)
- Dev mode: `npm run dev`
- Build frontend for desktop: `npm run build:frontend`
- Build Electron main/preload: `npm run build:electron`
- Build PyInstaller backend bundle: `npm run build:backend`
- Build + package Electron: `npm run build`
- Lint: `npm run lint`

The full `npm run build` pipeline:
1. Builds the frontend in desktop mode (`frontend/dist/`).
2. Compiles the Electron main/preload scripts (`dist-electron/`).
3. Runs PyInstaller to produce `backend_dist/tissue-backend` (or `.exe`).
4. Runs `electron-builder` and writes installers to `release/`.

The Electron main process (`electron/main/index.ts`) is responsible for:

- Starting the Python sidecar (`app.desktop_main:app` in dev, `backend_dist/tissue-backend` in production) on a free port.
- Setting `TISSUE_DESKTOP=1`, `TISSUE_DESKTOP_DATA_DIR`, and `TISSUE_DESKTOP_PORT`.
- Waiting for `/api/common/health` before showing the window.
- Providing IPC channels: `get-backend-url`, `get-user-data-path`, `open-directory`.

The preload script (`electron/preload/index.ts`) exposes a typed `window.electronAPI`.

The renderer uses `frontend/src/configs/desktop.ts` when Vite runs with `--mode desktop`.
The desktop config reads the backend URL from `window.electronAPI.backendUrl`, which already
includes the `/api` prefix because `app.desktop_main.py` mounts all backend routes under `/api`.

### Backend (Python)

Python deps are pinned in `requirements.txt`.

- Install deps (local dev)
  - `python -m venv .venv && source .venv/bin/activate`
  - `pip install -r requirements.txt`

- Run API server (local dev, desktop mode)
  - `uvicorn app.desktop_main:app --reload --host 127.0.0.1 --port 8000`

- DB migrations
  - Apply latest: `alembic upgrade head`
  - Create revision (manual edits likely needed): `alembic revision -m "message"`

- Basic “does it run” checks (since no linter/test suite is present)
  - Import/bytecode sanity: `python -m compileall app`

### Frontend (Vite + React)

From `frontend/`:

- Install: `npm install`
- Dev server: `npm run dev`
- Typecheck + build (Docker mode): `npm run build`
- Typecheck + build (Desktop mode): `npm run build:desktop`
- Lint: `npm run lint`

### Tests (and running a single test)

There are currently no tests in the repo (`tests/`, `pytest.ini`, `*.test.*`, etc. are absent).

If/when tests are added with `pytest`, standard single-test patterns are:

- One file: `pytest path/to/test_file.py`
- One test: `pytest path/to/test_file.py::test_name`
- One test by keyword: `pytest -k "keyword"`

If/when frontend tests are added (e.g. Vitest), prefer `npm run test -- <pattern>` and document the exact script here.

## Code Style / Conventions

### General

- **Do not break upstream**: prefer adding new files over editing files inherited from upstream.
- When you must edit an upstream file, add a comment marker:
  - Python: `# DESKTOP-MODIFIED: <reason>`
  - TypeScript/TSX: `// DESKTOP-MODIFIED: <reason>`
- Keep changes scoped: don’t hand-edit generated artifacts (notably `dist/`, `frontend/dist/`, `dist-electron/`, `backend_dist/`, and `release/`).
- Prefer small, reviewable diffs; avoid drive-by reformatting.
- Avoid committing secrets. This repo currently contains hard-coded secrets/defaults inherited from upstream (e.g. JWT secret and default admin password); do not add more.

### Path and config (desktop)

- Desktop runtime data (SQLite DB, logs, config) lives in the user app data directory:
  - macOS: `~/Library/Application Support/tissue-desktop/`
  - Windows: `%APPDATA%/tissue-desktop/`
- The backend sidecar binds to `127.0.0.1` on a dynamic free port.
- The frontend gets the backend URL via `window.electronAPI.getBackendUrl()` exposed in `electron/preload/`.

### Python (FastAPI backend)

**Imports**

- Use absolute imports within the app: `from app...` (consistent with existing code).
- Group imports: stdlib, third-party, local `app.*`. Keep groups separated by a blank line.

**Formatting**

- Match surrounding file style (this codebase is not uniformly formatted).
- 4-space indentation; avoid unnecessary vertical whitespace.

**Typing**

- Python 3.11 is used in Docker (`Dockerfile`), so modern typing is OK (`X | None`, `list[str]`).
- Use Pydantic v2 patterns (`model_dump()` etc.).
- Add type hints at boundaries: API handlers, dependency providers, service methods that are reused.

**Architecture / layering**

- API routes live in `app/api/*.py` and are registered in `app/api/__init__.py`.
- Keep route handlers thin: parse/validate inputs, call a service, return a response.
- Business logic lives in `app/service/*.py`.
- DB session is provided via `app.db.get_db()`; it also stores the session on `app.middleware.requestvars.g().db`.

**Responses**

- Successful responses typically use `app.schema.r.R` helpers:
  - `return R.ok(data)`
  - `return R.list(data, total=...)`

**Error handling**

- Prefer raising the project’s exceptions so global handlers apply:
  - `BizException` for expected 4xx business errors
  - `AuthenticationException` / `AuthorizationException` for auth failures
- Avoid bare `except:` in new code; catch expected exception types and re-raise a meaningful project exception.
- Use `app.utils.logger.logger` for errors/warnings instead of `print()`.

**Naming**

- Modules, functions, variables: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- FastAPI routers: module-level `router = APIRouter()`

**Security / config**

- Prefer environment variables or config files under `config/` for secrets.
- The JWT secret in `app/utils/security.py` is currently hard-coded; treat it as a deployment concern and avoid expanding this pattern.

### TypeScript/React (frontend)

**Tooling**

- TypeScript is `strict` (`frontend/tsconfig.json`).
- Lint is ESLint (`frontend/.eslintrc.cjs`). There is no Prettier config in this repo.

**Formatting**

- Match the file you touch (quote style and semicolons are currently mixed).
- Keep imports readable; avoid long relative import chains when a local index/export exists.

**Imports**

- Group imports roughly as: React/framework, third-party libs, local modules, then styles.
- Use `import type { ... }` for type-only imports when it improves clarity.

**API calls / auth**

- Use the shared Axios instance from `frontend/src/utils/requests.ts`.
- Auth token is injected via request interceptor; 401 triggers `store.dispatch.auth.logout()`.

**Config**

- Docker build uses `--mode docker` and expects API at `document.location.origin + '/api'` (`frontend/src/configs/docker.ts`).
- Desktop build uses `--mode desktop` and expects API at `window.electronAPI.backendUrl` (`frontend/src/configs/desktop.ts`).
- Development config currently points to a specific LAN host (`frontend/src/configs/development.ts`); don’t hard-code new environment-specific URLs.

### Electron (desktop)

**Structure**

- `electron/main/index.ts`: main process, window lifecycle, Python sidecar management.
- `electron/preload/index.ts`: isolated preload script, exposes `window.electronAPI`.
- `electron/electron.d.ts`: TypeScript declarations for `window.electronAPI`.
- `electron/builder.config.cjs`: `electron-builder` packaging configuration.
- `electron/resources/`: static assets such as icons.

**Safety**

- Keep `contextIsolation: true` and `nodeIntegration: false` in `webPreferences`.
- All main-to-renderer communication goes through `contextBridge.exposeInMainWorld`.
- Do not expose raw Node APIs to the renderer.

**Build**

- Root `tsconfig.json` compiles `electron/**/*.ts` into `dist-electron/`.
- `npm run build:electron` runs `tsc`.
- `npm run build:backend` runs `scripts/build-backend.py` (PyInstaller).
- `electron-builder` packages `dist-electron/`, `frontend/dist/`, and `backend_dist/tissue-backend*` via `extraResources`.

## Cursor / Copilot Rules

- No Cursor rules found (`.cursor/rules/` or `.cursorrules` not present).
- No GitHub Copilot instructions found (`.github/copilot-instructions.md` not present).

---

## Project Standards (2026-06-18)

> 本章节替代并补充 `Code Style / Conventions` 中未覆盖的执行细节。规范中的反例和修复均来自实际代码审查中发现的真问题，不是模板。
> 独立参考文件：`docs/standards/release-workflow.md`、`docs/standards/code-style.md`。

---

### 1. 发版工作流

#### 1.1 版本号唯一权威源

`package.json` 的 `version` 字段是**唯一可信版本号**。`version.py` 由 `scripts/sync-version.js` 自动生成，**不提交到 Git**（已入 `.gitignore`）。

发版 PR 前必须手动 bump `package.json` 版本（如 `1.0.1` → `1.0.2`），然后运行 `npm run sync:version` 生成 `version.py`。

#### 1.2 PR 拦截

`.github/workflows/check-version.yml` 在 PR 时检查：若修改了 release-relevant 文件但 `package.json` 的 `version` 未 bump → CI 失败，报错 `"发版前必须手动 bump package.json 版本号"`。

release-relevant 文件范围：`electron/**`、`app/**`、`frontend/**`、`requirements.txt`、`package.json`（version 本身）、`scripts/**`、`.github/workflows/build-desktop.yml`。

#### 1.3 合并后自动发布

合并到 `main` 后 CI 自动构建并发布到 GitHub Releases。`electron/builder.config.cjs` 中的 `publish.releaseType` 必须是 `release`（不是 `draft`），因为 `draft` 类型会导致 electron-builder 对同名 version **静默跳过资产上传**。

同名 version 已存在时，electron-builder 会自动删除旧资产并上传新资产。建议每次严格 bump 版本号，避免覆盖。

---

### 2. 代码执行规范（新增）

#### 2.1 禁止模块级初始化依赖外部状态

模块 `import` 时不得执行以下操作：文件系统操作（`mkdir`、`writeFile`）、环境变量读取（`os.environ.get()`）、网络请求、数据库连接。这些操作必须延迟到**函数调用时**。

**反例**（`app/utils/cache.py` 模块导入时）：
```python
# 错误：import 时立即依赖环境变量，如果 import 顺序变化行为即变
data_dir = get_data_dir()
if not data_dir.exists():
    data_dir.mkdir(parents=True, exist_ok=True)
cache_path = get_cache_dir()
```

**修复**：
```python
# 延迟到函数调用时读取
def _ensure_cache_dir() -> Path:
    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return get_cache_dir()

def get_cache_path(parent: str, path: str) -> str:
    cache_path = _ensure_cache_dir()
    ...
```

白名单：纯常量定义、不依赖外部状态的类型声明可以在模块级定义。

#### 2.2 禁止静默回退到硬编码值

配置项如果依赖 IPC/环境变量读取，**不可以用 `||` 静默回退**到硬编码值。静默回退会让启动失败时的调试变得极其困难。

**反例**（`frontend/src/configs/desktop.ts`）：
```ts
// 错误：backendUrl 为 undefined 时回退到错误的 8000 端口
BASE_API: window.electronAPI?.backendUrl || "http://127.0.0.1:8000/api"
```

**修复**：
```ts
const api = window.electronAPI?.backendUrl;
if (!api) {
    throw new Error("[desktop] backendUrl not available from preload");
}
const config: ConfigProperties = { BASE_API: api };
```

#### 2.3 禁止宽泛 `catch`

`except Exception:` 和 `catch (error)` 捕获了不该处理的异常（如 `KeyboardInterrupt`、`SystemExit`、权限错误），掩盖真正问题。

**反例**（`scripts/build-backend.py`）：
```python
except Exception:  # 捕获了 ImportError、PermissionError、KeyboardInterrupt
    print("PyInstaller not found, installing...")
```

**修复**：
```python
except (ImportError, ModuleNotFoundError):
    print("PyInstaller not found, installing...")
```

TypeScript 中同样：Promise 拒绝必须 `.catch` 并记录，禁止空 `catch` 块。

#### 2.4 路径计算使用 `__dirname` / `__file__`

禁止依赖 `process.cwd()` 或相对路径计算文件位置。脚本运行目录变化时 cwd 会漂移。

**反例**（`frontend/vite.config.ts`）：
```ts
fs.writeFileSync('.dev-server-port', String(addr.port));  // 依赖 cwd
```

**修复**（ESM 文件使用 `import.meta.url`，非 `__dirname`）：
```ts
import { resolve } from 'node:path';
const DEV_PORT_FILE = resolve(new URL('.', import.meta.url).pathname, '.dev-server-port');
fs.writeFileSync(DEV_PORT_FILE, String(addr.port));
```

#### 2.5 类型安全防御

导出的配置对象必须验证 key 存在，防止 mode 拼写错误导致 `undefined` 穿透。

**反例**（`frontend/src/configs/index.ts`）：
```ts
export default configs[mode];  // mode 拼写错误时返回 undefined
```

**修复**：
```ts
const config = configs[mode];
if (!config) {
    throw new Error(`[config] unknown build mode: ${mode}`);
}
export default config;
```

#### 2.6 日志统一前缀

`console.error` 和 `logger` 必须带前缀区分来源，避免多进程日志混在一起无法追踪。

推荐前缀：`[backend]`（Python sidecar）、`[shell]`（外部程序调用）、`[renderer]`（前端渲染进程）、`[electron]`（主进程）。

```ts
// 正确
console.error('[backend] Process exited with code', code);
console.error('[shell] failed to open external URL:', error);

// 错误（没有前缀，无法区分来源）
console.error('Failed to start:', error);
```

#### 2.7 环境变量初始化顺序

所有环境变量**必须在依赖它的模块 import 之前设置完毕**，或者由模块自身负责初始化。

**正确模式**：
```python
_bootstrap_desktop_env()  # 先设置 TISSUE_DESKTOP 等环境变量
from app.main import app as fastapi_app  # 安全：环境变量已就绪
```

---

### 3. 提交前自检清单

每个 Agent 提交前逐项检查：

- [ ] 对上游文件的修改都加了 `DESKTOP-MODIFIED: <原因>` 注释
- [ ] 没有模块级文件系统操作（`mkdir`、`writeFile` 等延迟到函数调用）
- [ ] 没有 `||` 静默回退到硬编码值（特别是 URL、端口）
- [ ] `catch` 块不是空的，异常要么记录要么重新抛出
- [ ] `Promise` 拒绝都有 `.catch` 或 `try/await`
- [ ] 环境变量在依赖它的模块 import 前已设置
- [ ] 日志有统一前缀（`[backend]`、`[shell]`、`[renderer]`）
- [ ] 如果是发版相关修改，`package.json` 的 version 已 bump 且 `sync:version` 已运行
