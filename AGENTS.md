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
