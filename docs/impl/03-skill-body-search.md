# F3 · 技能正文全文搜索

## 1. 背景与目标

现状技能库筛选（`views/Library.tsx` `shown` memo）只把关键词与 **名称 / 标题 / 描述** 对齐，**SKILL.md 正文搜不到**（见 `client/src/views/Library.tsx` 第 72–85 行）。

对一个「个人资产库」而言，「按能力词检索存量技能」是核心诉求：例如想找「能不能跑 postgres 迁移」，只能靠正文。同类工具里 knowledge-manager（SQLite FTS5）、ClawHub（语义检索）都具备正文检索。

**目标**：在技能库搜索框输入关键词时，能命中技能正文，并清楚呈现「命中原因」。

**明确不做**：语义向量检索（成本高、收益未验证）；不做服务端常驻索引库（保留本地优先、触发式哲学）。

## 2. 需求细化

- **F3-01** 搜索关键词同时命中：名称、标题、描述、正文（SKILL.md 全部内容）。
- **F3-02** 命中正文的卡片给出可辨识的命中提示（例如详情页打开直接定位到首个命中上下文），避免「明明搜到了却不知道因何命中」。
- **F3-03** 结果数量规模：数百个技能下搜索响应在体感即时内（<200ms）。
- **F3-04** 不落盘：正文索引只在内存中按 `(dir, mtime)` 短缓存，随 next 扫描失效重建，不写任何文件。

## 3. 涉及文件

| 层 | 文件 | 改动 |
|----|------|------|
| 后端 | `server/src/core/skillindex.ts`（**新建**） | 正文索引 + 查询 |
| 后端 | `server/src/api/routes.ts` | 新增 `GET /skills/search?q=` |
| 前端 | `client/src/views/Library.tsx` | 元数据过滤基础上叠加正文命中 |
| 前端 | `client/src/api/types.ts` | 新增 `SkillSearchHit` |
| 双端 | `client/src/i18n/{zh,en}.ts`、`server/src/i18n` | 文案 |
| 测试 | `server/tests/` | skillindex 单测 |

> `core/skillindex.ts` 是 F1 / F2 要复用的基础设施：统一提供「按目录批量取正文（带 mtime 缓存）」的入口。

## 4. 后端改动

### 4.1 新建 `core/skillindex.ts`

```ts
export interface BodyCache { mtimeMs: number; text: string }
export const bodyText = (dir: string, cache?: Map<string, BodyCache>): string
```

- 读取 `<dir>/SKILL.md` 全文，小写归一化。
- 走 `Map<dir, { mtimeMs, text }>` 短缓存：读之前 `statSync(SKILL.md).mtimeMs`，命中即复用，避免逐次磁盘 IO。缓存只在单次 `/skills/search` 请求内有效（请求级传参即可，不做全局常驻——保持简洁）。
- 对本次需求，也可直接用现有 `Skill.dir` 入参。F1/F2 复用时，把 `scanAll()` 返回的 skills 数组交给它即可。

### 4.2 `api/routes.ts` 新增查询接口

```ts
r.get('/skills/search', (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  if (!q) return res.json({ hits: [] });
  const lib = library();
  const cache = new Map<string, BodyCache>();
  const hits = lib.skills.map((s) => ({
    id: s.id, name: s.name, source: s.source,
    description: s.description,
    body: bodyText(s.dir, cache),
  })).filter((x) => x.body.includes(q))
    .map(({ id }) => ({ id, q, sample: /* 取首个非 frontmatter 命中断行上下文 */ }));
  res.json({ hits });
});
```

要点：
- 命中后仅回传 `id` + 关键词 + 一个命中上下文样例（取正文里关键词附近一段，做摘要），**不回传整篇正文**，控制响应体积。
- 与 `/state` 的分工：`/state` 仍只给元数据；正文检索独立走本接口，按需触发，不加重冷启动。

## 5. 前端改动（`views/Library.tsx`）

- 在 `shown` 过滤中：关键词 `q` 非空时，先保留「元数据命中」的卡片；**同时**调 `GET /skills/search?q=`，把命中 id 并入同一结果集（去重），搜索逻辑改为「元数据 ∨ 正文」。
- `useAsync` 拉正文命中，与现有 `data` 生命周期一致；输入防抖（复用现有 `q` 的 `useQueryParam`，自然防抖）。
- 命中上下文的展示：卡片上若该技能仅因正文命中，加一枚「正文命中」Badge（复用 `Badge` + token）；点击进详情时，把 `sample` 上下文带到详情弹窗高亮（详情层复用现有 `/skills/:id/content`，前端自行定位首个命中行 —— 纯只读，不改内容接口）。

## 6. 测试要点

- 单测（`server/tests/`）：正文含关键词能命中、仅 frontmatter 命中不算正文（若需可配是否含 frontmatter）、路径不可读时优雅跳过、mtime 缓存命中不重复 IO。
- smoke：在临时沙箱造含关键词的技能，走 `/skills/search` 断言返回 id。

## 7. 验收标准

- 技能库里输入「postgres 迁移」，能搜到正文描述该能力的技能。
- 命中仅因正文的卡片有可见「正文命中」标识，详情能定位上下文。
- 数百技能规模下搜索即时（请求级缓存，无每字读盘）。
- `build && test` 通过；不产生任何落盘副作用。

## 8. F1 / F2 的复用说明

`core/skillindex.ts` 的 `bodyText(dir, cache)` 与按请求短缓存是本特性交付物；F1 安全扫描、F2 frontmatter 校验会把同一函数用于批量读取自有仓库正文并配套各自的校验逻辑，故本特性放第一期最前。