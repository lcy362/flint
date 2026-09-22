import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  presetSkillSet,
  deployOne,
  resolveSyncMode,
} from '../src/core/sync.js';
import { skill, makeStore, tmpDir } from './helpers.js';

// 每个用例给 agent 一个独占的临时目录：
// 既避免读到本机真实目录，也让 effectiveAgentKey 稳定折回自身。
const cursorDir = path.join(tmpDir('flint-desired-'), 'cursor');

describe('presetSkillSet（一次性「应用预设」的 skill 集）', () => {
  it('未绑定预设时为空集 —— 不会「跟随全部预设」', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir } },
      presets: [{ name: 'demo', skills: ['alpha@default'], tags: [] }],
    });
    const skills = [skill('alpha')];
    expect(presetSkillSet(store, skills, 'cursor').size).toBe(0);
  });

  it('绑定预设后基准 = 预设成员', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: ['alpha@default', 'beta@other'], tags: [] }],
    });
    const skills = [skill('alpha'), skill('beta', 'other')];
    expect([...presetSkillSet(store, skills, 'cursor').values()].map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('预设关联标签命中也会进集', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: [], tags: ['viz'] }],
    });
    const skills = [skill('echarts', 'default', ['viz']), skill('other', 'default', ['misc'])];
    expect([...presetSkillSet(store, skills, 'cursor').values()].map((s) => s.name)).toEqual(['echarts']);
  });

  it('skillMeta 里的标签覆盖 frontmatter（命中口径与展示口径一致）', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: [], tags: ['viz'] }],
      skillMeta: { 'echarts@default': { tags: [] } },
    });
    const skills = [skill('echarts', 'default', ['viz'])];
    expect(presetSkillSet(store, skills, 'cursor').size).toBe(0);
  });

  it('成员 id 找不到时按纯名字兜底命中（id / 名字两种写法归一）', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: ['beta@ghost'], tags: [] }],
    });
    const skills = [skill('beta', 'other')];
    expect([...presetSkillSet(store, skills, 'cursor').values()].map((s) => s.name)).toEqual(['beta']);
  });

  it('id 与名字都找不到时不会硬塞进集', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: ['ghost@default'], tags: [] }],
    });
    expect(presetSkillSet(store, [skill('alpha')], 'cursor').size).toBe(0);
  });

  it('别名 Agent 没有自己的集，一律沿用主 Agent 的预设', () => {
    const shared = tmpDir('flint-shared-desired-');
    const store = makeStore({
      agents: {
        cline: { globalDir: shared, preset: 'demo' },
        warp: { globalDir: shared, preset: 'solo' },
      },
      activeAgents: ['cline', 'warp'],
      presets: [
        { name: 'demo', skills: ['alpha@default'], tags: [] },
        { name: 'solo', skills: ['gamma@ext'], tags: [] },
      ],
    });
    const skills = [skill('alpha'), skill('gamma', 'ext')];
    // 主 Agent 是 Cline（都活跃时按名称序），Warp 自己那份 solo 不生效
    expect([...presetSkillSet(store, skills, 'warp').values()].map((s) => s.name)).toEqual(['alpha']);
  });

  it('未指定 agentKey 场景（无 override）→ 空集', () => {
    const store = makeStore({ presets: [{ name: 'demo', skills: ['alpha@default'], tags: [] }] });
    expect(presetSkillSet(store, [skill('alpha')], 'cursor').size).toBe(0);
  });
});

describe('deployOne（单技能「添加」部署）', () => {
  it('把单个技能部署进 agent 目录（symlink）', () => {
    const repo = tmpDir('flint-deployone-repo-');
    fs.mkdirSync(path.join(repo, 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'alpha', 'SKILL.md'), '---\nname: alpha\n---\nBody');
    const target = path.join(tmpDir('flint-deployone-target-'), 'agent');
    const store = makeStore({ agents: { cursor: { globalDir: target, sync: 'symlink' } } });
    const alpha = skill('alpha');
    alpha.dir = path.join(repo, 'alpha');
    const res = deployOne(store, 'cursor', alpha.id, [alpha]);
    expect(res.created).toEqual(['alpha@default']);
    expect(fs.lstatSync(path.join(target, 'alpha')).isSymbolicLink()).toBe(true);
  });

  it('技能 id 找不到时给出 failed 而非抛错', () => {
    const target = path.join(tmpDir('flint-deployone-target-'), 'agent');
    const store = makeStore({ agents: { cursor: { globalDir: target, sync: 'symlink' } } });
    const res = deployOne(store, 'cursor', 'ghost@default', [skill('alpha')]);
    expect(res.failed.length).toBe(1);
    expect(res.failed[0].skill).toBe('ghost@default');
  });
});

describe('resolveSyncMode（同步策略优先级）', () => {
  it('关系级覆盖 > Agent 级覆盖 > 全局默认', () => {
    const store = makeStore({
      defaultSync: 'copy',
      agents: {
        cursor: { globalDir: cursorDir, sync: 'copy', skillSync: { alpha: 'symlink' } },
      },
    });
    expect(resolveSyncMode(store, 'cursor', 'alpha')).toBe('symlink'); // 关系级
    expect(resolveSyncMode(store, 'cursor', 'beta')).toBe('copy'); // Agent 级
  });

  it('无任何覆盖时用全局默认', () => {
    const store = makeStore({
      defaultSync: 'copy',
      agents: { cursor: { globalDir: cursorDir } },
    });
    expect(resolveSyncMode(store, 'cursor', 'alpha')).toBe('copy');
  });

  it('别名沿用主 Agent 的安装方式（同一目录不可能一个软链一个复制）', () => {
    const shared = tmpDir('flint-shared-sync-');
    const store = makeStore({
      defaultSync: 'symlink',
      agents: {
        cline: { globalDir: shared, sync: 'copy' },
        warp: { globalDir: shared, sync: 'symlink' },
      },
      activeAgents: ['cline', 'warp'],
    });
    // 主 Agent 是 Cline → warp 也读 copy
    expect(resolveSyncMode(store, 'warp', 'alpha')).toBe('copy');
  });
});