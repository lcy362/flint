import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findGitRoot, probeSource, detectStale, refreshSkill, recordIngestedSource } from '../src/core/source-update.js';
import { tmpDir, makeStore, skill } from './helpers.js';

function mkSkillRoot(exist: boolean) {
  const root = tmpDir();
  if (exist) {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'SKILL.md'), 'body', 'utf-8');
  }
  return root;
}

describe('findGitRoot', () => {
  it('向上命中最近 .git 返回仓库根', () => {
    const root = tmpDir();
    const nested = path.join(root, 'a', 'b');
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    fs.mkdirSync(nested, { recursive: true });
    expect(findGitRoot(nested)).toBe(root);
  });

  it('无 .git 返回 undefined', () => {
    expect(findGitRoot(tmpDir())).toBeUndefined();
  });
});

describe('probeSource', () => {
  it('git 仓库内技能标为 git', () => {
    const root = tmpDir();
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    const skillDir = path.join(root, 's1');
    fs.mkdirSync(skillDir, { recursive: true });
    expect(probeSource(skillDir)).toEqual({ sourceType: 'git', sourceRef: fs.realpathSync(skillDir) });
  });

  it('普通目录标为 dir', () => {
    const skillDir = mkSkillRoot(true);
    expect(probeSource(skillDir)).toEqual({ sourceType: 'dir', sourceRef: fs.realpathSync(skillDir) });
  });

  it('空路径 / 不存在返回空对象', () => {
    expect(probeSource('')).toEqual({});
    expect(probeSource('/nonexistent/xyz')).toEqual({});
  });
});

describe('recordIngestedSource', () => {
  it('来源可定位时写入 sourceRef/sourceType/takenAt', () => {
    const cfg = makeStore({});
    const root = tmpDir();
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    const sdir = path.join(root, 's1');
    fs.mkdirSync(sdir, { recursive: true });
    recordIngestedSource(cfg, 'r1', 's1', sdir);
    const meta = cfg.data.skillMeta['s1@r1'];
    expect(meta?.sourceRef).toBe(fs.realpathSync(sdir));
    expect(meta?.sourceType).toBe('git');
    expect(meta?.takenAt).toBeTruthy();
  });
});

describe('detectStale', () => {
  it('无来源返回 undefined', async () => {
    expect(await detectStale(tmpDir(), undefined)).toBeUndefined();
    expect(await detectStale(tmpDir(), { tags: [] })).toBeUndefined();
  });

  it('dir 源：源更新则 stale=true，源未更新则 false', async () => {
    const src = mkSkillRoot(true);
    const dst = mkSkillRoot(true);
    const meta = { tags: [], sourceRef: src, sourceType: 'dir' as const };
    // 源 mtime 更新
    const later = new Date(Date.now() + 10000);
    fs.utimesSync(path.join(src, 'SKILL.md'), later, later);
    expect(await detectStale(dst, meta)).toBe(true);
    // 让 dst 更新于源
    const later2 = new Date(Date.now() + 20000);
    fs.utimesSync(path.join(dst, 'SKILL.md'), later2, later2);
    expect(await detectStale(dst, meta)).toBe(false);
  });

  it('git 源但非真实仓库（无法读 log）返回 undefined', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    const meta = { tags: [], sourceRef: dir, sourceType: 'git' as const };
    expect(await detectStale(tmpDir(), meta)).toBeUndefined();
  });
});

describe('refreshSkill', () => {
  it('无来源拒绝', () => {
    const cfg = makeStore({});
    const repo = { id: 'r1', path: tmpDir() };
    const res = refreshSkill(cfg, repo, 's1');
    expect(res.refreshed).toBe(false);
  });

  it('来源是目录且副本存在：覆盖副本、更新 takenAt、来源不变', () => {
    const cfg = makeStore({});
    const root = tmpDir();
    const src = path.join(root, 'src');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'SKILL.md'), 'NEW', 'utf-8');
    // 仓库：<root>/skills/s1（repoSkillRoot 用 <path>/skills）
    const repo = { id: 'r1', path: root };
    const repoRoot = path.join(root, 'skills');
    fs.mkdirSync(repoRoot, { recursive: true });
    const dst = path.join(repoRoot, 's1');
    fs.mkdirSync(dst, { recursive: true });
    fs.writeFileSync(path.join(dst, 'SKILL.md'), 'OLD', 'utf-8');
    recordIngestedSource(cfg, 'r1', 's1', src);
    const res = refreshSkill(cfg, repo, 's1');
    expect(res.refreshed).toBe(true);
    expect(fs.readFileSync(path.join(dst, 'SKILL.md'), 'utf-8')).toBe('NEW');
    expect(fs.readFileSync(path.join(src, 'SKILL.md'), 'utf-8')).toBe('NEW'); // 来源未被改动
    expect(cfg.data.skillMeta['s1@r1']?.takenAt).toBeTruthy();
  });

  it('来源缺失拒绝且不动副本', () => {
    const cfg = makeStore({});
    const root = tmpDir();
    const repo = { id: 'r1', path: root };
    const repoRoot = path.join(root, 'skills');
    fs.mkdirSync(repoRoot, { recursive: true });
    const dst = path.join(repoRoot, 's1');
    fs.mkdirSync(dst, { recursive: true });
    fs.writeFileSync(path.join(dst, 'SKILL.md'), 'OLD', 'utf-8');
    cfg.data.skillMeta['s1@r1'] = { tags: [], sourceRef: '/nonexistent/src', sourceType: 'dir' };
    const res = refreshSkill(cfg, repo, 's1');
    expect(res.refreshed).toBe(false);
    expect(fs.readFileSync(path.join(dst, 'SKILL.md'), 'utf-8')).toBe('OLD');
  });
});