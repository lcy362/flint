# Flint 功能吸收 · 实施文档

> 本目录是「调研同类项目后吸收的功能」的实施文档。每个特性一页，统一描述：目标、需求细化、涉及文件、后端/前端改动、测试、验收。
>
> 背景调研结论见会话：「GitSkills / SkillKit / agent-skill-manager / knowledge-manager / skillsmanager / VS Code Skill Manager」等同类工具里，Flint 尚缺的部分能力。

## 实施顺序

按用户确认的顺序分两期：

```
第一期（先做）：F3 技能正文全文搜索  →  F4 来源/版本增强（可更新源 + 陈旧标记）
第二期（后做）：F1 技能内容安全扫描  →  F2 SKILL.md frontmatter 校验
```

F3 会新建一个轻量「技能正文索引」基础设施（`core/skillindex.ts`），F1 / F2 复用它批量读正文，因此 F3 放最前。

| 编号 | 特性 | 文档 | 主要落点 |
|------|------|------|----------|
| F3 | 技能正文全文搜索 | [`03-skill-body-search.md`](./03-skill-body-search.md) | `core/skillindex.ts`、`routes.ts`、`Library.tsx` |
| F4 | 来源/版本增强 | [`04-source-version-tracking.md`](./04-source-version-tracking.md) | `config/types.ts`、`collect.ts`/`import.ts`、`routes.ts`、详情弹窗 |
| F1 | 内容安全扫描 | [`01-skill-security-scan.md`](./01-skill-security-scan.md) | `core/security.ts`、`diagnose.ts`、`fix.ts`、Health 视图 |
| F2 | frontmatter 校验 | [`02-frontmatter-validation.md`](./02-frontmatter-validation.md) | `skill.ts`、`diagnose.ts`、Health 视图 |

## 全期共用约定（必须遵守）

1. **不改动核心不变量**（AGENTS.md §5）：文件即本体、期望集不落盘、物理以目录为准、触发式同步、只补不删、只读尊重。
2. **新增决策字段一律进 config**（`skillMeta` / 仓库级），禁止把 skill 内容写进 config。
3. **新增诊断项要成对出现**：`diagnose.ts` 产出 DiagItem →（若有修复）`fix.ts` 新增分发前缀；纯告警项不给修复。
4. **注释、UI 文案用中文；标识符/API 字段用英文**（AGENTS.md §6）。
5. **前端列表复用 `EntityList` / `FilterBar`，状态写在 hash**；视觉走 `styles/tokens.css`。
6. **新增维度 / 字段要同步更新 `docs/PRD.md` 与 `docs/TECH.md`**（AGENTS.md §8）——实施完成后收尾补，不在本目录另起草稿。
7. 每个特性完成自测：`npm run build && npm test`；涉及同步/诊断的行为跑 `npm run smoke -w server`。

## i18n 注意

四条特性都会新增 UI 文案与服务端日志/消息。两块 `client/src/i18n/{zh,en}.ts` 与 `server/src/i18n` 需同步补充；服务端日志固定英文（README §Development），前端文案与 toast 走 i18n。