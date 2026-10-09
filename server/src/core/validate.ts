import fs from 'node:fs';
import path from 'node:path';
import { Skill, SKILL_FILE, parseSkillMeta } from './skill.js';

/** 内容合法性问题种类（诊断 key 与 i18n 键一一对应） */
export type IssueKind =
  | 'yaml'
  | 'missing-name'
  | 'missing-description'
  | 'name-dir-mismatch'
  | 'name-slug';

export interface ContentIssue {
  kind: IssueKind;
}

/** Agent Skills 约定的 name 形态：小写开头，小写字母 / 数字 / 连字符 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * 校验单个技能的 SKILL.md frontmatter 契约（F2）。
 *
 * 纯分析、**绝不改写文件**（改名 / 补字段属破坏性操作，交给用户手工处理）。
 * 返回空数组表示合法。注意 `name` 取 frontmatter 原值——不同于 readSkill 会回退目录名，
 * 否则「缺 name」永远测不出来。
 */
export function validateFrontmatter(skill: Skill): ContentIssue[] {
  const file = path.join(skill.dir, SKILL_FILE);
  let md = '';
  try {
    md = fs.readFileSync(file, 'utf-8');
  } catch {
    return []; // 无 SKILL.md 由扫描器负责过滤，不在此重复报
  }
  const meta = parseSkillMeta(md);
  if (!meta.ok) return [{ kind: 'yaml' }];

  const issues: ContentIssue[] = [];
  if (!meta.name) issues.push({ kind: 'missing-name' });
  if (!meta.description) issues.push({ kind: 'missing-description' });
  if (meta.name && meta.name !== path.basename(skill.dir)) issues.push({ kind: 'name-dir-mismatch' });
  if (meta.name && !SLUG_RE.test(meta.name)) issues.push({ kind: 'name-slug' });
  return issues;
}

/**
 * 校验一批技能（仅自有仓库）；返回「技能 id → 问题列表」，合法的技能不出现在结果里。
 */
export function validateAll(skills: Skill[], ownSources: Set<string>): Map<string, ContentIssue[]> {
  const out = new Map<string, ContentIssue[]>();
  for (const s of skills) {
    if (!ownSources.has(s.source)) continue;
    if (!s.dir || !fs.existsSync(s.dir)) continue;
    const issues = validateFrontmatter(s);
    if (issues.length) out.set(s.id, issues);
  }
  return out;
}
