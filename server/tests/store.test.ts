import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore } from '../src/config/store.js';
import { emptyConfig } from '../src/config/types.js';
import { tmpDir } from './helpers.js';

function writeConfig(raw: unknown): string {
  const file = path.join(tmpDir('flint-store-'), 'config.json');
  fs.writeFileSync(file, JSON.stringify(raw), 'utf-8');
  return file;
}

describe('ConfigStore.load（加载与迁移）', () => {
  it('配置文件不存在时使用默认值（首次运行）', () => {
    const store = new ConfigStore(path.join(tmpDir('flint-store-'), 'config.json'));
    expect(store.data).toEqual(emptyConfig());
  });

  it('配置文件损坏时不抛错，回落默认值', () => {
    const file = path.join(tmpDir('flint-store-'), 'config.json');
    fs.writeFileSync(file, '{ this is not json', 'utf-8');
    const store = new ConfigStore(file);
    expect(store.data).toEqual(emptyConfig());
  });

  it('旧 agent key 迁移到新命名，并与已存在的新 key 合并', () => {
    const file = writeConfig({
      schemaVersion: 3,
      agents: { claude: { preset: 'demo' }, claude_code: { sync: 'copy' } },
      activeAgents: ['claude'],
    });
    const store = new ConfigStore(file);
    expect(store.data.agents.claude).toBeUndefined();
    expect(store.data.agents.claude_code).toEqual({ sync: 'copy', preset: 'demo' });
    expect(store.data.activeAgents).toEqual(['claude_code']);
  });

  it('activeAgents 里的旧 key 一并改名并去重', () => {
    const file = writeConfig({
      schemaVersion: 3,
      activeAgents: ['trae-cn', 'trae_cn', 'gemini-cli'],
    });
    const store = new ConfigStore(file);
    expect(store.data.activeAgents).toEqual(['trae_cn', 'gemini_cli']);
  });

  it('无旧 key 时迁移保持幂等（不改动配置）', () => {
    const file = writeConfig({ schemaVersion: 3, agents: { cursor: { preset: 'demo' } } });
    const store = new ConfigStore(file);
    expect(store.data.agents).toEqual({ cursor: { preset: 'demo' } });
    expect(store.data.activeAgents).toEqual([]);
  });

  it('剔除历史遗留的 preset.active（预设已无启用开关）', () => {
    const file = writeConfig({
      schemaVersion: 3,
      presets: [{ name: 'demo', skills: ['alpha@default'], tags: ['viz'], active: false }],
    });
    const store = new ConfigStore(file);
    expect(store.data.presets[0]).toEqual({ name: 'demo', skills: ['alpha@default'], tags: ['viz'] });
    expect('active' in store.data.presets[0]).toBe(false);
  });

  it('剔除历史遗留的 agent.mode（是否用预设改由 preset 绑定表达）', () => {
    const file = writeConfig({
      schemaVersion: 3,
      agents: { cursor: { mode: 'preset', preset: 'demo' } },
    });
    const store = new ConfigStore(file);
    expect(store.data.agents.cursor).toEqual({ preset: 'demo' });
  });

  it('schemaVersion 落后时升级到当前版本并写回文件', () => {
    const file = writeConfig({ schemaVersion: 1 });
    const store = new ConfigStore(file);
    expect(store.data.schemaVersion).toEqual(emptyConfig().schemaVersion);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).schemaVersion).toBe(emptyConfig().schemaVersion);
  });

  it('剔除历史遗留的 repos[].layout（自有仓库已收敛为扁平）', () => {
    const file = writeConfig({
      schemaVersion: 3,
      repos: [{ id: 'own', path: '/tmp/own', layout: 'nested' }],
    });
    const store = new ConfigStore(file);
    expect(store.data.repos[0]).toEqual({ id: 'own', path: '/tmp/own' });
    expect('layout' in store.data.repos[0]).toBe(false);
  });

  it('第三方来源的 layout 保留（只读来源仍支持分类组织）', () => {
    const file = writeConfig({
      schemaVersion: 3,
      foreignSources: [{ id: 'ume', name: 'ume', path: '/tmp/ume', layout: 'nested', linked: true }],
    });
    expect(new ConfigStore(file).data.foreignSources[0].layout).toBe('nested');
  });

  it('watchers 只有显式 true 才算开启（历史配置一律按关闭处理）', () => {
    expect(new ConfigStore(writeConfig({ schemaVersion: 3, watchers: true })).data.watchers).toBe(true);
    expect(new ConfigStore(writeConfig({ schemaVersion: 3, watchers: 'yes' })).data.watchers).toBe(false);
    expect(new ConfigStore(writeConfig({ schemaVersion: 3 })).data.watchers).toBe(false);
  });

  it('各集合字段缺失时补成空集合，不出现 undefined', () => {
    const store = new ConfigStore(writeConfig({ schemaVersion: 3 }));
    expect(store.data.repos).toEqual([]);
    expect(store.data.foreignSources).toEqual([]);
    expect(store.data.customAgents).toEqual([]);
    expect(store.data.presets).toEqual([]);
    expect(store.data.projects).toEqual([]);
    expect(store.data.skillMeta).toEqual({});
  });
});

describe('ConfigStore.save / replace', () => {
  it('save 会自动创建父目录并落盘为格式化 JSON', () => {
    const file = path.join(tmpDir('flint-store-'), 'nested', 'deep', 'config.json');
    const store = new ConfigStore(file);
    store.data.activeAgents = ['cursor'];
    store.save();

    const written = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(written.activeAgents).toEqual(['cursor']);
    // 人类可读（带缩进），便于手工编辑与 git diff
    expect(fs.readFileSync(file, 'utf-8')).toContain('\n  ');
  });

  it('replace 用新数据整体替换，并补齐缺失的默认字段', () => {
    const store = new ConfigStore(path.join(tmpDir('flint-store-'), 'config.json'));
    store.replace({ ...emptyConfig(), activeAgents: ['warp'] });
    expect(store.data.activeAgents).toEqual(['warp']);
    expect(store.data.defaultSync).toBeDefined();
    expect(store.data.schemaVersion).toEqual(emptyConfig().schemaVersion);
  });
});
