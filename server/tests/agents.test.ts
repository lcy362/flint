import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  agentSkillRows,
  effectiveAgentKey,
  expandTilde,
  findAgentDef,
  isLinkInRegisteredLibrary,
  isLinkInRepo,
  isManagedLinkTarget,
  primaryOf,
  pruneAliasStrategies,
  repoSkillRoot,
  resolveGlobalDir,
  resolveProjectDir,
  setPrimary,
  sharedStandardDir,
} from '../src/core/agents.js';
import { scanAll } from '../src/core/scanner.js';
import { desiredContext } from '../src/core/sync.js';
import { agentCards } from '../src/domain/cards.js';
import { emptyConfig, HubConfig, Repo } from '../src/config/types.js';
import { makeStore, tmpDir, writeSkill } from './helpers.js';

describe('expandTilde', () => {
  it('展开 ~ 与 ~/ 前缀', () => {
    expect(expandTilde('~')).toBe(os.homedir());
    expect(expandTilde('~/skills')).toBe(path.join(os.homedir(), 'skills'));
  });

  it('非 ~ 开头的路径原样返回', () => {
    expect(expandTilde('/abs/path')).toBe('/abs/path');
    expect(expandTilde('relative/path')).toBe('relative/path');
    // 只有开头的 ~ 是家目录，路径中间的 ~ 是普通字符
    expect(expandTilde('/abs/~x')).toBe('/abs/~x');
  });
});

describe('resolveGlobalDir / resolveProjectDir', () => {
  it('内置 Agent 无覆盖时拼到 home 下', () => {
    const cfg = makeStore().data;
    const def = findAgentDef(cfg, 'cursor')!;
    expect(resolveGlobalDir(def)).toBe(path.join(os.homedir(), '.cursor/skills'));
  });

  it('目录覆盖优先，并支持 ~ 展开', () => {
    const cfg = makeStore().data;
    const def = findAgentDef(cfg, 'cursor')!;
    expect(resolveGlobalDir(def, '/tmp/custom-cursor')).toBe('/tmp/custom-cursor');
    expect(resolveGlobalDir(def, '~/my-cursor')).toBe(path.join(os.homedir(), 'my-cursor'));
  });

  it('自定义 Agent 的 globalDir 直接使用（不再拼 home）', () => {
    const cfg = makeStore({ customAgents: [{ key: 'mine', name: 'Mine', globalDir: '/opt/mine/skills' }] }).data;
    const def = findAgentDef(cfg, 'mine')!;
    expect(def.custom).toBe(true);
    expect(resolveGlobalDir(def)).toBe('/opt/mine/skills');
  });

  it('项目目录：无 project 定义时为 undefined', () => {
    const cfg = makeStore().data;
    expect(resolveProjectDir(findAgentDef(cfg, 'cursor')!, '/p')).toBe('/p/.cursor/skills');
    expect(resolveProjectDir(findAgentDef(cfg, 'antigravity')!, '/p')).toBeUndefined();
    expect(resolveProjectDir(findAgentDef(cfg, 'cursor')!, '/p', '.my/skills')).toBe('/p/.my/skills');
  });
});

describe('repoSkillRoot', () => {
  it('缺省为 <path>/skills', () => {
    const repo: Repo = { id: 'default', path: '/tmp/repo', layout: 'flat' };
    expect(repoSkillRoot(repo)).toBe(path.join('/tmp/repo', 'skills'));
  });

  it('root 显式指定时优先，并展开 ~', () => {
    const repo: Repo = { id: 'default', path: '/tmp/repo', root: '~/skills-root', layout: 'flat' };
    expect(repoSkillRoot(repo)).toBe(path.join(os.homedir(), 'skills-root'));
  });
});

describe('primaryOf（同目录主 Agent 挑选规则）', () => {
  const m = (key: string, name: string, active = false, primary = false) => ({ key, name, active, primary });

  it('显式指定优先，且不受是否活跃影响', () => {
    expect(primaryOf([m('a', 'A', true), m('b', 'B', false, true)])).toBe('b');
  });

  it('多个显式指定时按名称稳定取第一个', () => {
    expect(primaryOf([m('a', 'Zeta', false, true), m('b', 'Alpha', false, true)])).toBe('b');
  });

  it('无指定时活跃优先', () => {
    expect(primaryOf([m('a', 'A'), m('b', 'B', true)])).toBe('b');
  });

  it('都未活跃时按名称排序', () => {
    expect(primaryOf([m('a', 'Warp'), m('b', 'Cline')])).toBe('b');
  });
});

describe('effectiveAgentKey（别名折到主 Agent）', () => {
  it('独占目录的 Agent 主就是自己', () => {
    const store = makeStore({ agents: { cursor: { globalDir: '/tmp/only-cursor' } } });
    expect(effectiveAgentKey(store.data, 'cursor')).toBe('cursor');
  });

  it('同目录多 Agent：活跃的那份当主', () => {
    const shared = tmpDir('flint-shared-');
    const store = makeStore({
      agents: { cline: { globalDir: shared }, warp: { globalDir: shared } },
      activeAgents: ['warp'],
    });
    expect(effectiveAgentKey(store.data, 'warp')).toBe('warp');
    expect(effectiveAgentKey(store.data, 'cline')).toBe('warp');
  });

  it('同目录都活跃时按名称序（Cline < Warp）', () => {
    const shared = tmpDir('flint-shared-');
    const store = makeStore({
      agents: { cline: { globalDir: shared }, warp: { globalDir: shared } },
      activeAgents: ['cline', 'warp'],
    });
    expect(effectiveAgentKey(store.data, 'warp')).toBe('cline');
  });

  it('显式指定可覆盖自动判定', () => {
    const shared = tmpDir('flint-shared-');
    const store = makeStore({
      agents: { cline: { globalDir: shared }, warp: { globalDir: shared } },
      activeAgents: ['cline', 'warp'],
    });
    setPrimary(store.data, 'warp', true);
    expect(effectiveAgentKey(store.data, 'cline')).toBe('warp');
    // 取消指定后回到自动判定
    setPrimary(store.data, 'warp', false);
    expect(effectiveAgentKey(store.data, 'cline')).toBe('cline');
  });

  it('未登记的 key 原样返回', () => {
    const store = makeStore();
    expect(effectiveAgentKey(store.data, 'not-an-agent')).toBe('not-an-agent');
  });
});

describe('setPrimary', () => {
  it('同一目录至多一个指定：指定新主时清掉旧标记', () => {
    const shared = tmpDir('flint-shared-');
    const store = makeStore({
      agents: { cline: { globalDir: shared, primary: true }, warp: { globalDir: shared } },
    });
    setPrimary(store.data, 'warp', true);
    expect(store.data.agents.warp.primary).toBe(true);
    expect(store.data.agents.cline.primary).toBeUndefined();
    // 策略字段不受影响，只动 primary 标记
    expect(store.data.agents.cline.globalDir).toBe(shared);
  });
});

describe('pruneAliasStrategies', () => {
  it('清掉别名那份永不生效的策略覆盖，保留目录覆盖', () => {
    const shared = tmpDir('flint-shared-');
    const store = makeStore({
      agents: {
        cline: {
          globalDir: shared,
          preset: 'demo',
          sync: 'copy',
          skillSync: { alpha: 'copy' },
          explicitOn: ['alpha@default'],
          explicitOff: ['beta@default'],
        },
        warp: { globalDir: shared },
      },
    });
    const cleared = pruneAliasStrategies(store.data, 'warp');
    expect(cleared).toEqual(['cline']);
    expect(store.data.agents.cline).toEqual({ globalDir: shared });
    // 主 Agent 自己那份不动
    expect(store.data.agents.warp).toEqual({ globalDir: shared });
  });

  it('别名只有策略字段、清空后整条记录被移除', () => {
    // codex 与 warp 的默认目录同为 ~/.agents/skills，天然同目录
    const store = makeStore({ agents: { codex: { preset: 'demo' } } });
    const cleared = pruneAliasStrategies(store.data, 'warp');
    expect(cleared).toEqual(['codex']);
    expect(store.data.agents.codex).toBeUndefined();
  });

  it('别名本来就没有策略时不产生改动', () => {
    const shared = tmpDir('flint-shared-');
    const store = makeStore({
      agents: { cline: { globalDir: shared }, warp: { globalDir: shared } },
    });
    expect(pruneAliasStrategies(store.data, 'warp')).toEqual([]);
  });
});

describe('isManagedLinkTarget / isLinkInRepo（软链归属判断）', () => {
  function fixture() {
    const base = tmpDir('flint-link-');
    const repoDir = path.join(base, 'repo');
    const alphaDir = path.join(repoDir, 'skills', 'alpha');
    fs.mkdirSync(alphaDir, { recursive: true });
    const agentDir = path.join(base, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });
    const repo: Repo = { id: 'default', path: repoDir, layout: 'auto' };
    const cfg: HubConfig = { ...emptyConfig(), repos: [repo] };
    return { base, repoDir, alphaDir, agentDir, repo, cfg };
  }

  it('指向仓库内技能的软链算本工具管理', () => {
    const { cfg, alphaDir, agentDir } = fixture();
    expect(isManagedLinkTarget(cfg, alphaDir, agentDir)).toBe(true);
  });

  it('指向仓库外的软链不算管理', () => {
    const { cfg, base, agentDir } = fixture();
    expect(isManagedLinkTarget(cfg, path.join(base, 'outside'), agentDir)).toBe(false);
  });

  it('空目标不算管理', () => {
    const { cfg, agentDir } = fixture();
    expect(isManagedLinkTarget(cfg, undefined, agentDir)).toBe(false);
  });

  it('相对软链目标按软链所在目录解析', () => {
    const { cfg, alphaDir, agentDir } = fixture();
    expect(isManagedLinkTarget(cfg, path.relative(agentDir, alphaDir), agentDir)).toBe(true);
  });

  it('仓库目录本身（不在 skills 下）不算技能', () => {
    const { cfg, repoDir, agentDir } = fixture();
    expect(isManagedLinkTarget(cfg, path.join(repoDir, 'other'), agentDir)).toBe(false);
  });

  it('isLinkInRepo 从「某个具体仓库」的角度判断', () => {
    const { repo, base, alphaDir, agentDir } = fixture();
    expect(isLinkInRepo(repo, alphaDir, agentDir)).toBe(true);
    expect(isLinkInRepo(repo, path.join(base, 'outside'), agentDir)).toBe(false);
  });
});

describe('isLinkInRegisteredLibrary（软链是否已指向某个「已登记库」）', () => {
  /** 自有仓库 + 第三方来源 + 一个未登记目录，用于区分「已有归属」与「库外」 */
  function fixture() {
    const base = tmpDir('flint-registered-');
    const repoDir = path.join(base, 'repo');
    const repoSkill = path.join(repoDir, 'skills', 'alpha');
    fs.mkdirSync(repoSkill, { recursive: true });
    const foreignDir = path.join(base, 'foreign');
    const foreignSkill = path.join(foreignDir, 'nested', 'beta');
    fs.mkdirSync(foreignSkill, { recursive: true });
    const agentDir = path.join(base, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });
    const cfg: HubConfig = {
      ...emptyConfig(),
      repos: [{ id: 'default', path: repoDir }],
      foreignSources: [{ id: 'foreign', name: 'foreign', path: foreignDir, layout: 'nested', linked: true }],
    };
    return { base, repoSkill, foreignSkill, agentDir, cfg };
  }

  it('指向自有仓库内的技能 → 已有归属', () => {
    const { cfg, repoSkill, agentDir } = fixture();
    expect(isLinkInRegisteredLibrary(cfg, repoSkill, agentDir)).toBe(true);
  });

  it('指向第三方来源内的技能（含分类子目录）→ 已有归属', () => {
    const { cfg, foreignSkill, agentDir } = fixture();
    expect(isLinkInRegisteredLibrary(cfg, foreignSkill, agentDir)).toBe(true);
  });

  it('指向共享标准目录 → 已有归属（目标目录不存在也算）', () => {
    const { cfg, agentDir } = fixture();
    expect(isLinkInRegisteredLibrary(cfg, path.join(sharedStandardDir('agents'), 'ghost'), agentDir)).toBe(true);
    expect(isLinkInRegisteredLibrary(cfg, path.join(sharedStandardDir('config-agents'), 'ghost'), agentDir)).toBe(true);
  });

  it('相对软链目标按软链所在目录解析', () => {
    const { cfg, repoSkill, agentDir } = fixture();
    expect(isLinkInRegisteredLibrary(cfg, path.relative(agentDir, repoSkill), agentDir)).toBe(true);
  });

  it('指向未登记的目录 → 无归属（可归集）', () => {
    const { cfg, base, agentDir } = fixture();
    expect(isLinkInRegisteredLibrary(cfg, path.join(base, 'outside', 'gamma'), agentDir)).toBe(false);
    expect(isLinkInRegisteredLibrary(cfg, undefined, agentDir)).toBe(false);
  });
});

describe('agentSkillRows：是否有「归集到仓库」入口', () => {
  /** 建一个含自有仓库的沙箱：agent 目录里的 alpha 按 kind 决定形态 */
  function actionsFor(kind: 'link-with-repo-copy' | 'link-without-repo-copy' | 'owned-dir') {
    const base = tmpDir('flint-collect-entry-');
    const repoDir = path.join(base, 'repo');
    if (kind !== 'link-without-repo-copy') writeSkill(path.join(repoDir, 'skills'), 'alpha');
    const agentDir = path.join(base, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });
    if (kind === 'owned-dir') {
      writeSkill(agentDir, 'alpha');
    } else {
      const outside = path.join(base, 'outside', 'alpha');
      fs.mkdirSync(outside, { recursive: true });
      fs.symlinkSync(outside, path.join(agentDir, 'alpha'), 'dir');
    }
    const store = makeStore({
      repos: [{ id: 'default', path: repoDir }],
      agents: { codebuddy: { globalDir: agentDir } },
    });
    const lib = scanAll(store.data.repos, store.data.foreignSources);
    const ctx = desiredContext(store, lib.skills);
    const card = agentCards(agentSkillRows('codebuddy', store.data, lib.skills, ctx)).find((c) => c.name === 'alpha')!;
    return { card, kinds: card.actions.map((a) => a.kind) };
  }

  it('软链指向库外，但仓库已有同名副本（列表上展示的来源就是这个仓库）→ 不显示归集', () => {
    const { card, kinds } = actionsFor('link-with-repo-copy');
    expect(card.source).toBe('default');
    expect(kinds).toEqual(['delete']);
  });

  it('软链指向库外，仓库里也没有同名副本 → 仍可归集', () => {
    expect(actionsFor('link-without-repo-copy').kinds).toEqual(['collect', 'delete']);
  });

  it('自带真实目录：即使仓库已有同名，也保留归集（它是把本目录版本写进仓库的常规入口）', () => {
    expect(actionsFor('owned-dir').kinds).toEqual(['collect', 'delete']);
  });
});
