# Flint 产品需求文档（PRD）

> 展示名 / 品牌名：**Flint**（代号，取「燧石」之意）；仓库名 `local-skills-hub`，GitHub `lcy362/flint`。
> 核心命题：让 skill 成为**个人资产**——一处沉淀、切到即用、跨 Agent 零成本迁移。
> 本文以**当前代码实现**为准，描述产品已具备的能力、规则与边界；技术实现见 [`TECH.md`](./TECH.md)，快速上手见 [`../README.md`](../README.md)，开发约定见 [`../AGENTS.md`](../AGENTS.md)。

---

## 1. 背景与问题

AI 编码 Agent 生态高度碎片化：Cursor、Claude Code、TRAE、Qoder、Windsurf、Codex、OpenCode……各家的 skill 目录、配置格式与加载机制各不相同。个人沉淀的 skill 资产散落在各平台目录里，无法统一沉淀、检索、复用与版本管理。

一个现实诉求进一步放大了这个问题：**用户会在多个提供免费 / 不同额度 token 的 Agent 之间来回切换**。切换时有两个痛点：

1. 本地已沉淀的 skill 不会被当前正在使用的 Agent 读到（目录不同）。
2. 切换后，之前配置好的 skill 组合（预设）无法快速、准确地"带过去"。

Flint 用一个本地优先的 Web 应用解决它：以文件系统为唯一事实源，集中管理 skill、统一打标签与去重、按预设 / 标签分发到各 Agent 与项目目录，并让分发在"操作触发点"即时完成。

---

## 2. 产品目标

1. **skill 成为个人资产**：建立可配置、可独立版本管理的非隐藏 skill 仓库，作为唯一事实源（source of truth）。
2. **跨 Agent 无缝迁移**：任意时刻把 Agent 加入"活跃集合"，仓库中的 skill 组合（预设）即刻反映到该 Agent 的 skill 目录，无需手动搬运。
3. **一处管理**：扫描、归集、导入、去重、命名、打标签、按预设 / 标签分发，全部收敛到一个 WebUI 完成。
4. **项目级协作**：项目内 skill 以 `.agents` 真实副本为准，符合开源规范，可提交 git 供团队共享，并支持把改动回写仓库。

---

## 3. 非目标（当前不做）

- **Marketplace / 在线市场**：不做技能市场与在线搜索。
- **云端多设备同步**：不做云端备份 / 同步（仓库本身可被用户自行 git 管理）。
- **语义化版本冲突合并**：不做版本差异对比与三方合并；同名交汇时由用户仲裁（合并确认）。
- **接管 Agent 自有配置生成**：不生成 `AGENTS.md` / `CLAUDE.md` 等 Agent 专属配置。
- **常驻后台全量 watcher**：全局同步坚持**触发式**；仅复制模式提供可选目录级 watcher（默认关闭）。

---

## 4. 核心概念与术语

| 术语 | 说明 |
|------|------|
| **Skill** | 一个含 `SKILL.md`（YAML frontmatter + Markdown）的目录，可附带文件 / 脚本。以 `name@来源` 全局唯一标识。 |
| **自有仓库（Repository）** | 集中存放 skill 本体的目录，**非隐藏、路径可配置**，可脱离本工具独立编辑 / git 管理。可配置多个。 |
| **第三方仓库（External Source）** | 外部 / 上游的开放内容库：登记后可只读关联（`linked=true`）纳入发现，不拷贝本体、不写其文件。 |
| **来源（Source）** | skill 的来源命名空间：某仓库 / 第三方仓库的 id。用于区分重名 skill。 |
| **Agent** | 本机某个编码工具，有全局技能目录（可选项目级目录）。内置 59 个 + 用户自定义。 |
| **活跃 Agent（activeAgents）** | 用户选定的"实时同步作用域"集合。结构性变更会自动同步到集合内成员的目录。 |
| **主 Agent（primary）** | 当多个 Agent 解析到**同一个技能目录**时，该目录的分发策略唯一落点（目录只有一份实体，策略只能存一份）。 |
| **Preset（预设）** | 一组命名的 skill 集合 = 显式成员 ∪ 关联标签命中。预设即决策，**无独立启用开关**。 |
| **标签（Tag）** | 给 skill 或项目打的标签：用于过滤浏览、预设关联、项目自动关联。 |
| **期望集（desired）** | 某 Agent / 项目"应装什么"的运行时计算结果，**不落盘**。 |
| **投影（projection）** | 把期望集落到物理目录的动作：软链或复制。 |
| **归集（collect）** | 把来源目录（Agent / 项目）里的 skill **复制**进仓库；源位置不变。 |
| **接管（takeover）** | 把来源目录里的那条技能替换为**指向仓库副本**的形态（Agent 目录→软链，项目→真实副本）。 |
| **同步策略** | 每条（skill, Agent）关系可选 **软链（symlink）**或**复制（copy）**；默认软链。 |

---

## 5. 功能需求

> 编号沿用 `SR / AG / AA / PR / TG / PJ / IM / EK / SY / UI / DG / NFR`，作为需求追溯锚点。

### 5.1 技能仓库管理（SR）

- **SR-01 唯一事实源**：默认仓库为非隐藏目录，路径可配置，保存在配置文件 `~/.flint/config.json`。
- **SR-02 多仓库**：支持配置多个自有仓库；每个仓库有 id（参与 skill 标识 `name@id`、不可变）、可选显示名、路径、可选 `root`（skills 根，缺省 `<path>/skills`）。
- **SR-03 去工具依赖**：仓库内容不写本工具专有格式；skill 即普通 Markdown 目录，可用任意编辑器 / git 直接管理。
- **SR-04 布局规则**：**自有仓库恒为扁平**（`<root>/<name>/SKILL.md`）——本工具对自有仓库的读取与写入共用同一套位置规则（归集 / 导入 / 项目回写都落在根下），因此不存在「读得到却找不到」的错位。需要分类目录时改用**第三方只读来源**或**标签**。第三方来源支持 `flat` / `nested`（递归发现深层 `SKILL.md`）/ `auto`（扫描期自动检测；**深层存在技能即判 nested**，不静默丢弃）。另支持读取**带索引清单**的库（如 `skill-store/candidate-catalog.json`）补充元数据并定位本体。
- **SR-05 仓库 CRUD 与类型转换**：登记 / 编辑 / 删除仓库；编辑时可在"自有仓库 ↔ 第三方仓库"之间切换定位（id 不变，路径按新类型扫描规则自动换算，技能引用不受影响）。
- **SR-06 仓库目录健康**：扫描根不存在时跳过并记录警告；诊断页可一键创建缺失的 skills 目录；自有仓库里位于分类子目录、因而不会被识别的技能报为警告，并给出处置建议（移到根下，或把该目录登记为只读来源）。

### 5.2 Agent 管理（AG）

- **AG-01 覆盖生态**：内置 59 个 Agent（清单见 §5.2.1），并对**共享标准目录**（多款 Agent 共用的技能目录 `~/.agents/skills`、`~/.config/agents/skills`）做归并标注。
- **AG-02 同目录归并 + 主 Agent**：多个 Agent 解析到同一技能目录时，UI 合成一张卡片（标题罗列全部 Agent），并明确它们**共用同一套策略**。该目录固定选一个**主 Agent** 作为策略唯一落点：显式指定优先，否则"活跃优先、其次名称序"自动判定。同目录其它 Agent 的无效策略会被自动清理。
- **AG-03 自定义 Agent**：可新增任意名称 + 全局目录（+ 可选项目目录、递归扫描开关），并支持删除。
- **AG-04 路径覆盖**：每个 Agent 的全局目录、项目级目录均可覆盖；覆盖后视为"已安装可用"。
- **AG-05 安装探测**：以解析后的全局目录是否存在判断"已安装"；未安装的卡片提示"本机未安装"。
- **AG-06 家族标注**：对家族性产品（TRAE 系列、Qoder / 千问系列、Claw 系列）在 UI 标注家族，便于对照。
- **AG-07 跨产品目录复用说明**：对"该目录也被 X、Y 直接读取"的 Agent 给出说明，避免重复安装。

#### 5.2.1 内置 Agent 目录参考表

> 内置清单以 skills-manager 的 `tool_adapters` 为准，并用 pks 补齐长尾。路径均为相对用户主目录；`root` 与目录覆盖始终可被用户改写（AG-04）。

**编码类（coding）**

| Agent key | 名称 | 全局技能目录 | 项目级目录 | 备注 |
|-----------|------|-------------|-----------|------|
| cursor | Cursor | `~/.cursor/skills` | `.cursor/skills` | 另读 `.agents/skills` |
| claude_code | Claude Code | `~/.claude/skills` | `.claude/skills` | — |
| codex | Codex | `~/.agents/skills` | `.agents/skills` | 部署于共享 `.agents` |
| github_copilot | GitHub Copilot | `~/.copilot/skills` | `.github/skills` | 另读 `.agents/skills` |
| grok | Grok | `~/.grok/skills` | `.grok/skills` | — |
| opencode | OpenCode | `~/.config/opencode/skills` | `.opencode/skills` | 另读 `.agents/skills` |
| antigravity | Antigravity | `~/.gemini/antigravity/skills` | — | Gemini 系 |
| gemini_cli | Gemini CLI | `~/.gemini/skills` | — | 另读 `.agents/skills` |
| amp | Amp | `~/.config/agents/skills` | — | 共享 `.config/agents/skills` |
| replit | Replit | `~/.config/agents/skills` | — | 共享 `.config/agents/skills` |
| kilo_code | Kilo Code | `~/.kilocode/skills` | — | — |
| roo_code | Roo Code | `~/.roo/skills` | — | 另读 `.agents/skills` |
| goose | Goose | `~/.config/agents/skills` | `.agents/skills` | 共享 `.config/agents/skills` |
| droid | Droid | `~/.factory/skills` | — | — |
| windsurf | Windsurf | `~/.codeium/windsurf/skills` | `.windsurf/skills` | 另读 `.agents/skills` |
| trae | TRAE | `~/.trae/skills` | `.trae/skills` | TRAE 系列·国际 |
| trae_cn | TRAE CN | `~/.trae-cn/skills` | `.trae-cn/skills` | TRAE 系列·中国 |
| cline | Cline | `~/.cline/skills` | `.cline/skills` | 目录独立，不读共享 `.agents` |
| warp | Warp | `~/.agents/skills` | `.agents/skills` | 部署于共享 `.agents` |
| omp_agent | OMP Agent | `~/.omp/agent/skills` | `.omp/skills` | 全局含 `agent` 段 |
| pi | Pi | `~/.pi/agent/skills` | `.pi/skills` | 另读 `.agents/skills` |
| deepseek_harness | DeepSeek Harness | `~/.dsh/skills` | `.dsh/skills` | 另读 `.agents/skills` |
| qoder | Qoder | `~/.qoder/skills` | `.qoder/skills` | Qoder / 千问系列 |
| qwen_code | Qwen Code | `~/.qwen/skills` | — | Qoder / 千问系列 |
| qoderwork | QoderWork | `~/.qoderwork/skills` | `.qoderwork/skills` | Qoder / 千问系列 |
| qoderworkcn | QoderWork CN | `~/.qoderworkcn/skills` | `.qoderworkcn/skills` | Qoder / 千问系列 |
| qwenworkcn | 千问办公 | `~/.qwenworkcn/skills` | — | Qoder / 千问系列 |
| codebuddy | CodeBuddy | `~/.codebuddy/skills` | `.codebuddy/skills` | — |
| zencoder | Zencoder | `~/.zencoder/skills` | — | — |
| zcode | ZCode | `~/.zcode/skills` | `.zcode/skills` | — |
| reasonix | DeepSeek Reasonix | `~/.reasonix/skills` | `.reasonix/skills` | — |
| kimi_code | Kimi Code | `~/.config/agents/skills` | `.agents/skills` | 共享 `.config/agents/skills` |
| openhands | OpenHands | `~/.agents/skills` | `.agents/skills` | 部署于共享 `.agents` |
| deepagents | DeepAgents | `~/.deepagents/agent/skills` | `.agents/skills` | 另读 `.agents/skills` |
| firebender | Firebender | `~/.firebender/skills` | `.agents/skills` | 另读 `.agents/skills` |
| cortex | Cortex | `~/.snowflake/cortex/skills` | `.cortex/skills` | — |
| crush | Crush | `~/.config/crush/skills` | `.crush/skills` | — |
| mistral_vibe | Mistral Vibe | `~/.vibe/skills` | `.vibe/skills` | — |
| augment / bob / command_code / continue / iflow / junie / kiro / kode / mcpjam / mux / neovate / pochi / adal | 对应工具 | `~/.<tool>/skills` | `.<tool>/skills` | 长尾，遵循各自约定 |

**个人助理类（lobster）**

| Agent key | 名称 | 全局技能目录 | 项目级目录 | 备注 |
|-----------|------|-------------|-----------|------|
| openclaw | OpenClaw | `~/.openclaw/skills` | — | Claw 系列 |
| qclaw | QClaw | `~/.qclaw/skills` | — | Claw 系列 |
| easyclaw | EasyClaw | `~/.easyclaw/skills` | — | Claw 系列 |
| autoclaw | AutoClaw | `~/.openclaw-autoclaw/skills` | — | Claw 系列 |
| workbuddy | WorkBuddy | `~/.workbuddy/skills` | — | Claw 系列 |
| hermes | Hermes Agent | `~/.hermes/skills` | `.agents/skills` | Claw 系列；`recursive_scan` |
| clawdbot | Clawdbot | `~/.clawdbot/skills` | `.clawdbot/skills` | — |
| teamwork | Teamwork | `~/teamwork/skills` | `teamwork/skills` | — |

> **共享标准目录说明**：`codex`、`warp`、`openhands` 直接以 `~/.agents/skills` 为全局目录（放一份即全生效）；`amp`、`replit`、`goose`、`kimi_code` 共享 `~/.config/agents/skills`。其余带"另读"标注的 Agent 在自身目录之外还会读取共享目录，这类技能对本 Agent 直接可用但**只读**（由共享目录自己的策略管理）。
>
> **UI 口径**：`~/.agents/skills` 被生态内绝大多数 Agent 读取，"也会读共享目录"不构成区分特征，因此**不在每个 Agent 上重复「另读」徽标**，而是把「开源生态推荐目录」标在**目录本身**——Agent 列表里那张目录卡换一套强调色突出，主标题即为「开源生态推荐目录」（使用它的 Agent 名退到副标题弱化），标题旁 info 按钮悬停说明「大部分 Agent 都会读这个目录、推荐优先管理；只装给某一个 Agent 请用该 Agent 自己的目录」，且该卡片在**活跃 / 非活跃各自分组内都排第一位**；非活跃时强调色整体减弱、边框换成虚线，既看得出「没在自动同步」，也仍然与普通卡片区分得开。点进该目录后，详情页的**标题主体同样是「开源生态推荐目录」**（带 info 说明：大部分 Agent 都支持读这个目录，这几个是当前使用的代表），使用它的 Agent 退到标题下方的副行（`~/.agents/skills · Codex / OpenHands / Warp`），「技能目录」一行中该路径也照常标出；活跃状态与切换按**整个目录**处理（见 AA-01）。`~/.config/agents/skills` 等其它共用目录不做特殊标记，与普通目录卡一样正常展示。

### 5.3 活跃 Agent 与触发式同步（AA）

- **AA-01 活跃集合（多选）**：在 Agent 详情页可把 Agent 加入 / 移出活跃集合（`PUT /activeAgents`），集合可含多个成员。因为一个目录只有一套策略、同步也按目录归并，活跃按**目录**判定与切换：同目录任一成员活跃 ⇒ 该目录活跃；详情页的「设为活跃 / 移出活跃」作用于**整个目录**（整组成员一起加入 / 移出），避免出现「点了移出、目录却仍在自动同步」的假动作，也保证详情页与列表卡片状态口径一致。
- **AA-02 触发式同步**：**不需要常驻 watcher**。结构性变更（仓库增删、导入、归集、预设变更、标签变更、Agent 策略变更、活跃集合变更）在触发点立即执行，把结果实时反映到活跃 Agent 的目录。
- **AA-03 非活跃懒同步**：非活跃 Agent 不自动跟随；用户在其详情页的任何手动操作会**就地全量对账**（`prune: true`），也可点「同步」按钮。
- **AA-04 加入即就位**：把 Agent 加入活跃集合时即刻按当前策略对账落盘。
- **AA-05 别名共享**：同目录的多个 Agent 只部署一次（目标折算到主 Agent 去重）；同目录任一成员活跃，该目录就会跟随变更。UI 卡片与详情页同口径：以目录为单位展示「活跃 / 非活跃」，切换也作用于整个目录。同一目录只有一个详情页——标题罗列整组成员（`Codex / OpenHands / Warp`），地址指向别名时前端规范到主 Agent，不把它做成「某个 Agent 自己的页」；头部**不再出现「策略存放于 / 共用目录」这类主别名徽标**（指定主 Agent 见详情页「安装与存放」）。

### 5.4 预设（PR）

- **PR-01 创建 / 编辑 / 删除**：新建预设只填名称；详情页增删显式技能、管理关联标签。
- **PR-02 成员即分发**：预设 = 显式 `skills[]` ∪ `tags[]` 命中。**无独立启用开关**；成员 / 标签变更即刻进入期望集并分发到活跃 Agent。预设只对**显式关联**它的 Agent 生效。
- **PR-03 实时性**：预设变更会以 `prune: true` 重跑活跃 Agent 同步（可回收多余的、由本工具部署的软链）。
- **PR-04 展示口径统一**：主页只展示"最终生效技能数"；详情页分「当前状态（只读）」与「调整方式（可写）」两组，汇总已开启技能与已应用的 Agent。
- **PR-05 关联标签**：`tags[]` 命中的技能自动纳入，与显式技能取并集。因标签自动纳入的技能开关锁定，去掉标签即可停用。

### 5.5 标签（TG）

- **TG-01 打标签**：在技能详情弹窗编辑标签；提供「只看未打标签」过滤便于补全。
- **TG-02 过滤浏览**：按标签 / 来源 / 名称搜索过滤；多选项之间为"或"。
- **TG-03 项目关联**：给项目打标签后，打有相同标签的 skill 自动进入项目期望集（§5.6）。
- **TG-04 标签读取口径**：`config.skillMeta[id].tags` 优先，其次回落 `SKILL.md` frontmatter（顶层 `tags` 或 `metadata.tags`，兼容数组与逗号分隔字符串）。
- **TG-05 标签迁移**：`POST /repos/:id/tags-migrate` 把 `skillMeta` 中暂存的标签写回 `SKILL.md` frontmatter（保留其它字段与正文），成功后删除该 config 记录。诊断页可一键触发。

### 5.6 项目级 Skill 管理（PJ）

- **PJ-01 标签关联**：项目期望集 = 标签命中 ∪ `explicitOn` − `explicitOff`，纯由 config 推导，与文件落地解耦。
- **PJ-02 本体目录 `.agents`**：项目内 skill **本体复制**到 `<project>/.agents/skills/`，可提交 git（团队协作必须有文件本体）。
- **PJ-03 其他 Agent 项目目录软链**：`syncProject` 让各 Agent 的项目级技能目录软链到 `.agents/skills`，实现"一套本体、多 Agent 共享"。实际投放哪些 Agent **以目录结构为事实**（不写 config），通过 `deployedAgents` 反读。
- **PJ-04 同步与清理**：`syncProject` 复制期望集本体、重建 `INDEX.md`（纯产物，供人 / git 查阅，不参与期望集推导），并仅回收"曾由本工具投放"（记录于 `INDEX.md`）的副本，用户自带技能永不误删。
- **PJ-05 回写仓库**：`POST /projects/:id/push` 把 `.agents/skills` 中改动的 skill 反向写回指定仓库（仅覆盖仓库中已存在的同名 skill）；UI 在项目详情「回写仓库」。
- **PJ-06 项目技能归集 / 接管**：复用 Agent 侧链路（同一归集弹窗）。**接管落真实副本**而非软链（`.agents` 要提交、跨机器自包含），并登记为项目受管技能。
- **PJ-07 项目技能删除**：仅允许删除项目里的真实目录；受管（期望内）技能需先停用。

### 5.7 技能导入与归集（IM）

- **IM-01 从 Agent 归集**：`GET /repos/:id/collect/preview` 列出各已安装 Agent 目录内的 skill；两段式确认页按名字分组、仓库版本与各 Agent 版本并列作为候选，由用户决定**保持仓库现状**还是**用某个 Agent 版本覆盖仓库副本**，随后逐项展示写入路径后执行。
- **IM-02 同名去重与合并确认**：同名 skill 交汇时并列展示来源 / 描述等由用户仲裁。归集默认去重跳过（除非用户显式选择覆盖）；`POST /skills/merge` 记录保留来源 `mergeSource`，未在仓库的候选会被收编进主仓库。
- **IM-03 接管**：`POST /repos/:id/takeover` 把 Agent 目录里的条目替换为指向仓库副本的软链（仓库副本必须先存在，需显式 `confirm`）。幂等；来源条目就是仓库本体时不做任何事。
- **IM-04 来源追溯**：导入 / 收编时写入 `skillMeta.origin`，技能详情页展示「来自 xxx」。
- **IM-05 安全边界**：归集只复制、不动来源；接管只换链接、不动仓库副本；所有写操作只针对"本工具接管的内容"。

### 5.8 外部 skill 集导入（EK）

- **EK-01 读取异构目录**：第三方来源支持扁平、嵌套分类、带索引清单三类结构；自有仓库按扁平处理（见 SR-04）。
- **EK-02 批量导入**：`POST /import` 把若干外部目录（每行一个）一次性复制进指定自有仓库；目录仅作数据源、不登记；同名去重跳过。
- **EK-03 导入预览**：`GET/POST /import/preview` 逐目录识别布局、统计可导入数量、汇总解析出的标签。
- **EK-04 第三方仓库**：登记为独立仓库（`foreignSources`），只读关联（`linked=true`）纳入发现、不拷贝、不写其本体。

### 5.9 同步机制（SY）

- **SY-01 每关系策略**：每条（skill, Agent）关系可选软链或复制；优先级：关系覆盖 `skillSync[name]` > Agent `sync` > 全局 `defaultSync`。
- **SY-02 默认软链**：零冗余、即时可见。
- **SY-03 复制回退**：软链创建失败（如 Windows 无权限）时自动降级为复制并写入 `warnings`。
- **SY-04 复制增量 watcher（可选）**：设置页开关 `watchers`，**默认关闭**；仅当存在复制模式 Agent 时启动，监听仓库目录、去抖 800ms 后重跑同步。
- **SY-05 幂等与安全**：`deployAgent` 以 diff 驱动（缺则建、失效则重建）；`prune` 仅在显式操作（预设变更 / 该 Agent 策略变更 / 手动同步 / 修复）时回收**本工具自己部署的软链**，真实目录与外部软链一律不动。
- **SY-06 失败可见**：同步结果 `failed` / `warnings` 直接展示并 toast。

### 5.10 WebUI（UI）

- **UI-01 技术栈**：前端 React + TS + Vite；后端 Node + TS（Express）。
- **UI-02 本地服务**：后端提供 REST API，承担文件扫描、软链 / 复制、配置持久化、可选 watcher。
- **UI-03 页面**：
  - **技能库（Library）**：浏览 / 搜索 / 过滤全部 skill；技能详情（SKILL.md 预览 + 标签编辑 + 来源追溯）；底部仓库区（登记 / 编辑 / 删除仓库，归集 / 导入入口）。
  - **智能体（Agents）**：一个实际技能目录一张卡片，展示当前可见技能、活跃态、关联预设、同目录成员；详情页可设活跃、覆盖目录、同步、关联预设、直接开关技能、按技能覆盖安装方式。
  - **预设（Presets）**：预设列表与详情（按标签纳入 / 按技能纳入、已开启技能、已应用 Agent）。
  - **项目（Projects）**：登记项目、打标签、项目技能列表、部署到 Agent、同步、归集 / 接管、回写仓库。
  - **诊断（Health）**：6 维度体检 + 就地修复（先确认再执行）。
  - **设置（Settings）**：默认安装方式、复制 watcher 开关、自定义 Agent、日志查看 / 下载 / 复制诊断信息。
- **UI-04 页面状态可刷新**：一级页面、二级详情、筛选条件全部写入 hash 地址（`#/<tab>[/<sub>][?<query>]`）。
- **UI-05 统一展示与视觉**：列表型实体统一走 `EntityList`（卡片 / 列表可切换，偏好全局记忆）；筛选统一走 `FilterBar`；视觉一律使用设计 token。

### 5.11 诊断与修复（DG）

- **DG-01 六维体检**：`GET /diagnose` 输出 `sync / dup / durability / config / repo / project` 六维分组与汇总（ok / warn / error）。
  - `sync`：每个活跃目录的期望 vs 物理（缺 / 多 / 失效）。
  - `dup`：同名多来源。
  - `durability`：活跃 Agent 目录里的失效软链。
  - `config`：配置文件是否加载。
  - `repo`：仓库 / 外部源目录是否存在。
  - `project`：项目路径与 `.agents/skills` 是否存在。
- **DG-02 就地修复**：`POST /fix` 按诊断项 key 分发（`sync:<agent>`、`broken:*`、`project:<path>`、`repo:<id>`、`tags:<repoId>`），全部幂等。
- **DG-03 操作前置确认**：修复按钮先弹出「将要执行什么」清单，用户确认后才执行。

---

## 6. 核心场景

### 6.1 切换 Agent 使用不同 token

1. 把 skill 统一沉淀到仓库，维护若干预设（如 `code-review`、`weekly-report`）。
2. 把 `{ trae_cn, qoder }` 设为活跃集合，并让它们的「关联预设」指向 `code-review`。
3. 预设成员一改，触发式同步立刻把 skill 以软链落到两个 Agent 的目录 → 立即可用。
4. 切到 `qwen_code`：把它加入活跃集合并关联预设，即刻就位；其余不在活跃集合的 Agent 保持现状，不被扰动。
5. 在任意活跃 Agent 中改了某 skill → 回写仓库 → 切回时其它 Agent 也能看到最新版本。

### 6.2 项目级协作

1. 项目 `foo` 打标签 `react`。
2. 资产库中带 `react` 标签的 skill 自动进入项目期望集（逻辑层）。
3. 点「同步」：本体复制到 `<foo>/.agents/skills/`，其余 Agent 项目目录软链至 `.agents`，可提交 git 供团队共享。
4. 团队在 `.agents` 中改动 skill → 点「回写仓库」把改动推回仓库本体。

---

## 7. 产品模型

```
config.json ──推导──▶ 期望集 desired ──投影──▶ 物理目录（软链 / 复制）
     ▲                                              │
     └─────────── 诊断 diffSync 对账 ◀───────────────┘
```

- **决策（config）**：`repos / foreignSources / customAgents / agents / activeAgents / presets / skillMeta / projects`。
- **期望集（desired）**：运行时由决策推导，不落盘。
- **投影（projection）**：期望 → 物理目录的 diff 对账，幂等。
- **同步作用域**：自动同步只作用于**活跃集合**；非活跃 Agent 懒同步。

---

## 8. 非功能需求（NFR）

- **NFR-01 全本地**：所有读写发生在本机文件系统，数据不出本机。
- **NFR-02 兼容性**：软链在 macOS / Linux 原生支持；Windows 软链无权限时自动降级为复制。
- **NFR-03 无侵入**：不写任何 Agent 专有格式；仓库与 `.agents` 遵循 `SKILL.md` 通用约定。
- **NFR-04 可独立维护**：仓库目录可被 git / 任意工具管理，本工具离开后资产仍可用。
- **NFR-05 幂等**：扫描、导入、归集、同步可重复执行，不产生重复本体或悬空链接。
- **NFR-06 可诊断**：失效软链、复制冲突、权限问题、目录缺失均有可见状态与修复指引。
- **NFR-07 可观测**：结构化日志落盘（`~/.flint/logs/app.log`），写入前把 homedir 前缀脱敏为 `~`，按大小轮转保留 3 份；设置页可查看 / 下载 / 复制诊断信息。

---

## 9. 整体验收标准

- 首次进入可经「登记仓库 → 归集 / 导入 → 配预设 → 投给 Agent」的最小通路把 skill 用起来。
- 任意决策变更（标签 / 预设 / explicit / 活跃集合）后，活跃 Agent 物理目录与期望集一致（`diagnose` 可验证）。
- 变更只在活跃 Agent 上即时生效，非活跃不被静默改动。
- 第三方仓库与 Agent 自带技能的本体不被写入 / 误删。
- 重复执行同一对账，结果幂等、无副作用。
