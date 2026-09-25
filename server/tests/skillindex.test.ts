import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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

  it('同一 cache 命中不重复读盘（修改内容后旧 cache 仍可复用）', () => {
    const dir = tmpDir();
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'SKILL.md');
    fs.writeFileSync(f, 'alpha', 'utf-8');
    const cache = new Map<string, { mtimeMs: number; text: string }>();
    expect(bodyText(dir, cache)).toBe('alpha');
    // mtime 未变：即使磁盘内容变化，命中缓存（短生命周期内可接受）
    fs.writeFileSync(f, 'beta', 'utf-8');
    expect(bodyText(dir, cache)).toBe('alpha');
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