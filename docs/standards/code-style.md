# Tissue Desktop 代码风格规范

> 适用于本仓库中**所有新增/修改的文件**（上游继承文件以最小改动原则处理）。
> 与 `AGENTS.md` 不冲突，只补充更具体的执行细节和反例。

---

## 1. 修改标记规范

### 1.1 DESKTOP-MODIFIED 注释

任何对上游文件的修改（不是纯新增文件）必须标注原因：

- Python：`# DESKTOP-MODIFIED: <原因>`
- TypeScript/TSX：`// DESKTOP-MODIFIED: <原因>`
- JSON 不支持注释，但在对应 key 旁边添加 `"// DESKTOP-MODIFIED": "原因"`

### 1.2 禁止行为

- ❌ 没有注释标记的修改
- ❌ 注释标记不说明原因（如 `// DESKTOP-MODIFIED` 后面没有冒号和解释）
- ❌ 在标记里写含糊原因（如 `// DESKTOP-MODIFIED: 改了一下`）

**正确示例**：

```ts
// DESKTOP-MODIFIED: 桌面生产环境从 file:// 加载，使用 hash history 避免路径解析问题
const history = import.meta.env.MODE === 'desktop' ? createHashHistory() : undefined;
```

```python
# DESKTOP-MODIFIED: use shared path helper so logs live in the desktop data dir
data_dir = get_data_dir()
```

---

## 2. Python 模块级初始化禁忌

### 2.1 核心原则

**模块导入（`import`）时不得依赖尚未设置的环境变量**。

### 2.2 反例与修复

**反例**（`app/utils/cache.py`）：

```python
# 模块导入时立即执行，此时 TISSUE_DESKTOP 可能还没设置
data_dir = get_data_dir()  # ← 错误：如果 get_data_dir 依赖环境变量，导入顺序决定行为
if not data_dir.exists():
    data_dir.mkdir(parents=True, exist_ok=True)

cache_path = get_cache_dir()
```

**修复**：

```python
# 延迟初始化，在函数调用时读取
def _ensure_cache_dir() -> Path:
    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return get_cache_dir()

def get_cache_path(parent: str, path: str) -> str:
    cache_path = _ensure_cache_dir()
    md = hashlib.md5()
    md.update(path.encode("utf-8"))
    return os.path.join(cache_path, parent, md.hexdigest())
```

### 2.3 模块级初始化白名单

以下操作在模块导入时**允许**：
- 纯常量定义（如 `DEV_PORT_FALLBACK = 5273`）
- 不依赖外部状态的类型声明

以下操作**禁止**：
- 文件系统操作（`mkdir`、`writeFile`、`openFile`）
- 环境变量读取（`os.environ.get()`）
- 网络请求
- 数据库连接

---

## 3. 类型安全与默认值

### 3.1 禁止静默回退

**反例**（`frontend/src/configs/desktop.ts`）：

```ts
// 如果 backendUrl 为 undefined，静默回退到错误的 8000 端口
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

### 3.2 禁止隐式 any

```ts
// ❌ 错误：data 是隐式 any
function onFinish(data: any) { ... }

// ✅ 正确：使用具体类型或 unknown
function onFinish(data: Record<string, unknown>) { ... }
```

### 3.3 运行时防御

**反例**（`frontend/src/configs/index.ts`）：

```ts
const configs = { development, docker, desktop };
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

---

## 4. 错误处理

### 4.1 禁止宽泛 catch

**反例**（`scripts/build-backend.py`）：

```python
except Exception:  # ← 捕获了 ImportError、PermissionError、KeyboardInterrupt 等不该捕获的
    print("PyInstaller not found, installing...")
```

**修复**：

```python
except (ImportError, ModuleNotFoundError):  # 只捕获"找不到"的异常
    print("PyInstaller not found, installing...")
```

### 4.2 禁止吞掉异常

```python
# ❌ 错误：try/except 什么都不做，异常被静默吞掉
try:
    do_something()
except:
    pass

# ✅ 正确：至少记录日志，或者重新抛出有意义的异常
try:
    do_something()
except Exception as e:
    logger.error(f"failed to do something: {e}")
    raise
```

### 4.3 Promise 拒绝必须处理

**反例**：

```ts
shell.openExternal(url);  // Promise 被拒绝时触发 unhandled-rejection
```

**修复**：

```ts
shell.openExternal(url).catch((error) => {
    console.error(`[shell] failed to open external URL ${url}:`, error);
});
```

---

## 5. Electron 安全规范

### 5.1 进程隔离

- `contextIsolation: true` 必须保持启用
- `nodeIntegration: false` 必须保持禁用
- 所有主进程与渲染进程通信通过 `contextBridge.exposeInMainWorld`

### 5.2 同步 IPC 谨慎使用

**反例**：

```ts
// 阻塞渲染进程，如果主进程忙会导致 UI 卡死
backendUrl: ipcRenderer.sendSync('get-backend-url-sync')
```

**建议**：同步 IPC 仅在**初始化时一次性读取**允许使用。如果可能，全部使用 `invoke` + `handle` 的异步模式。

### 5.3 导航安全

所有外部链接必须：

1. 在 `setWindowOpenHandler` 中拦截 `window.open`
2. 在 `will-navigate` 中拦截 `window.location` / `<a href>`
3. 白名单外 URL 通过 `shell.openExternal` 在系统浏览器打开

```ts
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch((error) => {
        console.error(`[shell] failed to open external URL ${url}:`, error);
    });
    return { action: 'deny' };
});

mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = isDev ? devServerUrl : 'file://';
    if (!url.startsWith(allowedOrigin)) {
        event.preventDefault();
        shell.openExternal(url).catch((error) => {
            console.error(`[shell] failed to open external URL ${url}:`, error);
        });
    }
});
```

---

## 6. 环境变量与路径

### 6.1 环境变量初始化顺序

所有环境变量**必须在模块导入前设置完毕**，或者由模块自身负责初始化。

**正确模式**（`app/desktop_main.py`）：

```python
# 先设置环境变量，再 import app 模块
_bootstrap_desktop_env()  # 设置 TISSUE_DESKTOP、TISSUE_API_PREFIX 等

from app.main import app as fastapi_app  # 安全：环境变量已就绪
```

**错误模式**：

```python
# 如果 app.utils.cache 在 app.main 之前被 import，环境变量可能还没设置
from app.utils.cache import cache_file  # 危险：cache.py 的模块级代码依赖环境变量
from app.main import app
```

### 6.2 路径计算使用 `__dirname` / `__file__`

**反例**（`frontend/vite.config.ts`）：

```ts
// 依赖 cwd，如果脚本从其他目录运行会写错位置
fs.writeFileSync('.dev-server-port', String(addr.port));
```

**修复**：

```ts
import { dirname, resolve } from 'path';
const DEV_PORT_FILE = resolve(__dirname, '.dev-server-port');
fs.writeFileSync(DEV_PORT_FILE, String(addr.port));
```

---

## 7. 日志与调试

### 7.1 统一前缀

日志前缀帮助区分日志来源：

```ts
// ✅ 推荐
console.error('[backend] Process exited with code', code);
console.error('[shell] failed to open external URL:', error);
console.error('[renderer] failed to load:', url);

// ❌ 不推荐（没有前缀，难以区分来源）
console.error('Failed to start:', error);
```

### 7.2 生产环境日志

- 生产环境日志写入用户数据目录（`app.getPath('userData')`）
- 开发环境日志输出到控制台即可
- 不要在前端 `console.log` 输出敏感信息（API key、密码等）

---

## 8. 命名规范

### 8.1 Python

| 类型 | 规范 | 示例 |
|------|------|------|
| 模块 | `snake_case` | `paths.py` |
| 函数 | `snake_case` | `get_data_dir()` |
| 类 | `PascalCase` | `LoggerManager` |
| 常量 | `UPPER_SNAKE_CASE` | `DEV_PORT_FALLBACK` |
| 私有函数 | `_leading_underscore` | `_bootstrap_desktop_env()` |

### 8.2 TypeScript

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件 | `PascalCase.tsx`（组件）或 `camelCase.ts`（工具） | `DirectoryInput.tsx` / `desktop.ts` |
| 接口 | `PascalCase` + `I` 前缀可选 | `IElectronAPI` |
| 函数 | `camelCase` | `getBackendUrl()` |
| 常量 | `UPPER_SNAKE_CASE`（模块级） | `DEV_PORT_PRIMARY` |
| 组件 | `PascalCase` | `DirectoryInput` |

---

## 9. 导入排序

### 9.1 Python

```python
# 1. 标准库
import os
import sys
from pathlib import Path

# 2. 第三方库
from fastapi import FastAPI
from pydantic import BaseModel

# 3. 本地模块
from app.utils.paths import get_data_dir
from app.utils.logger import logger
```

### 9.2 TypeScript

```ts
// 1. React / 框架
import { useState } from 'react';

// 2. 第三方库
import { Button } from 'antd';
import { createFileRoute } from '@tanstack/react-router';

// 3. 本地模块
import DirectoryInput from '../../../components/DirectoryInput';
import { isDesktop } from '../../utils/desktop';
```

---

## 10. 检查清单（提交前自检）

每个 Agent 提交前，用以下清单检查代码：

- [ ] 对上游文件的修改都加了 `DESKTOP-MODIFIED` 注释
- [ ] 没有模块级文件系统操作（`mkdir`、`writeFile` 等延迟到函数调用）
- [ ] 没有 `any` 类型或隐式 `any`
- [ ] 没有 `||` 静默回退到硬编码值（特别是 URL、端口）
- [ ] `catch` 块不是空的，异常要么记录要么重新抛出
- [ ] `Promise` 拒绝都有 `.catch` 或 `try/await`
- [ ] 环境变量在依赖它的模块 import 前已设置
- [ ] 日志有统一前缀（`[backend]`、`[shell]`、`[renderer]`）
- [ ] 版本号已检查（如果是发版相关修改）

---

## 11. 追溯记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-06-18 | 建立代码风格规范，覆盖修改标记、模块初始化、类型安全、错误处理、Electron 安全、环境变量、日志、命名、导入排序 | Kimi-CLI |
