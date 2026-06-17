# 任务 Spec：项目规范与代码风格（2026-06-18）

> 文件位置：`docs/specs/2026-06-18-project-standards.md`

---

## 1. 需求背景

- 项目已跑通 MVP（Electron + FastAPI + React），但**规范文件缺失**。
- 需要建立可执行的**发版工作流规范**和**代码风格规范**，防止后续开发（多 Agent 并行）引入不一致。
- 目标：所有 Agent 动手前看规范，代码审查有章可循。

---

## 2. 范围边界

- **新建**：
  - `docs/standards/release-workflow.md` — 发版工作流规范
  - `docs/standards/code-style.md` — 代码风格规范（覆盖 TS/Electron + Python）
- **不做**：
  - 不修改上游业务逻辑（只规范新增/修改的代码）
  - 不建立测试规范（当前无测试套件）

---

## 3. 技术约束

- 规范文档本身必须是 Markdown，放在 `docs/standards/` 目录
- 规范必须与已有 `AGENTS.md` 不冲突，只补充
- 代码风格规范必须引用具体文件路径和反例（从实际代码中提取）

---

## 4. 验收标准

- [x] 发版工作流规范内容已写入 `AGENTS.md`（Project Standards 章节），Agent 自动加载
- [x] 代码风格规范内容已写入 `AGENTS.md`（Project Standards 章节），含实际反例和修复
- [x] 独立参考文件保留在 `docs/standards/` 目录作为扩展阅读
- [x] 本 Spec 文件存在

---

## 5. 关联影响

- 后续所有 Agent 提交前必须阅读 `docs/standards/` 文件
- `AGENTS.md` 中已有的规范不变，但可能需要引用新增文档

---

## 6. Spec 追溯

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-06-18 | 新建项目规范与代码风格文档 | Kimi-CLI |
