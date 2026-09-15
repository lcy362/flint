# AGENTS.md — 开发指引

> 面向在本仓库工作的 AI 编码助手与人类贡献者。目标：在不破坏核心不变量（见 §5）的前提下，快速、正确地改动代码。
> 产品需求见 `docs/PRD.md`，技术架构见 `docs/TECH.md`，用户使用见 `README.md`。

---

## 1. 项目是什么

Flint（`local-skills-hub`）是一个**本地优先**的个人 AI Skills 资产管理器：以文件系统为唯一事实源，集中管理 skill、打标签、去重，并按预设 / 标签把 skill 分发（软链或复制）到各 AI Agent 目录与项目目录。

一句话模型：

```
config.json ──推导──▶ 期望集 desired ──投影──▶ 物理目录（软链 / 复制）
     ▲                                             │
     └──────────── 诊断 diffSync 对账 ◀─────────────┘
```

## 2. 技术栈与命令

- 后端：Node.js ≥ 20 + TypeScript + Express（`server/`），文件监听 chokidar，YAML 解析 `yaml`。
- 前端：React 18 + TypeScript + Vite（`client/`）。
- 依赖管理：npm workspaces（根 `package.json`）。

```bash
npm install          # 安装全部 workspace 依赖
npm run dev          # 并行起前后端（server: tsx watch / client: vite）
npm run dev:server   # 仅后端
npm run dev:client   # 仅前端
npm run build        # server tsc + client vite build
npm start            # 以构建产物启动后端
./start.sh           # 一键启动（环境/依赖/端口检查 → 打开浏览器）
npm test             # 单元测试（vitest，server workspace）
npm run test:watch -w server    # 单测 watch 模式
npm run smoke -w server         # 端到端 smoke（临时目录，不碰本机真实目录）
node bin/flint.mjs --no-open    # 按 npm 包的方式启一次（等价 npx flint-skills-hub）
```

- 端口：后端 `8787`（`PORT`），前端 `5173`（`CLIENT_PORT`）；Vite 代理 `/api` → 后端。
- 配置：`~/.skills-hub/config.json`（`SKILLS_HUB_CONFIG` 可覆盖）；日志：`~/.skills-hub/logs/app.log`。
- 发布包名 `flint-skills-hub`，注册命令 `flint` 与 `flint-skills-hub`；发布流程见 `docs/RELEASE.md`。

## 3. 仓库结构

```
server/src/
├─ index.ts         # 入口：装配 ConfigStore / Router / CopyWatcher，resync（触发式同步）
├─ api/routes.ts    # 全部 REST 路由（唯一 HTTP 出口）
├─ config/          # types.ts（数据模型）/ store.ts（加载·迁移·保存）/ defaults.ts
├─ core/            # 领域逻辑：scan / sync / agents / tags / collect / takeover / projects / diagnose / fix ...
├─ domain/cards.ts  # 领域行 → 前端展示契约（SkillCardView）
└─ infra/           # logger / picker / config-store 适配

client/src/
├─ App.tsx          # 布局 + tab 分发（6 个一级页面）
├─ api/types.ts     # 前端类型契约（与后端 domain/cards.ts 对齐）
├─ state/           # router（hash 路由）/ store（全局 bus）/ viewMode / collapse / useAsync
├─ views/           # Library / Agents / Presets / Projects / Health / Settings
├─ components/      # ui / common（EntityList·FilterBar）/ skill / agent / layout
└─ styles/          # tokens.css（设计 token）/ base.css / app.css

server/tests/       # 单元测试（vitest；vitest.config.ts 把配置指到临时沙箱，不碰真实目录）
bin/flint.mjs       # npm 包的命令行入口（端口自检 → 拉起 server/dist → 开浏览器）
.github/workflows/  # ci.yml（提交即跑单测）/ release.yml（发 npm + 建 Release）
docs/releases/      # 各版本 release notes（GitHub Release 正文来源）
```

## 4. 改代码前必须知道的三件事

1. **副作用只在后端**。扫描、软链 / 复制、配置持久化都发生在 `server`；前端只通过 REST 读写，不做文件系统操作。
2. **列表型 UI 一律复用通用组件**。技能 / 预设 / 项目 / Agent / 仓库 / 来源等列表先映射成 `EntityItem` 交给 `EntityList` 渲染，筛选走 `FilterBar`。不要手写 `.entity-row` / `.entity-card`。
3. **页面状态在 URL 里**。一级页面、二级详情、筛选条件都写进 hash 地址（`state/router.ts`）；不要在组件内部 `useState` 保存"当前在看哪一个"。

## 5. 核心不变量（改动不得违反）

- **文件即本体**：skill 内容永不写入 config / 数据库；config 只存"无法从文件系统推导的用户决策"。
- **期望集推导式、不落盘**：某 Agent / 项目的"应装什么"永远运行时计算（`desiredContext`）。
- **物理状态以目录为准**：投放给了哪些 Agent、装了哪些技能，一律读目录，不在 config 存快照。
- **触发式同步**：只在操作触发点执行；自动同步作用域**只限活跃 Agent**（`activeAgents`）。
- **只补不删 vs 显式回收**：自动触发用 `prune:false`（只补齐、修失效）；只有显式操作（预设变更 / Agent 策略变更 / 手动同步 / 修复）才 `prune:true` 回收本工具部署的软链。**真实目录与外部软链永不删。**
- **一个目录只有一套策略**：多个 Agent 共用同一技能目录时，策略落到该目录的**主 Agent**（`effectiveAgentKey` / `primaryOf`）；别名那份策略不生效，应被清理。
- **`name@source` 逻辑唯一、`name` 物理唯一**：投影按目录名归一化，只落一份。
- **只读尊重**：第三方只读来源、Agent 自带技能、外部软链都不擅自改写 / 删除。

> 完整约定见 `docs/TECH.md` §13（C1–C18、F1–F4）。

## 6. 代码与文案约定

- **注释、UI 文案用中文**；标识符 / API 字段用英文。
- **提交信息用英文**：简洁标题 + 分点说明改动（项目约定）。
- **前端视觉走 token**：颜色 / 字号 / 间距 / 圆角 / 动效 / 字体引用 `styles/tokens.css` 命名变量，组件内不写 hex / 字体名。
- **路径输入用 `PathField` / `PathListField`**，可一键调起系统选择器；相对路径因选择器无法表达才允许纯文本，并注明。
- **高频开关用乐观更新 + 串行队列**（见 `views/Agents.tsx` 的 `directQueue` / `views/Presets.tsx` 的 `skillQueue`），避免连点后发先至。
- **日志用 `infra/logger`** 的结构化接口（`log.info(module, msg, meta)`），不要裸 `console.log`；日志会脱敏 homedir。

## 7. 新增功能自查

```
新功能要保存一条信息？
 ├─ 是用户决策吗？ ──否──▶ 不存，由目录 / 文件推导
 ├─ 是 skill 内容吗？ ──是──▶ 只能存在于文件本体
 ├─ 是标签吗？ ──是──▶ 走标签载体（优先 SKILL.md frontmatter，暂存 skillMeta）
 └─ 是策略 / 开关吗？ ──是──▶ 存 config，标识用 name@source
                               └─ 写操作：先算 diff、幂等、限自有作用域
                                   └─ 同步：自动只补不删（prune:false）
                                       └─ 诊断页补对应检查项（core/diagnose.ts）
```

改完后请跑 `npm run build` 确认类型与构建通过、`npm test` 确认单测通过；涉及同步 / 项目 / 主 Agent 的行为，跑 `npm run smoke -w server`。

## 8. 文档维护

- 文档正式件：`docs/PRD.md`（产品）、`docs/TECH.md`（架构）、`docs/RELEASE.md`（发版流程）；`README.md`（使用）、`AGENTS.md`（本文件，开发）。
- 改动影响功能 / 架构时，**同步更新对应文档**，不要在仓库里新起"过程性草稿"。
- 发版相关：写 release notes 走 `docs/RELEASE.md` 的规范，落在 `docs/releases/release_notes_vX.Y.Z.md`。
