# 审计 Phase 1：范围理解

> 审计时间: 2026-06-25
> 模式: 深度审计（多 Agent 并行）

## 项目概要

**Tissue Desktop** — Electron 桌面版教师教材刮削工具。上游 [chris-2s/tissue](https://github.com/chris-2s/tissue) 的桌面化分支。核心目标：**复用上游前后端代码，只做最小桌面化改造**。

## 模块拓扑

```
Tissue Desktop
├── app/ (FastAPI Backend) — 57 个 .py 文件
│   ├── api/           — 13 个路由模块
│   ├── service/       — 11 个业务服务
│   ├── db/            — 数据库模型 + 事务
│   ├── middleware/    — CORS + request vars
│   ├── exception/     — 统一异常处理
│   ├── dependencies/  — 安全依赖注入
│   ├── schema/        — Pydantic 模型
│   ├── utils/         — 工具函数（含 4 个蜘蛛）
│   ├── main.py        — 原生入口
│   └── desktop_main.py — 桌面版入口
├── electron/ (Desktop Shell) — 3 个 .ts 文件
│   ├── main/index.ts       — 进程管理 + 窗口
│   ├── preload/index.ts    — IPC 桥接
│   └── builder.config.cjs  — 打包配置
├── frontend/ (Vite + React) — 75+ 个 .ts/.tsx 文件
│   ├── src/routes/         — 13 个页面路由
│   ├── src/components/     — 15 个组件
│   ├── src/apis/           — 12 个 API 模块
│   ├── src/configs/        — 3 个构建模式配置
│   ├── src/models/         — Rematch store
│   └── src/utils/          — 前端工具函数
├── scripts/ — 3 个构建脚本
├── .github/workflows/ — 4 个 CI 工作流
└── docs/ — 规范与 Spec 文档
```

## 核心流程（共 6 条）

| # | 流程 | 入口 | 出口 |
|---|------|------|------|
| F1 | **桌面启动** | Electron `whenReady` → startBackend → createWindow | 前端 UI 就绪 |
| F2 | **视频刮削** | 用户输入番号 → SpiderService → 多站点并发刮削 → 合并 → 保存 NFO/封面 | 视频元数据 |
| F3 | **下载整理** | qBittorrent 下载完成 → job_scrape_download → scrape_download → trans → NFO | 文件系统 |
| F4 | **订阅下载** | 定时任务 → do_subscribe → 匹配条件 → qBittorrent 下载 | 下载队列 |
| F5 | **Cookie 同步** | CookieCloud sync (定时/手动) → site cookies 更新 | DB |
| F6 | **版本检查** | `/api/common/version` → GitHub raw → 对比版本号 | 前端显示 |

## 架构来源可信度评估

| 文档 | 状态 | 评估 |
|------|------|------|
| `README.md` | ✅ 存在，较新 | 可信，描述项目定位和构建方式 |
| `AGENTS.md` | ✅ 存在，389行，2026-06-18 更新 | 可信，含详细架构、规范、提交检查清单 |
| `docs/specs/2026-06-17-*` | ✅ 存在 | 可信，记录了桌面版实现细节 |
| `docs/specs/2026-06-18-*` | ✅ 存在 | 可信，项目标准规范 |
| `docs/standards/` | ✅ 存在 | 可信，代码风格和发布流程 |
| 独立 `ARCHITECTURE.md` | ❌ 不存在 | 🔧 架构信息从 `AGENTS.md` 和代码反向推导 |

## 并行审计拆分计划

| Agent | 范围 | 文件数 | 重点 |
|-------|------|--------|------|
| Agent A | `app/api/` + `app/db/` + `app/middleware/` + `app/exception/` + `app/dependencies/` + `app/schema/` + `app/scheduler.py` | ~35 | 路由闭环、DB 模型一致性、异常处理覆盖 |
| Agent B | `app/service/` + `app/utils/` | ~25 | 业务逻辑闭环、蜘蛛调用链、缓存、通知 |
| Agent C | `electron/` + `scripts/` + `.github/` + `config/` + `frontend/src/configs/` | ~12 | 桌面壳流程、构建脚本、CI/CD 工作流 |
| Agent D | `frontend/src/`（routes/components/apis/models/utils） | ~50+ | 前端路由闭环、API 调用链、状态管理 |

## 已知问题

- 无正式 Bug 清单（无 pytest / tests 目录）
- 上游硬编码 JWT secret 和默认密码（已记录在 AGENTS.md 中）
- 无 Prettier 配置，代码风格不统一
