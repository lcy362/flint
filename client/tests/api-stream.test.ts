import { beforeEach, describe, expect, it, vi } from 'vitest';
import { splitSseFrames, streamApi } from '../src/api/types';

describe('splitSseFrames（SSE 帧切分）', () => {
  it('按空行切帧，保留残余半帧', () => {
    const r = splitSseFrames('data: {"phase":"start"}\n\ndata: {"phase":"log","line":"x"}\n\ndata: {"phase":"do');
    expect(r.frames).toEqual(['data: {"phase":"start"}', 'data: {"phase":"log","line":"x"}']);
    expect(r.rest).toBe('data: {"phase":"do');
  });

  it('忽略非 data 行（keep-alive 注释 / 空段）', () => {
    const r = splitSseFrames(': keep-alive\n\ndata: {"a":1}\n\n\n\n');
    expect(r.frames).toEqual(['data: {"a":1}']);
  });

  it('空输入', () => {
    expect(splitSseFrames('')).toEqual({ frames: [], rest: '' });
  });

  it('JSON 内含空行转义也不误切（\\n 在字符串里是两字符）', () => {
    const r = splitSseFrames('data: {"line":"a\\nb"}\n\n');
    expect(r.frames).toEqual(['data: {"line":"a\\nb"}']);
    expect(r.rest).toBe('');
  });
});

/** 造一个 SSE 响应：把若干帧拼成一段文本流 */
function sseResponse(frames: string[]) {
  const text = frames.map((f) => `data: ${f}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return { ok: true, body: stream, json: async () => ({}) };
}

describe('streamApi（SSE 流式请求）', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('分发 log / progress 事件，done 事件作为结果返回', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      JSON.stringify({ phase: 'start', pkg: 'impeccable' }),
      JSON.stringify({ phase: 'log', line: 'installing…' }),
      JSON.stringify({ phase: 'progress', percent: 45, stage: 'Receiving objects' }),
      JSON.stringify({ phase: 'progress', received: 1048576, stage: 'download' }),
      JSON.stringify({ phase: 'done', ok: true, pkg: 'impeccable' }),
    ]));
    const logs: string[] = [];
    const progresses: any[] = [];
    const out = await streamApi<{ ok: boolean; pkg: string }>('/sources/npx', { command: 'npx impeccable' }, {
      onLog: (line) => logs.push(line),
      onProgress: (p) => progresses.push(p),
    });
    expect(logs).toEqual(['installing…']);
    expect(progresses[0]).toEqual({ percent: 45, received: undefined, total: undefined, stage: 'Receiving objects' });
    // npm 侧只有已下载字节、没有百分比——前端据此画不定进度条
    expect(progresses[1].percent).toBeUndefined();
    expect(progresses[1].received).toBe(1048576);
    expect(out).toMatchObject({ ok: true, pkg: 'impeccable' });
  });

  it('error 事件转成异常抛出', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      JSON.stringify({ phase: 'error', error: 'install failed' }),
    ]));
    await expect(streamApi('/sources/npx', {}, {})).rejects.toThrow('install failed');
  });

  it('非 2xx 走普通 JSON 错误（参数校验失败发生在开流前）', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'bad command' }) });
    await expect(streamApi('/sources/npx', {}, {})).rejects.toThrow('bad command');
  });
});
