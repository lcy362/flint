import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { gitExec } from '../src/core/git.js';
import {
  defaultIdFromPkg,
  npxInstall,
  npxPkgIssue,
  npxUpdate,
  normalizeInstaller,
  parseArgs,
  suggestScanRoot,
} from '../src/core/npx-install.js';
import { idIssue } from '../src/core/register.js';
import { tmpDir, writeSkill } from './helpers.js';

/** git 可用性探测（本工具强依赖 git，CI 必然具备；不可用则跳过执行类用例） */
async function hasGit(): Promise<boolean> {
  const v = await gitExec(['--version'], { timeout: 5000 });
  return v.status === 0;
}

describe('npxPkgIssue（npm 包名校验）', () => {
  it('普通名 / scope / 带版本都合法', () => {
    expect(npxPkgIssue('impeccable')).toBeUndefined();
    expect(npxPkgIssue('@pbakaus/impeccable')).toBeUndefined();
    expect(npxPkgIssue('impeccable@1.2.3')).toBeUndefined();
    expect(npxPkgIssue('@scope/pkg@latest')).toBeUndefined();
  });

  it('空、选项注入、ext:: helper、空白、大写一律拒绝', () => {
    expect(npxPkgIssue('')).toBeTruthy();
    expect(npxPkgIssue('   ')).toBeTruthy();
    expect(npxPkgIssue('-y')).toBeTruthy();
    expect(npxPkgIssue('ext::sh -c whoami')).toBeTruthy();
    expect(npxPkgIssue('foo bar')).toBeTruthy();
    expect(npxPkgIssue('Foo')).toBeTruthy();
  });
});

describe('parseArgs（安装参数切分）', () => {
  it('按空白切分、丢弃空段', () => {
    expect(parseArgs('install -y --project')).toEqual(['install', '-y', '--project']);
    expect(parseArgs('  skills   update  -y  ')).toEqual(['skills', 'update', '-y']);
    expect(parseArgs('')).toEqual([]);
    expect(parseArgs(undefined)).toEqual([]);
    expect(parseArgs(['install', '--dir', '.'])).toEqual(['install', '--dir', '.']);
  });

  it('控制字符拒绝', () => {
    expect(() => parseArgs('install\u0000evil')).toThrow();
  });
});

describe('defaultIdFromPkg（包名推导缺省 id）', () => {
  it('去 scope 与版本后缀，结果一定是合法 id', () => {
    expect(defaultIdFromPkg('impeccable')).toBe('impeccable');
    expect(defaultIdFromPkg('@pbakaus/impeccable')).toBe('pbakaus-impeccable');
    expect(defaultIdFromPkg('impeccable@1.2.3')).toBe('impeccable');
    expect(defaultIdFromPkg('@scope/pkg@latest')).toBe('scope-pkg');
    for (const pkg of ['impeccable', '@pbakaus/impeccable', 'impeccable@1.2.3', '我的 包']) {
      expect(idIssue(defaultIdFromPkg(pkg))).toBeUndefined();
    }
  });
});

describe('normalizeInstaller（安装器信息落库规整）', () => {
  it('缺省 = 无安装器', () => {
    expect(normalizeInstaller(undefined)).toEqual({});
    expect(normalizeInstaller(null)).toEqual({});
  });

  it('合法 npx 安装器：参数解析、空 updateArgs 回落为缺省', () => {
    const r = normalizeInstaller({ kind: 'npx', pkg: 'impeccable', args: 'skills install -y --project', updateArgs: '  ', at: '2026-01-01T00:00:00Z' });
    expect(r.issue).toBeUndefined();
    expect(r.installer).toEqual({ kind: 'npx', pkg: 'impeccable', args: ['skills', 'install', '-y', '--project'], at: '2026-01-01T00:00:00Z' });
  });

  it('保留专用更新命令', () => {
    const r = normalizeInstaller({ kind: 'npx', pkg: 'impeccable', args: ['skills', 'install', '-y'], updateArgs: ['skills', 'update', '-y', '--force'] });
    expect(r.installer?.updateArgs).toEqual(['skills', 'update', '-y', '--force']);
  });

  it('kind 不符 / 包名非法 / 参数含控制字符都给出 issue', () => {
    expect(normalizeInstaller({ kind: 'git', pkg: 'x' }).issue).toBeTruthy();
    expect(normalizeInstaller({ kind: 'npx', pkg: 'Foo' }).issue).toBeTruthy();
    expect(normalizeInstaller({ kind: 'npx', pkg: 'ok', args: 'a\u0000b' }).issue).toBeTruthy();
  });
});

describe('suggestScanRoot（安装产物推断技能扫描根）', () => {
  it('impeccable 形态：技能在 .claude/skills/ 下 → 建议根即该目录', () => {
    const base = tmpDir('flint-npx-suggest-');
    writeSkill(path.join(base, '.claude', 'skills'), 'impeccable');
    expect(suggestScanRoot(base)).toBe(path.join(base, '.claude', 'skills'));
  });

  it('根自身即技能 → 根自己', () => {
    const base = tmpDir('flint-npx-root-');
    writeSkill(base, 'solo');
    expect(suggestScanRoot(base)).toBe(base);
  });

  it('空目录 / 只有 .git → undefined（预览会显示 0，交由用户改路径）', () => {
    const base = tmpDir('flint-npx-empty-');
    expect(suggestScanRoot(base)).toBeUndefined();
    fs.mkdirSync(path.join(base, '.git'), { recursive: true });
    expect(suggestScanRoot(base)).toBeUndefined();
  });

  it('多个技能同在根下 → 根；散落不同子目录 → 公共祖先', () => {
    const flat = tmpDir('flint-npx-flat-');
    writeSkill(flat, 'a');
    writeSkill(flat, 'b');
    expect(suggestScanRoot(flat)).toBe(flat);

    const nested = tmpDir('flint-npx-nested-');
    writeSkill(path.join(nested, 'cat'), 'a');
    writeSkill(path.join(nested, 'dog'), 'b');
    expect(suggestScanRoot(nested)).toBe(nested);
  });

  it('软链技能目录（impeccable link 形态）同样识别', () => {
    const base = tmpDir('flint-npx-link-');
    const real = writeSkill(tmpDir('flint-npx-real-'), 'impeccable');
    const skillsDir = path.join(base, '.claude', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.symlinkSync(real, path.join(skillsDir, 'impeccable'), 'dir');
    expect(suggestScanRoot(base)).toBe(skillsDir);
  });
});

/**
 * 用一个本地假安装器跑完整安装 / 更新闭环（不联网）：
 * FLINT_NPX_BIN 指向一个 node 桩，模拟「往 cwd 写技能、每次运行内容递增」的安装器。
 * 参数约定：rest 含 noop = 什么都不写；含 fail = 退出码 1。
 */
describe('npxInstall / npxUpdate（笼子内执行与快照）', () => {
  const stub = path.join(tmpDir('flint-npx-stub-'), 'npx');
  const prevBin = process.env.FLINT_NPX_BIN;

  beforeEach(() => {
    fs.writeFileSync(
      stub,
      [
        '#!/usr/bin/env node',
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        'const rest = process.argv.slice(4); // --yes <pkg> <rest...>',
        "if (rest.includes('fail')) { console.error('boom'); process.exit(1); }",
        "if (rest.includes('noop')) { console.log('noop'); process.exit(0); }",
        'const cwd = process.cwd();',
        "const dir = path.join(cwd, '.claude', 'skills', 'fake');",
        "fs.mkdirSync(dir, { recursive: true });",
        "const counter = path.join(cwd, '.counter');",
        "const n = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0) + 1;",
        "fs.writeFileSync(counter, String(n));",
        "fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\\nname: fake\\ndescription: fake installer skill v${n}\\n---\\nBody v${n}\\n`);",
        "console.log(`installed v${n}`);",
      ].join('\n'),
      'utf-8',
    );
    fs.chmodSync(stub, 0o755);
    process.env.FLINT_NPX_BIN = stub;
  });

  afterAll(() => {
    if (prevBin === undefined) delete process.env.FLINT_NPX_BIN;
    else process.env.FLINT_NPX_BIN = prevBin;
  });

  it('安装：内容落笼子、git 快照、建议根正确', async () => {
    if (!(await hasGit())) return;
    const dir = path.join(tmpDir('flint-npx-install-'), 'impeccable');
    const r = await npxInstall({ pkg: 'impeccable', args: ['install', '-y', '--project'], dir });
    expect(r.ok).toBe(true);
    expect(r.path).toBe(dir);
    expect(r.reused).toBe(false);
    // 笼子：技能落在托管目录的 .claude/skills 下，且目录被 git init
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'fake', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
    // 建议根可直接用于登记
    expect(r.suggestedRoot).toBe(path.join(dir, '.claude', 'skills'));
  });

  it('更新：默认重跑安装命令，产物有变化即 updated', async () => {
    if (!(await hasGit())) return;
    const dir = path.join(tmpDir('flint-npx-update-'), 'impeccable');
    await npxInstall({ pkg: 'impeccable', args: ['install', '-y'], dir });
    const u = await npxUpdate({ dir, pkg: 'impeccable', args: ['install', '-y'] });
    expect(u.ok).toBe(true);
    expect(u.updated).toBe(true);
    expect(u.usedArgs).toEqual(['install', '-y']);
    expect(u.diff).toContain('SKILL.md');
  });

  it('更新：updateArgs 优先；无文件变化时 updated=false', async () => {
    if (!(await hasGit())) return;
    const dir = path.join(tmpDir('flint-npx-noop-'), 'impeccable');
    await npxInstall({ pkg: 'impeccable', args: ['install', '-y'], dir });
    const u = await npxUpdate({ dir, pkg: 'impeccable', args: ['install', '-y'], updateArgs: ['noop'] });
    expect(u.ok).toBe(true);
    expect(u.usedArgs).toEqual(['noop']);
    expect(u.updated).toBe(false);
    expect(u.diff).toBe('');
  });

  it('安装失败：不抛，返回 ok=false 与 message', async () => {
    const dir = path.join(tmpDir('flint-npx-fail-'), 'impeccable');
    const r = await npxInstall({ pkg: 'impeccable', args: ['install', 'fail'], dir });
    expect(r.ok).toBe(false);
    expect(r.message).toBeTruthy();
    expect(r.log).toContain('boom');
  });

  it('非法包名 / 非法 id 直接拒绝，不动文件系统', async () => {
    const bad = await npxInstall({ pkg: 'Foo', args: [], dir: path.join(tmpDir('flint-npx-badpkg-'), 'x') });
    expect(bad.ok).toBe(false);
    expect(bad.path).toBe('');
    const badId = await npxInstall({ pkg: 'impeccable', args: [], id: '-bad', dir: path.join(tmpDir('flint-npx-badid-'), 'x') });
    expect(badId.ok).toBe(false);
  });
});
