import { describe, expect, it } from 'vitest';
import { splitSseFrames } from '../src/api/types';

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
