import fs from 'node:fs';
import path from 'node:path';
import { Skill, SKILL_FILE } from './skill.js';
import { SEC_RULES } from './security-rules.generated.js';
import type { SecCategory, SecSeverity, SecRule } from './security-rules.generated.js';

export type { SecCategory, SecSeverity } from './security-rules.generated.js';

/** 单条内容安全命中。detail 直接挂到诊断项上供前端跳转定位。 */
export interface SecFinding {
  skillId: string;
  skillName: string;
  /** 技能目录绝对路径 */
  dir: string;
  /** 命中文件（相对技能目录，如 SKILL.md / scripts/install.sh） */
  file: string;
  /** 命中行号（1 起；整文件模式匹配不到行时为 undefined） */
  line?: number;
  ruleId: string;
  category: SecCategory;
  severity: SecSeverity;
  /** 规则描述 i18n 键（server/src/i18n） */
  titleKey: string;
  /** 命中行片段（截断，供人工复核） */
  excerpt: string;
}

/** 单个文件读入上限：超过则跳过，避免把大附件读进内存 */
const MAX_FILE_BYTES = 256 * 1024;
/** 每个技能最多扫的脚本文件数 */
const MAX_SCRIPT_FILES = 40;
/** 命中片段展示长度 */
const EXCERPT_MAX = 160;
/** 只扫这些扩展名的脚本（其余按二进制/附件跳过） */
const SCRIPT_EXT = new Set([
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.py', '.rb', '.pl', '.php', '.js', '.mjs', '.cjs', '.ts',
]);

/** 占位符/示例值：命中即视为误报丢弃（凭据类规则专用） */
const PLACEHOLDER_RE = /(your[-_]?(api[-_]?key|token|secret|password)|example|sample|dummy|placeholder|redacted|changeme|xxxx+|<[a-z0-9_-]+>)/i;
/** 说明性提及：命中即把严重级降一档（文档里举例 `curl | sh` 不该报 error） */
const DEMOTE_RE = /(never\s+use|do\s+not\s+(use|run)|don'?t\s+run|不要(使用|执行)|禁止|示例|例如|仅供说明|e\.g\.|for\s+example|not\s+recommended)/i;

/** 规则 → 编译后的全局正则（惰性、进程内复用；matchAll 不会污染 lastIndex） */
const COMPILED = new Map<string, RegExp>();

function ruleRe(rule: SecRule): RegExp {
  let re = COMPILED.get(rule.id);
  if (!re) {
    const flags = rule.flags.includes('g') ? rule.flags : `${rule.flags}g`;
    re = new RegExp(rule.pattern, flags);
    COMPILED.set(rule.id, re);
  }
  return re;
}

/** 香农熵（比特/字符）：用于过滤"高熵才像真密钥"的泛化赋值规则 */
export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** 安全降一级：error → warn → info → info */
function demote(sev: SecSeverity): SecSeverity {
  if (sev === 'error') return 'warn';
  if (sev === 'warn') return 'info';
  return 'info';
}

/** 读文本文件；缺失 / 超限 / 二进制一律返回 undefined */
function readTextFile(file: string): string | undefined {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return undefined;
    const buf = fs.readFileSync(file);
    if (buf.includes(0)) return undefined; // 含 NUL 视为二进制
    return buf.toString('utf-8');
  } catch {
    return undefined;
  }
}

/** 列出技能内待扫描的文件：SKILL.md + scripts/ 下的脚本文本 */
function skillFiles(dir: string): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = [];
  const skillMd = path.join(dir, SKILL_FILE);
  if (fs.existsSync(skillMd)) out.push({ rel: SKILL_FILE, abs: skillMd });

  const scriptsDir = path.join(dir, 'scripts');
  let isDir = false;
  try { isDir = fs.statSync(scriptsDir).isDirectory(); } catch { isDir = false; }
  if (!isDir) return out;

  let names: string[] = [];
  try { names = fs.readdirSync(scriptsDir); } catch { return out; }
  for (const name of names.slice(0, MAX_SCRIPT_FILES)) {
    if (!SCRIPT_EXT.has(path.extname(name).toLowerCase())) continue;
    const abs = path.join(scriptsDir, name);
    try {
      if (!fs.statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    out.push({ rel: `scripts/${name}`, abs });
  }
  return out;
}

/** 对一段文本跑全部规则，产出命中（含误报过滤与严重级降档） */
function scanText(skill: Skill, rel: string, text: string): SecFinding[] {
  const lines = text.split('\n');
  const out: SecFinding[] = [];
  for (const rule of SEC_RULES) {
    for (const m of text.matchAll(ruleRe(rule))) {
      const idx = m.index ?? 0;
      const line = text.slice(0, idx).split('\n').length;
      const excerpt = (lines[line - 1] ?? '').trim().slice(0, EXCERPT_MAX);
      const matchText = m[0];

      // 凭据类：示例值 / 占位符直接丢弃，避免 README 里 `sk-xxx` 之类的噪音
      if (rule.category === 'secret' && PLACEHOLDER_RE.test(matchText)) continue;
      // 泛化赋值：值必须达到最小熵，才可能像真密钥（password=123456789012 不该报）
      if (rule.minEntropy !== undefined) {
        const value = matchText.replace(/^[^:=]*[:=]\s*/, '').replace(/^["']|["']$/g, '');
        if (shannonEntropy(value) < rule.minEntropy) continue;
      }

      out.push({
        skillId: skill.id,
        skillName: skill.name,
        dir: skill.dir,
        file: rel,
        line,
        ruleId: rule.id,
        category: rule.category,
        // 说明性提及降档：文档里举例说明危险命令，不该当成真风险
        severity: DEMOTE_RE.test(excerpt) ? demote(rule.severity) : rule.severity,
        titleKey: rule.titleKey,
        excerpt,
      });
    }
  }
  return out;
}

/**
 * 内容安全扫描（F1）：读单个技能的 SKILL.md 与 scripts/ 文本，
 * 命中危险回调 / 凭据泄漏 / 提示注入 / 混淆载荷即产出告警。
 *
 * 纯只读：不改动、不删除任何文件。供诊断（自有仓库批量）与详情页（单技能按需）共用。
 */
export function scanSkillSecurity(skill: Skill): SecFinding[] {
  const out: SecFinding[] = [];
  if (!skill.dir || !fs.existsSync(skill.dir)) return out;
  for (const f of skillFiles(skill.dir)) {
    const text = readTextFile(f.abs);
    if (!text) continue;
    out.push(...scanText(skill, f.rel, text));
  }
  return out;
}

/** 批量扫描：只覆盖 self-owned 来源（第三方只读来源默认不扫，ownSources 决定范围） */
export function scanSecurity(skills: Skill[], ownSources: Set<string>): SecFinding[] {
  const findings: SecFinding[] = [];
  for (const s of skills) {
    if (!ownSources.has(s.source)) continue;
    findings.push(...scanSkillSecurity(s));
  }
  return findings;
}
