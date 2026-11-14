import fs from 'node:fs';

interface TextSnap {
  mtimeMs: number;
  size: number;
  text: string;
}

/**
 * 进程内正文缓存：按文件 mtime + size 复用。
 * 扫描、正文搜索、安全扫描、frontmatter 校验读的是同一份 SKILL.md，
 * 这里让它们共用一次磁盘读取。写操作后由调用方 `invalidateTextCache` 清掉。
 */
const cache = new Map<string, TextSnap>();

/**
 * 读一个文本文件。超过 maxBytes、或内容含 NUL（视为二进制）时返回 undefined，且不写入缓存。
 * mtime 与 size 都没变时直接返回上次的字符串。
 */
export function readCachedUtf8(file: string, maxBytes = Number.POSITIVE_INFINITY): string | undefined {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return undefined;
  }
  if (!st.isFile() || st.size > maxBytes) return undefined;
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.text;
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return undefined;
  }
  if (buf.includes(0)) return undefined;
  const text = buf.toString('utf-8');
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, text });
  return text;
}

/** 写操作之后清掉正文缓存，避免同毫秒覆盖时仍拿到旧内容 */
export function invalidateTextCache(): void {
  cache.clear();
}
