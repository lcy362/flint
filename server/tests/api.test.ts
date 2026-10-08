import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeRouter } from '../src/api/routes.js';
import type { ConfigStore } from '../src/infra/config-store.js';
import { makeStore, tmpDir, writeSkill } from './helpers.js';

// 选择器会调起系统原生对话框，单测里换成固定返回值，避免真的弹窗
vi.mock('../src/infra/picker.js', () => ({
  pickDirectory: vi.fn(async () => '/tmp/flint-picked-dir'),
  pickFile: vi.fn(async () => '/tmp/flint-picked-file.txt'),
}));

/** 一套「仓库 + 第三方来源 + Agent 目录 + 项目」的完整现场，全部落在临时目录 */
interface Fixture {
  base: string;
  repoDir: string;
  skillsRoot: string;
  sourceDir: string;
  agentDir: string;
  projectDir: string;
  importDir: string;
  store: ConfigStore;
}

function fixture(): Fixture {
  // macOS 的 /var 是软链：先解析基址，路径比较才不会两套口径
  const base = fs.realpathSync(tmpDir('flint-api-'));

  const repoDir = path.join(base, 'repo');
  const skillsRoot = path.join(repoDir, 'skills');
  writeSkill(skillsRoot, 'alpha');
  writeSkill(skillsRoot, 'beta', 'tags: [demo]\n');

  // 第三方来源：分类目录（layout=nested），只读
  const sourceDir = path.join(base, 'source');
  writeSkill(path.join(sourceDir, 'category'), 'gamma');

  const agentDir = path.join(base, 'agents', 'cursor');
  fs.mkdirSync(agentDir, { recursive: true });

  const projectDir = path.join(base, 'proj');
  fs.mkdirSync(projectDir, { recursive: true });

  const importDir = path.join(base, 'import');
  writeSkill(importDir, 'delta');

  const store = makeStore({
    repos: [{ id: 'default', path: repoDir, name: 'default' }],
    foreignSources: [{ id: 'upstream', name: 'upstream', path: sourceDir, layout: 'nested', linked: true }],
    agents: { cursor: { globalDir: agentDir }, claude_code: { globalDir: path.join(base, 'agents', 'claude') } },
    activeAgents: ['cursor'],
    projects: [{ path: projectDir, tags: [] }],
  });

  return { base, repoDir, skillsRoot, sourceDir, agentDir, projectDir, importDir, store };
}

let ctx: Fixture;
let server: http.Server;
let api = '';

/** 发一个请求；body 为 undefined 时不带请求体 */
async function call(method: string, url: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(api + url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* 非 JSON（如 res.download）保持原文 */ }
  return { status: res.status, body: parsed };
}

beforeAll(async () => {
  ctx = fixture();
  const app = express();
  app.use('/api', makeRouter(ctx.store));
  server = app.listen(0);
  await once(server, 'listening');
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('元数据类接口', () => {
  it('GET /state 返回技能库与配置现场', async () => {
    const { status, body } = await call('GET', '/state');
    expect(status).toBe(200);
    expect(body.skills.map((s: any) => s.id)).toContain('alpha@default');
    expect(body.repos).toHaveLength(1);
    expect(body.sources).toHaveLength(1);
    expect(body.settings.defaultSync).toBe('symlink');
    expect(typeof body.home).toBe('string');
  });

  it('GET /settings 与 PUT /settings 往返', async () => {
    expect((await call('GET', '/settings')).body).toEqual({ defaultSync: 'symlink' });
    const put = await call('PUT', '/settings', { defaultSync: 'copy' });
    expect(put.body).toEqual({ defaultSync: 'copy' });
    // 非法值被忽略，保留原值
    expect((await call('PUT', '/settings', { defaultSync: 'nope' })).body).toEqual({ defaultSync: 'copy' });
    await call('PUT', '/settings', { defaultSync: 'symlink' });
  });

  it('GET /skills/:id/content 返回正文与文件清单', async () => {
    const { status, body } = await call('GET', `/skills/${encodeURIComponent('alpha@default')}/content`);
    expect(status).toBe(200);
    expect(body.content).toContain('Body');
    expect(body.files).toEqual([]);
  });

  it('GET /skills/:id/content 对未知技能与缺 SKILL.md 分别 404', async () => {
    expect((await call('GET', '/skills/nope%40default/content')).status).toBe(404);
    const empty = path.join(ctx.skillsRoot, 'empty-skill');
    fs.mkdirSync(empty, { recursive: true });
    expect((await call('GET', '/skills/empty-skill%40default/content')).status).toBe(404);
  });

  it('GET /skills/search 命中正文并给出上下文', async () => {
    expect((await call('GET', '/skills/search')).body).toEqual({ hits: [] });
    const hit = await call('GET', '/skills/search?q=body');
    expect(hit.body.hits.map((h: any) => h.id)).toContain('alpha@default');
  });

  it('PATCH /skills/:id 归一化标签并写回', async () => {
    const res = await call('PATCH', `/skills/${encodeURIComponent('alpha@default')}`, {
      tags: ['x', ' x ', 'y\nz', 42],
    });
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual(['x', 'y', 'z']);
    expect((await call('PATCH', '/skills/alpha%40default', {})).status).toBe(400);
    expect((await call('PATCH', '/skills/a%0db', { tags: [] })).status).toBe(400);
  });

  it('GET /logs 与 /logs/download 能读到日志文件', async () => {
    const logs = await call('GET', '/logs?tail=5');
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.body.lines)).toBe(true);
    expect(typeof logs.body.version).toBe('string');
    const dl = await fetch(`${api}/logs/download`);
    expect(dl.status).toBe(200);
  });
});

describe('仓库与来源', () => {
  it('GET /repos 与 POST /repos 的新增 / 冲突 / 缺参分支', async () => {
    expect((await call('GET', '/repos')).body).toHaveLength(1);
    expect((await call('POST', '/repos', { id: 'only-id' })).status).toBe(400);
    expect((await call('POST', '/repos', { id: 'default', path: '/tmp' })).status).toBe(409);
    const created = await call('POST', '/repos', { id: 'second', path: path.join(ctx.base, 'repo2') });
    expect(created.body.map((r: any) => r.id)).toEqual(['default', 'second']);
    expect((await call('DELETE', '/repos/second')).body.map((r: any) => r.id)).toEqual(['default']);
  });

  it('POST /repos/detect 探测布局', async () => {
    expect((await call('POST', '/repos/detect', {})).status).toBe(400);
    const detected = await call('POST', '/repos/detect', { path: ctx.skillsRoot });
    expect(detected.body.count).toBeGreaterThan(0);
  });

  it('POST /repos/scan/:id 扫描指定仓库', async () => {
    expect((await call('POST', '/repos/scan/nope')).status).toBe(404);
    const flat = await call('POST', '/repos/scan/default');
    expect(flat.body.skills.map((s: any) => s.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('PUT /repos/:id 改名并把自有仓库转成第三方来源', async () => {
    await call('POST', '/repos', { id: 'tmp-repo', path: path.join(ctx.base, 'repo3') });
    expect((await call('PUT', '/repos/nope', {})).status).toBe(404);
    const renamed = await call('PUT', '/repos/tmp-repo', { name: 'renamed', root: ctx.skillsRoot, path: ctx.repoDir });
    expect(renamed.body.repos.map((r: any) => r.name)).toContain('renamed');
    const converted = await call('PUT', '/repos/tmp-repo', { kind: 'source' });
    expect(converted.body.repos.map((r: any) => r.id)).not.toContain('tmp-repo');
    expect(converted.body.sources.map((s: any) => s.id)).toContain('tmp-repo');
    // 收拾干净，避免影响后续用例的仓库列表断言
    expect((await call('DELETE', '/sources/tmp-repo')).body.map((s: any) => s.id)).not.toContain('tmp-repo');
  });

  it('GET /repos/:id/status 与 POST /repos/:id/sync 在非 git 目录上优雅降级', async () => {
    expect((await call('GET', '/repos/nope/status')).status).toBe(404);
    expect((await call('GET', '/repos/default/status')).status).toBe(404);
    expect((await call('POST', '/repos/nope/sync')).status).toBe(404);
    // 临时目录不是 git 仓库：pull 失败 → 500 且带错误信息
    const pulled = await call('POST', '/repos/default/sync');
    expect(pulled.status).toBe(500);
    expect(typeof pulled.body.error).toBe('string');
  });

  it('第三方来源的新增 / 编辑 / 删除与转自有仓库', async () => {
    expect((await call('POST', '/sources', { id: 'x' })).status).toBe(400);
    const added = await call('POST', '/sources', { id: 'extra', path: ctx.sourceDir });
    expect(added.body.map((s: any) => s.id)).toContain('extra');
    expect((await call('PUT', '/sources/nope', {})).status).toBe(404);

    const edited = await call('PUT', '/sources/extra', { name: 'Extra', path: ctx.sourceDir, layout: 'flat', linked: false });
    expect(edited.body.sources.find((s: any) => s.id === 'extra')).toMatchObject({ name: 'Extra', layout: 'flat', linked: false });

    const asRepo = await call('PUT', '/sources/extra', { kind: 'repo', root: ctx.sourceDir });
    expect(asRepo.body.repos.map((r: any) => r.id)).toContain('extra');
    expect(asRepo.body.sources.map((s: any) => s.id)).not.toContain('extra');
    await call('DELETE', '/repos/extra');
  });

  it('POST /repos/:id/tags-migrate 把旧标签搬进 SKILL.md', async () => {
    expect((await call('POST', '/repos/nope/tags-migrate')).status).toBe(404);
    const migrated = await call('POST', '/repos/default/tags-migrate');
    expect(migrated.status).toBe(200);
    expect(migrated.body).toHaveProperty('migrated');
  });
});

describe('技能合并', () => {
  it('POST /skills/merge 缺参 400，正常仲裁返回结果', async () => {
    expect((await call('POST', '/skills/merge', { name: 'alpha' })).status).toBe(400);
    const ok = await call('POST', '/skills/merge', { name: 'alpha', keepSource: 'default' });
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveProperty('merged');
  });
});

describe('Agent 接口', () => {
  it('GET /agents 与 GET /agents/:key/skills', async () => {
    expect((await call('GET', '/agents')).body.length).toBeGreaterThan(0);
    const detail = await call('GET', '/agents/cursor/skills');
    expect(detail.body).toHaveProperty('skills');
    expect(detail.body.active).toBe(true);
    expect(detail.body.addable.map((a: any) => a.name)).toContain('alpha');
  });

  it('PUT /agents/:key 写目录覆盖与策略，未知 agent 404', async () => {
    expect((await call('PUT', '/agents/nope', {})).status).toBe(404);
    const saved = await call('PUT', '/agents/claude_code', {
      globalDir: path.join(ctx.base, 'agents', 'claude'),
      sync: 'copy',
      preset: 'demo',
      skillSync: { alpha: 'symlink' },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ sync: 'copy', preset: 'demo' });
    // 空字符串等价于「取消覆盖」
    const cleared = await call('PUT', '/agents/claude_code', { preset: '', globalDir: '' });
    expect(cleared.body).not.toHaveProperty('preset');
  });

  it('指定与取消主 Agent', async () => {
    const set = await call('PUT', '/agents/cursor', { primary: true });
    expect(set.body.primary).toBe(true);
    const cleared = await call('PUT', '/agents/cursor', { primary: false });
    expect(cleared.body).not.toHaveProperty('primary');
  });

  it('POST /agents/:key/skills 部署单个技能，缺 id 400', async () => {
    expect((await call('POST', '/agents/nope/skills', { id: 'x' })).status).toBe(404);
    expect((await call('POST', '/agents/cursor/skills', {})).status).toBe(400);
    const deployed = await call('POST', '/agents/cursor/skills', { id: 'alpha@default' });
    expect(deployed.status).toBe(200);
    expect(fs.existsSync(path.join(ctx.agentDir, 'alpha'))).toBe(true);
  });

  it('DELETE /agents/:key/skills/:name 移除本目录落点：软链只解除链接，真实目录直接删', async () => {
    await call('POST', '/agents/cursor/skills', { id: 'alpha@default' });
    expect((await call('DELETE', '/agents/nope/skills/alpha')).status).toBe(404);
    expect((await call('DELETE', '/agents/cursor/skills/ghost')).status).toBe(404);

    // 用户自带的真实目录：按用户意图删除，不做归属拦截
    const owned = writeSkill(ctx.agentDir, 'owned');
    expect((await call('DELETE', '/agents/cursor/skills/owned')).status).toBe(200);
    expect(fs.existsSync(owned)).toBe(false);

    // 指向外部库之外的软链：只解除链接，目标本体保持不动
    const outside = path.join(ctx.base, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(ctx.agentDir, 'ext-link'), 'dir');
    expect((await call('DELETE', '/agents/cursor/skills/ext-link')).status).toBe(200);
    expect(fs.existsSync(path.join(ctx.agentDir, 'ext-link'))).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);

    expect((await call('DELETE', '/agents/cursor/skills/alpha')).status).toBe(200);
    expect(fs.existsSync(path.join(ctx.agentDir, 'alpha'))).toBe(false);
  });

  it('GET /skills/:name/agents 一次给出该技能在各智能体目录的分发情况', async () => {
    // 未分发：所有目录都是 present=false（不存在的目录也在清单里，只是没有这条技能）
    const before = await call('GET', '/skills/alpha/agents');
    expect(before.status).toBe(200);
    expect(before.body.agents.length).toBeGreaterThan(0);
    expect(before.body.agents.find((a: any) => a.key === 'cursor').present).toBe(false);

    // 部署后：本工具部署的软链 → reason=manual
    await call('POST', '/agents/cursor/skills', { id: 'alpha@default' });
    const deployed = await call('GET', '/skills/alpha/agents');
    expect(deployed.body.agents.find((a: any) => a.key === 'cursor')).toMatchObject({ present: true, reason: 'manual' });

    // 用户自带的真实目录 → reason=own；指向外部库之外的软链 → reason=external
    writeSkill(ctx.agentDir, 'owned');
    const outside = path.join(ctx.base, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(ctx.agentDir, 'external'), 'dir');
    expect((await call('GET', '/skills/owned/agents')).body.agents.find((a: any) => a.key === 'cursor'))
      .toMatchObject({ present: true, reason: 'own' });
    expect((await call('GET', '/skills/external/agents')).body.agents.find((a: any) => a.key === 'cursor'))
      .toMatchObject({ present: true, reason: 'external' });

    // 移除后回到未分发
    await call('DELETE', '/agents/cursor/skills/alpha');
    expect((await call('GET', '/skills/alpha/agents')).body.agents.find((a: any) => a.key === 'cursor').present).toBe(false);
  });

  it('POST /agents/:key/sync 按绑定预设做一次性部署', async () => {
    await call('POST', '/presets', { name: 'demo-preset', skills: ['alpha@default'], tags: [] });
    await call('PUT', '/agents/cursor', { preset: 'demo-preset' });
    const synced = await call('POST', '/agents/cursor/sync');
    expect(synced.status).toBe(200);
    expect(synced.body.agent).toBe('cursor');
    expect(fs.existsSync(path.join(ctx.agentDir, 'alpha'))).toBe(true);
  });

  it('活跃 Agent 集合读写', async () => {
    expect((await call('GET', '/activeAgents')).body).toContain('cursor');
    const set = await call('PUT', '/activeAgents', ['cursor', 'claude_code']);
    expect(set.body).toContain('claude_code');
    // 缺省取 body.agents 分支
    const alt = await call('PUT', '/activeAgents', { agents: ['cursor'] });
    expect(alt.body).toEqual(['cursor']);
    const empty = await call('PUT', '/activeAgents', {});
    expect(empty.body).toEqual([]);
    await call('PUT', '/activeAgents', ['cursor']);
  });

  it('自定义 Agent 的新增 / 冲突 / 删除', async () => {
    expect((await call('GET', '/agents/custom')).status).toBe(200);
    expect((await call('POST', '/agents/custom', { key: 'k' })).status).toBe(400);
    const added = await call('POST', '/agents/custom', {
      key: 'my-agent', name: 'My Agent', globalDir: path.join(ctx.base, 'custom'), projectDir: 'proj', recursive: true,
    });
    expect(added.body.map((a: any) => a.key)).toContain('my-agent');
    expect((await call('POST', '/agents/custom', { key: 'my-agent', name: 'My Agent', globalDir: '/tmp/x' })).status).toBe(409);
    const removed = await call('DELETE', '/agents/custom/my-agent');
    expect(removed.body.map((a: any) => a.key)).not.toContain('my-agent');
  });
});

describe('预设接口', () => {
  it('创建 / 编辑 / 删除预设与错误分支', async () => {
    const created = await call('POST', '/presets', { name: 'review', skills: ['beta@default'], tags: ['demo'] });
    expect(created.body).toMatchObject({ name: 'review', skills: ['beta@default'], tags: ['demo'] });
    expect((await call('POST', '/presets', {})).status).toBe(400);
    expect((await call('POST', '/presets', { name: 'review' })).status).toBe(400); // 重名
    const updated = await call('PUT', '/presets/review', { skills: ['alpha@default'] });
    expect(updated.body.skills).toEqual(['alpha@default']);
    expect((await call('PUT', '/presets/nope', { skills: [] })).status).toBe(400);
    expect((await call('DELETE', '/presets/review')).body).toEqual({ ok: true });
    expect((await call('GET', '/presets')).body.map((p: any) => p.name)).not.toContain('review');
  });
});

describe('项目接口', () => {
  it('GET /projects 带上部署的 Agent 与 hasAgents', async () => {
    const list = await call('GET', '/projects');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: 0, path: ctx.projectDir });
    expect(typeof list.body[0].hasAgents).toBe('boolean');
  });

  it('POST /projects 添加项目并同步，路径非法时 400', async () => {
    // 缺 path / 已在配置里的路径：都拒绝
    expect((await call('POST', '/projects', {})).status).toBe(400);
    expect((await call('POST', '/projects', { path: ctx.projectDir })).status).toBe(400);

    // 新项目：正常加入并同步；索引 0 仍是原项目，后续用例不受影响
    const fresh = path.join(ctx.base, 'proj2');
    fs.mkdirSync(fresh, { recursive: true });
    const added = await call('POST', '/projects', { path: fresh, tags: ['p'], agents: ['cursor'] });
    expect(added.status).toBe(200);
    expect(added.body.map((p: any) => p.path)).toContain(fresh);
  });

  it('项目标签与 Agent 投放', async () => {
    expect((await call('PUT', '/projects/99/tags', {})).status).toBe(404);
    expect((await call('PUT', '/projects/99/agents', {})).status).toBe(404);
    const tagged = await call('PUT', '/projects/0/tags', { tags: ['alpha'] });
    expect(tagged.body.tags).toEqual(['alpha']);
    const agents = await call('PUT', '/projects/0/agents', { agents: ['cursor'] });
    expect(agents.body).toHaveProperty('sync');
  });

  it('项目技能的增删查与回写仓库', async () => {
    expect((await call('GET', '/projects/99/skills')).status).toBe(404);
    expect((await call('PUT', '/projects/99/skills')).status).toBe(404);
    expect((await call('POST', '/projects/99/skills', { id: 'x' })).status).toBe(404);
    expect((await call('DELETE', '/projects/99/skills/x')).status).toBe(404);
    expect((await call('POST', '/projects/99/push', {})).status).toBe(404);
    expect((await call('POST', '/projects/99/sync')).status).toBe(404);

    // 缺 id / 未知技能
    expect((await call('POST', '/projects/0/skills', {})).status).toBe(400);
    expect((await call('POST', '/projects/0/skills', { id: 'ghost@nope' })).status).toBe(400);

    // 正常落副本 → 再删除
    const copied = await call('POST', '/projects/0/skills', { id: 'alpha@default' });
    expect(copied.status).toBe(200);
    expect(fs.existsSync(path.join(ctx.projectDir, '.agents', 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    // 已存在的真实副本：重复添加会重写同名副本（幂等，不报错）
    expect((await call('POST', '/projects/0/skills', { id: 'alpha@default' })).status).toBe(200);

    expect((await call('DELETE', '/projects/0/skills/ghost')).status).toBe(404);
    // 接管项（软链）：不重复落副本；删除只解除链接，仓库里的本体保持不动
    fs.symlinkSync(path.join(ctx.skillsRoot, 'beta'), path.join(ctx.projectDir, '.agents', 'skills', 'beta'), 'dir');
    expect((await call('POST', '/projects/0/skills', { id: 'beta@default' })).status).toBe(409);
    expect((await call('DELETE', '/projects/0/skills/beta')).status).toBe(200);
    expect(fs.existsSync(path.join(ctx.projectDir, '.agents', 'skills', 'beta'))).toBe(false);
    expect(fs.existsSync(path.join(ctx.skillsRoot, 'beta'))).toBe(true);
    expect((await call('DELETE', '/projects/0/skills/alpha')).status).toBe(200);

    const listed = await call('GET', '/projects/0/skills');
    expect(listed.body).toHaveProperty('skills');
    expect(listed.body).toHaveProperty('addable');

    const pushed = await call('POST', '/projects/0/push', { repoId: 'default', names: ['alpha'] });
    expect(pushed.status).toBe(200);
    expect(pushed.body).toHaveProperty('pushed');
  });

  it('项目归集预览 / 归集 / 接管', async () => {
    expect((await call('GET', '/projects/99/collect/preview?repo=default')).status).toBe(404);
    expect((await call('GET', '/projects/0/collect/preview?repo=nope')).status).toBe(400);
    const preview = await call('GET', '/projects/0/collect/preview?repo=default');
    expect(preview.body).toHaveProperty('items');

    expect((await call('POST', '/projects/99/collect', {})).status).toBe(404);
    const collected = await call('POST', '/projects/0/collect', { repoId: 'default', name: 'alpha' });
    expect(collected.status).toBe(200);
    expect(collected.body).toHaveProperty('collected');

    expect((await call('POST', '/projects/99/takeover', {})).status).toBe(404);
    expect((await call('POST', '/projects/0/takeover', {})).status).toBe(400);
    const taken = await call('POST', '/projects/0/takeover', { name: 'alpha', repoId: 'default', confirm: true });
    expect(taken.status).toBe(200);
    expect(taken.body).toHaveProperty('taken');
  });
});

describe('归集与接管（Agent 维度）', () => {
  it('GET /repos/:id/collect/preview 与 POST /repos/:id/collect', async () => {
    await call('POST', '/agents/cursor/skills', { id: 'alpha@default' });
    expect((await call('GET', '/repos/nope/collect/preview')).status).toBe(404);
    const preview = await call('GET', '/repos/default/collect/preview');
    expect(preview.status).toBe(200);

    expect((await call('POST', '/repos/nope/collect', {})).status).toBe(404);
    const bySelections = await call('POST', '/repos/default/collect', {
      selections: [{ agentKey: 'cursor', names: ['alpha'] }],
      replaceNames: ['alpha'],
    });
    expect(bySelections.status).toBe(200);
    expect(bySelections.body).toHaveProperty('byAgent');

    // 旧入参兼容：agentKeys / agentKey
    expect((await call('POST', '/repos/default/collect', { agentKeys: ['cursor'] })).status).toBe(200);
    expect((await call('POST', '/repos/default/collect', { agentKey: 'cursor', names: ['alpha'] })).status).toBe(200);
  });

  it('POST /repos/:id/takeover 缺参 400，正常返回结果', async () => {
    expect((await call('POST', '/repos/default/takeover', {})).status).toBe(400);
    const res = await call('POST', '/repos/default/takeover', { agentKey: 'cursor', name: 'alpha', confirm: false });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('linked');
  });
});

describe('导入 / 诊断 / 修复', () => {
  it('GET 与 POST /import/preview 都支持', async () => {
    // 三种取目录方式：query ?path、body.dirs、body.path
    const byPath = await call('GET', `/import/preview?path=${encodeURIComponent(ctx.importDir)}`);
    expect(byPath.body.map((x: any) => x.source)).toEqual([ctx.importDir]);
    expect(byPath.body[0].count).toBe(1);

    const byBody = await call('POST', '/import/preview', { dirs: [ctx.importDir] });
    expect(byBody.body.map((x: any) => x.source)).toEqual([ctx.importDir]);

    const single = await call('POST', '/import/preview', { path: ctx.importDir });
    expect(single.body.map((x: any) => x.source)).toEqual([ctx.importDir]);

    expect((await call('POST', '/import/preview', {})).body).toEqual([]);
    // 路径不存在时给出 error 字段而不是抛错
    const missing = await call('POST', '/import/preview', { dirs: [path.join(ctx.base, 'nope')] });
    expect(missing.body[0]).toHaveProperty('error');
  });

  it('POST /import 把外部目录收编进仓库', async () => {
    const res = await call('POST', '/import', { dirs: [ctx.importDir, path.join(ctx.base, 'ghost-dir')], repoId: 'default' });
    expect(res.status).toBe(200);
    expect(res.body[0].imported).toEqual(['delta']);
    expect(res.body[1].skipped.length).toBeGreaterThan(0);
    // 多行粘贴形式
    const multi = await call('POST', '/import', { path: `\n  ${ctx.importDir}  \n` });
    expect(multi.status).toBe(200);
  });

  it('GET /diagnose 与 POST /fix', async () => {
    const diag = await call('GET', '/diagnose');
    expect(diag.status).toBe(200);
    expect(diag.body).toHaveProperty('summary');

    expect((await call('POST', '/fix', {})).status).toBe(400);
    const items = Object.values(diag.body.groups ?? {}).flat() as { key: string }[];
    if (items.length > 0) {
      const fixed = await call('POST', '/fix', { key: items[0].key });
      expect(fixed.status).toBe(200);
    }
  });
});

describe('同步接口', () => {
  it('GET /sync/status 给出对各 Agent 目录的差异', async () => {
    const { status, body } = await call('GET', '/sync/status');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((x: any) => x.agent)).toContain('cursor');
  });

  it('POST /sync 手动同步（可指定 agents）', async () => {
    const all = await call('POST', '/sync', {});
    expect(all.status).toBe(200);
    expect(Array.isArray(all.body)).toBe(true);
    const only = await call('POST', '/sync', { agents: ['cursor'] });
    expect(only.body.map((r: any) => r.agent)).toEqual(['cursor']);
  });
});

describe('文件系统选择器接口', () => {
  it('POST /filesystem/pick 与 /filesystem/pick-file 返回所选路径', async () => {
    expect((await call('POST', '/filesystem/pick')).body).toEqual({ path: '/tmp/flint-picked-dir' });
    expect((await call('POST', '/filesystem/pick-file')).body).toEqual({ path: '/tmp/flint-picked-file.txt' });
  });
});

describe('技能来源刷新', () => {
  it('POST /skills/:id/refresh 对未知技能 404，对无来源技能 400', async () => {
    expect((await call('POST', '/skills/nope%40default/refresh')).status).toBe(404);
    expect((await call('POST', `/skills/${encodeURIComponent('alpha@default')}/refresh`)).status).toBe(400);
  });
});
