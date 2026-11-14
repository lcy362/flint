import { Skill } from './skill.js';
import { contentStamp, scanSkillSecurity } from './security.js';
import type { SecFinding } from './security.js';
import { validateFrontmatter } from './validate.js';
import type { ContentIssue } from './validate.js';

/**
 * 内容体检（F1 + F2）的统一入口。
 *
 * 三处消费同一套检查，保证口径一致：
 * - `diagnose` 的 content 维度（全量，产出 DiagItem，并记下摘要）
 * - `/state` 的技能摘要（只回传尚未过期的上次计数，不在列表上重跑规则）
 * - `/skills/:id/security` 明细（详情页主动运行 / 重跑，并记下摘要）
 */

interface HealthSnap { stamp: string; health?: ContentHealth }

/** 上次体检的摘要。文件戳变了就作废，列表不再拿旧计数冒充现状。 */
const healthSnaps = new Map<string, HealthSnap>();

/** 把一次真实扫描的计数记下来，供之后的 /state 复用 */
export function rememberSkillHealth(skill: Skill, findings: SecFinding[], issues: ContentIssue[]): void {
  if (!skill.id || !skill.dir) return;
  healthSnaps.set(skill.id, { stamp: contentStamp(skill.dir), health: healthOf(findings, issues) });
}

export function invalidateHealthCache(): void {
  healthSnaps.clear();
}

/** 单个技能的内容问题计数。error=安全高危；warn=安全提示 + frontmatter 契约问题。 */
export interface ContentHealth { error: number; warn: number }

export interface SkillInspection {
  /** 是否属于自有仓库（第三方只读来源不参与内容检测） */
  own: boolean;
  findings: SecFinding[];
  issues: ContentIssue[];
}

/**
 * 由命中与契约问题统计健康摘要；info 级不计入（与诊断口径一致——纯提示信号不该点亮列表标记）。
 * 无任何问题时返回 undefined，调用方据此省略字段。
 */
export function healthOf(findings: SecFinding[], issues: ContentIssue[]): ContentHealth | undefined {
  let error = 0;
  let warn = 0;
  for (const f of findings) {
    if (f.severity === 'error') error += 1;
    else if (f.severity === 'warn') warn += 1;
  }
  warn += issues.length;
  if (error === 0 && warn === 0) return undefined;
  return { error, warn };
}

/** 检测单个技能；非自有仓库直接返回 own:false（前端据此提示「第三方来源不检测」） */
export function inspectSkill(skill: Skill, ownSources: Set<string>): SkillInspection {
  if (!ownSources.has(skill.source)) return { own: false, findings: [], issues: [] };
  const findings = scanSkillSecurity(skill);
  const issues = validateFrontmatter(skill);
  rememberSkillHealth(skill, findings, issues);
  return { own: true, findings, issues };
}

/** 一批技能的内容健康摘要（仅自有仓库；无问题的技能不出现在结果里）。会跑全量规则，并更新摘要缓存。 */
export function contentHealthMap(skills: Skill[], ownSources: Set<string>): Map<string, ContentHealth> {
  const out = new Map<string, ContentHealth>();
  for (const s of skills) {
    if (!ownSources.has(s.source)) continue;
    const findings = scanSkillSecurity(s);
    const issues = validateFrontmatter(s);
    const health = healthOf(findings, issues);
    rememberSkillHealth(s, findings, issues);
    if (health) out.set(s.id, health);
  }
  return out;
}

/**
 * /state 用的摘要：只返回文件戳仍对得上的上次计数。
 * 没扫过、或 SKILL.md / scripts 已经变了，就不带 health，等诊断或详情页重新检测。
 */
export function cachedContentHealthMap(skills: Skill[], ownSources: Set<string>): Map<string, ContentHealth> {
  const out = new Map<string, ContentHealth>();
  for (const s of skills) {
    if (!ownSources.has(s.source) || !s.dir) continue;
    const snap = healthSnaps.get(s.id);
    if (!snap || snap.stamp !== contentStamp(s.dir)) {
      if (snap) healthSnaps.delete(s.id);
      continue;
    }
    if (snap.health) out.set(s.id, snap.health);
  }
  return out;
}
