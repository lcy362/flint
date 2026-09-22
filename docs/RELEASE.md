# 发版流程规范

> 面向在本仓库发版的人与 AI 助手。关联：`.github/workflows/ci.yml`（提交即跑单测）、
> `.github/workflows/release.yml`（发 npm 包 + 建 GitHub Release）、`docs/releases/`（历史 release notes）。

---

## 一、总览

```
提交代码 ──▶ CI 跑构建 + 单测 + smoke（每次 push / PR）
                  │
用户说「发版」 ──▶ AI 定版本号 + 写 release notes 草稿
                  │
              🔴 人工审核通过 ◀── 未经确认不得进入下一步
                  │
              git push 到 master（release notes 随之落库）
                  │
                  ▼（自动触发，无需再点任何按钮）
       ┌──────────┴──────────┐
   校验：构建 + 单测 + smoke   解析目标版本（尚未发布的最高版本）
       └──────────┬──────────┘
                  ▼
       发 npm 包（npmjs OIDC + 同步 GitHub Packages）→ 建 tag → 建 GitHub Release
```

**关键点：人工审核发生在 notes 落库之前，落库即发布。** AI 负责写 release notes 与定版本号，人负责审阅
并让它合并 / 推送到 `master`；一旦 `docs/releases/release_notes_vX.Y.Z.md` 进入 `master`，工作流就**自动**
发布该版本——不需要再去 GitHub 点按钮。`workflow_dispatch`（填版本号）与推 `v*` 标签保留为手动兜底。

---

## 二、版本号规则

三位 `X.Y.Z`：

| 类型 | 号段 | 典型内容 |
|---|---|---|
| 大版本 | `X.0.0` | 架构级重构、破坏性变更、重大能力 |
| 中版本 | `X.Y.0` | 新功能、功能增强、较大的代码层重构 |
| 小版本 | `X.Y.Z` | Bug 修复、体验微调 |

升位：中版本 `Y+1` 且 `Z` 清零；大版本 `X+1` 且 `Y/Z` 清零；小版本仅 `Z+1`。

> 版本号只由用户要求触发（「发个小版本」「升到 vX.Y.Z」）。AI 不得自行升版，
> 也不得在功能未完成时提前占号。

### 用户说法与动作映射

| 用户说法 | 动作 |
|---|---|
| 「发个小版本」 | `Z+1`，以修复为主 |
| 「发布中版本」/「新功能发版」 | `Y+1`，`Z` 清零 |
| 「发大版本」 | `X+1`，`Y/Z` 清零 |
| 「升到 vX.Y.Z」 | 直接采用 |

---

## 三、release notes 规范

产出一份文件：`docs/releases/release_notes_vX.Y.Z.md`，它同时是
**GitHub Release 的正文**（release.yml 用 `body_path` 直接读取）。

### 3.1 结构与语言

**全文英文。** 这是对外产物，会出现在 npm 页面与 GitHub Release 上，
中英混杂会显得不专业；`README.md` 本身就是英文为主，保持一致。

```markdown
# Release vX.Y.Z — <一句话副标题>

> Release date: YYYY-MM-DD

## Overview

<1-3 句：本版类型（大/中/小版本）+ 核心变化 + 覆盖本版关键词>

## Usage

<本版怎么装、怎么跑；有 breaking change 或迁移事项写在这里>

## What's New

### Features & Improvements
- <大的功能更新，逐条列出：能力是什么、怎么用、影响谁>

### Refactoring & Optimizations
- <面向开源社区的大型代码层优化 / 架构演进；只有「大」的才写>

### Bug Fixes
- <按类归纳成几条，不展开到单个 issue 细节>

---
<可选>升级注意事项（仅当影响用户时）
```

### 3.2 红线（不写进 release notes）

对用户无实际价值的内部工作一律不提，哪怕数量很大：

- 文档整理 / 重命名 / 措辞调整
- 纯渠道推广、关键词堆砌
- 内部代码风格、静态分析（ruff / eslint）、测试基建本身
- 小型重构、类名与模块迁移（对使用者和架构无实质影响时）

小版本可适当细列 Bug 修复，但仍保持简短。

### 3.3 写作要求

- **自包含**：每份文档不依赖其它文档即可读懂（版本、日期、能力、用法都在本页）。
- **标题含关键词**：副标题用用户会搜索的功能词。
- 只做内容型表达，不做无意义关键词堆砌。

---

## 四、发布流程

1. **用户触发发版**（含版本类型或明确版本号）。
2. 按「二、版本号规则」确定 `vX.Y.Z`。
3. 汇总本版变化，按「三、release notes 规范」筛选内容（过滤红线）。
4. 写 `docs/releases/release_notes_vX.Y.Z.md`（按 3.1 模板，**全文英文**）。
5. 🔴 **人工审核**：把 release notes 草稿展示给用户审阅，确认通过才可继续。
   用户可要求增删或改措辞，AI 改完再次确认，直到明确批准。
6. 本地自验：`npm run build`、`npm test`、`npm run smoke -w server`。
7. 提交并推送 `master` —— **这一步就是发布动作**，不需要再去 GitHub 操作。
8. 工作流自动完成：校验（构建 + 单测 + smoke）→ 解析目标版本（`docs/releases/` 里
   「已写 notes 但尚未发布」的最高版本；若都已发布、但最高版本缺 tag，则只补 tag / Release）→
   检查 release notes 存在 → 改写发布用 manifest → `npm publish --provenance`（OIDC）→
   **确认该版本已在 registry 可见**（看不到就红掉，不建 tag / Release，见 §5.4）→
   `npm pack` 打包该版本 tarball → 同步发一份到 **GitHub Packages**（`@lcy362/flint`，见 §5.5）→
   创建 tag `vX.Y.Z` → 创建 GitHub Release
   （正文来自 release notes，tarball 作为下载资产一并挂载）。

### 兜底触发方式

自动触发不适用时（需要重发、需要演练、或只想指定某个版本）：

- **Actions ▸ Release ▸ Run workflow**，填版本号；先演练就勾 `dry-run`
  （只校验与打包，不发布、不建 Release）。
- 或 `git push origin vX.Y.Z`，行为等价。

两条口径的差别：**显式指定**（上面两种）遇到「该版本已发布」会直接失败，用来拦住误操作；
**自动触发**遇到同一情况只报「无可发布」并成功跳过——所以改笔记错字既不会误发、也不会把流水线弄红。

### 与开发无关的注意事项

- **发布用的 `package.json` 与仓库里的不是同一份**。工作流在工作区里执行
  `npm pkg delete private workspaces devDependencies` 并写入 tag 版本号后才发布；
  仓库里的 `package.json` 始终是开发形态，不要手工把它改成可发布状态。
- **不要手工改 `package.json` 的 `version`**。版本号由发版时的工作流统一写入，
  仓库里保持 `0.1.0` 这类占位值即可，避免「仓库版本」与「已发布版本」两套真相。
- **重复发版会被拦下**：同一版本已存在于 npm 时工作流直接失败。

---

## 五、npm 发布凭证（Trusted Publishing / OIDC）

发布**不使用任何 NPM_TOKEN 密钥**。GitHub Actions 通过 OIDC 向 npm 换取一次性的
发布凭证，密钥不落任何地方，也不会因为忘记轮换而失效。

需要在 npm 侧做**一次性配置**（仅第一次发版前）。

### 5.1 前提条件（官方硬性要求，任一不满足都只会在「真正发布那一刻」才失败）

| 要求 | 本仓库现状 |
|---|---|
| npm CLI **≥ 11.5.1**、Node **≥ 22.14.0** | ✅ `release.yml` 用 Node 22 + `npm install -g npm@latest` |
| 必须是 **GitHub 托管 runner**（自托管 runner 不支持） | ✅ 使用 `ubuntu-latest` |
| `package.json` 的 `repository.url` 与 GitHub 仓库**一致** | ✅ 已配 `git+https://github.com/lcy362/flint.git` |
| 需要 `id-token: write` 权限 | ✅ 已授予发布 job |

### 5.2 配置步骤

1. 登录 <https://www.npmjs.com>，进入 `flint-skills-hub` 包的 **Settings ▸ Trusted Publisher**
   （入口在**你的包**的设置页 —— 包不存在就没有这个入口，见 §5.3）。
2. 填写：
   - Publisher: **GitHub Actions**
   - Repository owner: `lcy362`
   - Repository name: `flint`
   - Workflow filename: `release.yml` ← **必须与 `.github/workflows/release.yml` 完全一致**
   - Environment name: 留空（工作流未使用 GitHub Environment）
3. 🔴 **显式勾选允许的动作 `npm publish`。**
   自 **2026-09-03** 起创建的配置**默认只允许 `npm stage publish`**；不勾 `npm publish`，
   本工作流会在发布那一刻报权限错误。⚠️ npm **保存配置时不做任何校验**，填错的代价就是「发布时才炸」。
4. 保存。之后 `release.yml` 里的 `npm publish` 自动使用 OIDC，无需任何 secret。

> ⚠️ **配置创建后不可修改**（publisher 与必填字段固定），填错只能删除后重建；每个包最多 10 条配置。
> npm 文档建议的迁移顺序是：先用 OIDC 验证发布可用 → 再收紧 token 策略 → 最后撤销不再需要的 automation token。

### 5.3 首版（v0.1.0）发布不了 OIDC —— 必须先「引导」一次

Trusted Publisher 是**包级**配置，而 `flint-skills-hub` 目前在 npm 上还不存在（注册表返回 404），
所以**首版必须用传统认证方式发布**，让包名先在注册表上诞生，之后才能配 OIDC。

两条路，任选其一：

**A. 本地手工首发（推荐，最省事）**

```bash
cd /path/to/flint
npm login                                  # 浏览器 / 2FA 认证
npm run build
# 临时改写「发布用 manifest」，发完立刻还原；仓库里的 package.json 始终是开发形态
npm pkg delete private workspaces devDependencies
npm pkg set version=0.1.0
npm publish --access public
git checkout package.json
```

**B. 用临时 Granular Access Token 走工作流**

> ⚠️ **不能用 Classic token**：npm 已于 **2025-12-09 永久撤销全部 Classic token**，
> 现在只能创建 **Granular Access Token**，且**只能在网站上创建**（CLI 的 `npm token create` 已不支持）。

1. npm → 右上角头像 → **Access Tokens** → **Generate New Token**；
2. 勾选 **Bypass two-factor authentication**
   （不勾的话，CI 里的发布会被 2FA 挑战拦下 —— 2026-08 起该开关只管发布类操作，账号治理类操作仍强制交互式 2FA）；
3. **Packages and scopes** 区块：
   - Permissions 选 **`Read and write (publish and stage)`**
     （`stage only` 不能直接发布，只能暂存等人工 promote）；
   - Select Packages 选 **All Packages**
     （目标包 `flint-skills-hub` 尚不存在，无法在 “Only select packages” 里勾选它）；
4. Expiration 设短（例如 7 天）—— 这只是一次性引导用的钥匙；
5. **Generate Token** → **立刻复制**（完整 token 只在创建后显示这一次）；
6. 仓库 Settings ▸ Secrets and variables ▸ Actions → New repository secret，
   名字必须为 **`NPM_TOKEN`**；
7. 触发 `release.yml` —— 工作流检测到该 secret 时会以「bootstrap 模式」用 token 发布，并在日志里打出 warning；
8. 首版发完后，按 §5.2 配好 Trusted Publisher，**然后删掉这个 secret**
   （否则长期留着一把长效钥匙，正是 OIDC 想消除的风险）。

首版之后，后续发版一律走 OIDC。

> ℹ️ **发布后校验：只告警，不阻断**。`release.yml` 在 `npm publish` 之后会确认新版本能从 registry
> 解析，最多重试 8 次 × 15s；确认不到只打 `::warning::`，**tag / Release 照建**。两条边界：
>
> 1. **不要用 `npm view`**：它读本地 npm 缓存，而紧邻的上一步「未发布探测」刚把 404 写进缓存，
>    于是后续重试 60s 全都在读同一个缓存（v0.1.1 实录：runner 上六次全 404，本机却早已可见）。
>    这就是改用 registry API（带 `Cache-Control: no-cache`）的原因。
> 2. **也不能做成阻断**：npm 从「接单成功」到「公开可见」之间有传播延迟，**v1.0.0 实测约 8 分钟**
>    （发布步骤 07:11:50 跑完，registry 时间戳是 07:20:03）。任何「两分钟不出现就判死」的校验都会把
>    正常发版判红、反而拦住 tag / Release。真正被拒的发布（重复版本 / 权限不足）会让 `npm publish`
>    以非 0 退出，那一步已经拦住了，这里不需要第二道拦截 —— 校验超时只提示「稍后自行确认」（见 §5.4）。
>
> 万一仍然遇到「已发布但没建 tag/Release」（例如用旧版工作流发的），手工补一条即可：
>
> ```bash
> gh release create vX.Y.Z --target master --title vX.Y.Z \
>   --notes-file docs/releases/release_notes_vX.Y.Z.md
> ```
>
> 注意：手工建 tag 会以**你的身份**触发 `push: tags v*` 那次 `Release` 运行（正常路径下 tag 由
> `GITHUB_TOKEN` 创建，不会递归触发）。该运行会在「版本解析」的已发布校验处**正确地**拦下并失败 ——
> 这是守卫在起作用，不是故障。

### 5.4 「npm publish 成功但版本还查不到」怎么办

`npm publish` 会打印
`npm notice Your package is being processed and may take a few minutes to become available.`
随后以 0 退出；此时立刻去查 registry 很可能仍是 404 —— **这是正常的传播延迟，不是失败**：
v1.0.0 实测从发布步骤跑完（07:11:50）到 registry 上出现该版本的时间戳（07:20:03）**约 8 分钟**。

因此：

- **不要据此判断发版失败，也不用重跑工作流**：tag / Release 会在同一次运行里照常创建；
- 想确认就直查 `https://registry.npmjs.org/flint-skills-hub/<version>`
  （**别用 `npm view`**，它读本地缓存），或看
  <https://www.npmjs.com/package/flint-skills-hub?activeTab=versions>；
- **超过约 15 分钟**仍查不到，才按真问题处理：
  - 到 npmjs.com 看是否有**待批准的发布**（发布审批策略成立时）——有就批准；
  - 或看那次运行里 `npm publish` 的完整输出：重复版本 / 权限不足会以非 0 退出，那种情况工作流本来就是红的；
  - 若版本确实没上去、而 tag / Release 已建出来（触发过工作流重跑），删掉 tag / Release 后重跑工作流即可
    （自动模式会认到「已在 npm、但 tag 缺失」时只补 tag，不会重发）。

---

### 5.5 同步发一份到 GitHub Packages（npm.pkg.github.com）

除了 npmjs.com，发版工作流还会把同一版本**同步发布**到 GitHub Packages（`npm.pkg.github.com`）。
这是**仓库主页右侧「Packages」边栏出现 npm 包卡片**的原因——GitHub 只显示发布到自家 registry 的包，
不会展示 npmjs.com 上的包。

规则与注意：

- **scoped 名**：GitHub npm registry 只接受 scoped 包，scope 必须等于仓库所属主，故发布名为 **`@lcy362/flint`**
  （npmjs 上仍是 `flint-skills-hub`）。两者是**两套独立的镜像**，互不影响。
- **认证**：走 `release.yml` 里 Actions 自带的 `GITHUB_TOKEN`，需要给发布 job 加 **`packages: write`** 权限；
  不新增任何 secret，无需提前配置。
- **版本号**：与 npmjs 共用 `release.yml` 解析出的同一版本，发布写入 manifest 后再 `npm pkg set name="@lcy362/flint"`。
- **顺序**：该步排在 `npm pack`（Release 资产）之后，避免改名先改了 npmjs 侧 tarball 文件名。
- **触发条件**：与 npmjs 保持一致（`skip != true && publish == true`），`dry-run` 时跳过。
- 效果自查：发完后到 <https://github.com/lcy362/flint/packages> 能看到 `@lcy362/flint`，仓库侧边栏出现其入口。

首次发布无需任何额外配置即可工作；若 `GITHUB_TOKEN` 权限盘中 `packages` 未开启，初次发布会在该步失败，
届时去仓库 Settings ▸ Actions ▸ General 确认已勾选 **Read and write** 的包发布权限。

---

## 六、CI 与 Release 的分工

| | `ci.yml` | `release.yml` |
|---|---|---|
| 触发 | 每次 push / PR / 手动 | release notes 落到 `master`（自动）/ 手动 `workflow_dispatch` / 推 `v*` 标签 |
| 构建 + 单测 | ✅（Node 20 / 22 矩阵） | ✅（发布前再验一遍） |
| smoke | ✅ | ✅ |
| 写权限 | 无（`contents: read`） | `contents: write` + `id-token: write` + `packages: write` |
| 产物 | 无 | npm 包（npmjs + GitHub Packages）+ tag + GitHub Release |

两者互不依赖：`ci.yml` 挂掉不会阻止发版，但 `release.yml` 内部的校验不过就发不出去。

---

## 七、本地对应命令

```bash
npm test                      # 单元测试（vitest）
npm run test:watch -w server  # 单测 watch 模式
npm run smoke -w server       # 端到端 smoke（临时目录，不碰真实目录）
npm run build                 # 类型检查 + 前后端构建
```
