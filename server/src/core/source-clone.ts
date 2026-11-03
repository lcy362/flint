import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH } from '../config/defaults.js';
import { gitExec, gitRun } from './git.js';
import { log } from '../infra/logger.js';
import { t } from '../i18n/index.js';

/**
 * 「从 Git 仓库导入」：按地址把代码拉到本工具托管目录，供随后走既有的登记流程。
 *
 * 口径：拉取只负责把代码落到文件系统，不改 config；登记（id / 名称 / 布局 / 预览 / 落库）
 * 仍由既有登记流程完成——路径就是拉取到的目录。
 * 已有克隆则复用并顺带 fetch，避免重复下载。
 *
 * 安全约束（与 core/git.ts 一致）：
 * - 只用异步子进程跑 git，绝不 spawnSync（同步会冻住事件循环）；
 * - 地址走 argv 且置于 `--` 之后，杜绝选项注入；仅接受只读传输协议，拒绝 ext:: 等可执行任意命令的 helper。
 */

/** 拉取落地根目录：<flint 数据目录>/sources（尊重 FLINT_CONFIG 覆盖，测试 / smoke 落在沙箱） */
export function sourcesDir(): string {
  return path.join(path.dirname(CONFIG_PATH), 'sources');
}

/** 允许的 Git 传输：https/http、ssh、git、file（本地），以及 scp 简写 user@host:path（只读，无 shell 注入） */
const GIT_URL_SCHEME = /^(https?|ssh|git|file):\/\/[^\s]+$/i;
const GIT_URL_SCP = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[^\s]+$/;

/** Git 地址合法性；不合法返回可读文案（用户可见，走 i18n），合法返回 undefined */
export function gitUrlIssue(url: string): string | undefined {
  const u = url.trim();
  if (!u) return t('register.gitUrlEmpty');
  if (u.length > 2000) return t('register.gitUrlInvalid', { url: `${u.slice(0, 120)}…` });
  // `-` 开头会被 git 当作选项；`::` 是 ext:: 等远程 helper 的载体，一律拒绝
  if (u.startsWith('-') || u.includes('::') || hasControlOrWhitespace(u)) {
    return t('register.gitUrlInvalid', { url: u });
  }
  if (GIT_URL_SCHEME.test(u) || GIT_URL_SCP.test(u)) return undefined;
  return t('register.gitUrlInvalid', { url: u });
}

/** 控制字符或空白：Git 地址里出现即拒绝 */
function hasControlOrWhitespace(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    if (s.charCodeAt(i) <= 0x1f) return true;
  }
  return /\s/.test(s);
}

/** 去掉结尾 `/` */
function stripTrailingSlash(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end -= 1;
  return s.slice(0, end);
}

/** 取 `/` 或 `:` 之后的最后一段 */
function lastUrlSegment(s: string): string {
  let i = s.length - 1;
  while (i >= 0 && s[i] !== '/' && s[i] !== ':') i -= 1;
  return s.slice(i + 1);
}

function stripGitSuffix(s: string): string {
  return s.length >= 4 && s.slice(-4).toLowerCase() === '.git' ? s.slice(0, -4) : s;
}

function isSlugChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  const digit = c >= 48 && c <= 57;
  const upper = c >= 65 && c <= 90;
  const lower = c >= 97 && c <= 122;
  return digit || upper || lower || ch === '.' || ch === '_' || ch === '-';
}

function toSlug(raw: string): string {
  let slug = '';
  for (const ch of raw) slug += isSlugChar(ch) ? ch : '-';
  let start = 0;
  let end = slug.length;
  while (start < end && slug[start] === '-') start += 1;
  while (end > start && slug[end - 1] === '-') end -= 1;
  return slug.slice(start, end);
}

/**
 * 由地址推导克隆目录名（也是登记时缺省 id 的来源）：取末段去掉 .git，再净化成合法 id 字符。
 * 保证结果一定是一个合法 id（以字母或数字开头，只含字母数字与 . _ -）。
 */
export function dirNameFromUrl(url: string): string {
  const base = stripGitSuffix(lastUrlSegment(stripTrailingSlash(url.trim())));
  const slug = toSlug(base);
  if (!slug) return 'git-source';
  const head = slug.charCodeAt(0);
  const alnum = (head >= 48 && head <= 57) || (head >= 65 && head <= 90) || (head >= 97 && head <= 122);
  return alnum ? slug : `s-${slug}`;
}

export interface CloneOutcome {
  ok: boolean;
  /** 克隆 / 复用到的本地目录 */
  path: string;
  /** 本次是否新建克隆（false = 复用已有克隆） */
  cloned: boolean;
  message: string;
}

/**
 * 确保 <托管目录>/<id> 处有一份该地址的克隆：已存在则复用并 fetch，否则新建克隆。
 * 失败时清理本次新建的半成品目录，避免留下"看着像仓库其实残缺"的状态。
 * onOutput：实时转发 clone / fetch 的输出（供 SSE 进度展示）。
 */
export async function ensureSourceClone(url: string, id: string, onOutput?: (chunk: string) => void): Promise<CloneOutcome> {
  const dest = path.join(sourcesDir(), id);
  // 一律不弹交互口令：私库 / 缺凭证时直接失败，避免请求挂到超时
  const noPrompt = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  // 已有克隆：复用并顺手 fetch（失败不阻断，沿用本地副本，交由登记后的「检查更新 / 同步」再处理）
  if (fs.existsSync(path.join(dest, '.git'))) {
    // --progress：stderr 非 TTY 时 git 默认完全静默，加上它才有 `Receiving objects: 45%` 这类真实进度
    const f = await gitRun(dest, ['fetch', '--progress'], 30000, noPrompt, onOutput);
    log.info('source-clone', 'Reuse existing clone', { dir: dest, fetched: f.status === 0 });
    return { ok: true, path: dest, cloned: false, message: '' };
  }
  fs.mkdirSync(sourcesDir(), { recursive: true });
  const existedBefore = fs.existsSync(dest);
  const r = await gitExec(['clone', '--progress', '--', url, dest], { timeout: 120000, env: noPrompt, onOutput });
  if (r.timedOut || r.status !== 0) {
    // 只清理本次新建的半成品目录；目标本就存在（非空 / 非 git）时不删，交由报错原文提示
    if (!existedBefore) { try { fs.rmSync(dest, { recursive: true, force: true }); } catch { /* 半成品清理失败不阻断报错 */ } }
    log.info('source-clone', 'Clone failed', { url, dir: dest, timedOut: r.timedOut, err: r.err });
    return { ok: false, path: dest, cloned: false, message: r.timedOut ? t('register.gitCloneTimeout') : (r.err || r.out || t('register.gitCloneFailed')) };
  }
  log.info('source-clone', 'Clone done', { url, dir: dest });
  return { ok: true, path: dest, cloned: true, message: '' };
}

export interface GitImportResult {
  /** 拉取到的本地目录，登记流程以此为路径 */
  path: string;
  /** 本次是否新建克隆（false = 复用已有克隆） */
  cloned: boolean;
}

/** 按 Git 地址拉取代码到托管目录，返回随后登记要用的路径。onOutput 实时转发拉取输出 */
export async function cloneSourceRepo(urlRaw: string, onOutput?: (chunk: string) => void): Promise<GitImportResult> {
  const url = urlRaw.trim();
  const issue = gitUrlIssue(url);
  if (issue) throw new Error(issue);
  const out = await ensureSourceClone(url, dirNameFromUrl(url), onOutput);
  if (!out.ok) throw new Error(out.message);
  return { path: out.path, cloned: out.cloned };
}
