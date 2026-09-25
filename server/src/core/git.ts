import { spawn } from 'node:child_process';

/**
 * 共享的**异步** git 执行器。
 *
 * 关键约束：全项目禁止使用 spawnSync / execSync 跑 git——
 * 同步调用会阻塞 Node 事件循环，一个卡住的远端会让整个服务（含 /state）一起冻死。
 * 所有 git 调用统一走这里，保证：异步、带超时、超时杀进程组并立即返回。
 */

export interface GitOut { status: number | null; out: string; err: string; timedOut: boolean }

/** 执行 git；超时则杀整个进程组并立即 resolve，绝不阻塞主进程 */
export function gitRun(dir: string, args: string[], timeout = 8000): Promise<GitOut> {
  return new Promise((resolve) => {
    // detached 让 git 成为进程组组长，超时可连同其子进程一起杀掉，
    // 否则（如内网 HTTPS 仓库）子进程仍持有管道，close 事件迟迟不触发。
    const child = spawn('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let out = '';
    let err = '';
    let done = false;
    let timedOut = false;
    const finish = (status: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ status, out: out.trim(), err: err.trim(), timedOut });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* 组不存在则忽略 */ }
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish(null); // 不等 close，立即返回
    }, timeout);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code));
  });
}

/** 执行 git 并返回 stdout 文本；非零退出/超时返回 undefined */
export async function gitText(dir: string, args: string[], timeout = 8000): Promise<string | undefined> {
  const r = await gitRun(dir, args, timeout);
  if (r.status !== 0) return undefined;
  return r.out || undefined;
}