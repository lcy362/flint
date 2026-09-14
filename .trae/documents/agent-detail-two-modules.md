# 智能体详情页：两大模块 + 文案可读性

## Context（为什么要做）
智能体详情页此前是「一屏面板堆叠」：未活跃提示用了一串内部术语（"活跃集合""自动跟随""落盘"），
技能行只回答"装了什么"，看不出"来自哪个目录 / 谁引入的 / 是不是软链"；而"要装什么"又散落在
「分发策略」下拉、顶部「添加」弹窗、按技能覆盖安装方式三处，和预设页「添加 skill」的体验不一致。

目标：
1. 顶部未活跃提示改成大白话。
2. 页面收敛为两大模块——**现有技能（只读展示）** 与 **技能的控制（可写）**。
3. 展示侧：多目录 Agent（自身目录 + 额外读取的共享标准目录）逐行标出技能来自哪个目录、引入来源、是否软链。
4. 控制侧：**关联预设** 与 **直接添加技能** 两种并列方式，后者对齐预设页「按技能纳入」的 UI/流程。

## 服务端
### `server/src/core/agents.ts`
- `AgentSkillRow` 新增 `fromDir`（技能物理所在目录）与 `readVia: 'own' | 'shared'`；`reason` 新增 `'shared'`。
- 新增 `sharedReadDirs(def, ownDir)`：算出该 Agent 额外读取的共享标准目录（`~/.agents/skills` /
  `~/.config/agents/skills`，去掉与自身目录重合者）。
- `agentSkillRows` 由「只扫自身目录」扩展为「自身目录 ∪ 额外读取的共享目录」：
  - 自身目录：维持原逻辑（期望集 ∪ 残留 ∪ 自带），行标 `readVia: 'own'`。
  - 共享目录：只补自身目录没有的技能（同名以自身目录为准），`wanted: false`、`reason: 'shared'`、`readVia: 'shared'`；
    只认软链或真正的技能目录，避免把无关文件当技能。
  - 顺带把原先 `presentNames` 循环里的 O(n²) 期望集查找改为一次性 `Set`。

> `agentSkillRows` 仅服务于 `GET /agents/:key/skills` 的展示，不参与同步，改动不影响落盘行为。

### `server/src/domain/cards.ts`
- `SkillReason` 增加 `'shared'`，`normReason` 放行。
- `stateOf`：`shared` 归为 `unmanaged`（不由本 Agent 分发，无开关语义）。
- `acts`：`shared` 返回空操作（该目录的技能由它自己的策略管理）。
- `agentCard`：`external` / `shared` 的 `store` 一律退化为 `own`（避免"软链安装"误导），并透出 `fromDir` / `readVia`。

## 客户端
### 契约与徽标
- `api/types.ts`：`SkillReason` 加 `'shared'`；`SkillCardView` 加 `fromDir` / `readVia` 与页面派生的 `dirLabel` / `dirTitle`。
- `components/skill/SkillBadges.tsx`：
  - 新增 `REASON_LABEL.shared = '共享目录'`（信息色）与图例条目；
  - `stateBadge`：`shared` 显示「只读」；
  - 新增 `dirBadge`（来自自身目录 / 共享目录）与 `linkBadge`（共享目录里的软链）并接入 `skillBadges`；
  - 图例补一条「软链」。
- `components/common/FoldButton.tsx`：从预设详情抽出，供预设 / 智能体复用。

### `views/Agents.tsx`（AgentDetail 重构）
- 顶部提示改白话：
  - 标题「未加入活跃集合，不会自动跟随变更」；正文说明"技能库/预设的变动不会自动同步进来，需要点「同步」；
    本页操作仍立即写入；想持续跟随就设为活跃"，同目录有活跃成员时改说"仍会自动同步进来"。
- **模块一「现有技能」**（quiet 只读）：面板顶部列出自身目录 / 另读共享目录 / 项目目录 / 同目录 Agent；
  `SkillList` 去掉开关，仅保留收编/删除等操作。多目录 Agent 时逐行加目录徽标。
- **模块二「技能的控制」**（可写，改动立即生效并同步）：
  1. **关联预设**：选预设作分发基准，展示该预设当前会带入的技能 pill（显式 ∪ 标签命中）。
  2. **直接添加技能**：以技能库为全集，`FilterBar`（搜索 + 来源 + 标签 + 视图切换）配合 `SkillList` 开关，
     与预设页「按技能纳入」一致；预设带入的技能打「预设引入」标注。开关采用本地草稿 + 串行提交（乐观更新），
     服务端追平后自动回收草稿。
  3. **安装与存放**（默认折叠）：默认安装方式、策略存放于、按技能覆盖安装方式。
- 顶部去掉「添加」弹窗入口（改为模块二内联），保留设为活跃 / 目录 / 同步 / 删除。

## 验证
1. `npm run build`（server tsc + client tsc/vite）通过。
2. 用临时目录 + 桩 `os.homedir()` 跑 `agentSkillRows('cursor', …)`：
   自身目录技能 `readVia: 'own'`，共享目录技能 `reason: 'shared' / readVia: 'shared'`，同名技能不重复。
3. dev 打开 `#/agents/<key>`：两大模块分区、目录信息、未活跃白话提示、直接添加技能开关即时生效。
