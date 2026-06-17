# Tissue Desktop

> 本项目是 [tissue](https://github.com/chris-2s/tissue) 的 **Electron 桌面版**，由社区爱好者基于上游开源版本进行桌面化适配。
> 
> **前端 UI、后端业务逻辑、数据库模型等核心代码均复用自 [chris-2s/tissue](https://github.com/chris-2s/tissue)**；本仓库仅增加 Electron 外壳、Python sidecar 启动、桌面路径适配、打包脚本及 CI 配置，方便不想使用 Docker 的用户在 macOS / Windows 上直接运行。

老师教材刮削工具，提供海报下载、元数据匹配等功能，使教材能够在Jellyfin、Emby、Kodi等工具里装订成册，便于学习。

[效果图传送阵](#talk-is-cheap-show-me-the-view)

### 项目来源

- **上游项目**：[https://github.com/chris-2s/tissue](https://github.com/chris-2s/tissue)
- **原作者**：chris-2s
- **本仓库定位**：上游项目的 Electron 桌面化分支，非官方版本。

### 注意事项

- ***科学的上网方式***是使用本项目的前提，这是最重要的一点。
- 项目仍处于非常早期阶段，只是满足了最基本的需求。
- 目前仍有许多bug，不排除有丢失或污染数据的可能性，请做好备份，酌情使用。
- 对于非Tissue刮削的NFO文件打开可能存在报错，有处理了部分情况，可能还有遗漏的情况。
- 当前还是自用为主，请勿在国内任何平台讨论本项目。

### 默认用户

用户名：admin

默认密码：password

### 桌面版（Electron）开发与运行

> 桌面版复用现有 FastAPI 后端与 React 前端，通过 Electron 主进程将后端作为 sidecar 启动。

#### 环境准备

```bash
# 1. 安装 Node 依赖（ workspaces 会同时安装 frontend 依赖）
npm install

# 2. 创建 Python 虚拟环境并安装后端依赖
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

#### 开发模式

```bash
npm run dev
```

该命令会：
1. 编译 Electron 主进程与预加载脚本；
2. 以 `desktop` 模式启动 Vite 前端开发服务器；
3. 启动 Electron 并加载 `http://localhost:5173`；
4. Electron 主进程会自动启动 Python sidecar，分配空闲端口，待 `/api/common/health` 就绪后再显示窗口。

#### 构建

```bash
# 仅构建前端桌面资源
npm run build:frontend

# 仅构建 Python 后端可执行文件（开发调试用）
npm run build:backend

# 完整构建：前端 + Electron + Python 后端 + 安装包（当前平台）
npm run build
```

构建产物输出到 `release/`。

#### 打包说明

桌面版使用 [PyInstaller](https://pyinstaller.org/) 将 FastAPI 后端打包成独立的可执行文件
`tissue-backend`（macOS）或 `tissue-backend.exe`（Windows），再通过 `electron-builder`
随 Electron 一起分发给最终用户。打包前请确保：

1. Python 3.11+ 已安装（必须是标准 CPython；静态编译的 Python，如 PlatformIO 自带解释器，无法配合 PyInstaller）；
2. 已创建虚拟环境并安装 `requirements.txt`（CI 会自动完成）；
3. macOS 上生成的 `.app` 未做签名与公证，首次运行需在“系统设置 > 隐私与安全性”中允许；
4. Windows 上生成的 `.exe` 未做代码签名，SmartScreen 可能会提示。

> 本地构建时如果默认 `.venv` 的 Python 是静态编译版，可另外创建标准 Python 虚拟环境，并通过 `TISSUE_BUILD_PYTHON=/path/to/venv/bin/python npm run build` 指定构建解释器。

#### CI 构建

`.github/workflows/build-desktop.yml` 会在 `push` 到 `main` / `develop`
或手动触发时，在 `macos-latest` 与 `windows-latest` 上同时运行 `npm run build`，
并将 `release/` 目录作为 Artifact 上传。

### 额外说明

文件和下载器的转移方式支持复制和移动两种。

### Talk is cheap, show me the view

<img width="1685" alt="image" src="https://github.com/chris-2s/tissue/assets/159798260/e5707b21-2737-4fb6-839e-a213318eddf3">
<img width="1685" alt="image" src="https://github.com/chris-2s/tissue/assets/159798260/4597df88-87bf-40a6-805f-37dc0b5e02ad">
<img width="1682" alt="image" src="https://github.com/chris-2s/tissue/assets/159798260/ac11e3d0-7631-40cb-bef6-7074fe3bbc2f">
