# Tissue Desktop 发版工作流规范

> 版本权威：`package.json` 的 `version` 字段。
> 所有其他版本标记（`version.py`、electron-builder 产物版本）均从此派生。

---

## 1. 版本号管理

### 1.1 唯一权威源

`package.json` 中的 `version` 是**唯一可信版本号**。

```json
{
  "name": "tissue-desktop",
  "version": "1.0.1"
}
```

`version.py` 中的 `APP_VERSION = 'v1.0.1'` 不是权威源，它由构建脚本**自动生成**。

### 1.2 自动同步机制

- `npm run sync:version`（或 `scripts/sync-version.js`）读取 `package.json` 的 `version`，写入 `version.py` 为 `APP_VERSION = 'v${version}'`（保留 `v` 前缀，因为 `app/api/common.py` 的版本比对逻辑依赖它）。
- `sync:version` 必须放在 `npm run dev` 和 `npm run build` 链首，确保每次开发和构建前版本一致。
- `version.py` 已加入 `.gitignore`，**不应被提交到 Git**。

### 1.3 禁止行为

- ❌ 直接手动编辑 `version.py`
- ❌ 在 `builder.config.cjs` 中硬编码 `buildVersion`
- ❌ 不同文件（`package.json`、`version.py`、builder 产物）版本不一致

---

## 2. 发版前检查（PR 阶段）

### 2.1 check-version CI

`.github/workflows/check-version.yml` 在 PR 时执行：

```yaml
# 伪代码示意
if (PR 修改了 release-relevant 文件) {
    if (package.json 的 version 没有 bump) {
        失败，报错："发版前必须手动 bump package.json 版本号"
    }
}
```

**release-relevant 文件**：
- `electron/**`
- `app/**`
- `frontend/**`
- `requirements.txt`
- `package.json`（version 本身）
- `scripts/**`
- `.github/workflows/build-desktop.yml`

### 2.2 人工步骤

发版 PR 前必须：

1. `package.json` 手动 bump version（如 `1.0.1` → `1.0.2`）
2. 运行 `npm run sync:version` 确保 `version.py` 同步
3. 提交 `package.json` 的变更（不提交 `version.py`，它已在 `.gitignore`）
4. 确认 PR 标题包含版本号（如 `[Release] v1.0.2`）

---

## 3. 合并后自动发布

### 3.1 CI 工作流

合并到 `main` 后，`.github/workflows/build-desktop.yml` 自动触发：

```
1. checkout
2. setup Node.js + Python
3. npm install + pip install
4. npm run sync:version
5. npm run build:frontend
6. npm run build:electron
7. npm run build:backend
8. npx electron-builder --config electron/builder.config.cjs --publish always
```

### 3.2 Release 类型配置

`electron/builder.config.cjs` 中：

```js
publish: {
    provider: 'github',
    releaseType: 'release',  // ← 必须是 'release'，不是 'draft'
}
```

**为什么是 `release` 而不是 `draft`？**

- 已存在的 release（同名 version）如果是 `draft` 类型，electron-builder 会**静默跳过**所有资产上传，CI 显示 success 但 release 不更新。
- `release` 类型下，electron-builder 会显式覆盖同名 release，上传新资产。

### 3.3 同名版本覆盖策略

- 如果 GitHub 上已存在同名 version 的 release，electron-builder 会自动删除旧资产并上传新资产。
- 如果版本号已存在且不是同一次构建产物（比如用户手动改了 tag），需要手动清理后再发版。
- **建议**：每次发版严格 bump 版本号，避免覆盖旧版本的 debug 需求。

---

## 4. 版本号规则

遵循 [SemVer](https://semver.org/lang/zh-CN/)：

- `MAJOR.MINOR.PATCH`
- `PATCH` 递增：bug 修复、小改进
- `MINOR` 递增：新功能、向后兼容
- `MAJOR` 递增：破坏性变更

当前项目处于早期阶段（v1.x），以 `MINOR` 和 `PATCH` 递增为主。

---

## 5. 异常处理

| 场景 | 处理方式 |
|------|---------|
| CI 构建成功但 release 没更新 | 检查 GitHub release 是否已存在同名 version；检查 `releaseType` 是否为 `draft` |
| 紧急热修复（不需要等 CI） | 本地 `npm run build`，手动上传 `release/` 产物到 GitHub release |
| 版本号 bump 但 PR 被驳回 | 不需要回退版本号，下次发版继续从当前版本 bump |
| 多 Agent 同时修改 version | 以 `main` 分支上的版本为准，冲突时重新 bump 并 force-push PR |

---

## 6. 追溯记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-06-18 | 建立发版工作流规范 | Kimi-CLI |
