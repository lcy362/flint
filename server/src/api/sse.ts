import type { Response } from 'express';
import { parseGitProgress, type ProgressInfo } from '../core/progress.js';

/**
 * SSE（Server-Sent Events）流式输出：给耗时操作（git 克隆 / npx 安装 / npx 更新）
 * 提供实时进度。协议极简——每个事件一行 `data: <json>\n\n`：
 * - `{phase:'start', ...}`    开始（携带命令 / 目录等上下文）
 * - `{phase:'log', line}`     一行输出（子进程 stdout/stderr 规整后）
 * - `{phase:'progress', ...}` 下载进度（percent / received / total / stage）
 * - `{phase:'done', ...}`     成功，其余字段即该操作的结果载荷
 * - `{phase:'error', error}`  失败，error 为可读文案（完整日志已由 log 事件给出）
 *
 * 校验类错误（参数不合法等）发生在开流之前，仍走普通 JSON + 4xx，不进流。
 */

/** SSE 响应头：关缓存、显式关代理缓冲（vite dev 代理默认透传，不额外压缩） */
export function sseHead(res: Response): void {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
}

/** 发送一个事件 */
export function sseSend(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/** 结束流 */
export function sseEnd(res: Response): void {
  res.end();
}

/** 单行输出最大长度：进度行偶发超长时截断，避免把整个包名列表刷进界面 */
const MAX_LINE = 500;
/** 合并发送的最小间隔（ms）：npm / git 进度刷新很快，限流防刷爆界面 */
const FLUSH_MS = 120;

/**
 * 把子进程的原始输出块规整成「行」并限流转发。
 * 用法：`const emit = createLineEmitter(res); child.stdout.on('data', emit)`，
 * 结束后调 `emit.flush()` 把残余半行吐完。
 *
 * onProgress：命中 git 进度行（`Receiving objects: 45% …`）时回调一次；
 * 这类行**不再**进日志面板——它们已被进度条表达，刷屏无意义。
 */
export function createLineEmitter(res: Response, onProgress?: (p: ProgressInfo) => void): ((chunk: string) => void) & { flush: () => void } {
  const onProg = onProgress;
  let partial = '';
  let pending: string[] = [];
  let last = 0;
  const flush = () => {
    if (pending.length === 0) return;
    const lines = pending;
    pending = [];
    last = Date.now();
    for (const line of lines) sseSend(res, { phase: 'log', line });
  };
  const emit = (chunk: string) => {
    partial += chunk;
    // 进度条用 \r 刷新、普通输出用 \n：两种都当行边界
    const parts = partial.split(/\r\n|\r|\n/);
    partial = parts.pop() ?? '';
    for (const p of parts) {
      const line = p.trim();
      if (!line) continue;
      if (onProg) {
        const prog = parseGitProgress(line);
        if (prog) { onProg(prog); continue; } // 进度行交给进度条，不进日志
      }
      pending.push(line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line);
    }
    if (pending.length > 0 && Date.now() - last >= FLUSH_MS) flush();
  };
  /** 收尾：把残余半行（末尾没有换行的输出）也吐出去 */
  emit.flush = () => {
    const tail = partial.trim();
    partial = '';
    if (tail) {
      const prog = onProg ? parseGitProgress(tail) : undefined;
      if (prog && onProg) onProg(prog);
      else pending.push(tail.length > MAX_LINE ? `${tail.slice(0, MAX_LINE)}…` : tail);
    }
    flush();
  };
  return emit;
}

/** 进度事件最小间隔（ms）：进度更新很密，节流防刷爆界面 */
const PROGRESS_MS = 200;

/** 进度上报器：把进度信息按最小间隔发成 `{phase:'progress', …}` 事件 */
export interface ProgressReporter {
  /** 上报一次进度（内部节流） */
  emit: (p: ProgressInfo) => void;
  /** 立刻发出最后一条待发进度（收尾用，避免尾部进度丢失） */
  flush: () => void;
}

export function createProgressReporter(res: Response, throttleMs = PROGRESS_MS): ProgressReporter {
  let last = 0;
  let pending: ProgressInfo | undefined;
  let timer: NodeJS.Timeout | null = null;
  const send = (p: ProgressInfo) => {
    last = Date.now();
    pending = undefined;
    sseSend(res, { phase: 'progress', ...p });
  };
  return {
    emit(p: ProgressInfo) {
      const now = Date.now();
      if (now - last >= throttleMs) {
        if (timer) { clearTimeout(timer); timer = null; }
        send(p);
        return;
      }
      pending = p;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pending) send(pending);
        }, throttleMs - (now - last));
        timer.unref?.();
      }
    },
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (pending) send(pending);
    },
  };
}
