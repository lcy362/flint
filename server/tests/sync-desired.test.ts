import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeDesired,
  desiredContext,
  desiredNamesFor,
  resolveSyncMode,
} from '../src/core/sync.js';
import { skill, makeStore, tmpDir } from './helpers.js';

// 每个用例给 agent 一个独占的临时目录：
// 既避免读到本机真实目录，也让 effectiveAgentKey 稳定折回自身。
const cursorDir = path.join(tmpDir('flint-desired-'), 'cursor');

describe('desiredContext（期望集推导）', () => {
  it('未绑定预设时基准为空 —— 不会「跟随全部预设」', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir } },
      presets: [{ name: 'demo', skills: ['alpha@default'], tags: [] }],
    });
    const skills = [skill('alpha')];
    expect([...computeDesired(store, skills, 'cursor').values()]).toEqual([]);
    expect(desiredContext(store, skills, 'cursor').preset).toBe('');
  });

  it('绑定预设后基准 = 预设成员', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: ['alpha@default', 'beta@other'], tags: [] }],
    });
    const skills = [skill('alpha'), skill('beta', 'other')];
    expect([...desiredNamesFor(store, skills, 'cursor')].sort()).toEqual(['alpha', 'beta']);
    expect(desiredContext(store, skills, 'cursor').preset).toBe('demo');
  });

  it('预设关联标签命中也会进基准', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: [], tags: ['viz'] }],
    });
    const skills = [skill('echarts', 'default', ['viz']), skill('other', 'default', ['misc'])];
    expect([...desiredNamesFor(store, skills, 'cursor')]).toEqual(['echarts']);
  });

  it('skillMeta 里的标签覆盖 frontmatter（命中口径与展示口径一致）', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: [], tags: ['viz'] }],
      skillMeta: { 'echarts@default': { tags: [] } },
    });
    const skills = [skill('echarts', 'default', ['viz'])];
    expect([...desiredNamesFor(store, skills, 'cursor')]).toEqual([]);
  });

  it('预设来源标注 presetOf（含标签命中的成员）', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: ['alpha@default'], tags: ['viz'] }],
    });
    const skills = [skill('alpha'), skill('echarts', 'default', ['viz'])];
    const ctx = desiredContext(store, skills, 'cursor');
    expect(ctx.presetOf.get('alpha')).toBe('demo');
    expect(ctx.presetOf.get('echarts')).toBe('demo');
  });

  it('explicitOn 在基准之外额外开启技能', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo', explicitOn: ['gamma@ext'] } },
      presets: [{ name: 'demo', skills: ['alpha@default'], tags: [] }],
    });
    const skills = [skill('alpha'), skill('gamma', 'ext')];
    expect([...desiredNamesFor(store, skills, 'cursor')].sort()).toEqual(['alpha', 'gamma']);
  });

  it('explicitOff 从基准中裁掉技能（按 id 命中）', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo', explicitOff: ['beta@default'] } },
      presets: [{ name: 'demo', skills: ['alpha@default', 'beta@default'], tags: [] }],
    });
    const skills = [skill('alpha'), skill('beta')];
    expect([...desiredNamesFor(store, skills, 'cursor')]).toEqual(['alpha']);
  });

  it('explicitOff 按纯名字也生效（id / 名字两种写法归一）', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo', explicitOff: ['beta'] } },
      presets: [{ name: 'demo', skills: ['alpha@default', 'beta@other'], tags: [] }],
    });
    const skills = [skill('alpha'), skill('beta', 'other')];
    expect([...desiredNamesFor(store, skills, 'cursor')]).toEqual(['alpha']);
  });

  it('同一技能 id 与名字都找不到时不会硬塞进期望集', () => {
    const store = makeStore({
      agents: { cursor: { globalDir: cursorDir, preset: 'demo' } },
      presets: [{ name: 'demo', skills: ['ghost@default'], tags: [] }],
    });
    expect([...desiredNamesFor(store, [skill('alpha')], 'cursor')]).toEqual([]);
  });

  it('别名 Agent 没有自己的期望集，一律沿用主 Agent 的策略', () => {
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
    expect([...desiredNamesFor(store, skills, 'warp')]).toEqual(['alpha']);
    expect(desiredContext(store, skills, 'warp').preset).toBe('demo');
  });

  it('未指定 agentKey 时按全局默认（无 override → 基准为空）', () => {
    const store = makeStore({ presets: [{ name: 'demo', skills: ['alpha@default'], tags: [] }] });
    expect([...computeDesired(store, [skill('alpha')]).values()]).toEqual([]);
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
