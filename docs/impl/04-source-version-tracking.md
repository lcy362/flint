# F4 · 来源/版本增强（可更新源 + 陈旧标记）

## 1. 背景与目标

同类工具里 agent-skill-manager 用 `.skill_metadata.json` 记录 `source/github_url/installed_at/updated_at` 并支持 `update --all`；Skills Manager 支持「改本地 → push 回后端」。

Flint 现状：`SkillMeta.origin`（IM-04）只是**展示用文案**（详情页「来自 xxx」），没有版本、没有「来源可更新」的意识，也没有陈旧判断。

**目标**：把 `origin` 升级为**可追踪来源**——（a）收编/导入时若发现来源可定位（本地 git 仓库 / 外部源目录），记录来源与时间；（b）技能详情展示版本与陈旧状态；（c）对本地 git 来源提供「从来源更新」的一次性动作。

**明确不做**（落在 PRD 非目标内）：云端市场拉取、语义化版本冲突合并、自动更新。保留「触发式、用户显式动作」哲学；更新从**本地 git / 已知路径**取，绝不上网。

## 2. 需求细化

- **F4-01** `SkillMeta` 扩展：`origin` 保留语义，另加 `sourceRef?`（可更新来源的定位，如本地 git 仓库路径或外部源目录绝对路径）、`takenAt?`（收编时间），并为可选 `sourceType: 'git' | 'dir'`。
- **F4-02 陈旧标记**：对比仓库副本 `SKILL.md` 的 `mtime` 与来源处 `SKILL.md` 的 `mtime` / `git log -1 --format=%cI`。来源更新 → 该技能标记「有更新」。
- **F4-03 从来源更新**：`POST /skills/:id/refresh` 把仓库副本从 `sourceRef` 指定的来源**复制覆盖**（仅当该技能已登记来源；仅覆盖自有仓库内同名技能；不改来源本身——只读尊重）。
- **F4-04 展示**：技能详情把「来自 xxx」扩展为「来自仓库 X / 目录 Y，收编于 3 个月前；来源有更新」+ 更新按钮。

## 3. 涉及文件

| 层 | 文件 | 改动 |
|----|------|------|
| 后端 | `server/src/config/types.ts` | `SkillMeta` 增 `sourceRef? / takenAt? / sourceType?` |
| 后端 | `server/src/config/store.ts` | 迁移兜底（旧 `origin` 无损保留，新字段可选） |
| 后端 | `server/src/core/collect.ts`、`core/import.ts` | 收编/导入时探测并写入 `sourceRef/takenAt` |
| 后端 | `server/src/core/source-update.ts`（**新建**） | `detectStale()` + `refreshSkill()` |
| 后端 | `server/src/api/routes.ts` | 详情返回增强元数据；新增 `POST /skills/:id/refresh` |
| 后端 | `server/src/core/diagnose.ts` | 把「可更新技能」纳入一张列表（见 §6） |
| 前端 | `client/src/views/Library.tsx` 详情弹窗 | 来源/版本/陈旧展示 + 更新按钮 |
| 双端 | i18n | 文案 |

## 4. 后端改动

### 4.1 数据模型（`config/types.ts`）

```ts
export interface SkillMeta {
  tags: string[];
  mergeSource?: string;
  origin?: string;            // 保留：收编自哪个 Agent / 外部目录（IM-04 展示文案）
  sourceRef?: string;         // 新增：可更新来源定位（本地 git 路径 / 外部源绝对路径）
  sourceType?: 'git' | 'dir';// 新增
  takenAt?: string;           // 新增：收编时间 ISO
}
```

`emptyConfig()` / `schemaVersion` 不动（字段全可选，store 无需迁移步骤；若后续要强类型默认值再 bump）。

### 4.2 来源探测

- **收编 / 导入时**（`collect.ts`、`import.ts` 写副本的分支）：源目录若在 `.git` 内 → `sourceType:'git'`、`sourceRef: <git 仓库根>`；否则若源是登记的 `foreignSources` → `sourceType:'dir'`、`sourceRef: <源根>`。`takenAt=now`。
- 探测 helper 放 `core/source-update.ts`：`probeSource(dir): { type?; ref? }`（向上找 `.git` 目录，找到即 git）。

### 4.3 新建 `core/source-update.ts`

```ts
export function detectStale(repoDir, meta: SkillMeta): boolean | undefined
```
- 无 `sourceRef` → 返回 `undefined`（不可判断，不标陈旧）。
- `sourceType==='git'`：取 `git -C <ref> log -1 --format=%cI -- <相对子路径>`；无相对路径时用整个仓库最新提交时间。远端时间 > `meta.takenAt`（或副本 mtime）→ stale。
- `sourceType==='dir'`：比对来源 `SKILL.md` 与副本 `SKILL.md` 的 `mtime`。
- 纯只读；git 命令失败 / 目录缺失 → 返回 `undefined`。

```ts
export function refreshSkill(cfg, repoId, skillId): { refreshed: boolean; reason?: string }
```
- 校验 `sourceRef` 存在；从来源把该技能目录**复制覆盖**到自有仓库 `<root>/<name>/`（目录先 remap/备份原副本？——见 §8 安全边界）。
- 成功后更新 `meta.takenAt=now`。**不改来源**。

### 4.4 路由

- `GET /skills/:id/content` 返回里加 `meta: { sourceRef, sourceType, takenAt, stale }`（`stale` 由 `detectStale` 现算）。
- `POST /skills/:id/refresh`：`{ repoId }` 必填，内部 `refreshSkill`，成功 `touch()` 后回传 `{ refreshed: true }`。

## 5. 前端改动

- 详情弹窗来源区：原「来自 xxx」下按元数据渲染分段：
  - `sourceType==='git'` → 「来源仓库：<路径> · 收编于 <相对时间>」。
  - 有更新 → 橙色「来源有更新」Badge + 「从来源更新」按钮（调用 `POST /skills/:id/refresh`，成功 toast，刷新详情）。
  - 无 `sourceRef` → 维持现状（`origin` 文案），不显示按钮。
- 按钮走「先确认再执行」：onClick 先确认覆盖说明（F4-03 只能覆盖自有仓库同名技能，来源不动）。

## 6. 诊断页承接

不在主诊断增加新维度（不打扰体检）；在技能详情层以读时计算呈现陈旧。可选：`diagnose.ts` `repo` 维度追加一条聚合 `repo:<id>:stale-source`（有来源可更新技能数 >0 时 warn，附明细），便于集中发现。实现为**纯告警**，`/fix` 不做自动更新（尊重「显式、用户动作」哲学）。

## 7. 测试要点

- `probeSource`：普通目录 / `.git` 内 / 子目录向上命中，三例。
- `detectStale`：git 源、dir 源、无 sourceRef、git 命令失败，各返回符合预期。
- `refreshSkill`：副本被来源覆盖、来源未被改动、无 sourceRef 拒绝、护栏（不在自有仓库则拒绝）。
- smoke：临时仓库造技能 → 登记 git 来源 → 改来源 → refresh → 副本同步，来源未变。

## 8. 安全边界（关键）

- **只读尊重**：`refreshSkill` 只覆盖自有仓库内**已登记来源**的同名技能；来源目录/远端**永不写**。
- **覆盖前替身**：为防覆盖破坏已有内容，覆盖前把旧副本 `.bak` 保留在仓库根下（或走 git 由用户自行回滚），避免数据不可逆丢失。
- 非目标提醒：不做网络拉取、不做自动跟随更新（须用户点按钮）。