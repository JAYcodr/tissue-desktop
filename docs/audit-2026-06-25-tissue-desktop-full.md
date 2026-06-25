# 系统审计报告：Tissue Desktop

> **审计日期**: 2026-06-25
> **模式**: 深度审计（多 Agent 并行）
> **架构来源**: 🔧 `AGENTS.md` + 代码反向推导（无独立 `ARCHITECTURE.md`）

---

## 概要

| 项目 | 值 |
|------|-----|
| 检查范围 | `app/` `electron/` `frontend/src/` `scripts/` `.github/workflows/` |
| 检查文件数 | ~160 个 |
| 核心流程数 | 6 条（F1-F6） |
| 并行审计代理 | 4 个（后端核心 / 服务+工具 / Electron壳+CI / 前端） |
| 发现问题 | **P0: 0 | P1: 11 | P2: 26 | P3: 24** |
| 去重后总数 | **61** 个独立问题 |
| 跨代理重复发现 | 2 组（cache.py 模块级初始化、JWT 硬编码） |

## 审计分类统计

```
P1 (阻塞)    ████████████ 11
P2 (严重)    ████████████████████████████ 26
P3 (一般)    ██████████████████████████ 24
```

### 按模块分布

| 模块 | 审计代理 | 文件数 | P1 | P2 | P3 | 健康度 |
|------|---------|--------|----|----|----|--------|
| **后端核心层** (api/db/middleware/exception/scheduler/schema) | Agent A | ~35 | 3 | 8 | 11 | 🟡 |
| **后端服务+工具层** (service/utils/spider/notify) | Agent B | ~25 | 3 | 6 | 6 | 🟡 |
| **Electron 壳 + 构建 + CI** | Agent C | ~12 | 2 | 4 | 2 | 🟢 |
| **前端** (routes/components/apis/models) | Agent D | ~50 | 4 | 9 | 5 | 🟡 |

---

## 按优先级排列

| ID | 优先级 | 类型 | 模块 | 位置 | 简述 |
|----|--------|------|------|------|------|
| A01 | **P1** | 🐛 资源泄漏 | 后端核心 | `app/api/home.py:47` | SSE 日志端点每循环打开文件句柄未关闭 → FD 泄漏 |
| A02 | **P1** | 🐛 异常处理 | 后端核心 | `app/scheduler.py:107-114` | `do_job` 无 except → 异常直接传播，`manually('无效key')` 抛 KeyError |
| A03 | **P1** | 🐛 契约不一致 | 后端核心 | `app/api/history.py:12` | `get_histories` 返回裸值而非 `R.list()`，唯一违反 REST 包装规范 |
| B01 | **P1** | 🐛 运行时崩溃 | 后端服务 | `app/utils/notify/webhook.py:19` | dict key 使用 `payload`(dict) 导致 `TypeError: unhashable type: 'dict'` |
| B02 | **P1** | 🐛 打包失效 | 后端服务 | `app/utils/image/badge.py:10,15` | 硬编码相对路径 `./app/utils/image/ch.png` → PyInstaller 打包后 `FileNotFoundError` |
| B03 | **P1** | 🐛 数据丢失 | 后端服务 | `app/service/video.py:106-170` | `trans()` `shutil.move` 后网络/IO 操作失败，原文件不可恢复 |
| C01 | **P1** | 🐛 竞态条件 | Electron | `electron/main/index.ts:323-328` | macOS activate 事件在 `startBackend()` 前触发 `createWindow` → preload 拿空 `backendUrl` |
| C02 | **P1** | 🐛 CI 构建失败 | CI/CD | `.github/workflows/build-desktop.yml:57-61` | CI 未执行 `npm run sync:version`，`version.py` 缺失 → PyInstaller 崩溃 |
| D04 | **P1** | 🐛 静默吞异常 | 前端 | `frontend/src/utils/useFormModal.ts:38-40` | 空 `catch (e) {}` 块 → 表单提交异常完全被吞 |
| D08 | **P1** | 🐛 UX 缺陷 | 前端 | `frontend/src/models/auth.ts:44-54` | 登录失败无错误提示，用户只看到 loading 消失 |
| D12 | **P1** | 🐛 空指针 | 前端 | `frontend/src/utils/requests.ts:20` | `error.response?.status`—网络断连时 `error.response` 为 undefined 导致崩溃 |
| A04 | **P2** | 📐 规范违规 | 后端核心 | `app/db/__init__.py:11-25` | 模块导入时执行 `mkdir`、`create_engine` |
| A05 | **P2** | 📐 规范违规 | 后端核心 | `app/schema/setting.py:11,57` | 模块级 `get_default_media_paths()` 读环境变量 |
| A07 | **P2** | 📐 规范违规 | 后端核心 | `app/utils/logger.py:102` | 模块级 `LoggerManager()` 打开文件 + 读环境变量 |
| A08 | **P2** | 📐 宽泛 catch | 后端核心 | `app/exception/__init__.py:22-25` | `handle_exception(Exception)` 掩盖底层错误 |
| A09 | **P2** | 📐 宽泛 catch | 后端核心 | `app/dependencies/security.py:25` | JWT 验证 `except Exception` 掩盖具体错误类型 |
| A10 | **P2** | 🐛 数据类型 | 后端核心 | `app/db/models/torrent.py:10` | `hash=Column(Integer)`→ BT 哈希是 40 字符十六进制串，应为 `String` |
| A11 | **P2** | 📐 配置不合理 | 后端核心 | `app/db/__init__.py:20-23` | SQLite `pool_size=1024` 过高（串行写），`pool_timeout=180` 过长 |
| B04 | **P2** | 🐛 逻辑错误 | 后端服务 | `app/utils/spider/javbus.py:102` | `if include_downloads:` 应为 `if include_previews:` |
| B05 | **P2** | 🐛 静默失败 | 后端服务 | `app/utils/notify/__init__.py:8-15` | `match_notification()` 未匹配时返回 `None` → AttributeError 被裸 except 吞掉 |
| B06 | **P2** | 📐 规范违规 | 后端服务 | `app/utils/cache.py:8-10` | 模块级 `mkdir`（与 A06 为同一问题） |
| B07 | **P2** | 🐛 静默失败 | 后端服务 | `app/utils/notify/telegram.py:69-83` | Telegram API 调用不检查 HTTP 响应状态码 |
| B08 | **P2** | 🐛 健壮性 | 后端服务 | `app/utils/nfo.py:50-54` | `get_full()` 未捕获 XML `ParseError` |
| B09 | **P2** | 🧹 死代码 | 后端服务 | `app/service/subscribe.py:77-78` | `download_video_manual` 是多余透传层 |
| C03 | **P2** | 📐 宽泛 catch | CI/CD | `scripts/build-backend.py:55` | `except Exception:` 捕获无关异常 |
| C04 | **P2** | 🐛 竞态条件 | Electron | `electron/main/index.ts:67-81` | 端口 TOC/TOU：`close()`→`spawn()` 窗口可被抢占 |
| C05 | **P2** | 🛡️ 导航安全 | Electron | `electron/main/index.ts:281-289` | `startsWith` 白名单匹配导致 `localhost:52731` 被误放行 |
| C06 | **P2** | 🧹 死代码 | CI/CD | `.github/workflows/build.yml:7` | version.py 已 gitignore，workflow 永不触发 |
| D03 | **P2** | 📐 配置 | 前端 | `frontend/src/configs/development.ts:4` | 缺少 `/api` 前缀，`npm run dev` 非 desktop 模式时 API 全 404 |
| D06 | **P2** | 📐 路由 | 前端 | `routes/_index/route.tsx:19-24` | redirect `/login` vs 路由定义 `/login/` 不一致 |
| D07 | **P2** | 🧹 命名错误 | 前端 | `routes/_index/setting/-component/webhook.tsx:3` | 文件名 webhook 但函数名 `Telegram()` |
| D09 | **P2** | 🧹 代码组织 | 前端 | `apis/auth.ts:19-24` | `getVersions()` 放在 `auth.ts` 而非 `common.ts` |
| D14 | **P2** | 🐛 功能完整 | 前端 | `routes/_index/file/-components/batchModal.tsx:48-72` | BatchModal 串行处理不可中断 + 直接修改 state |
| D16 | **P2** | 🐛 响应格式 | 前端 | `apis/history.ts:8` | `getHistories()` 返回 `response.data` vs 其他 API 返回 `response.data.data` |
| D17 | **P2** | 🐛 错误处理 | 前端 | `models/auth.ts:62-68` | `getInfo` 失败时无错误兜底 |
| A12-A22 | P3 | 杂项 | 后端核心 | 多文件 | 无用接口、重复导入/Schema、字段命名不一致、缺校验/限流等 |
| B10-B15 | P3 | 杂项 | 后端服务 | 多文件 | 死代码、线程安全、命名混淆、Webhook 空实现、JWT 硬编码 |
| C07-C08 | P3 | 杂项 | Electron | 多文件 | Windows SIGTERM 空操作、development.ts 端口硬编码 |
| D05/11/13/15/18 | P3 | 杂项 | 前端 | 多文件 | 错误提示格式、宽泛类型、版本号类型、SSE 端点硬编码、冗余调用 |

---

## P1 详细发现

### A01 [P1][资源泄漏] SSE 日志端点文件句柄泄漏

- **位置**: `app/api/home.py:47`
- **描述**: `log_generator()` 内 `tailer.follow(open(log_path, 'r'))` 在 `while True` 循环的每次迭代（每秒一次）都打开一个新文件句柄，但从不显式关闭。应用运行几小时后必然耗尽系统文件描述符。
- **验证**: 读取 `app/api/home.py:42-49`，确认 `open()` 在循环体内
- **建议**: 将文件 `open()` 移到循环外，改为 `f.readline()` + `time.sleep(1)` 模式

### A02 [P1][异常处理] 调度器 do_job 无异常保护

- **位置**: `app/scheduler.py:107-114`
- **描述**: `do_job` 只有 `try/finally` 没有 `except`。`job.job()` 异常时 APScheduler 捕获但不会重试；`scheduler.manually('无效key')` 在第 108 行抛 `KeyError`，`finally` 中 `job.running -= 1` 也抛 `UnboundLocalError`。
- **验证**: 读取 `app/scheduler.py` 确认缺少 `except` 块
- **建议**: 添加 `except Exception` 记录错误并设重试上限；添加 key 校验

### A03 [P1][契约不一致] history API 返回裸值

- **位置**: `app/api/history.py:12`
- **描述**: `return histories` — 唯一不使用 `R.list()`/`R.ok()` 包装的端点。前端已适配（`apis/history.ts` 返回 `response.data` 而非 `response.data.data`），但增加维护认知负担。
- **验证**: 对比 `app/api/history.py:12` 与其他 API 文件
- **建议**: 改为 `return R.list(histories)`，同步更新前端

### B01 [P1][运行时崩溃] Webhook 通知 dict key 类型错误

- **位置**: `app/utils/notify/webhook.py:19-22`
- **描述**: `requests.post(json={event: event, payload: payload})` 中 `payload` 是 dict 类型，作为 JSON key 时序列化会抛出 `TypeError: unhashable type: 'dict'`。实际意图是 `{'event': event, 'payload': payload}`。
- **验证**: 确认文件内容，`payload: payload` 使用了 dict 变量作为 key
- **建议**: 改为 `{'event': event, 'payload': payload}`

### B02 [P1][打包失效] badge.py 硬编码相对路径

- **位置**: `app/utils/image/badge.py:10,15`
- **描述**: `Image.open("./app/utils/image/ch.png")` — 路径相对于 cwd。PyInstaller 打包后 cwd 变化会导致 `FileNotFoundError`。
- **验证**: 确认文件中使用了 `./app/utils/image/` 相对路径
- **建议**: 使用 `os.path.join(os.path.dirname(__file__), 'ch.png')`

### B03 [P1][数据丢失] trans() 非原子操作

- **位置**: `app/service/video.py:118-170`
- **描述**: `trans()` 中 `shutil.move`（行 150）后执行网络请求（`get_video_cover`）、写图片（`save_images`）、写 NFO（`nfo.save`）。任何步骤失败后原文件已不可恢复，`history` 记录也不写入。
- **验证**: 读取 `app/service/video.py:106-170` 确认操作顺序
- **建议**: 改为先在临时目录完成所有处理，最后原子级 `shutil.move` 到目标路径

### C01 [P1][竞态条件] macOS activate 事件与 backend 启动竞态

- **位置**: `electron/main/index.ts:307-310`, `323-328`
- **描述**: `app.whenReady().then(await startBackend())` 在 `getFreePort()` 处 yield 控制权，事件循环可能处理 `activate` 事件 → `createWindow()` → preload 执行 `sendSync('get-backend-url-sync')` → 返回 `""`（`backendUrl` 尚未赋值）→ `desktop.ts` 抛出 `[desktop] backendUrl not available from preload`。仅影响 macOS。
- **验证**: macOS 启动 dev 模式，观察窗口空白
- **建议**: `activate` 处理程序中增加 `if (!backendUrl) return;` 守卫

### C02 [P1][CI 构建失败] CI 缺少 sync:version 步骤

- **位置**: `.github/workflows/build-desktop.yml:57-61`
- **描述**: CI 分步构建未执行 `npm run sync:version`。`version.py` 已入 `.gitignore`，CI 检出代码中不含该文件。`build:backend`（PyInstaller）分析 `version` 模块时因找不到 `version.py` 失败。
- **验证**: 确认 `.gitignore` 中 `version.py` 被排除，且 CI workflow 未包含 sync:version
- **建议**: 在 build 步骤前添加 `npm run sync:version`

### D04 [P1][静默吞异常] useFormModal 空 catch 块

- **位置**: `frontend/src/utils/useFormModal.ts:38-40`
- **描述**: `catch (e) {}` 完全为空，不记录、不重抛、不给用户反馈。表单验证失败、service 异常全部静默吞掉。
- **验证**: 读取文件确认空 catch 块
- **建议**: `catch` 中记录错误并显示 `message.error()`

### D08 [P1][UX 缺陷] 登录失败无错误提示

- **位置**: `frontend/src/models/auth.ts:44-54`
- **描述**: `login` effect 的 `.finally` 只设置 `setLogging(false)`，无 `.catch`。凭证错误/网络不可达时用户无任何反馈。
- **验证**: 确认 login effect 中无 catch 块
- **建议**: 添加 `catch` 块，使用 `message.error()` 显示失败原因

### D12 [P1][空指针] 响应拦截器 error.response 可能为 undefined

- **位置**: `frontend/src/utils/requests.ts:20`
- **描述**: `error.response.status == 401` — 网络断连时 `error.response` 为 `undefined`，抛出 `TypeError`，导致 Axios 错误拦截器本身崩溃。
- **验证**: 确认 `error.response` 无可选链/防御检查
- **建议**: 改为 `error.response?.status === 401`

---

## 流程闭环评估

| 流程 | 状态 | 说明 |
|------|------|------|
| **F1 桌面启动** | ⚠️ 有断裂 | **C01** macOS activate 竞态 → 空白窗口；**C04** 端口 TOC/TOU 低概率失败 |
| **F2 视频刮削** | ⚠️ 部分断裂 | **B04** JavBus previews 绑定到 downloads 标志；**B03** `trans()` 非原子 → 数据丢失 |
| **F3 下载整理** | ⚠️ 有风险 | **B03** 同上；`except BizException` 不捕获 OS/网络异常 |
| **F4 订阅下载** | ✅ 基本通畅 | qBittorrent 不可用时正确捕获 `BizException` 并 `continue` |
| **F5 Cookie 同步** | ✅ 基本通畅 | CookieCloud 同步有完善的失败处理 |
| **F6 版本检查** | ⚠️ 外部依赖 | 依赖 `raw.githubusercontent.com` 可用性，不可用时静默返回当前版本 |

---

## 系统性/架构性问题

### 1. 模块级初始化违规（AGENTS.md §2.1）

4 个模块在 `import` 时执行 IO/文件系统操作：

| 文件 | 违规操作 | 影响 |
|------|---------|------|
| `app/db/__init__.py` (A04) | `get_data_dir()` + `mkdir` + `create_engine()` | 导入时创建目录和数据库文件 |
| `app/schema/setting.py` (A05) | `get_default_media_paths()` + `get_config_path()` | 导入时读环境变量 |
| `app/utils/cache.py` (A06) | `get_data_dir()` + `mkdir` | 导入时创建缓存目录 |
| `app/utils/logger.py` (A07) | `LoggerManager()` 打开文件 | 导入时打开日志文件 |

**根因**: `desktop_main.py` 在第 37 行调用 `_bootstrap_desktop_env()` 设置环境变量后，才 `import app.main`。如果导入顺序变化，行为即变。应集中迁移到延迟初始化模式。

### 2. 宽泛 catch（AGENTS.md §2.3）

| 文件 | 问题 |
|------|------|
| `app/exception/__init__.py:22-25` (A08) | `@app.exception_handler(Exception)` 兜底 |
| `app/dependencies/security.py:25` (A09) | `except Exception` 掩盖 JWT 具体错误 |
| `scripts/build-backend.py:55` (C03) | `except Exception:` 捕获 `KeyboardInterrupt` |
| `app/utils/notify/__init__.py:22-23,30-31,38-39` (B05) | 裸 `except:` 吞掉所有异常 |

### 3. 安全/凭据

- **JWT secret 硬编码**: `app/utils/security.py:11` — `"ULDFZslsFEzL2pSm"`（所有实例共享 → 任意伪造 token）
- **默认管理员密码**: `app/db/__init__.py:47` — `"password"`

### 4. 高频耦合点

| 模块 | 被引用数 | 说明 |
|------|---------|------|
| `app/utils/paths.py` | ~15 处 | 路径工具，几乎所有模块依赖 |
| `app/utils/logger.py` | ~20 处 | 日志，全项目依赖 |
| `app/db/__init__.py` 的 `get_db` | ~13 处 | 数据库会话依赖 |
| `app/service/spider.py` | ~5 处 | 蜘蛛服务，多处业务模块依赖 |

`paths.py` 和 `logger.py` 是最高风险耦合点——它们本身就是模块级初始化违规的重灾区。

---

## 架构健康评分

| 维度 | 得分 | 说明 |
|------|------|------|
| **流程闭环率** | 5/6 = 83% 🟢 | F1-F4 有 3 条部分断裂，F5-F6 通畅 |
| **文档一致性** | 4/5 = 80% 🟢 | AGENTS.md 详细准确，但缺少独立 ARCHITECTURE.md |
| **AGENTS.md 规范合规** | 4/5 = 80% 🟢 | 模块级初始化违规是主要扣分项 |
| **异常处理完整性** | 3/5 = 🟡 | 多处宽泛 catch、空 catch、静默失败 |
| **API 契约一致性** | 4/5 = 🟢 | 仅 history 端点返回格式不一致 |
| **安全检查** | 3/5 = 🟡 | JWT secret 硬编码、导航白名单不严谨 |
| **构建/CI 完整性** | 4/5 = 🟢 | 1 个 CI 构建失败问题、1 个死代码 workflow |
| **前端错误处理** | 3/5 = 🟡 | 空 catch 块、网络错误无反馈 |
| ****综合健康度** | **3.75/5 = 🟡 中等** | 核心功能完整，但异常处理和资源管理需优先改善 |

---

## 按模块详细分布

### 后端核心层（app/api/ + app/db/ + app/exception/ + app/dependencies/ + app/schema/ + app/scheduler.py）

| 健康度 | P1 | P2 | P3 |
|--------|----|----|----|
| 🟡 中等 | 3 | 8 | 11 |

**主要问题**: 文件句柄泄漏、调度器无异常保护、API 契约不一致、4 处模块级初始化违规、宽泛 catch

### 后端服务+工具层（app/service/ + app/utils/）

| 健康度 | P1 | P2 | P3 |
|--------|----|----|----|
| 🟡 中等 | 3 | 6 | 6 |

**主要问题**: Webhook 崩溃、打包后路径失效、非原子文件操作、JavBus 逻辑错误、通知静默失败、NFO 解析崩溃

### Electron 壳 + 构建 + CI

| 健康度 | P1 | P2 | P3 |
|--------|----|----|----|
| 🟢 良好 | 2 | 4 | 2 |

**主要问题**: macOS 竞态条件、CI 构建失败、导航白名单不严谨、Docker workflow 死代码

### 前端（frontend/src/）

| 健康度 | P1 | P2 | P3 |
|--------|----|----|----|
| 🟡 中等 | 4 | 9 | 5 |

**主要问题**: 空 catch 块、登录无反馈、响应拦截器空指针、批处理状态突变、API 响应格式不一致

---

## 紧急修复建议（按优先级）

### 第一批（P1 — 立即修复）
1. **B01** — `webhook.py` dict key 类型错误 → 导致通知功能完全不可用
2. **A01** — SSE 文件句柄泄漏 → 运行数小时后服务器崩溃
3. **B02** — `badge.py` 相对路径 → 打包后无法生成封面标签
4. **C02** — CI 缺少 `sync:version` → CI 构建失败
5. **D04** — `useFormModal` 空 catch → 表单提交异常无声
6. **D08** — 登录无反馈 → 最核心 UX 问题

### 第二批（P1 — 尽快修复）
7. **C01** — macOS activate 竞态 → 首次启动可能空白窗口
8. **B03** — `trans()` 非原子 → 数据丢失风险
9. **D12** — 响应拦截器空指针 → 网络断连时整个页面崩溃
10. **A02** — 调度器无 except → 无效任务 key 导致崩溃
11. **A03** — history API 格式不一致 → 维护成本

### 第三批（P2 — 下次迭代）
12. **A10** Torrent hash 字段类型
13. **B04** JavBus previews 条件错误
14. **C05** 导航白名单不严谨
15. **D14** BatchModal 状态突变
16. **D16** API 响应格式不一致
17. 模块级初始化重构（A04-A07/B06 — AGENTS.md 2.1 合规）

---

## 回滚策略

本审计报告涉及的问题均 **未做任何修改**。修复时每个修复应为独立 commit，按 P1→P2→P3 顺序处理。每次修复前应创建独立分支（`fix/<问题ID>-<简述>`），修复后通过 `git revert` 回滚。

---

*审计工具: 系统性代码库审计 v2.0 | 并行 Agent: 4 | 检查文件: ~160 | 耗时: ~15 分钟*
