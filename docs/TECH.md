# Flint 技术架构（TECH）

> 本文描述 Flint 的**当前实现**：技术栈、分层、数据模型、核心引擎、HTTP API、前端架构与关键设计约定。
> 产品需求见 [`PRD.md`](./PRD.md)，快速上手见 [`../README.md`](../README.md)，开发约定见 [`../AGENTS.md`](../AGENTS.md)。

---

## 1. 技术栈与运行

| 层 | 选型 |
|----|------|
| 前端 | React 18 + TypeScript + Vite 5（`client/`） |
| 后端 | Node.js ≥ 20 + TypeScript + Express 4（`server/`） |
| YAML | `yaml`（解析 / 回写 `SKILL.md` frontmatter） |
| 编排 | npm workspaces（`server` / `client`）+ concurrently |
| 配置 | JSON 文件 `~/.flint/config.json`（可由 `FLINT_CONFIG` 覆盖） |
| 日志 | `~/.flint/logs/app.log`（结构化单行，按大小轮转） |

- 根 `package.json` 定义 workspaces 与脚本：`dev`（并行起前后端）、`dev:server`、`dev:client`、`build`、`start`。
- 端口：后端默认 `8787`（`PORT`），前端默认 `5173`（`CLIENT_PORT`）；Vite 将 `/api` 代理到后端。
- `start.sh`：一键启动（检查 Node ≥ 20 / 依赖 / 端口占用 → 后台启动 → 等待就绪 → 打开浏览器 → 脚本退出，进程驻留后台）。支持 `-y`（强制重启）、`-h`；日志写 `~/.flint/logs/`。

---

## 2. 目录结构

```
flint/  (local-skills-hub)
├─ package.json            # workspaces + 顶层脚本
├─ start.sh                # 一键启动脚本
├─ README.md               # 使用说明
├─ AGENTS.md               # 开发指引（AI 助手 / 贡献者）
├─ docs/PRD.md             # 产品需求
├─ docs/TECH.md            # 本文件（技术架构）
├─ server/
│  ├─ src/
│  │  ├─ index.ts          # 入口：装配 ConfigStore / Router，resync（自动同步已停用）
│  │  ├─ api/routes.ts     # 全部 REST 路由
│  │  ├─ config/           # types.ts / store.ts / defaults.ts
│  │  ├─ core/             # 领域逻辑（见 §4）
│  │  ├─ domain/cards.ts   # 领域行 → 前端展示契约
│  │  ├─ infra/            # config-store / fs / logger / picker 适配
│  │  └─ ...
│  └─ smoke.ts             # 端到端 smoke（临时目录，不污染本机）
└─ client/
   └─ src/
      ├─ App.tsx           # 布局 + tab 路由分发
      ├─ api/              # fetch 封装 + 前端类型契约
      ├─ state/            # hash 路由 / 全局 bus / viewMode / collapse / useAsync
      ├─ views/            # Library / Agents / Presets / Projects / Health / Settings
      ├─ components/       # ui / common / skill / agent / layout
      ├─ log/logger.ts     # 前端日志（上报到服务端）
      └─ styles/           # tokens.css / base.css / app.css
```

---

## 3. 分层架构

```
浏览器 (React + Vite :5173)
      │ HTTP /api
      ▼
Express Router (api/routes.ts)  ── 解析请求、校验、调 core、触发投放
      │
      ├─ core/ 领域层                 扫描·投放·标签·导入·项目·诊断
      ├─ config/ 配置层               ConfigStore（加载 / 迁移 / 保存 config.json）
      ├─ domain/ 展示契约             行 → SkillCardView
      └─ infra/ 基础设施              日志 / 配置读写 / 系统选择器
      │
      ▼
文件系统：仓库目录 · Agent 各技能目录 · 项目 .agents
```

- **副作用全部在后端**：扫描、软链 / 复制、配置持久化都发生在 `server`；前端只通过 REST 读写。
- **前后端类型契约各自维护**：后端 `config/types.ts` 定义持久化模型，前端 `api/types.ts` 定义视图契约；后端用 `domain/cards.ts` 把领域行翻译成前端可直接渲染的卡片。

---

## 4. 核心模块（server/src）

| 模块 | 职责 |
|------|------|
| `core/skill.ts` | 读取 / 解析 `SKILL.md` frontmatter（name / description / version / tags，兼容顶层 `tags` 与 `metadata.tags`）。 |
| `core/scanner.ts` | 扫描仓库 / 外部源：自有仓库**恒按扁平**读取，外部源支持布局识别（flat / nested / auto，深层存在技能即判 nested）、带索引清单（catalog）读取、聚合 `scanAll`。 |
| `core/tags.ts` | `effectiveTags`：`config.skillMeta` 覆盖优先，回落 frontmatter。 |
| `core/repo-tags.ts` | 把 `skillMeta` 标签写回 `SKILL.md` frontmatter（保留其它字段与正文）。 |
| `core/agents.ts` | 内置 Agent 清单、路径解析、同目录归并与**主 Agent** 判定、`agentSkillRows`（**只读目录**的某 Agent 完整技能行并集）、`isManagedLinkTarget` / `repoSkillRoots`。 |
| `core/sync.ts` | **一次性投放能力**：复用 `resolveSyncMode` / `symlinkSkill` / `copySkill` / `dirsEqual` / `deployAgent`，暴露 `deployOne`（单技能部署，`prune:false`）供添加 / 应用预设调用；`diffSync`（只读对账）供诊断。**无期望集推导、无自动同步。** |
| `core/active.ts` | 活跃集合 set / toggle（仅作展示 / 排序 / `primaryOf` 判定 / 诊断扫描的辅助集合）。 |
| `core/presets.ts` | 预设 CRUD。 |
| `core/collect.ts` | 归集：预览某来源目录、复制进仓库（去重 / 覆盖）。 |
| `core/takeover.ts` | 接管：把来源目录条目替换为指向仓库副本的软链。 |
| `core/import.ts` | 批量导入外部目录 + 导入预览。 |
| `core/merge.ts` | 同名多来源合并仲裁。 |
| `core/integrate.ts` | 汇总所有来源（仓库 / 外部源 / Agent 目录）为候选清单（供诊断 dup）。 |
| `core/projects.ts` | 项目投放（复制 `.agents` 本体、写 `INDEX.md` 登记）、投放 Agent 反读、接管（副本）、回写仓库。 |
| `core/diagnose.ts` | 6 维度只读体检。 |
| `core/fix.ts` | 按诊断项 key 分发就地修复。 |
| `core/picker.ts` | 系统原生目录 / 文件选择器（macOS osascript / Windows PowerShell / Linux zenity·kdialog）。 |
| `domain/cards.ts` | `AgentSkillRow` / `ProjectSkillRow` → `SkillCardView`（reason / store / state / actions）。 |

---

## 5. 数据模型（`~/.flint/config.json`）

```ts
interface HubConfig {
  schemaVersion: number;          // 当前 3，加载时自动迁移
  repos: Repo[];                  // 自有仓库
  foreignSources: ForeignSource[];// 第三方仓库（只读关联）
  customAgents: CustomAgent[];    // 自定义 Agent
  agents: Record<string, AgentOverride>;  // 按 Agent 的覆盖与策略
  activeAgents: string[];         // 活跃集合
  presets: Preset[];
  skillMeta: Record<string, SkillMeta>;   // 兼容标签 / 来源追溯 / 合并记录
  projects: ProjectLink[];
  defaultSync: 'symlink' | 'copy';
}
```

| 类型 | 关键字段 |
|------|---------|
| `Repo` | `id`（参与 `name@id`，不可变）、`name?`、`path`、`root?`（skills 根，缺省 `<path>/skills`）。**无 `layout`：自有仓库恒为扁平** |
| `ForeignSource` | `id`、`name`、`path`、`layout`（flat / nested / auto；只有只读来源才需要它）、`linked`（true=只读关联） |
| `CustomAgent` | `key`、`name`、`globalDir`（绝对路径或 `~/`）、`projectDir?`、`recursive?` |
| `AgentOverride` | `globalDir?`、`projectDir?`、`sync?`、`skillSync?: Record<skillName, SyncMode>`、`preset?`、`primary?` |
| `Preset` | `name`、`skills: string[]`（`name@来源`）、`tags: string[]` |
| `SkillMeta` | `tags: string[]`、`mergeSource?`、`origin?` |
| `ProjectLink` | `path`、`tags: string[]` |

**迁移与清理**（`config/store.ts`）：
- 旧 Agent key → 新 key（`claude`→`claude_code`、`trae-cn`→`trae_cn`、`qwen-code`→`qwen_code`、`kilo-code`→`kilo_code`、`roo-code`→`roo_code`、`gemini-cli`→`gemini_cli`）。
- 剔除历史残留死字段：preset 的 `active`、agent 的 `mode`、agent / project 的 `explicitOn` / `explicitOff`（开关已取消，agent / 项目完全以实际目录为准）。
- 历史 `watchers`（复制模式 watcher 开关）随 watcher 退役一并忽略，保存后自然消失。

### 5.1 数据资产：两个世界

- **文件系统世界（本体，唯一可信副本）**：仓库 skill 目录、第三方源目录、Agent 全局目录（软链 / 复制 / 自带本体）、`<project>/.agents/skills`（本体）、`<project>/.<agent>/skills`（软链 → `.agents`）。标签载体为 `SKILL.md` frontmatter。
- **config 世界（管理元数据）**：只存**不可从文件系统推导的用户决策**。config 里**没有 skill 本体的注册表**——资产库列表每次由 `scanAll` 实时扫描得出，文件系统本身就是资产清单。

---

## 6. 核心数据流

```
config.json ──(手动添加 / 应用预设)──▶ deployOne 一次性投放 ──▶ 物理目录（软链/复制）
     ▲                                                        │
     └────────── 物理目录为准；无期望集、无自动补回 ◀────────────┘
```

### 6.1 资产入仓

```
Agent 技能目录 ──归集(复制)──▶ 仓库 skills/ ──scanAll──▶ 资产库视图 (id = name@来源)
外部目录     ──批量导入(复制)──▶ 仓库 skills/
第三方仓库   ──只读关联────────▶ scanAll 纳入发现（不拷贝）
```

去重键 = skill 目录名（`name`）；`name@来源` 允许跨来源重名共存于逻辑层，但**投放时按 `name` 归一化只落一份**。

### 6.2 手动投放（一次性部署）

```
添加（POST /agents/:key/skills，body {id: name@source}）: 用户选定单技能
        │   复用 deployOne（单技能部署，prune:false），软链 / 复制按 resolveSyncMode 决定
        ▼
落盘到 Agent 目录：按 name 建软链或副本
   ├─ 已存在同名校验 → 软链指向正确则跳过；实体目录内容一致才允许重建，否则报 failed（用户自有内容不删）
   └─ 删除（DELETE /agents/:key/skills/:skillName）→ 仅回收 isManagedLinkTarget 判定的本工具部署软链 / 副本
```

- **应用预设（一次性）**：在某目录「应用预设」= 把该预设展开成员逐个 `deployOne` 部署一次（`prune:false`），**此后不再自动补回**——被删技能不会因预设仍在而自动回来。
- **无自动同步**：`activeAgents` 不再作为部署触发作用域；`onChanged/onConfigChanged` 不再自动 resync / 部署。手动 `POST /sync` 显式保留。
- **幂等**：重复执行 diff 为空即无操作；安全边界决定不覆盖真实目录、不删外部软链。

### 6.3 项目级链路

```
添加（POST /projects/:id/skills）: 手动选定技能 ──▶ 复制本体到 <project>/.agents/skills/（写 INDEX.md 登记）
        │
        ├─ 软链 ──▶ <project>/.<agent>/skills   （一套本体、多 Agent 共享）
        └─ 反写     ──▶ POST /projects/:id/push  （.agents → 仓库）
```

- 投放对象**以目录结构为事实**（软链 / 副本是否存在），不写 config（`deployedAgents` 反读）。
- `INDEX.md` 记录本工具投放的技能（供人 / git 查阅），也用作回收时判定"曾由本工具投放"以安全回收副本；不参与任何期望集推导。删除仅移除本工具登记的副本，用户自带技能永不误删。

### 6.4 标签链路

```
skillMeta[id].tags（优先） → frontmatter tags / metadata.tags（回退）
        │
        └─ 消费方：① 资产库过滤 ② 预设标签关联 ③ 项目标签命中
```

---

## 7. 同步引擎详解（`core/sync.ts`）

| 函数 | 说明 |
|------|------|
| `deployOne(agentKey, skillId, cfg, allSkills)` | 单技能一次性部署：按 `name` 落盘到目标目录（内部复用 `deployAgent`，`prune:false`），受 `isManagedLinkTarget` 安全守卫；**不写 config**（物理即真相）。 |
| `resolveSyncMode(cfg, agentKey, skillName)` | 同步方式：`skillSync[name]` > agent `sync` > `defaultSync`。 |
| `deployAgent(cfg, agentKey, skillName, allSkills)` | 落盘单技能：建软链 / 副本 / 失效重建；安全前提见下。 |
| `syncActive(cfg, allSkills, only?, reason)` | 仅保留给「手动应用预设」的一次性调用（展开预设成员逐个 `deployOne`）；不再由任何自动同步触发。 |
| `diffSync(cfg, allSkills)` | 只读对账：实际目录 vs 来源（missing / extra / brokenLink），`desired` 恒为空，仅用于识别残留 / 失效，供诊断。 |

**`deployAgent` 的安全边界**（决定"绝不误删"）：
1. 落点已有软链：指向正确则跳过；指向本工具部署的仓库则重建；指向**外部**（不在任何自有仓库内）则报 `failed`，不替换。
2. 落点已有实体目录：内容与目标副本一致才视为"本工具部署的副本"可重建，否则报 `failed`（用户自有内容不删）。
3. 删除 / `prune` 只回收 `isManagedLinkTarget` 判定为本工具部署的软链 / 副本——目标落在**自有仓库或第三方来源**注册库内（口径已扩展）；真实目录与外部软链不动。
4. 软链创建失败时降级为复制并记入 `warnings`（Windows 兼容）。

---

## 8. 同目录主 Agent 机制（AG-02 / C18）

**问题**：多个 Agent 可能解析到同一全局目录（如 `codex` / `warp` / `openhands` 共用 `~/.agents/skills`）。目录只有一份实体，需要确定唯一的策略 / 投放落点，避免多个 Agent 各自投放、互相覆盖。

**方案**：每个技能目录固定一个**主 Agent** 作为策略唯一落点，同目录其它 Agent 视为别名。

- 主 Agent 判定（`primaryOf`）：① 用户显式 `primary: true` 优先 → ② 活跃优先 → ③ 名称序。
- `effectiveAgentKey` 把任意 Agent 折算到其目录的主 Agent；策略读写、投放目标都以它为准。
- `setPrimary`：指定 / 取消主 Agent（同目录至多一个，写在被指定者身上）。
- `pruneAliasStrategies`：清理别名那份永不生效的策略，避免配置里留下假象。
- 展示：卡片与详情页的标题都罗列使用该目录的全部 Agent（不分主次），**不设「主 / 别名」徽标**——它们是否共用由一句「这些 Agent 共用这个技能目录：同一套策略，分发一次全部生效」说明；「存在谁名下」在详情页「安装与存放 → 策略存放于」可更换。
- 投放按目录归并：一次 `deployOne` 作用于该目录实体，组内其它 Agent 一并生效；`activeAgents` 只参与主 Agent 判定，不决定是否自动投放。

---

## 9. 归集 / 接管 / 导入

| 动作 | 接口 | 语义 |
|------|------|------|
| 归集预览 | `GET /repos/:id/collect/preview` | 列出各已安装 Agent 目录内的 skill，标注是否已在仓库、本体是目录还是软链、软链目标是否落在本仓库。 |
| 归集 | `POST /repos/:id/collect` | 复制进仓库（解引用源软链）；同名默认去重跳过，`replaceNames` 指定者覆盖（防自毁：源与仓库为同一本体时跳过）。 |
| 接管 | `POST /repos/:id/takeover` | 把来源条目替换为指向仓库副本的软链（需 `confirm`）；来源条目就是仓库本体时不动。 |
| 项目归集 / 接管 | `GET|POST /projects/:id/collect`、`POST /projects/:id/takeover` | 复用同一链路；**项目接管落真实副本**（`.agents` 要提交、跨机器自包含）。 |
| 批量导入 | `POST /import` | 复制外部目录进仓库；同名去重；写入 `origin` 来源追溯。 |
| 合并仲裁 | `POST /skills/merge` | 同名多来源时保留指定来源；未在仓库的候选被收编进主仓库；记录 `mergeSource`。 |

**行内入口的可见性**：Agent 技能表上的「归集到仓库」只在技能**尚无归属**时出现——本体是自带真实目录，或软链**不落在**任何「已登记库」（自有仓库 / 第三方来源 / 共享标准目录 `~/.agents/skills`、`~/.config/agents/skills`）之内。软链有归属时（`alreadyInLibrary` = `isLinkInRegisteredLibrary`，纯按目标路径判定）本体已经在库里了，再归集只会复制出重复本体，因此只保留「从本目录移除」；要覆盖仓库副本请走技能库「添加技能 → 从 Agent 归集」，那里才有并列候选可比。自带真实目录不受此限：它的本体在本地，覆盖仓库副本的行内入口保留。**「仓库里恰有同名副本」不算归属**——那是「同名」，不是「这条软链来自仓库」，不该据此隐藏入口、更不该拿它冒充来源。

前端 `CollectSkillModal` 通过 `CollectSourceApi` 适配器（Agent 目录 / 项目目录）复用同一弹窗与流程。

---

## 10. 诊断与修复

- `GET /diagnose` → `{ config, summary, groups, items }`，分组：`sync / dup / durability / config / repo / project`。
- 不含独立的 "Agent" 维度：Agent 侧没有能独立成立的健康问题，相关状态由 `sync` / `durability` 覆盖。
- `POST /fix { key }` 分发：
  - `sync:<agent>` → 对账该 Agent 目录（补缺失 / 修失效，`prune:true` 回收本工具部署物）。
  - `broken:*` → 扫描全部活跃 Agent 的失效软链并修复。
  - `project:<path>` → 创建 `<path>/.agents/skills`。
  - `repo:<id>` → 创建仓库 skills 目录。
  - `tags:<repoId>` → 标签迁移到 frontmatter。
- UI（`views/Health.tsx`）先由诊断项生成「将要执行什么」清单，用户确认后再执行。

---

## 11. HTTP API 一览

> 全部挂载在 `/api` 前缀下。投放 / 删除由用户显式触发（添加、应用预设、删除），**无自动同步补回**；`POST /sync` 为保留的显式手动同步。

**状态 / 设置**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/state` | 资产库聚合视图：activeAgents / skills / presets / repos / sources / customAgents / settings / home |
| GET / PUT | `/settings` | 默认同步方式 |

**技能**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/skills/:id/content` | SKILL.md 正文 + 附带文件列表 |
| PATCH | `/skills/:id` | 保存标签（归一化后写入 `skillMeta`） |
| POST | `/skills/merge` | 同名合并仲裁 |

**仓库 / 来源**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET / POST | `/repos` | 列出 / 登记自有仓库 |
| PUT / DELETE | `/repos/:id` | 编辑（可切类型）/ 删除 |
| POST | `/repos/scan/:id` | 扫描单仓库 |
| POST | `/repos/detect` | 探测目录布局 |
| POST | `/repos/:id/tags-migrate` | 标签迁移到 frontmatter |
| GET | `/repos/:id/collect/preview` | 归集预览 |
| POST | `/repos/:id/collect` | 归集 |
| POST | `/repos/:id/takeover` | 接管 |
| GET / POST | `/sources` | 列出 / 登记第三方仓库 |
| PUT / DELETE | `/sources/:id` | 编辑（可切类型）/ 删除 |

**Agent / 活跃**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agents` | Agent 视图列表（含 primaryKey / sharedWith / 生效策略） |
| PUT | `/agents/:key` | 更新策略（sync / preset / skillSync）、目录覆盖、主 Agent 指定；仅保存，不触发自动投放（`activeAgents` 不作部署作用域） |
| GET | `/agents/:key/skills` | 该 Agent 技能行（**读目录**）+ 可添加清单 |
| POST | `/agents/:key/skills` | **添加**单个技能（body `{id: name@source}`，`deployOne` 一次性部署软链 / 副本） |
| POST | `/agents/:key/sync` | 手动同步（`prune:true`，回收本工具部署物） |
| DELETE | `/agents/:key/skills/:skillName` | **删除**该技能物理产物（仅本工具部署的软链 / 副本；真实目录与外部软链一律不动） |
| GET / POST | `/agents/custom` | 列出 / 新增自定义 Agent |
| DELETE | `/agents/custom/:key` | 删除自定义 Agent |
| GET / PUT | `/activeAgents` | 活跃集合（仅作展示 / 排序 / `primaryOf` 判定 / 诊断扫描的辅助，不再触发投放） |

**预设 / 项目**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET / POST | `/presets` | 列出 / 创建 |
| PUT / DELETE | `/presets/:name` | 更新 / 删除预设定义（仅刷新，不再自动同步到任何目录；Agent / 项目页「应用预设」一次性投放） |
| GET / POST | `/projects` | 列出（含 deployedAgents）/ 新建项目 |
| PUT | `/projects/:id/tags` | 改标签（仅刷新，不自动重投） |
| PUT | `/projects/:id/agents` | 调整投放 Agent（以目录结构为事实） |
| GET | `/projects/:id/skills` | 项目技能行（**读目录**）+ 可添加清单 |
| POST | `/projects/:id/skills` | **添加**单个技能（复制本体到 `.agents` 并登记 `INDEX.md`，对齐 takeover 的 copy 语义） |
| DELETE | `/projects/:id/skills/:name` | **删除**本工具登记投放的副本（真实目录与外部内容不动） |
| GET | `/projects/:id/collect/preview` | 项目技能归集预览 |
| POST | `/projects/:id/collect` | 项目技能归集 |
| POST | `/projects/:id/takeover` | 项目技能接管（副本） |
| POST | `/projects/:id/push` | 回写仓库 |
| POST | `/projects/:id/sync` | 同步项目 |

**导入 / 诊断 / 同步 / 日志**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET / POST | `/import/preview` | 导入预览 |
| POST | `/import` | 批量导入 |
| GET | `/diagnose` | 体检 |
| POST | `/fix` | 就地修复 |
| GET | `/sync/status` | 只读对账（`diffSync`） |
| POST | `/sync` | 手动同步（可选 `agents` 限定） |
| GET | `/logs` · `/logs/download` | 查看 / 下载日志 |
| POST | `/filesystem/pick` · `/filesystem/pick-file` | 调起系统目录 / 文件选择器 |

**请求入口包装**（`index.ts`）：
- `onChanged` / `onConfigChanged`：结构性变更后的通知钩子，当前入口未注入订阅者；**不触发任何自动同步或对账**。
- `POST /sync`（手动显式）保留为唯一的手动全量同步入口。

---

## 12. 前端架构

### 12.1 路由（`state/router.ts`）

- 极简 **hash 路由**，作为"当前页面"的唯一数据源：`#/<tab>[/<sub>][?<query>]`。
- 一级页面（6 个 tab）、二级详情（Agent key / 项目 id / 技能 id / 预设名）、筛选条件全部写进地址，刷新 / 分享可复原。
- hooks：`useRoute` / `useQueryParam` / `useQueryFlag` / `useQueryValue` / `useQueryList`；高频输入用 `replace: true` 避免污染历史栈。

### 12.2 状态

- `state/store.ts`：全局 reload 总线（`emitReload` / `subscribe`）+ 主题记忆。
- `state/viewMode.ts`：卡片 / 列表偏好，全局共享并持久化。
- `state/collapse.ts`：折叠态持久化（localStorage）。
- `state/useAsync.ts`：请求 + loading/error + reload 封装。

### 12.3 统一展示契约

- `components/common/EntityList.tsx`：`EntityItem` 契约 + 卡片 / 列表两种渲染；技能、预设、项目、Agent、仓库、来源、归集候选等一切列表型实体统一走它。`EntityItem.variant` 目前只有 `standard`（共享标准目录卡片换色突出），用于需要与同类卡片拉开视觉层级的特例。
- `components/common/FilterBar.tsx`：搜索 + 维度筛选 + 重置 + 视图切换 + 徽标说明入口。
- `components/skill/SkillBadges.tsx`：技能徽标（reason / store / state / 已接管 / 目录）与「标签说明」数据源，卡片与列表行共用。
- `components/agent/agentBadges.tsx`：Agent 徽标（活跃 / 开源生态推荐目录 / 自定义 / 家族 / 未安装 / 预设）与说明数据源。「开源生态推荐目录」只标在 `~/.agents/skills` 这个目录本身（判定用 `readsAgentsDir`，即后端 `shared === 'agents'`），不对每个读取它的 Agent 重复「另读」；`~/.config/agents/skills` 等其它共用目录不做任何标记。
- `components/agent/OpenStandardTitle.tsx`：`~/.agents/skills` 的主标题（列表卡片与详情页共用）——写明「开源生态推荐目录」，info 按钮在卡片上讲「大部分 Agent 都读这个目录、推荐优先管理，只装给某一个 Agent 请用该 Agent 自己的目录」，在详情页上讲「大部分 Agent 都支持读这个目录，页面这几个是当前使用的代表」。该卡片 `variant: 'standard'` 换用 `--c-standard` 强调色、使用它的 Agent 名退到副标题弱化，并在**活跃 / 非活跃各自分组内排第一位**；非活跃时强调色减弱、边框换虚线（看得出是非活跃推荐目录，仍与普通卡片区分得开）。
- **详情页的目录口径**（`views/Agents.tsx` 的 `AgentDetail`）：`~/.agents/skills` 的详情页以推荐目录为标题主体（`OpenStandardTitle`，info 说明「这几个是当前使用的代表」），成员退到副行 `<目录> · <成员并列>`；其它目录的标题用 `AgentNamesTitle` 罗列整组成员（主 Agent 在前、其余名称序，与卡片同序）。活跃状态与切换都按**整个目录**处理——`dirActive = members.some(m => m.active)`，切换时整组成员一起加入 / 移出 `activeAgents`，与列表卡片同口径，避免「卡片说活跃、页面说非活跃」。
- **同目录只有一个详情页**：`AgentNamesTitle` 只做并列展示、不再逐名可点（同一目录不存在「某个 Agent 自己的页」）；地址指向别名（如 `#/agents/openhands`）时前端 `replace` 规范到该目录的主 Agent，避免同一目录出现两个详情页各说一套。
- `components/agent/agentGroups.ts`：按解析后的目录把 Agent 归并成卡片模型（主 Agent 在前）。
- `domain/cards.ts` ↔ `api/types.ts`：后端领域行 → `SkillCardView`，前端按 `reason / store / state` 决定徽标与可执行操作（`add / delete / collect / detail`，无 on/off 开关）。
- **状态列只回答「装没装、可不可用」**：`state` 只有 `on`（该技能就在本目录里，本 Agent / 项目可用——本工具分发的、自带目录、外部软链、共享目录读到的都算）；删除后物理产物被移除，不再有 `off` 状态。「本工具管不管它」不占状态列，由 `reason` 徽标表达（自带 / 外部软链 / 只读），前端用 `isToolManaged(item)` 判断是否渲染「添加 / 删除」、是否进「安装方式」清单。
- **行内「是什么」以事实为准**：`SkillCardView.source` 只表达**软链目标实际落在哪个已登记库**（`libraryOfLinkTarget`，按路径判定；自有仓库 / 第三方来源），判定不出就留空——绝不拿技能名去回填来源。不在本工具分发范围内的行（`own` / `external` / `shared`）再由服务端给出 `pathLabel`（真实位置，软链附带真实目标，home 压成 `~`），列表把它当行的副标题展示；本工具分发的行才用 `name@来源` 表达身份。

### 12.4 关键交互约定

- **乐观更新 + 串行提交**：Agent 页「直接添加技能」与预设页「按技能纳入」用本地草稿即时反映，请求进串行队列，避免连点时后发先至。
- **路径输入统一可调起系统选择器**：`components/ui/PathField.tsx`（`PathField` / `PathListField`）；相对路径（如 `.my-tool/skills`）因选择器无法表达，保留纯文本输入并注明。
- **技能详情**：`views/Library.tsx` 的 `SkillDetailModal` 提供元数据 + 标签编辑 + 来源追溯 + `SKILL.md` 预览。

---

## 13. 关键设计约定

> 所有功能演进都必须遵守的底层规则。

### 数据本体类

- **C1 文件即本体**：skill 本体只以普通文件目录存在于磁盘；任何新功能不得把 skill 内容写入 config 或数据库。
- **C2 开放格式**：仓库与 `.agents` 只遵循 `SKILL.md` 约定，不引入私有清单 / 索引文件。
- **C3 管理信息与外部本体分离**：第三方仓库的用户归类不写其本体（`skillMeta` 承载，或迁移到自有副本）。

### 状态与事实类

- **C4 以文件目录状态为准**：凡是"物理上看得见"的状态（投放给了哪些 Agent、Agent 装了哪些技能）一律以目录为唯一事实，不在 config 存快照。
- **C5 config 只存不可推导的管理决策**：每个字段都须满足"删掉后无法从文件系统重新推导"。
- **C6 物理为准，无期望集**：agent / 项目技能列表与状态**完全以实际目录为准**，不在 config 存 on/off 开关，也不维护"应装什么"的运行时期望集。投放由用户显式发起（添加 / 应用预设 / 删除）、一次性生效，没有按期望集的自动补回。
- **C7 幂等**：扫描 / 导入 / 归集 / 投放可重复执行；写操作先算 diff 再动手。

### 标识与命名类

- **C8 `name@source` 逻辑唯一，`name` 物理唯一**：逻辑层用 `name@来源` 精确标识，物理投放按 `name` 归一化只落一份。
- **C9 去重收敛**：同名 skill 自动去重保留一份；复制类操作默认带同名去重。

### 同步类

- **C10 手动投放，无自动补回**：物理目录只经用户显式「添加 / 应用预设 / 删除」变更；不存在按期望集或事件驱动的自动同步，被删技能不会自动回来。`POST /sync` 为保留的显式手动同步。
- **C11 软链优先，复制回退**：默认软链；不跟随软链的场景降级为复制。
- **C12 `activeAgents` 不作部署作用域**：活跃集合仅作展示 / 排序 / `primaryOf` 判定 / 诊断扫描的辅助集合，不触发、不限定任何自动投放。
- **C18 一个目录只有一套策略（主 Agent 生效）**：见 §8。
- **C13 只读尊重，不侵入外部数据**：只读关联的外部源只读不写；Agent 自带技能与外部软链不擅自改动；删除只针对 `isManagedLinkTarget` 判定为本工具部署（自有仓库 ∪ 第三方来源）的软链 / 副本，真实目录与外部软链永不删。

### 生态兼容类

- **C14 标签落在生态共识位置**：优先 `SKILL.md` frontmatter 顶层 `tags`（社区 40+ 工具原生读取、随 git 版本化）；本工具对暂未回写的标签以 `skillMeta` 暂存并提供迁移。
- **C15 多布局宽容读取**：外部源支持 flat / nested / 带索引清单；**自有仓库恒为扁平**（只认根下的 `SKILL.md`，分类子目录里的技能由诊断报出、不静默丢弃）。发现一律**以 `SKILL.md` 存在为准**，不以目录深度为准。

### 边界类

- **C16 全本地，数据不出机**：不引入上报、遥测或云端依赖。
- **C17 可诊断**：每引入一种新状态或新载体，必须同步在 diagnose 中增加对应检查项。

### 前端约定类

- **F1 URL 是页面状态的唯一来源**：详情选中项与筛选条件必须走 router，不得用组件内部 state 保存"当前在看哪一个"。
- **F2 近似展示复用通用组件**：列表型 UI 先扩 `EntityItem` 契约或 `FilterBar` 的 `controls` 插槽；不得手写 `.entity-row` / `.entity-card`。
- **F3 视觉一律走 token**：颜色 / 字号 / 间距 / 圆角 / 动效 / 字体全部引用 `styles/tokens.css` 命名变量，组件不内联色值。
- **F4 路径输入统一可调起系统选择器**：新增绝对路径输入必须使用 `PathField`。

---

## 14. 日志与可观测

- 结构化单行日志：`时间 [级别] [模块] 消息 {meta}`，同时输出 console 与落盘 `~/.flint/logs/app.log`。
- 级别由 `FLINT_LOG_LEVEL`（默认 `info`）控制；写入前把 homedir 前缀脱敏为 `~`。
- 轮转：超过阈值（`FLINT_LOG_MAX_MB`，默认 5MB）时 `app.log → app.1.log → app.2.log`，保留 3 份。
- 请求日志记录 method / path / status / 耗时与 body 字段名（不记值）。

---

## 15. 测试与脚本

- `server/smoke.ts`：使用临时目录（`FLINT_CONFIG` 指向 mkdtemp），覆盖最小闭环（扫描 → 预设 → 添加 / 应用预设落盘）、项目级投放、回写仓库、批量导入 + 诊断、预设标签命中、同目录共用、显式指定主 Agent 等批次；不污染真实 `~/.xxx` 目录。
- `npm run build`：先构建 server（`tsc`）再构建 client（`tsc && vite build`）。
