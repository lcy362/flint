import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 下载 / 执行进度：给前端画进度条用。
 *
 * 口径诚实——有确切百分比就给百分比（git 自带进度行），拿不到就只给已传输字节
 * （npm 在非 TTY 下不渲染进度条，但解包体积在涨，拿它当「已下载多少」的真实指标），
 * 绝不用估算值冒充百分比。
 */
export interface ProgressInfo {
  /** 0–100；拿不到就是 undefined（前端走不定进度样式） */
  percent?: number;
  /** 已传输字节 */
  received?: number;
  /** 总字节（拿不到就是 undefined） */
  total?: number;
  /** 阶段说明（git 阶段名 / 'download' 等） */
  stage?: string;
}

/**
 * git 的进度行：`Receiving objects:  45% (1234/2345, 1.20/2.70 MiB, 3.40 MiB/s)`
 * 锚定行首：只认本地进度（`Receiving objects`），`remote: Counting objects: …`
 * 是服务端在数自己的对象，与「我方下载了多少」无关，不认。
 */
const GIT_PROGRESS_RE =
  /^(Receiving objects|Resolving deltas|Compressing objects|Counting objects|Writing objects|Enumerating objects):\s+(\d+)%(?:\s+\(([^)]*)\))?/;
const BYTE_MUL: Record<string, number> = { b: 1, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };
const BYTE_UNITS = ['GiB', 'MiB', 'KiB', 'B'];

/** 单位 → 字节 */
function toBytes(value: string, unit?: string): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const mul = BYTE_MUL[(unit ?? 'B').toLowerCase()] ?? 1;
  return Math.round(n * mul);
}

function skipSpaces(s: string, i: number): number {
  let j = i;
  while (s[j] === ' ') j += 1;
  return j;
}

/** 读一段数字（允许小数点）；对不上返回 undefined */
function readAmount(s: string, i: number): { raw: string; next: number } | undefined {
  const start = skipSpaces(s, i);
  let j = start;
  while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j += 1;
  if (j === start) return undefined;
  return { raw: s.slice(start, j), next: j };
}

function readUnit(s: string, i: number): { unit?: string; next: number } {
  const j = skipSpaces(s, i);
  const unit = BYTE_UNITS.find((u) => s.startsWith(u, j));
  return unit ? { unit, next: j + unit.length } : { next: j };
}

/**
 * 字节对：`1.20/2.70 MiB`（单位只写在后一个数后面）或 `1.20 MiB/2.70 MiB`。
 * 必须带单位才算字节——`(3/3)` 那种对象计数不是字节，不能当下载量。
 * 用手写扫描代替正则，避免 `[\d.]+` 与可选空白叠出超线性回溯。
 */
function parseBytesPair(detail: string): { received: number; total: number } | undefined {
  for (let i = 0; i < detail.length; i += 1) {
    const ch = detail[i];
    if (ch < '0' || ch > '9') continue;
    const prev = detail[i - 1];
    if (prev === '.' || (prev >= '0' && prev <= '9')) continue;
    const left = readAmount(detail, i);
    if (!left) continue;
    const leftUnit = readUnit(detail, left.next);
    const slash = skipSpaces(detail, leftUnit.next);
    if (detail[slash] !== '/') continue;
    const right = readAmount(detail, slash + 1);
    if (!right) continue;
    const rightUnit = readUnit(detail, right.next);
    const unit = rightUnit.unit ?? leftUnit.unit;
    if (!unit) continue;
    const received = toBytes(left.raw, unit);
    const total = toBytes(right.raw, unit);
    if (received === undefined || total === undefined) continue;
    return { received, total };
  }
  return undefined;
}

/** 速度片段，如 `3.40 MiB/s`；找不到返回 undefined */
function parseSpeed(detail: string): string | undefined {
  for (let i = 0; i < detail.length; i += 1) {
    const ch = detail[i];
    if (ch < '0' || ch > '9') continue;
    const prev = detail[i - 1];
    if (prev === '.' || (prev >= '0' && prev <= '9')) continue;
    const num = readAmount(detail, i);
    if (!num) continue;
    const unit = readUnit(detail, num.next);
    if (!unit.unit) continue;
    if (detail[unit.next] === '/' && detail[unit.next + 1] === 's') return detail.slice(i, unit.next + 2);
  }
  return undefined;
}

/** ANSI 终端控制序列：git 可能按用户配置着色，进度行要先剥掉颜色码 */
const ANSI_RE = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** 剥掉 ANSI 颜色码与首尾空白 */
function cleanLine(line: string): string {
  return line.replace(ANSI_RE, '').trim();
}

/** 解析一行 git 进度输出；不是进度行返回 undefined */
export function parseGitProgress(line: string): ProgressInfo | undefined {
  const m = GIT_PROGRESS_RE.exec(cleanLine(line));
  if (!m) return undefined;
  const percent = Number(m[2]);
  const detail = m[3] ?? '';
  const info: ProgressInfo = {
    percent: Number.isFinite(percent) ? percent : undefined,
    stage: m[1],
  };
  const bytes = parseBytesPair(detail);
  if (bytes) {
    info.received = bytes.received;
    info.total = bytes.total;
  }
  const speed = parseSpeed(detail);
  if (speed) info.stage = `${m[1]} · ${speed}`;
  return info;
}

/** 字节 → 人类可读（B / KB / MB / GB） */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(1)} ${units[i]}`;
}

/** 目录体积（字节）；限制遍历文件数，避免超大缓存拖慢轮询 */
export function dirSize(dir: string, maxFiles = 5000): number {
  let total = 0;
  let files = 0;
  const walk = (d: string) => {
    if (files >= maxFiles) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files >= maxFiles) return;
      const child = path.join(d, e.name);
      if (e.isDirectory()) walk(child);
      else {
        try { total += fs.statSync(child).size; files += 1; } catch { /* 读不到就跳过 */ }
      }
    }
  };
  walk(dir);
  return total;
}

/** npx 的缓存根（npm 下载解包落在这里） */
export function npxCacheRoot(): string {
  const cache = process.env.npm_config_cache || path.join(os.homedir(), '.npm');
  return path.join(cache, '_npx');
}

/**
 * 盯住 npx 缓存增长：npm 在非 TTY 下不渲染进度条，但解包出来的体积在涨——
 * 拿它当「已下载多少」的真实指标（只统计本次开始后新建 / 改动过的缓存目录）。
 *
 * 阶段语义：
 * - `download`：体积在涨 → 「正在下载 X MB」；
 * - `install`：体积连续两次不变 → 下载结束，转入安装阶段（「正在安装」）。
 * 返回停止函数。
 */
export function watchNpxDownload(startedAt: number, onProgress: (p: ProgressInfo) => void, intervalMs = 400): () => void {
  let last = -1;
  let stable = 0;
  let installing = false;
  const tick = () => {
    const root = npxCacheRoot();
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
    let total = 0;
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(root, e.name);
      try {
        if (fs.statSync(dir).mtimeMs < startedAt) continue; // 只算本次动过的缓存目录
      } catch { continue; }
      total += dirSize(dir);
    }
    if (total > last) {
      last = total;
      stable = 0;
      installing = false;
      // 还没下载到东西时不报 0 字节——「0 B」是噪声，不是进度
      if (total > 0) onProgress({ received: total, stage: 'download' });
      return;
    }
    // 体积不再增长：下载多半结束了，转入安装阶段（避免进度条停住让人以为卡死）
    if (!installing && total > 0) {
      stable += 1;
      if (stable >= 2) {
        installing = true;
        onProgress({ received: total, stage: 'install' });
      }
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
