# agent / 项目技能列表：改为完全以实际目录为准

## Context（背景与目标）
现状：agent 与项目技能通过「期望集」机制管理——config 里 `agents.<key>.{explicitOn,explicitOff,preset}` 与 `projects[].explicitOn` 推导出期望集(desired) → `deployAgent` 投影成目录软链/副本 → 自动同步(activeAgents + touch/watch)对账维护。前端有 on/off 开关。

由此产生的问题（用户实际遇到的）：停用第三方来源技能时，因 `isManagedLinkTarget` 只认自有仓库（local-skills），指向 ume-skills 的软链不被回收、被误标「外部软链」。

用户拍板的修复方向（本次要实现的目标）：
1. **完全以实际目录为准**：技能列表 = 读实际目录，不维护 on/off 状态与期望集列表数据。
2. 去掉「手动开启/停用」开关，只留 **添加(部署软链/副本)** 与 **删除(移除物理产物)** 两个操作。
3. 删除 `explicitOn/explicitOff`；预设保留，但**只作一次性「应用」动作**，不再自动同步补回。
4. **项目页一起改**（同样取消 `projects[].explicitOn` 与 on/off）。
5. 保留安全不变量：真实目录与外部软链永不删；删除只删本工具部署(normal)的软链/副本。

原则（用户重申）：「所有状态完全以实际目录为准」，不设额外开关状态、不维护列表数据。

## 改动清单

### A. 删除显式开关机制
- `config/types.ts`：`AgentOverride` 删 `explicitOn`/`explicitOff`（保留 `sync/skillSync/preset/primary`）；`ProjectLink` 删 `explicitOn`/`explicitOff`。
- `config/store.ts`：迁移清洗函数追加删去历史 `explicitOn/explicitOff`。
- `core/sync.ts`：删期望投影 `desiredContext`/`computeDesired`/`desiredNamesFor`；**保留并复用** `resolveSyncMode`/`symlinkSkill`/`copySkill`/`dirsEqual`/`deployAgent`（改造后用单技能）。
- `api/routes.ts`：PUT `/agents/:key` 的 `skill+on` 分支与 `setList('explicitOn'/'explicitOff')` 删除；`DELETE /agents/:key/skills/:skillName` 去掉「技能在 desired 中则拦截」的逻辑；项目侧 PUT/DELETE 同样处理。
- 客户端：`Agents.tsx` 删 `toggleDirect`/`directQueue`/`draftOn`/`directCards` 开关区与预设自动命中渲染；`handleAction` 去掉 toggle 分支；`Projects.tsx` 去掉 toggle(on/off) 分支改为「部署/删除」。
- `api/types.ts`：收敛 `SkillCardView.state/toggleOn`、`SyncDiff` 等不再需要的契约字段。
- i18n：删 enable/disable/直接开启等 on/off 文案；改「移除/添加」。

### B. 停用 agent/项目目录的自动同步
- 取消 `activeAgents` 作为部署触发作用域（不再由 `touch`/watcher 自动 `syncActive`）。保留 `activeAgents` 仅作：列表活跃分组/排序、`primaryOf` 判定、diagnose 失效软链扫描作用域、前端 muted 展示的辅助集合。
- `syncActive` 仅保留给「手动一键应用预设」作一次性调用；`POST /sync`（手动显式）保留。
- watcher/CopyWatcher 自动链、`onChanged/onConfigChanged` 自动同步停用；`touch()` 改为仅刷新列表、不触发部署。
- `diagnose.ts` 的 `diffSync` 一次性对账保留（用于诊断残留/失效），但传参不再依赖 `computeDesired/desiredContext`，`desired` 改传空。

### C. 新增「添加/部署 + 删除」入口
- 添加：新增 `POST /agents/:key/skills`（body `{id: name@source}`），复用 `deployAgent`（单技能、`prune:false`）+ `symlinkSkill/copySkill` + `resolveSyncMode` + `isManagedLinkTarget` 安全守卫，**不写 config**（物理即真相）。项目侧 `POST /projects/:id/skills` 复用 copy 落副本（对齐 takeover 的 copy 语义）。
- 删除：复用现有 `DELETE /agents/:key/skills/:skillName` 与 `DELETE /projects/:id/skills/:name`，去掉 desired 拦截后即为「移除物理产物」，仅删确定为本工具部署的软链/副本（不删真实目录、不删外部软链）。

### D. 预设改造
- 预设「定义」保留（`core/presets.ts` + `/presets` 路由，编辑仍是配置中的共享技能包）。
- `/presets/:name` PUT 不再触发自动同步，仅刷新。
- Agent/项目页新增「应用预设」按钮：调用一次 `deployAgent`（`prune:false`，一次性把预设展开的技能部署进目录，**之后不再自动**）。`agents[key].preset` 保留作为「该目录应用哪套」的记忆。

### E. 测试与文档
- 单测：`sync-desired.test.ts`(32)、`sync-deploy.test.ts`(16)、`agents.test.ts`、`store.test.ts`、`cards.test.ts` 按新语义重写/删除期望集与开关断言。
- smoke：`server/smoke.ts` 改走新 `deployOne / 应用预设` 路径验证目录落盘。
- 文档：`docs/PRD.md`（期望集/自动同步/on-off 章节）、`docs/TECH.md`（C1–C18 中 desired 投影与 activeAgents 语义、§13）、`AGENTS.md` §5（「期望集推导式不落盘」「触发式同步/activeAgents」改为「物理为准」「一次性应用」）与 §7 自查流程。

## 执行顺序
1. types/store 迁移（先删开关字段）
2. sync.ts 收敛核心（去期望投影、保留单技能复用函数）
3. routes 改 API（去 on/off、加 POST 部署、去 desired 拦截）
4. 客户端 + i18n
5. 单测 / smoke 收尾
6. 文档同步

## 复用清单（不新造轮子）
- `symlinkSkill` / `copySkill` / `dirsEqual` / `resolveSyncMode`（`server/src/core/sync.ts`）
- `isManagedLinkTarget` / `repoSkillRoots` / `agentSkillRows` 的第 1/3/4 段（`server/src/core/agents.ts`）
- `deployAgent`（改为单技能一次性调用）
- 现成 DELETE 路由（去 desired 拦截）

## 验证
- `npm run build` 通过（类型）、`npm test` 通过（重写后单测）。
- `npm run smoke -w server` 通过（新路径目录落盘）。
- 手工端到端：开启 dev，对某个 agent `.agents/skills`：技能库「添加」ume-skills 技能 → 目录出现软链且指向 ume-skills；「删除」该技能 → 软链被移除；停用不再存在；预设「应用」只做一次性。