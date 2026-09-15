import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  copySkill,
  deployAgent,
  dirsEqual,
  symlinkSkill,
} from '../src/core/sync.js';
import { Skill } from '../src/core/skill.js';
import { HubConfig } from '../src/config/types.js';
import { makeStore, tmpDir, writeSkill } from './helpers.js';

/** 一次搭好「一个仓库 + 两个技能 + 一个独占目录的 agent」的最小现场 */
function setup(agentOverride: HubConfig['agents'][string] = {}) {
  // 取 realpath：macOS 的 /var 本身是软链，若基址不先解析，
  // 「失效软链」用例里 underRoot 的 realpath 与字面路径两套口径会打架
  const base = fs.realpathSync(tmpDir('flint-deploy-'));
  const repoDir = path.join(base, 'repo');
  const skillsRoot = path.join(repoDir, 'skills');
  const alphaDir = writeSkill(skillsRoot, 'alpha');
  const betaDir = writeSkill(skillsRoot, 'beta');
  const agentDir = path.join(base, 'agent');

  const store = makeStore({
    repos: [{ id: 'default', path: repoDir, layout: 'auto' }],
    agents: { cursor: { globalDir: agentDir, ...agentOverride } },
  });

  const mk = (name: string, dir: string): Skill => ({
    id: `${name}@default`, name, source: 'default', dir, tags: [],
  });
  const alpha = mk('alpha', alphaDir);
  const beta = mk('beta', betaDir);
  return { base, repoDir, skillsRoot, agentDir, store, alpha, beta };
}

const desiredOf = (...skills: Skill[]) => new Map(skills.map((s) => [s.id, s]));

describe('deployAgent（落盘部署）', () => {
  it('首次部署：生成指向仓库的软链，且能读到 SKILL.md', () => {
    const { store, agentDir, alpha } = setup();
    const res = deployAgent(store, 'cursor', desiredOf(alpha), [alpha], {});
    expect(res.failed).toEqual([]);
    expect(res.created).toEqual(['alpha@default']);
    const link = path.join(agentDir, 'alpha');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(link)).toBe(fs.realpathSync(alpha.dir));
    expect(fs.existsSync(path.join(link, 'SKILL.md'))).toBe(true);
  });

  it('重复部署是幂等的：已正确的软链不重复计入 created', () => {
    const { store, alpha } = setup();
    deployAgent(store, 'cursor', desiredOf(alpha), [alpha], {});
    const again = deployAgent(store, 'cursor', desiredOf(alpha), [alpha], {});
    expect(again.created).toEqual([]);
    expect(again.failed).toEqual([]);
  });

  it('失效软链被重建（旧的悬空链接不阻塞新部署）', () => {
    const { store, agentDir, skillsRoot, alpha } = setup();
    fs.mkdirSync(agentDir, { recursive: true });
    fs.symlinkSync(path.join(skillsRoot, 'ghost'), path.join(agentDir, 'alpha'), 'dir');

    const res = deployAgent(store, 'cursor', desiredOf(alpha), [alpha], {});
    expect(res.failed).toEqual([]);
    expect(res.created).toEqual(['alpha@default']);
    expect(fs.realpathSync(path.join(agentDir, 'alpha'))).toBe(fs.realpathSync(alpha.dir));
  });

  it('外部软链绝不替换（不归本工具管）', () => {
    const { store, agentDir, base, alpha } = setup();
    const outside = path.join(base, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    fs.symlinkSync(outside, path.join(agentDir, 'alpha'), 'dir');

    const res = deployAgent(store, 'cursor', desiredOf(alpha), [alpha], {});
    expect(res.created).toEqual([]);
    expect(res.failed.map((f) => f.skill)).toEqual(['alpha@default']);
    // 链接仍指向外部目录，没有被改写
    expect(fs.readlinkSync(path.join(agentDir, 'alpha'))).toBe(outside);
  });

  it('同名真实目录内容一致 → 视为本工具部署的副本，重建为软链', () => {
    const { store, agentDir, alpha } = setup();
    fs.cpSync(alpha.dir, path.join(agentDir, 'alpha'), { recursive: true });

    const res = deployAgent(store, 'cursor', desiredOf(alpha), [alpha], {});
    expect(res.created).toEqual(['alpha@default']);
    expect(fs.lstatSync(path.join(agentDir, 'alpha')).isSymbolicLink()).toBe(true);
  });

  it('同名真实目录内容不一致 → 判失败并原样保留用户内容', () => {
    const { store, agentDir, alpha } = setup();
    const mine = path.join(agentDir, 'alpha');
    fs.mkdirSync(mine, { recursive: true });
    fs.writeFileSync(path.join(mine, 'SKILL.md'), '---\nname: mine\n---\nMine\n', 'utf-8');

    const res = deployAgent(store, 'cursor', desiredOf(alpha), [alpha], {});
    expect(res.created).toEqual([]);
    expect(res.failed.map((f) => f.skill)).toEqual(['alpha@default']);
    expect(fs.lstatSync(mine).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(mine, 'SKILL.md'), 'utf-8')).toContain('mine');
  });

  it('未知 Agent 直接判失败，不写盘', () => {
    const { store } = setup();
    const res = deployAgent(store, 'not-an-agent', new Map(), [], {});
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].skill).toBe('*');
  });

  it('copy 模式落的是真实副本（不是软链）', () => {
    const { store, agentDir, alpha } = setup({ sync: 'copy' });
    const res = deployAgent(store, 'cursor', desiredOf(alpha), [alpha], {});
    expect(res.created).toEqual(['alpha@default']);
    const dest = path.join(agentDir, 'alpha');
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(fs.existsSync(path.join(dest, 'SKILL.md'))).toBe(true);
  });
});

describe('deployAgent 的 prune 语义（只补不删 vs 显式回收）', () => {
  /** 先摆一个「本工具部署的」残留：beta 的软链，但期望集里只有 alpha */
  function withResidual() {
    const ctx = setup();
    fs.mkdirSync(ctx.agentDir, { recursive: true });
    symlinkSkill(path.join(ctx.agentDir, 'beta'), ctx.beta.dir);
    return ctx;
  }

  it('prune:false（自动同步）只补齐，不回收残留', () => {
    const ctx = withResidual();
    const res = deployAgent(ctx.store, 'cursor', desiredOf(ctx.alpha), [ctx.alpha], {});
    expect(res.removed).toEqual([]);
    expect(fs.existsSync(path.join(ctx.agentDir, 'beta'))).toBe(true);
    expect(fs.existsSync(path.join(ctx.agentDir, 'alpha'))).toBe(true);
  });

  it('prune:true（显式同步）回收本工具部署、已不在期望集里的软链', () => {
    const ctx = withResidual();
    const res = deployAgent(ctx.store, 'cursor', desiredOf(ctx.alpha), [ctx.alpha], { prune: true });
    expect(res.removed).toEqual(['beta']);
    expect(fs.existsSync(path.join(ctx.agentDir, 'beta'))).toBe(false);
    expect(fs.existsSync(path.join(ctx.agentDir, 'alpha'))).toBe(true);
  });

  it('prune:true 也不碰外部软链', () => {
    const ctx = subject();
    const res = deployAgent(ctx.store, 'cursor', desiredOf(ctx.alpha), [ctx.alpha], { prune: true });
    expect(res.removed).toEqual([]);
    expect(fs.existsSync(path.join(ctx.agentDir, 'gamma'))).toBe(true);
    expect(fs.readlinkSync(path.join(ctx.agentDir, 'gamma'))).toBe(ctx.outside);
  });

  it('prune:true 也不碰真实目录（agent 自带技能）', () => {
    const ctx = subject();
    const res = deployAgent(ctx.store, 'cursor', desiredOf(ctx.alpha), [ctx.alpha], { prune: true });
    expect(res.removed).toEqual([]);
    expect(fs.existsSync(path.join(ctx.agentDir, 'owned', 'SKILL.md'))).toBe(true);
  });
});

/** 现场：残留的外部软链 gamma + 自带真实目录 owned + 期望集只有 alpha */
function subject() {
  const ctx = setup();
  const outside = path.join(ctx.base, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.mkdirSync(ctx.agentDir, { recursive: true });
  symlinkSkill(path.join(ctx.agentDir, 'gamma'), outside);
  writeSkill(ctx.agentDir, 'owned');
  return { ...ctx, outside };
}

describe('symlinkSkill / copySkill', () => {
  it('symlinkSkill 会先清掉同名占位再建软链', () => {
    const base = tmpDir('flint-link-');
    const target = writeSkill(path.join(base, 'src'), 'alpha');
    const link = path.join(base, 'dst', 'alpha');

    symlinkSkill(link, target);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);

    // 再建一次：不报 EEXIST
    symlinkSkill(link, target);
    expect(fs.readlinkSync(link)).toBe(target);
  });

  it('copySkill 复制出独立的真实目录', () => {
    const base = tmpDir('flint-copy-');
    const target = writeSkill(path.join(base, 'src'), 'alpha');
    const dest = path.join(base, 'dst', 'alpha');

    copySkill(dest, target);
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(fs.existsSync(path.join(dest, 'SKILL.md'))).toBe(true);

    // 复制体是独立的：改目标不影响副本
    fs.writeFileSync(path.join(target, 'SKILL.md'), '---\nname: alpha\n---\nChanged\n', 'utf-8');
    expect(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf-8')).not.toContain('Changed');
  });
});

describe('dirsEqual（判断同名目录是否本工具部署的副本）', () => {
  it('内容完全一致 → true', () => {
    const base = tmpDir('flint-eq-');
    const a = writeSkill(path.join(base, 'a'), 'alpha');
    const b = writeSkill(path.join(base, 'b'), 'alpha');
    expect(dirsEqual(a, b)).toBe(true);
  });

  it('文件内容不同 → false', () => {
    const base = tmpDir('flint-eq-');
    const a = writeSkill(path.join(base, 'a'), 'alpha');
    const b = writeSkill(path.join(base, 'b'), 'alpha');
    fs.writeFileSync(path.join(b, 'SKILL.md'), '---\nname: alpha\n---\nOther\n', 'utf-8');
    expect(dirsEqual(a, b)).toBe(false);
  });

  it('文件名集合不同 → false', () => {
    const base = tmpDir('flint-eq-');
    const a = writeSkill(path.join(base, 'a'), 'alpha');
    const b = writeSkill(path.join(base, 'b'), 'alpha');
    fs.writeFileSync(path.join(b, 'extra.txt'), 'x', 'utf-8');
    expect(dirsEqual(a, b)).toBe(false);
  });

  it('空目录之间不算一致（防止把空目录误判为副本）', () => {
    const base = tmpDir('flint-eq-');
    const a = path.join(base, 'a');
    const b = path.join(base, 'b');
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    expect(dirsEqual(a, b)).toBe(false);
  });

  it('一侧是软链时不算一致', () => {
    const base = tmpDir('flint-eq-');
    const a = writeSkill(path.join(base, 'a'), 'alpha');
    const b = path.join(base, 'b');
    fs.mkdirSync(b, { recursive: true });
    fs.symlinkSync(a, path.join(b, 'nested'), 'dir');
    fs.writeFileSync(path.join(b, 'SKILL.md'), fs.readFileSync(path.join(a, 'SKILL.md')));
    expect(dirsEqual(a, b)).toBe(false);
  });
});
