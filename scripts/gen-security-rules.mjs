#!/usr/bin/env node
/**
 * 构建期生成安全扫描规则常量（F1）。
 *
 * 读取 server/rules/security/*.yaml（vendored 规则快照），产出
 * server/src/core/security-rules.generated.ts —— 运行时零依赖、零网络。
 *
 * 只在规则变更时手动运行：npm run gen:security-rules
 * 生成产物提交进仓库，因此 build / start 完全不依赖本脚本。
 *
 * 同时承担规则校验：id 唯一、取值合法、正则可编译——把坏规则挡在构建期。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const RULES_DIR = path.join(root, 'server/rules/security');
const OUT_FILE = path.join(root, 'server/src/core/security-rules.generated.ts');

const CATEGORIES = ['dangerous', 'secret', 'injection', 'obfuscation'];
const SEVERITIES = ['info', 'warn', 'error'];

/** 读取并校验一个规则文件，返回规则数组 */
function readRules(file) {
  const doc = YAML.parse(fs.readFileSync(file, 'utf-8'));
  if (!doc || !Array.isArray(doc.rules)) throw new Error(`${path.basename(file)}: 缺少顶层 rules 数组`);
  return doc.rules.map((r) => {
    const where = `${path.basename(file)} → ${r?.id ?? '(无 id)'}`;
    if (!r?.id || !/^[A-Z][A-Z0-9_]+$/.test(r.id)) throw new Error(`${where}: id 需为大写下划线形式`);
    if (!CATEGORIES.includes(r.category)) throw new Error(`${where}: category 非法 (${r.category})`);
    if (!SEVERITIES.includes(r.severity)) throw new Error(`${where}: severity 非法 (${r.severity})`);
    if (typeof r.pattern !== 'string' || !r.pattern) throw new Error(`${where}: 缺少 pattern`);
    if (!r.titleKey) throw new Error(`${where}: 缺少 titleKey`);
    if (r.flags && !/^[gimsuy]*$/.test(r.flags)) throw new Error(`${where}: flags 非法 (${r.flags})`);
    if (r.minEntropy !== undefined && (typeof r.minEntropy !== 'number' || r.minEntropy < 0)) {
      throw new Error(`${where}: minEntropy 非法 (${r.minEntropy})`);
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(r.pattern, r.flags ?? '');
    } catch (e) {
      throw new Error(`${where}: 正则无法编译 — ${e.message}`);
    }
    return {
      id: r.id,
      category: r.category,
      severity: r.severity,
      flags: r.flags ?? '',
      titleKey: r.titleKey,
      pattern: r.pattern,
      minEntropy: r.minEntropy,
    };
  });
}

const files = fs.existsSync(RULES_DIR)
  ? fs.readdirSync(RULES_DIR).filter((f) => f.endsWith('.yaml')).sort()
  : [];
if (files.length === 0) throw new Error(`未找到规则文件: ${RULES_DIR}`);

const seen = new Set();
const rules = [];
for (const f of files) {
  for (const r of readRules(path.join(RULES_DIR, f))) {
    if (seen.has(r.id)) throw new Error(`规则 id 重复: ${r.id}`);
    seen.add(r.id);
    rules.push(r);
  }
}

const lines = rules.map((r) => {
  const parts = [
    `id: ${JSON.stringify(r.id)}`,
    `category: ${JSON.stringify(r.category)}`,
    `severity: ${JSON.stringify(r.severity)}`,
    `flags: ${JSON.stringify(r.flags)}`,
    `titleKey: ${JSON.stringify(r.titleKey)}`,
    `pattern: ${JSON.stringify(r.pattern)}`,
  ];
  if (r.minEntropy !== undefined) parts.push(`minEntropy: ${r.minEntropy}`);
  return `  { ${parts.join(', ')} },`;
});

const banner = `/* eslint-disable */
/**
 * AUTO-GENERATED — 请勿手改。
 * 来源: server/rules/security/*.yaml
 * 重新生成: npm run gen:security-rules
 */

export type SecSeverity = 'info' | 'warn' | 'error';
export type SecCategory = 'dangerous' | 'secret' | 'injection' | 'obfuscation';

export interface SecRule {
  id: string;
  category: SecCategory;
  severity: SecSeverity;
  /** 正则标志（''/i/u 等），与 pattern 一起交给 new RegExp */
  flags: string;
  /** 指向 server/src/i18n 的规则描述键 */
  titleKey: string;
  /** 正则源码（未经 RegExp 解释） */
  pattern: string;
  /** 命中值的最小香农熵（仅泛化凭据规则使用；低于该值视为误报丢弃） */
  minEntropy?: number;
}

/** 由 vendored 规则快照生成的检测规则表（共 ${rules.length} 条） */
export const SEC_RULES: SecRule[] = [
`;

fs.writeFileSync(OUT_FILE, `${banner}${lines.join('\n')}\n];\n`, 'utf-8');
console.log(`[gen:security-rules] ${rules.length} 条规则 → ${path.relative(root, OUT_FILE)}`);
