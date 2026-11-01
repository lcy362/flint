import type { Response } from 'express';

/**
 * SSE（Server-Sent Events）流式输出：给耗时操作（git 克隆 / npx 安装 / npx 更新）
 * 提供实时进度。协议极简——每个事件一行 `data: <json>\n\n`：
 * - `{phase:'start', ...}`  开始（携带命令 / 目录等上下文）
 * - `{phase:'log', line}`   一行输出（子进程 stdout/stderr 规整后）
 * - `{phase:'done', ...}`   成功，其余字段即该操作的结果载荷
 * - `{phase:'error', error}` 失败，error 为可读文案（完整日志已由 log 事件给出）
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
 */
export function createLineEmitter(res: Response): (chunk: string) => void {
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
  return (chunk: string) => {
    partial += chunk;
    // 进度条用 \r 刷新、普通输出用 \n：两种都当行边界
    const parts = partial.split(/\r\n|\r|\n/);
    partial = parts.pop() ?? '';
    for (const p of parts) {
      const line = p.trim();
      if (line) pending.push(line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line);
    }
    if (pending.length > 0 && Date.now() - last >= FLUSH_MS) flush();
  };
}
