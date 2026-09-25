import { log } from '../infra/logger.js';
import { gitRun, gitText } from './git.js';

/**
 * F4 · 仓库级 git 同步（远程地址 / 是否有更新 / 直接 pull）。
 *
 * 口径：仓库的"来源"就是它的 git remote。
 *
 * 关键约束：全部走**异步**子进程（见 core/git.ts），绝不使用 spawnSync——
 * 同步调用会阻塞 Node 事件循环，导致 /state 等请求一起被冻住（曾因此整站加载不出来）。
 */

/** 读取仓库 origin 远端地址；非 git 仓库返回 undefined */
export async function repoGitRemote(repoDir: string): Promise<string | undefined> {
  return gitText(repoDir, ['remote', 'get-url', 'origin'], 5000);
}

export interface RepoStatus {
  /** 远端地址（git remote origin）；非 git 仓库整体返回 undefined */
  remote: string;
  /** 本地领先远端提交数（比对失败时为 undefined） */
  ahead?: number;
  /** 落后远端提交数；>0 表示"来源有更新"（比对失败时为 undefined，即无法判定） */
  behind?: number;
  /** 本次是否成功联网校验过（false 表示用的是本地缓存引用，仅作参考） */
  checked: boolean;
}

/**
 * 仓库相对远端的领先/落后提交数。
 * opts.fetch=false（默认）只读本地已有的远端引用，秒回；
 * opts.fetch=true 先 git fetch（短超时），远端不可达时跳过比对。
 */
export async function repoStatus(repoDir: string, opts: { fetch?: boolean } = {}): Promise<RepoStatus | undefined> {
  const remote = await repoGitRemote(repoDir);
  if (!remote) return undefined;
  const st: RepoStatus = { remote, checked: false };
  if (opts.fetch) {
    const f = await gitRun(repoDir, ['fetch', '--quiet'], 8000);
    if (f.timedOut || f.status !== 0) return st;
    st.checked = true;
  }
  const cb = (await gitText(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'], 5000)) ?? 'HEAD';
  // 优先当前分支上游；无上游回落到 origin/HEAD
  let count = await gitText(repoDir, ['rev-list', '--count', `HEAD..${cb}@{u}`], 8000);
  if (count !== undefined && !/^\d+$/.test(count)) count = undefined;
  if (count === undefined) {
    const ro = await gitText(repoDir, ['rev-list', '--count', 'HEAD..origin/HEAD'], 8000);
    if (ro !== undefined && /^\d+$/.test(ro)) count = ro;
  }
  if (count !== undefined) {
    st.behind = Number(count);
    const ahead = await gitText(repoDir, ['rev-list', '--count', `${cb}@{u}..HEAD`], 8000);
    if (ahead !== undefined && /^\d+$/.test(ahead)) st.ahead = Number(ahead);
  }
  return st;
}

export interface PullResult { ok: boolean; updated: boolean; message: string }

/** 直接 git pull（默认上游）；成功返回 ok，updated 表示是否有实际变更 */
export async function pullRepo(repoDir: string): Promise<PullResult> {
  const r = await gitRun(repoDir, ['pull'], 60000);
  if (r.timedOut) {
    log.info('repo-sync', 'pull timeout', { dir: repoDir });
    return { ok: false, updated: false, message: 'git pull timed out' };
  }
  if (r.status !== 0) {
    log.info('repo-sync', 'pull failed', { dir: repoDir, err: r.err });
    return { ok: false, updated: false, message: r.err || r.out };
  }
  const updated = !/already up[ -]to[ -]date/i.test(r.out);
  log.info('repo-sync', 'pull done', { dir: repoDir, updated });
  return { ok: true, updated, message: r.out };
}