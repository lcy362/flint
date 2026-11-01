import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectEscapedWrites, detectOutsideWrites, parseDeclaredHomePaths } from '../src/core/cage.js';
import { tmpDir } from './helpers.js';

/** 把 HOME 指到临时目录：os.homedir() 在 POSIX 下认 $HOME，检测因此可控 */
function withFakeHome<T>(fn: (home: string) => T): T {
  const prev = process.env.HOME;
  const home = tmpDir('flint-cage-home-');
  process.env.HOME = home;
  try {
    return fn(home);
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
  }
}

describe('detectOutsideWrites（笼外写入检测）', () => {
  const prevHome = process.env.HOME;
  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
  });

  it('发现家目录下被改动的新增文件（安装器越界写入）', () => {
    withFakeHome((home) => {
      const cage = path.join(home, 'cage');
      fs.mkdirSync(path.join(home, '.claude', 'agents'), { recursive: true });
      fs.mkdirSync(cage, { recursive: true });
      const started = Date.now() - 1000;
      // 安装器在笼外写了文件
      fs.writeFileSync(path.join(home, '.claude', 'agents', 'impeccable.md'), 'x');
      const hits = detectOutsideWrites(started, cage);
      expect(hits.some((p) => p.includes('.claude'))).toBe(true);
      // 家目录缩写成 ~
      expect(hits.every((p) => p.startsWith('~'))).toBe(true);
    });
  });

  it('笼子内部的改动不算越界', () => {
    withFakeHome((home) => {
      const cage = path.join(home, 'cage');
      fs.mkdirSync(path.join(cage, '.grok', 'skills'), { recursive: true });
      const started = Date.now() - 1000;
      fs.writeFileSync(path.join(cage, '.grok', 'skills', 'SKILL.md'), 'x');
      const hits = detectOutsideWrites(started, cage);
      expect(hits).toEqual([]);
    });
  });

  it('运行之前就存在的文件不算本次越界写入', () => {
    withFakeHome((home) => {
      const cage = path.join(home, 'cage');
      fs.mkdirSync(path.join(home, '.grok'), { recursive: true });
      const old = new Date(Date.now() - 3600_000);
      fs.writeFileSync(path.join(home, '.grok', 'old.md'), 'x');
      fs.utimesSync(path.join(home, '.grok', 'old.md'), old, old);
      fs.utimesSync(path.join(home, '.grok'), old, old);
      const hits = detectOutsideWrites(Date.now() - 1000, cage);
      expect(hits).toEqual([]);
    });
  });

  it('parseDeclaredHomePaths：从安装器输出里取出它声明要写的位置', () => {
    const out = [
      'Detected harnesses:',
      'Grok Build        ~/.flint/sources/impeccable/.grok',
      'Claude Code       ~/.claude',
      'OpenCode          ~/.config/opencode',
    ].join('\n');
    const paths = parseDeclaredHomePaths(out);
    expect(paths).toContain('~/.claude');
    expect(paths).toContain('~/.config/opencode');
    // 被包含的路径不再单列
    expect(paths).not.toContain('~/.claude/skills');
  });

  it('detectEscapedWrites：只认「安装器声明过且确实被改」的位置', () => {
    withFakeHome((home) => {
      const cage = path.join(home, 'cage');
      fs.mkdirSync(cage, { recursive: true });
      const started = Date.now() - 1000;
      // 安装器声明要写 ~/.claude，并真的写了
      fs.mkdirSync(path.join(home, '.claude', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(home, '.claude', 'agents', 'x.md'), 'x');
      // 后台 IDE 自己写的 ~/.codebuddy（安装器没声明过）
      fs.mkdirSync(path.join(home, '.codebuddy'), { recursive: true });
      fs.writeFileSync(path.join(home, '.codebuddy', 'state.json'), '{}');
      const escaped = detectEscapedWrites(started, cage, ['~/.claude']);
      expect(escaped).toEqual(['~/.claude']);
      expect(escaped.some((p) => p.includes('codebuddy'))).toBe(false);
    });
  });

  it('detectEscapedWrites：安装器没声明位置时，退化为「像技能落点」的路径', () => {
    withFakeHome((home) => {
      const cage = path.join(home, 'cage');
      fs.mkdirSync(cage, { recursive: true });
      const started = Date.now() - 1000;
      fs.mkdirSync(path.join(home, '.grok', 'skills'), { recursive: true });
      fs.writeFileSync(path.join(home, '.grok', 'skills', 'SKILL.md'), 'x');
      fs.mkdirSync(path.join(home, '.cache', 'x'), { recursive: true });
      fs.writeFileSync(path.join(home, '.cache', 'x', 'blob'), 'x');
      const escaped = detectEscapedWrites(started, cage, []);
      expect(escaped.some((p) => p.includes('.grok'))).toBe(true);
      expect(escaped.some((p) => p.includes('.cache'))).toBe(false);
    });
  });
});
