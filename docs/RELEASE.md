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
              git push 分支 / 合并
                  │
用户点 Actions ▸ Release ▸ Run workflow（填版本号）
                  │
       ┌──────────┴──────────┐
   校验：构建 + 单测 + smoke   release notes 文档必须存在
       └──────────┬──────────┘
                  ▼
       发 npm 包（OIDC）→ 建 tag → 建 GitHub Release
```

**关键点：发版由人触发。** AI 只负责写 release notes 与改版本号，点下发布按钮的永远是人；
CI 里没有「push 即发布」的路径。

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
7. 提交并推送分支 → 合并到 `master`。
8. 用户在 GitHub 上触发发布：**Actions ▸ Release ▸ Run workflow**，填版本号。
   需要先演练时勾选 `dry-run`（只校验与打包，不发布、不建 Release）。
9. 工作流自动完成：校验（构建 + 单测 + smoke）→ 检查 release notes 存在 →
   确认 `flint-skills-hub@X.Y.Z` 尚未发布 → 改写发布用 manifest →
   `npm publish --provenance`（OIDC）→ 创建 tag `vX.Y.Z` → 创建 GitHub Release。

> 也支持 `git push origin vX.Y.Z` 触发，行为与第 8 步等价。

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

> ℹ️ **发布后校验的坑（v0.1.0 / v0.1.1 各踩一次）**：`release.yml` 发布后会确认新版本能从 registry 解析。
> 两次都出现「**包发成功了，却因为这一步判死而跳过建 tag / 建 GitHub Release**」。真实原因有两个：
>
> 1. **`npm view` 读的是本地 npm 缓存**：紧邻的上一步「未发布探测」刚把 404 写进缓存，
>    于是后续重试 60s 全都在读同一个缓存（v0.1.1 实录：runner 上六次全 404，本机却早已可见）。
> 2. 首版还存在真实的 registry 传播延迟。
>
> 现已改为**直接查 registry API**（带 `Cache-Control: no-cache`）并加 `continue-on-error`。
> `npm publish` 成功本身已证明发布落地，这一步只是兜底确认，因此**失败只告警、不再阻断**建 tag / Release。
>
> 万一仍然遇到「已发布但没建 tag/Release」（例如用旧版工作流发的），手工补一条即可：
>
> ```bash
> gh release create vX.Y.Z --target master --title vX.Y.Z \
>   --notes-file docs/releases/release_notes_vX.Y.Z.md
> ```
>
> 注意：手工建 tag 会以**你的身份**触发 `push: tags v*` 那次 `Release` 运行（正常路径下 tag 由
> `GITHUB_TOKEN` 创建，不会递归触发）。该运行会在「已发布校验」处**正确地**拦下并失败 ——
> 这是守卫在起作用，不是故障。

---

## 六、CI 与 Release 的分工

| | `ci.yml` | `release.yml` |
|---|---|---|
| 触发 | 每次 push / PR / 手动 | 手动 `workflow_dispatch` / 推 `v*` 标签 |
| 构建 + 单测 | ✅（Node 20 / 22 矩阵） | ✅（发布前再验一遍） |
| smoke | ✅ | ✅ |
| 写权限 | 无（`contents: read`） | `contents: write` + `id-token: write` |
| 产物 | 无 | npm 包 + tag + GitHub Release |

两者互不依赖：`ci.yml` 挂掉不会阻止发版，但 `release.yml` 内部的校验不过就发不出去。

---

## 七、本地对应命令

```bash
npm test                      # 单元测试（vitest）
npm run test:watch -w server  # 单测 watch 模式
npm run smoke -w server       # 端到端 smoke（临时目录，不碰真实目录）
npm run build                 # 类型检查 + 前后端构建
```
