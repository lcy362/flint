# F1 · 技能内容安全扫描

> 第二期实施（F3、F4 之后）。复用 F3 交付的 `core/skillindex.ts` 批量读正文。

## 1. 背景与目标

本地技能库会引入第三方 skill（GitHub / 他人目录 / 项目里接管）。现状的 `diagnose` 只查「目录 / 软链 / 去重」这张表，**完全不看内容**——一个带 `curl | sh`、疑似密钥、prompt 注入指令的技能会被当成普通技能分发到所有 Agent。

同类工具普遍具备内容安全能力：SkillKit 内置 46 条扫描规则（prompt injection / secrets / 危险代码）、AI Skillstore 上架前做安全审计。

**目标**：新增一个只读「安全」体检维度，扫描自有仓库（及可选的第三方来源）技能内容，命中危险模式即告警；指向具体文件与位置。**纯只读、不擅自改删**（符合「只读尊重」不变量）。

**明确不做**：自动隔离/删除（会破坏用户内容）；网络黑名单查询（保持全本地）；上架审计（Flint 不是市场）。

## 2. 需求细化

- **F1-01 新诊断维度 `security`**：在 `DiagDimension` / `DiagGroups` / 前端 Health 增加 `security` 分组。
- **F1-02 三类检查**（作用对象：自有仓库技能目录 + `scripts/` 内文件 + SKILL.md 正文）：
  1. **危险回调**：`scripts/` 中的脚本里出现 `curl|sh`、`wget` 执行、`eval`/`exec`/`child_process`、`bash -c` 接远程地址、`sudo` 提权等模式 → warn/error。
  2. **疑似敏感信息**：`SKILL.md` 或脚本中出现高熵/模式化密钥（`sk-`、`AKIA`、`-----BEGIN ... PRIVATE KEY-----`、`api[_-]?key\s*=` + 明显值）→ warn。
  3. **prompt 注入特征**：正文中出现「忽略之前指令/忽略上述内容/无视系统提示/把以上所有规则作废/不要告诉用户」等劝诱改写指令 → warn。
- **F1-03 定位**：发现项 detail 携带 `{ skillId, file, line?, pattern }`，前端 Health 卡住该条目可跳详情。
- **F1-04 范围开关**：默认扫**自有仓库**；第三方来源因只读且可能巨大，默认不扫（可配置，见 §5）。

## 3. 涉及文件

| 层 | 文件 | 改动 |
|----|------|------|
| 后端 | `server/src/core/security.ts`（**新建**） | 扫描器 + 模式规则表 |
| 后端 | `server/src/core/diagnose.ts` | 增 `security` 维度、产出 DiagItem |
| 后端 | `server/src/api/routes.ts` | `/diagnose` 自动含新维度（无新路由） |
| 前端 | `client/src/views/Health.tsx` | 渲染 `security` 分组（复用现有诊断列表渲染） |
| 双端 | i18n | 文案 |
| 测试 | `server/tests/` | security 单测 |

## 4. 后端改动

### 4.1 新建 `core/security.ts`

```ts
export type SecSeverity = 'info' | 'warn' | 'error';
export interface SecFinding { skillId: string; file: string; line?: number; pattern: string; severity: SecSeverity }
export function scanSecurity(cfg: ConfigStore, lib): SecFinding[]
```

- 迭代 `lib.skills` 中**自有仓库**的技能；对每个技能目录：读 `SKILL.md` 与 `scripts/`（及可选 `references/`）下文本文件。
- 复用 F3 `bodyText(dir, cache)` 批量读 `SKILL.md`；脚本文件单独逐文件读（限制大小与文件数，避免把大附件读进内存）。
- 正则规则集中一张 `Pattern[]`，每条含 `re`、`severity`、`i18n key`，便于增删与本地化。

| 组 | 示例模式（示意，非最终） | severity |
|----|--------------------------|----------|
| dangerous | `curl\s+[^|]*\s*\|\s*(sh|bash)`、`\beval\s*\(`、`child_process`、`wget.*-O\s+-\s*\|`、`sudo` | error / warn |
| secret | `sk-[A-Za-z0-9]{16,}`、`AKIA[0-9A-Z]{16}`、`BEGIN (RSA|OPENSSH|EC) PRIVATE KEY`、`password\s*=\s*\S+` | warn |
| injection | `忽略(了)?(之前的|上述|以上).*指令|无视(系统|安全|所有).*(指令|规则)|不要告诉用户|as of now ignore` | warn |

> 具体正则落地时以「低误报」为准：危险回调仅在有实际执行语义时告 error，纯说明性提及降为 info/warn。

### 4.2 `diagnose.ts` 扩展

- `DiagDimension` 增加 `'security'`；`DiagGroups`、`DIMS`、`summary` 同步补。
- 在 `diagnose()` 里调用 `scanSecurity`，按 `(file, pattern)` 产出 DiagItem：
  - `key: 'sec:<skillId>:<idx>'`
  - `status`: 任一 error → error；否则存在 warn → warn；无发现 → 一个 `ok` 汇总项（「N 个技能，未发现安全问题」）。
- detail 携带 `SecFinding`（供前端跳转详情并高亮定位）。

### 4.3 修复策略（`fix.ts`）

- **默认不给自动修复**：扫描是告知性的，删改会破坏内容。`POST /fix` 针对 `sec:*` **不新增分支**，Health 上该条目无「修复」按钮，仅「查看」跳详情。
- 这与共用约定 3 兼容：诊断项可不配修复（纯告警项）。

## 5. 前端 / 配置

- `Health.tsx`：渲染 `security` 分组复用现有诊断维度渲染逻辑；每条命中显示 `file:line` 与模式名。
- **范围开关**（可选，二期我不强制）：`Settings` 加 `securityScanScope: 'own' | 'all'`（默认 `own`），落 config 顶水平段，前端透传；默认不扫第三方来源。

## 6. 测试要点

- 对「危险回调 / 密钥 / 注入」三类构造 fixture 技能，断言命中及 severity。
- 负例：正常 readme 型技能不误报（低误报校验）。
- 超大目录/二进制附件跳过错位不被当成文本解析。
- diagnose 汇总：无发现时输出 `ok` 汇总项；有 error 时维度汇总为 error。

## 7. 验收标准

- Health 出现「安全」维度；含 `curl | sh` 技能报 error 并给出文件与行号。
- 扫描只读：运行前后技能目录内容逐字节一致。
- 第三方来源默认不被扫描（`own` 默认）。
- `build && test` 通过；不依赖任何网络请求。

## 8. 与 F2 的关系

F1 看「坏内容」，F2 看「格式合法」——两者都进 `diagnose`、都读主体。建议 F2 的维度命名与 F1 保持一致（`content` 可容纳构造/合法两类），若实现上合并为一个「内容体检」维度更利落；本文档按独立 `security` 维度写，F2 文档独立 `content` 维度，最终按实现取舍合并或并列。