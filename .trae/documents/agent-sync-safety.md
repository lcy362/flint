# 同步安全：自动同步只补齐、不删除；绝不覆盖用户自有内容

## Context（问题）
用户发现「opencode 之前有 2 个技能，变成活跃后自己消失了」，担心"试用了一下产品就被删数据"。

排查结论（日志 + 代码）：
- 被删的是 **本工具部署的软链**（指向 `~/local-skills/skills/...`），技能本体仍在仓库里，未丢内容。
- 触发链：`touch()` → `resync('route')` → `syncActive()` → `deployAgent()` 的清理循环，
  会把「不在期望集里、且目标落在自有仓库内」的软链 unlink。
- 而 `touch()` 被大量「与分发无关」的操作调用：新增/删除/编辑仓库、来源、归集、导入、合并、
  改标签、改活跃集合、删除自定义 Agent……于是一次无关操作就可能回收活跃 Agent 的部署项。

另外存在一处真实的数据丢失风险：`deployAgent` 对期望技能的落盘直接走
`symlinkSkill/copySkill`（内部 `rmSync` 后重建），**不区分落点是不是用户自己的实体目录**——
同名时会把用户自有目录删掉。`agentSkillRows`/诊断此前也没有把这种冲突拦下来。

## 设计原则
1. **自动流程只补齐，不删除。** 回收（unlink）只在显式场景发生。
2. **只回收本工具自己部署的软链。** 实体目录、外部软链一律不动。
3. **不覆盖用户自有内容。** 落点已有实体目录/外部软链时，宁可不部署并报冲突，也不删除。

## 改动
### `server/src/core/sync.ts`
- `deployAgent(cfg, key, desired, allSkills, opts: { prune?: boolean })`：
  - **新增 prune 开关**，默认 false。清理循环仅在 `prune === true` 时执行。
  - **落盘前先判断落点归属**：
    - 已是软链且指向正确 → 跳过；
    - 已是软链但指向别处 → 仅当 `isManagedLinkTarget`（目标落在自有仓库）时才允许重建，否则记为失败、不动；
    - 已是实体目录 → 新增 `dirsEqual(linkDir, target)` 判定：内容一致视为「本工具部署的副本」可安全重建，
      否则记为失败、不动（**修掉原有删用户目录的隐患**）；
    - 已是普通文件 → 不动，记失败。
  - 新增 `dirsEqual`（递归比较文件名与内容）。
- `syncActive(cfg, skills, only?, reason?, opts)`：把 `opts` 透传给 `deployAgent`；日志补 `prune` 字段。
- `SyncDiff` 注释更新：extra 只由显式同步清理。

### 触发侧（哪些路径允许 prune）
| 路径 | prune | 说明 |
|---|---|---|
| `index.ts resync()`（`touch()` / watcher 自动同步） | ❌ false | 只补齐、修复失效链接 |
| `PUT /presets/:name` | ✅ true | **预设变更**（唯一默认允许回收的自动场景） |
| `PUT /agents/:key`（策略变更：preset/skill/sync/skillSync/开关） | ✅ true | 只对该 Agent 自己回收 |
| `POST /agents/:key/sync`（详情页「同步」按钮） | ✅ true | 用户显式操作 |
| `POST /sync`（全局手动同步） | ✅ true | 用户显式操作 |
| `applyFix` 的 `sync:` / `broken:`（体检中心点修复） | ✅ true | 用户显式操作 |
| 其余 `touch()`（仓库/来源/导入/归集/合并/标签/活跃集合/删自定义 Agent） | ❌ false | 不再删除 |

### 客户端
- 详情页「同步」按钮 tooltip → 「按当前策略补齐缺失技能，并回收本工具自己多部署的软链（不动你的自有内容）」。

## 取舍
- 好处：任何非预期操作都不会删用户环境里的东西；删除只发生在"预设变更 / 针对该 Agent 的策略变更 /
  手动同步 / 点修复"。
- 代价：由标签、仓库等间接变化导致的"多余项"不再自动消失，会以「已停用 / 余量」形式留在目录里，
  由体检中心暴露并一键清理（`extra` 口径不变）。这是刻意的：**宁可不清理，也不误删**。

## 验证
1. `npm run build` 通过。
2. 临时 harness（桩 `os.homedir()` + 临时仓库/目录）驱动 `deployAgent`：
   - `prune:false` 保留多余的本工具软链（不自动删除）—— PASS
   - `prune:true` 回收该软链 —— PASS
   - 同名实体目录、内容不同（用户自有）→ 不覆盖、报失败、内容保留 —— PASS
   - 同名实体目录、内容与仓库一致（本工具副本）→ 允许重建为软链 —— PASS
   - 外部软链（目标不在仓库内）→ 不替换 —— PASS

## 未涉及 / 后续
- 项目级同步 `syncProject` 独立于 Agent 同步，仅由项目相关显式操作触发，且已拒绝覆盖实体目录；
  其 `<project>/.agents/skills` 清理仍为自动，可按同一原则后续收敛。
