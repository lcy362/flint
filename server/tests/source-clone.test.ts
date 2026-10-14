import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitExec, gitRun } from '../src/core/git.js';
import { cloneSourceRepo, dirNameFromUrl, ensureSourceClone, gitUrlIssue, sourcesDir } from '../src/core/source-clone.js';
import { idIssue } from '../src/core/register.js';
import { tmpDir, writeSkill } from './helpers.js';

describe('gitUrlIssue（Git 地址合法性）', () => {
  it('https / ssh / git / file 与 scp 简写都合法', () => {
    expect(gitUrlIssue('https://github.com/foo/bar.git')).toBeUndefined();
    expect(gitUrlIssue('ssh://git@github.com/foo/bar.git')).toBeUndefined();
    expect(gitUrlIssue('git://example.com/bar.git')).toBeUndefined();
    expect(gitUrlIssue('file:///tmp/bar')).toBeUndefined();
    expect(gitUrlIssue('git@github.com:foo/bar.git')).toBeUndefined();
  });

  it('空、选项注入（- 开头）、ext:: helper、含空白一律拒绝', () => {
    expect(gitUrlIssue('')).toBeTruthy();
    expect(gitUrlIssue('-o')).toBeTruthy();
    expect(gitUrlIssue('ext::sh -c whoami')).toBeTruthy();
    expect(gitUrlIssue('https://a b/c')).toBeTruthy();
    expect(gitUrlIssue('foo/bar')).toBeTruthy();
  });
});

describe('dirNameFromUrl（地址推导克隆目录名 / 缺省 id）', () => {
  it('取末段去掉 .git，结果一定是合法 id', () => {
    expect(dirNameFromUrl('https://github.com/foo/bar.git')).toBe('bar');
    expect(dirNameFromUrl('git@github.com:foo/baz.git')).toBe('baz');
    expect(dirNameFromUrl('https://github.com/foo/bar/')).toBe('bar');
    expect(idIssue(dirNameFromUrl('https://github.com/foo/bar.git'))).toBeUndefined();
  });

  it('末段含中文 / 空格等非法字符时净化成合法名', () => {
    const name = dirNameFromUrl('https://github.com/foo/我的 库.git');
    expect(idIssue(name)).toBeUndefined();
    expect(name).not.toContain(' ');
  });
});

describe('cloneSourceRepo（按地址拉取）', () => {
  it('非法地址直接拒绝，不拉取', async () => {
    await expect(cloneSourceRepo('ext::sh -c whoami')).rejects.toThrow();
  });

  it('本地仓库地址：克隆到托管目录并可被登记流程扫到；再次调用复用不重复下载', async () => {
    // 有个可用的 git 才跑；不可用则跳过（本工具本就强依赖 git，CI 环境必然具备）
    const v = await gitExec(['--version'], { timeout: 5000 });
    if (v.status !== 0) return;
    const origin = tmpDir('flint-origin-');
    writeSkill(origin, 'alpha');
    await gitRun(origin, ['init', '-q']);
    await gitRun(origin, ['add', '-A']);
    await gitRun(origin, ['-c', 'user.email=t@e.com', '-c', 'user.name=t', 'commit', '-m', 'init']);

    const r = await cloneSourceRepo(`file://${origin}`);
    expect(r.path.startsWith(sourcesDir())).toBe(true);
    expect(r.cloned).toBe(true);
    expect(fs.existsSync(path.join(r.path, '.git'))).toBe(true);
    // 克隆目录名即缺省 id：合法，登记流程可直接推导
    expect(idIssue(path.basename(r.path))).toBeUndefined();
    // 代码已落地：技能本体在
    expect(fs.existsSync(path.join(r.path, 'alpha', 'SKILL.md'))).toBe(true);

    // 再次拉取：复用已有克隆（不重复下载）
    const again = await ensureSourceClone(`file://${origin}`, path.basename(r.path));
    expect(again.ok).toBe(true);
    expect(again.cloned).toBe(false);
  });
});
