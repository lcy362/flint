import fs from 'node:fs';
import path from 'node:path';
import { SKILL_FILE } from './skill.js';

export interface BodyCache { mtimeMs: number; text: string }

/**
 * 读取一个技能目录的 SKILL.md 正文，小写归一化后返回。
 *
 * 用请求级短缓存（Map<dir, { mtimeMs, text }>）避免逐次磁盘 IO：
 * 调用方在单次操作（如一次搜索、一次诊断）里复用同一个 cache 实例即可。
 * 不缓存失效逻辑——mtime 变化时自然重建，也无需清理（短生命周期）。
 *
 * 这是 F3 正文搜索复用给 F1（安全扫描）、F2（frontmatter 校验）的共用基础设施。
 */
export function bodyText(dir: string, cache?: Map<string, BodyCache>): string {
  if (!dir) return '';
  if (cache?.has(dir)) return cache.get(dir)!.text;
  const file = path.join(dir, SKILL_FILE);
  let text = '';
  let mtimeMs = 0;
  try {
    const st = fs.statSync(file);
    mtimeMs = st.mtimeMs;
    if (cache?.has(dir) && cache.get(dir)!.mtimeMs === mtimeMs) return cache.get(dir)!.text;
    text = fs.readFileSync(file, 'utf-8').toLowerCase();
  } catch { return ''; }
  if (cache) cache.set(dir, { mtimeMs, text });
  return text;
}

/**
 * 在技能正文里查找关键词，返回首个命中上下文（不含 frontmatter）。
 *
 * 命中上下文用于前端「正文命中」展示，避免把整篇回传。仅取正文部分（去掉 `---` frontmatter 块）
 * 中第一行包含关键词的行及其附近一行，压缩换行为单个分隔符。
 */
export function firstHitContext(body: string, kw: string, max = 120): string | undefined {
  if (!body || !kw) return undefined;
  const lines = body.split('\n');
  let i = lines.findIndex((l) => l.includes(kw));
  if (i < 0) return undefined;
  const line = lines[i].trim();
  // 圈定命中词前后各 max 字符，避免长行撑爆卡片
  const idx = line.indexOf(kw);
  const start = Math.max(0, idx - max);
  const end = Math.min(line.length, idx + kw.length + max);
  const seg = line.slice(start, end).trim();
  return seg.length ? seg : line;
}