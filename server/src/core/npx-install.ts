import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH } from '../config/defaults.js';
import { hasSkill } from './skill.js';
import { sourcesDir } from './source-clone.js';
import { gitRun } from './git.js';
import { idIssue } from './register.js';
import { log } from '../infra/logger.js';
import { t } from '../i18n/index.js';

/**
 * 「从 npx 命令安装」：在 flint 托管目录里跑第三方包的安装命令，把产物关进笼子，
 * 随后交给既有登记 / 扫描 / 分发链路——本模块只负责「执行」与「快照」，不认识任何具体包。
 *
 * 安全纪律（与 core/git.ts、core/source-clone.ts 一致）：
 * - 只用异步 spawn，绝不 spawnSync（同步会冻住事件循环）；
 * - argv 数组传参、shell:false，杜绝选项注入与 shell 元字符；
 * - cwd 一律收敛在托管目录（`<flint 数据目录>/sources/<id>`），安装器只能写到这里；
 * - 非交互 env（CI / GIT_TERMINAL_PROMPT / npm_config_yes）防止挂起；
 * - detached + 超时杀进程组，npx 首次要下载包，超时给足 5 分钟；
 * - 托管目录自动 git init：每次安装 / 更新前后各存一个快照提交，用户可 diff / 回滚，
 *   同时保证「从 cwd 向上探测项目根」的安装器（如 impeccable --project）收敛在笼子内。
 */

/** npx 超时：首次运行要下载包（含 engine 二进制），给足 5 分钟 */
export const NPX_TIMEOUT_MS = 300_000;

/** 子进程输出最多回传的字符数（尾部，错误信息通常在末尾） */
const LOG_TAIL = 8000;

/** 非交互环境：装死「无人值守」，交互式安装器要么用默认值要么快速失败，绝不挂起 */
function npxEnv(): NodeJS.ProcessEnv {
  return { ...process.env, CI: '1', GIT_TERMINAL_PROMPT: '0', npm_config_yes: 'true' };
}

/**
 * npx 可执行文件定位：优先 `FLINT_NPX_BIN`（测试注入桩），其次与 node 同目录
 * （标准 Node 安装里 npx 与 node 同在 bin 目录），最后常见家酿 / 系统位置；
 * 都找不到回退 'npx' 走 PATH。与 git.ts 的 GIT_BIN 同一思路。
 */
export function npxBin(): string {
  const candidates = [
    process.env.FLINT_NPX_BIN,
    path.join(path.dirname(process.execPath), 'npx'),
    '/opt/homebrew/bin/npx',
    '/usr/local/bin/npx',
    '/usr/bin/npx',
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => fs.existsSync(p)) ?? 'npx';
}

/**
 * npm 包名合法性（简化版 npm 规则）：可选 @scope/ 前缀，可选 @version 后缀。
 * 合法返回 undefined，非法返回可读文案（用户可见，走 i18n）。
 */
export function npxPkgIssue(pkg: string): string | undefined {
  const p = pkg.trim();
  if (!p) return t('register.npxPkgEmpty');
  if (p.length > 214) return t('register.npxPkgInvalid', { pkg: p });
  // `-` 开头会被 npm 当作选项；`::` 是 ext:: 类 helper 的载体；空白 / 控制字符一律拒绝
  if (p.startsWith('-') || p.includes('::') || /[\s\u0000-\u001f]/.test(p)) {
    return t('register.npxPkgInvalid', { pkg: p });
  }
  const re = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[^\s@]+)?$/;
  if (!re.test(p)) return t('register.npxPkgInvalid', { pkg: p });
  return undefined;
}

/** 安装参数按空白切分（前端传整串；数组原样透传）。空段丢弃，控制字符拒绝 */
export function parseArgs(input: string | string[] | undefined): string[] {
  const list = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/\s+/);
  const out = list.map((s) => s.trim()).filter(Boolean);
  if (out.some((a) => /[\u0000-\u001f]/.test(a))) throw new Error(t('register.npxArgsInvalid'));
  return out;
}

/**
 * 命令行切分：按空白切，支持单 / 双引号包裹（引号内的空格保留）。
 * 用户粘的是原始命令（`npx impeccable skills install --dir "my dir"`），不能简单 split(/\s+/)。
 */
export function splitCmdTokens(cmd: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null;
      else { cur += ch; continue; }
      // 收尾引号：保留已攒的内容
      out.push(cur);
      cur = '';
      has = false;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) {
      if (cur || has) { out.push(cur); cur = ''; has = false; }
      continue;
    }
    cur += ch;
    has = true;
  }
  if (cur || has) out.push(cur);
  return out.filter((s) => s.length > 0);
}

/**
 * 解析用户输入的原始 npx 命令：`npx [--yes] <pkg> [args...]`。
 * - 允许省略 `npx` 前缀（直接写包名也行）；`--yes` / `-y` 会被丢掉（本工具自带 --yes）；
 * - 已知包名（knownPkg，更新命令场景）时用它消歧：`npx impeccable skills update` → args=[skills, update]；
 * - 未知包名时，第一个非选项 token 即包名。
 */
export function parseNpxCommand(cmd: string, opts: { knownPkg?: string } = {}): { pkg?: string; args: string[] } {
  const tokens = splitCmdTokens(cmd);
  if (tokens[0] === 'npx') tokens.shift();
  while (tokens[0] === '--yes' || tokens[0] === '-y') tokens.shift();
  const known = opts.knownPkg;
  if (known) {
    if (tokens[0] === known) tokens.shift();
    return { pkg: known, args: tokens };
  }
  if (tokens[0] && !tokens[0].startsWith('-')) {
    const pkg = tokens.shift();
    return { pkg, args: tokens };
  }
  return { pkg: undefined, args: tokens };
}

/**
 * 由包名推导托管目录名 / 缺省 id：@scope/name → scope-name，去掉 @version 后缀，
 * 非法字符净化成 `-`。结果一定是合法 id（与 dirNameFromUrl 同款保证）。
 */
export function defaultIdFromPkg(pkg: string): string {
  const noVer = pkg.trim().replace(/@[^@/]+$/, '');
  const slug = noVer.replace(/^@/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) return 'npx-source';
  return /^[A-Za-z0-9]/.test(slug) ? slug : `s-${slug}`;
}

/** npx 来源的托管目录：与 git 克隆同根（`<flint 数据目录>/sources/<id>`） */
export function stagingDirFor(id: string): string {
  return path.join(sourcesDir(), id);
}

export interface NpxRunResult {
  ok: boolean;
  /** 进程退出码（超时 / 启动失败为 null） */
  code: number | null;
  timedOut: boolean;
  /** 输出尾部（stdout + stderr 合并，截断到 LOG_TAIL） */
  log: string;
}

/** 在指定目录里执行 `npx --yes <pkg> <args...>`；异步、带超时、超时杀进程组。
 *  onOutput：实时转发子进程输出块（供 SSE 进度展示）。 */
export function runNpx(pkg: string, args: string[], dir: string, timeoutMs = NPX_TIMEOUT_MS, onOutput?: (chunk: string) => void): Promise<NpxRunResult> {
  return new Promise((resolve) => {
    const child = spawn(npxBin(), ['--yes', pkg, ...args], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: npxEnv(),
    });
    let out = '';
    let done = false;
    let timedOut = false;
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const tail = out.length > LOG_TAIL ? `…${out.slice(-LOG_TAIL)}` : out;
      resolve({ ok: code === 0, code, timedOut, log: tail.trim() });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* 组不存在则忽略 */ }
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish(null); // 不等 close，立即返回
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; onOutput?.(String(d)); });
    child.stderr.on('data', (d) => { out += d; onOutput?.(String(d)); });
    child.on('error', (e) => { out += `\n${String(e)}`; finish(null); });
    child.on('close', (code) => finish(code));
  });
}

/**
 * 托管目录初始化 git 仓库（没有 .git 才建）。
 * 两个作用：①安装 / 更新前后存快照，可 diff 可回滚；
 * ②让「从 cwd 向上探测项目根」的安装器（impeccable --project 即此）收敛在笼子内，
 *   不会一路跳到用户主目录。
 */
export async function ensureStagingGit(dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(dir, '.git'))) return;
  await gitRun(dir, ['init', '-q'], 10_000);
}

/**
 * 全量提交一个快照点（git add -A + commit --allow-empty）。
 * 身份用行内 -c 注入，绝不写用户 / 全局 git config。返回提交 sha，失败返回 undefined。
 */
export async function gitCommitAll(dir: string, message: string): Promise<string | undefined> {
  await gitRun(dir, ['add', '-A'], 15_000);
  const r = await gitRun(
    dir,
    ['-c', 'user.name=flint', '-c', 'user.email=flint@local', 'commit', '--allow-empty', '-q', '-m', message],
    15_000,
  );
  if (r.status !== 0) return undefined;
  const sha = await gitRun(dir, ['rev-parse', '--short', 'HEAD'], 5000);
  return sha.status === 0 ? sha.out : undefined;
}

/** 相对最近一次快照的改动统计（已暂存视角）；无改动返回空串 */
export async function gitDiffStatStaged(dir: string): Promise<string> {
  await gitRun(dir, ['add', '-A'], 15_000);
  const r = await gitRun(dir, ['diff', '--cached', '--stat', 'HEAD'], 10_000);
  return r.status === 0 ? r.out.trim() : '';
}

/** 扫描建议根时跳过的目录 */
const SKIP_DIRS = new Set(['.git', 'node_modules']);
/** 目录深度上限：安装产物不会埋得很深，够用且防止异常树炸掉遍历 */
const MAX_DEPTH = 6;

/** 递归找出 dir 下所有含 SKILL.md 的目录 */
function findSkillDirs(dir: string, depth: number): string[] {
  if (depth > MAX_DEPTH) return [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out: string[] = [];
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const child = path.join(dir, e.name);
    // 与 scanner 同口径：软链到目录的条目也算目录（impeccable link 装出的就是软链技能）；
    // 失效软链 / 普通文件在这里被跳过。stat 跟随软链，lstat 不跟随。
    let isDir = false;
    try { isDir = fs.statSync(child).isDirectory(); } catch { continue; }
    if (!isDir) continue;
    if (hasSkill(child)) out.push(child);
    else out.push(...findSkillDirs(child, depth + 1));
  }
  return out;
}

/**
 * 从安装产物里推断「技能扫描根」：技能目录的公共父目录。
 * impeccable 装出 `.claude/skills/impeccable/` → 建议根 `.claude/skills`（flat，1 个技能）；
 * 根自身即技能 → 根自己；什么都找不到 → undefined（预览会显示 0，用户自行改路径）。
 */
export function suggestScanRoot(dir: string): string | undefined {
  if (hasSkill(dir)) return dir;
  const skillDirs = findSkillDirs(dir, 1);
  if (skillDirs.length === 0) return undefined;
  const parents = skillDirs.map((d) => path.dirname(d));
  const first = parents[0];
  if (parents.every((p) => p === first)) return first;
  // 多个技能散落不同深度：取公共祖先，布局交给登记时的 auto 检测
  const segs = skillDirs.map((d) => d.split(path.sep));
  const common: string[] = [];
  for (let i = 0; ; i += 1) {
    const col = segs[0][i];
    if (col === undefined || !segs.every((s) => s[i] === col)) break;
    common.push(col);
  }
  return common.join(path.sep) || path.sep;
}

export interface NpxInstallInput {
  pkg: string;
  /** 安装参数：整串（空格分隔）或数组，内部统一 parseArgs；可缺省 */
  args?: string | string[];
  /** 缺省由包名推导；调用方（测试）可显式指定 */
  id?: string;
  /** 缺省 stagingDirFor(id)；调用方（测试）可显式指定 */
  dir?: string;
  /** 实时输出回调（供 SSE 进度展示） */
  onOutput?: (chunk: string) => void;
}

export interface NpxInstallResult {
  ok: boolean;
  /** 解析出的包名（登记时写入 installer） */
  pkg: string;
  /** 解析出的参数（登记时写入 installer） */
  args: string[];
  /** 安装落地目录（= 托管目录） */
  path: string;
  /** 建议的登记路径（技能扫描根）；装空了为 undefined */
  suggestedRoot?: string;
  /** 本次是否在已存在的托管目录上重跑（false = 全新目录） */
  reused: boolean;
  log: string;
  message?: string;
}

/**
 * 执行一次 npx 安装：校验 → 备好笼子（git init + 基线快照）→ 跑命令 → 成功后落一个安装提交。
 * 失败返回 ok:false 与 message（i18n 文案），不抛——由路由转 500。
 */
export async function npxInstall(input: NpxInstallInput): Promise<NpxInstallResult> {
  const issue = npxPkgIssue(input.pkg);
  if (issue) return { ok: false, pkg: input.pkg, args: [], path: '', reused: false, log: '', message: issue };
  const args = parseArgs(input.args);
  const id = input.id?.trim() || defaultIdFromPkg(input.pkg);
  const idProblem = idIssue(id);
  if (idProblem) return { ok: false, pkg: input.pkg, args, path: '', reused: false, log: '', message: idProblem };
  const dir = input.dir ?? stagingDirFor(id);
  const reused = fs.existsSync(dir) && fs.readdirSync(dir).length > 0;

  await ensureStagingGit(dir);
  await gitCommitAll(dir, 'flint: baseline before npx install');
  log.info('npx-install', 'Running npx install', { pkg: input.pkg, args, dir });

  const r = await runNpx(input.pkg, args, dir, NPX_TIMEOUT_MS, input.onOutput);
  if (!r.ok) {
    const message = r.timedOut ? t('register.npxInstallTimeout') : t('register.npxInstallFailed');
    log.info('npx-install', 'npx install failed', { pkg: input.pkg, dir, code: r.code, timedOut: r.timedOut });
    return { ok: false, pkg: input.pkg, args, path: dir, reused, log: r.log, message };
  }
  await gitCommitAll(dir, `flint: npx install ${input.pkg}`);
  const suggestedRoot = suggestScanRoot(dir);
  log.info('npx-install', 'npx install done', { pkg: input.pkg, dir, suggestedRoot });
  return { ok: true, pkg: input.pkg, args, path: dir, suggestedRoot, reused, log: r.log };
}

export interface NpxUpdateInput {
  dir: string;
  pkg: string;
  args: string[];
  /** 专用的更新命令；缺省重跑安装命令（一键更新的默认形态） */
  updateArgs?: string[];
  /** 实时输出回调（供 SSE 进度展示） */
  onOutput?: (chunk: string) => void;
}

export interface NpxUpdateResult {
  ok: boolean;
  /** 是否有文件变化（false = 安装器跑完但产物没变，视为已最新） */
  updated: boolean;
  /** 实际执行的命令（更新命令 ?? 安装命令）——调用方用于向用户说明 */
  usedArgs: string[];
  /** 改动统计（git diff --stat）；无改动为空串 */
  diff: string;
  log: string;
  message?: string;
}

/** 落库的安装器信息（与 config/types.ts 中 ForeignSource.installer 同构） */
export interface NpxInstaller {
  kind: 'npx';
  pkg: string;
  args: string[];
  updateArgs?: string[];
  at?: string;
}

/**
 * 安装器信息落库规整：仅接受 kind='npx' 且包名合法的形态。
 * 返回 issue 非空时调用方应拒绝本次请求（400）；raw 缺省表示「无安装器」。
 * updateCmd：用户填的原始更新命令（可带 `npx <pkg>` 前缀），按已知包名消歧后落成 updateArgs。
 */
export function normalizeInstaller(raw: unknown, opts: { knownPkg?: string } = {}): { installer?: NpxInstaller; issue?: string } {
  if (raw === undefined || raw === null) return {};
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'npx' || typeof o.pkg !== 'string') {
    return { issue: t('register.npxPkgInvalid', { pkg: String(o.pkg ?? '') }) };
  }
  const issue = npxPkgIssue(o.pkg);
  if (issue) return { issue };
  try {
    const args = parseArgs(o.args as string | string[] | undefined);
    const known = opts.knownPkg ?? o.pkg.trim();
    let updateArgs: string[] = [];
    if (typeof o.updateCmd === 'string' && o.updateCmd.trim()) {
      updateArgs = parseNpxCommand(o.updateCmd, { knownPkg: known }).args;
    } else {
      updateArgs = parseArgs(o.updateArgs as string | string[] | undefined);
    }
    const at = typeof o.at === 'string' ? o.at : undefined;
    return {
      installer: {
        kind: 'npx',
        pkg: o.pkg.trim(),
        args,
        ...(updateArgs.length > 0 ? { updateArgs } : {}),
        ...(at ? { at } : {}),
      },
    };
  } catch (e) {
    return { issue: (e as Error).message };
  }
}

/**
 * 更新一个 npx 来源：在托管目录里重跑安装器（updateArgs 优先）。
 * 更新前存快照 → 跑命令 → 统计改动；失败不碰现状，用户可凭快照回滚。
 * 软链投放的 Agent 会随目录内容刷新自动生效；复制投放的 Agent 不自动补写（C10）。
 */
export async function npxUpdate(input: NpxUpdateInput): Promise<NpxUpdateResult> {
  const usedArgs = input.updateArgs && input.updateArgs.length > 0 ? input.updateArgs : input.args;
  await ensureStagingGit(input.dir);
  await gitCommitAll(input.dir, 'flint: snapshot before npx update');
  log.info('npx-install', 'Running npx update', { pkg: input.pkg, args: usedArgs, dir: input.dir });

  const r = await runNpx(input.pkg, usedArgs, input.dir, NPX_TIMEOUT_MS, input.onOutput);
  if (!r.ok) {
    const message = r.timedOut ? t('register.npxInstallTimeout') : t('register.npxInstallFailed');
    log.info('npx-install', 'npx update failed', { pkg: input.pkg, dir: input.dir, code: r.code, timedOut: r.timedOut });
    return { ok: false, updated: false, usedArgs, diff: '', log: r.log, message };
  }
  const diff = await gitDiffStatStaged(input.dir);
  const updated = diff.length > 0;
  log.info('npx-install', 'npx update done', { pkg: input.pkg, dir: input.dir, updated });
  return { ok: true, updated, usedArgs, diff, log: r.log };
}
