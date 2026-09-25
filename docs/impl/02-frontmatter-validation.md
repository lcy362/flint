# F2 · SKILL.md frontmatter 校验

> 第二期实施（F3、F4、可衔接 F1 之后）。复用 `core/skillindex.ts` 读正文；与 F1 同入 `diagnose`。

## 1. 背景与目标

Agent Skills 标准要求每个技能目录含 `SKILL.md`，frontmatter 至少 `name` + `description`，且 `name` 通常须与目录名一致、为小写连字符风格。现状自有仓库逐条入库时**不校验 frontmatter 合法性**——一个缺 `name`/`description`、目录名与 `name` 不一致、YAML 损坏的技能照样被分发到所有 Agent，直到运行时才发现「没有被调用」而摸不着头脑。

同类工具 knowledge-manager 提供 `verify`/`repair`，agentskills.io 有 `skills-ref validate`。

**目标**：在体检中心新增一个**只读「内容合法」维度**，校验 frontmatter 契约，对不合法技能给出具体缺什么、该怎么改的提示。

**明确不做**：自动改写 frontmatter / 自动重命名目录（前者违反「不写 Agent 专有格式」精神，后者是破坏性目录操作）。校验是**告知性**的（与 F1 一致，低干预）。

## 2. 需求细化

- **F2-01 新诊断维度 `content`**：在 `DiagDimension` / `DiagGroups` / Health 增加 `content` 分组（若与 F1 合并为同一个维度，命名对齐，见 F1 §8）。
- **F2-02 校验项**（作用对象：自有仓库技能。第三方来源只读，即使不规范也只提示不阻断）：
  1. **缺 `SKILL.md` 或非目录** —— 扫描器已过滤，通常不出现；作为兜底。
  2. **YAML 损坏**：frontmatter 无法 `parseSkillMeta` 解析（`parseSkillMeta` 内部已有 `try/catch` 返回空，需把「解析失败」这个信号显式暴露出来）。
  3. **缺 `name`**：frontmatter 无 `name`。
  4. **缺 `description`**：frontmatter 无 `description`。
  5. **`name` 与目录名不一致**：`frontmatter.name !== path.basename(dir)` → 提示（warning；许多 Agent 按目录名加载，不一致会导致加载不到，这正是不变量 C「名字物理唯一」要防的错位）。
  6. **`name` 不符合 slug**（可选，作为 warning）：非 `^[a-z0-9][a-z0-9-]*$` 时提示，兼容宽松处理不强制。
- **F2-03 状态**：仅 `warn` / `ok`，不设 `error`（不合法技能仍可用，只是易错位；`error` 留给 F1 的真危险）。

## 3. 涉及文件

| 层 | 文件 | 改动 |
|----|------|------|
| 后端 | `server/src/core/skill.ts` | `parseSkillMeta` 暴露「解析失败」信号（可选，见 §4.2） |
| 后端 | `server/src/core/validate.ts`（**新建**） | `validateFrontmatter(s: Skill): ContentIssue[]` |
| 后端 | `server/src/core/diagnose.ts` | 增 `content` 维度 |
| 前端 | `client/src/views/Health.tsx` | 渲染 `content` 分组 |
| 双端 | i18n | 文案 |
| 测试 | `server/tests/` | validate 单测 |

## 4. 后端改动

### 4.1 新建 `core/validate.ts`

```ts
export type IssueKind = 'yaml' | 'missing-name' | 'missing-description' | 'name-dir-mismatch' | 'name-slug';
export interface ContentIssue { kind: IssueKind; message: string }
export function validateFrontmatter(s: Skill): ContentIssue[]
export function validateAll(lib): Map<string, ContentIssue[]>  // keyed by skill id
```

- 对每个自有仓库技能：读 `SKILL.md`（复用 `bodyText` 或直接用 `readSkill`+正文），按 §2.2 规则产出 issue 列表；无 issue 记空数组。
- `name-dir-mismatch`：`frontmatter.name !== path.basename(s.dir)`。
- 绝不改动文件，纯分析。

### 4.2 `parseSkillMeta` 信号（`skill.ts`）

现函数 `parseSkillMeta` 对坏 YAML 直接 `return { tags: [] }`（`skill.ts` 第 48–50 行 catch）。要让校验能区分「真缺 name」与「YAML 坏了没解析出来」，返回结构加一个 `ok: boolean` 标记（默认 true；catch 分支置 false 且不带 name）。向后兼容：新增可选字段不影响现有调用方。

### 4.3 `diagnose.ts` 扩展

- `DiagDimension` 增加 `'content'`；`DiagGroups` / `DIMS` / `summary` 同步补。
- 在 `diagnose()` 里调 `validateAll(lib)`：
  - 有 issue 的技能 → 逐条 `key: 'content:<skillId>:<kind>'`，`status:'warn'`，`detail: { kind, skillId, dir, name }`。
  - 全部合法 → 一个 `ok` 汇总项：「N 个技能 frontmatter 规范」。

### 4.4 `fix.ts`

- `content:*` **不配自动修复**（同 F1：改文件/改名是破坏性，应手工处理）。Health 上该条目展示建议文案（「请编辑该技能的 SKILL.md 补齐 name/description」），无「修复」按钮。与共用约定 3 兼容（纯告警可不配修复）。

## 5. 前端改动（`Health.tsx`）

- 渲染 `content` 分组，复用现有诊断维度渲染；每条显示技能名 + 目录 + 缺什么/如何改。
- 若实现阶段 F1/`security` 与 F2/`content` 合并为一个维度，前端只改动一次（合并时以更细的 key 前缀区分来源）。

## 6. 测试要点

- 对 YAML 损坏 / 缺 name / 缺 description / name≠目录名 / name 非 slug / 全合法 六类构造 fixture，断言 issue 种类与数量。
- 无一误报：合法技能返回空数组。
- `diagnose` 汇总：全合法出 `ok` 汇总项、有 issue 时该技能逐条 warn。

## 7. 验收标准

- Health 出现「内容」维度；缺 `name` 或 `name`≠目录名的技能被标 warn 并给出目录与建议。
- 校验只读：运行前后技能目录内容不变。
- 兼容既有 `parseSkillMeta` 调用方（新增 `ok` 字段为可选）。
- `build && test` 通过。

## 8. 与 F1 的合并取舍

F1（安全）与 F2（合法）都进 `diagnose`、都读主体、都默认不自愈。实现时建议**合并为一个「内容」维度**（key 前缀 `sec:` 与 `content:` 区分），Health 只增一次分组，减少前端与维度模型改动量；若想保留「安全」与「合法」两个独立心智入口，也可并列。最终以 PRD/TECH 更新说明为准。