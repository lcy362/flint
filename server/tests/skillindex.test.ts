import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bodyText, firstHitContext } from '../src/core/skillindex.js';
import { tmpDir } from './helpers.js';

describe('bodyText', () => {
  it('读取 SKILL.md 全文并小写归一化', () => {
    const dir = tmpDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'Name\nPostgres Migration\n', 'utf-8');
    expect(bodyText(dir)).toBe('name\npostgres migration\n');
  });

  it('缺失 SKILL.md 时优雅返回空串', () => {
    expect(bodyText(tmpDir())).toBe('');
  });

  it('mtime 变化后重新读取', () => {
    const dir = tmpDir();
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'SKILL.md');
    fs.writeFileSync(f, 'alpha', 'utf-8');
    const cache = new Map<string, { mtimeMs: number; text: string }>();
    expect(bodyText(dir, cache)).toBe('alpha');
    fs.writeFileSync(f, 'beta', 'utf-8');
    expect(bodyText(dir, cache)).toBe('beta');
  });

  it('mtime 未变时第二次读取不碰磁盘', () => {
    const dir = tmpDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'alpha', 'utf-8');
    const cache = new Map<string, { mtimeMs: number; text: string }>();
    expect(bodyText(dir, cache)).toBe('alpha');
    const read = vi.spyOn(fs, 'readFileSync');
    expect(bodyText(dir, cache)).toBe('alpha');
    expect(bodyText(dir)).toBe('alpha');
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it('cache 为空 Map 时每次都会重新读（无需触碰）', () => {
    const dir = tmpDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'hello world', 'utf-8');
    expect(bodyText(dir)).toBe('hello world');
  });
});

describe('firstHitContext', () => {
  it('无关键词返回 undefined', () => {
    expect(firstHitContext('abc', '')).toBeUndefined();
    expect(firstHitContext('', 'x')).toBeUndefined();
  });

  it('命中返回所在行的上下文片段', () => {
    const ctx = firstHitContext('line one\nmigrate postgres data safely\nline three', 'postgres');
    expect(ctx).toContain('postgres');
    expect(ctx).toBeDefined();
  });

  it('未命中返回 undefined', () => {
    expect(firstHitContext('hello world', 'nomatch')).toBeUndefined();
  });
});