import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));
process.env.SKILLS_HUB_CONFIG = path.join(base, 'config.json');

const { ConfigStore } = await import('./src/config/store.js');
const { scanAll } = await import('./src/core/scanner.js');
const { syncActive } = await import('./src/core/sync.js');
import * as presets from './src/core/presets.js';
import * as active from './src/core/active.js';

const store = new ConfigStore();
const cfg = store.data;

// 临时仓库：skills/alpha（扁平）+ skills/分类/beta（嵌套） 测试 auto 布局
const repoDir = path.join(base, 'repo');
const mkSkill = (d, name) => { fs.mkdirSync(path.join(d, name), { recursive: true }); fs.writeFileSync(path.join(d, name, 'SKILL.md'), `---\nname: ${name}\ndescription: 测试skill ${name}\nversion: 1.0.0\n---\n正文`); };
mkSkill(path.join(repoDir, 'skills'), 'alpha');
mkSkill(path.join(repoDir, 'skills', 'devops'), 'beta');

cfg.repos.push({ id: 'default', path: repoDir, layout: 'auto' });

// 外部来源：嵌套分类（模拟 ume-skills）
const extDir = path.join(base, 'ext');
mkSkill(path.join(extDir, 'skills', 'frontend'), 'gamma');
cfg.foreignSources.push({ id: 'ume', name: 'ume-skills', path: extDir, layout: 'nested', linked: true });

// 活跃 agent 目标目录（用覆盖指到临时目录，避免污染真实 ~/.trae-cn）
// 注意：必须显式关联预设才有预设基准——不关联就不会跟随任何预设
const targetDir = path.join(base, 'agent-tmp');
cfg.agents['trae_cn'] = { globalDir: targetDir, sync: 'symlink', preset: 'demo' };
store.save();

const lib = scanAll(cfg.repos, cfg.foreignSources);
console.log('发现 skills =', lib.skills.map((s) => s.id).sort());

const alpha = lib.skills.find((s) => s.name === 'alpha');
presets.create(store, 'demo');
presets.update(store, 'demo', { skills: [alpha.id] });
active.set(store, ['trae_cn']);

// 直接调同步引擎（不经过 HTTP）
const results = syncActive(store, lib.skills);
console.log('同步结果 =', JSON.stringify(results, null, 2));

const link = path.join(targetDir, 'alpha');
const isLink = fs.lstatSync(link).isSymbolicLink();
console.log('校验软链:', path.basename(link), 'isSymlink=', isLink, '→', fs.readdirSync(targetDir));
console.log(isLink && fs.readdirSync(link).includes('SKILL.md') ? '✅ 最小闭环通过' : '❌ 失败');

// ---- 批次2: 项目级 skill smoke ----
let projBase = '';
{
  const { addProject, syncProject } = await import('./src/core/projects.js');
  projBase = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-proj-'));
  addProject(store, projBase, ['frontend']);
  // 给 alpha 打 frontend 标签
  store.data.skillMeta['alpha@default'] = { tags: ['frontend'] };
  store.save();
  const lib3 = scanAll(store.data.repos, store.data.foreignSources);
  const res = syncProject(store, projBase, lib3.skills);
  console.log('\n[project] .agents 复制 =', res.copied, '| agent项目目录软链 =', res.agentLinks.map((x) => `${x.agent}`).join(','));
  const ag = path.join(projBase, '.agents', 'skills');
  console.log('.agents 内容 =', fs.existsSync(ag) ? fs.readdirSync(ag) : 'none');
  if (fs.existsSync(ag) && fs.readdirSync(ag).includes('alpha')) console.log('✅ 项目级同步通过');
  else console.log('❌ 项目级同步失败');
}

// ---- 批次2.5: 回写仓库 smoke（PJ-05）----
{
  const { pushProjectToRepo } = await import('./src/core/projects.js');
  // 模拟团队成员改动项目内 skill
  fs.writeFileSync(path.join(projBase, '.agents', 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: 团队改动版\n---\n正文');
  const push = pushProjectToRepo(store, projBase, 'default');
  console.log('\n[push] 回写 =', JSON.stringify(push, null, 2));
  const back = fs.readFileSync(path.join(repoDir, 'skills', 'alpha', 'SKILL.md'), 'utf-8');
  console.log(back.includes('团队改动版') ? '✅ 回写仓库通过' : '❌ 回写仓库失败');
}

// ---- 批次3: 批量导入 + 诊断 smoke ----
{
  const { importDirs } = await import('./src/core/import.js');
  const ext2Dir = path.join(base, 'ext2');
  mkSkill(path.join(ext2Dir, 'skills', 'viz'), 'echarts');
  mkSkill(path.join(ext2Dir, 'skills', 'viz'), 'd3');
  const imp = importDirs(store, [ext2Dir], 'default');
  console.log('\n[import] =', JSON.stringify(imp, null, 2));
  const { diagnose } = await import('./src/core/diagnose.js');
  const lib4 = scanAll(store.data.repos, store.data.foreignSources);
  const { collectCandidates } = await import('./src/core/integrate.js');
  const { computeDesired } = await import('./src/core/sync.js');
  const diag = diagnose(store, { lib: lib4, candidates: collectCandidates(store, lib4), desired: computeDesired(store, lib4.skills) });
  console.log('[diagnose] 项数 =', diag.items.length, '| config =', diag.config);
  console.log('仓库含新技能 echarts =', fs.existsSync(path.join(repoDir, 'skills', 'echarts', 'SKILL.md')));
}

// ---- 批次4: preset 关联标签 smoke（PR-05）----
{
  store.data.skillMeta['echarts@default'] = { tags: ['viz'] };
  presets.update(store, 'demo', { tags: ['viz'] });
  store.save();
  const lib5 = scanAll(store.data.repos, store.data.foreignSources);
  const { desiredNamesFor } = await import('./src/core/sync.js');
  const names = [...desiredNamesFor(store, lib5.skills, 'trae_cn')];
  console.log('\n[preset-tags] 期望集 =', names.sort());
  console.log(names.includes('echarts') ? '✅ preset 标签命中通过' : '❌ preset 标签未生效');
}

// ---- 批次5: 同目录共用 smoke（一个目录只能有一套策略）----
{
  const { listAgents } = await import('./src/core/agents.js');
  const { desiredContext } = await import('./src/core/sync.js');
  const sharedDir = path.join(base, 'shared-skills');
  // cline / warp 内置就共用 ~/.agents/skills，这里用目录覆盖指到同一临时目录来模拟
  store.data.agents['cline'] = { globalDir: sharedDir, sync: 'symlink', preset: 'demo' };
  store.data.agents['warp'] = { globalDir: sharedDir, preset: 'solo' }; // 同目录其它 Agent 自己那套不应生效
  const lib6 = scanAll(store.data.repos, store.data.foreignSources);
  const gamma = lib6.skills.find((s) => s.name === 'gamma');
  presets.create(store, 'solo');
  presets.update(store, 'solo', { skills: [gamma?.id ?? ''] });
  active.set(store, ['cline', 'warp']);
  store.save();

  const views = listAgents(store.data);
  const cline = views.find((a) => a.key === 'cline');
  const warp = views.find((a) => a.key === 'warp');
  const ran = syncActive(store, lib6.skills, undefined, 'smoke');
  const deployed = fs.existsSync(sharedDir)
    ? fs.readdirSync(sharedDir).filter((n) => !n.startsWith('.')).sort()
    : [];
  const aliasSync = syncActive(store, lib6.skills, ['warp'], 'smoke')[0];
  const aliasPreset = desiredContext(store, lib6.skills, 'warp').preset;
  console.log('\n[alias] warp.primaryKey =', warp?.primaryKey, '| warp 生效预设 =', warp?.preset, '| 同目录其它 =', cline?.sharedWith);
  console.log('[alias] 活跃两个只部署 =', ran.length, '次 | 目录内容 =', deployed, '| 同步同目录成员落到 =', aliasSync?.agent, '| 它方期望预设 =', aliasPreset);
  const ok =
    warp?.primaryKey === 'cline' &&
    warp?.preset === 'demo' &&
    ran.length === 1 &&
    aliasSync?.agent === 'cline' &&
    aliasPreset === 'demo' &&
    deployed.includes('alpha') &&
    !deployed.includes('gamma');
  console.log(ok ? '✅ 同目录共用通过（只有主 Agent 部署，其它成员沿用其策略）' : '❌ 同目录共用失败');
}

// ---- 批次6: 显式指定主 Agent smoke（AG-02）----
{
  const { listAgents, setPrimary } = await import('./src/core/agents.js');
  const { desiredContext } = await import('./src/core/sync.js');
  const sharedDir = path.join(base, 'shared-skills');
  const lib7 = scanAll(store.data.repos, store.data.foreignSources);

  // 两个都活跃时，自动判定本是 cline（活跃相同 → 名称序）；显式指定 warp 后应以 warp 为准
  setPrimary(store.data, 'warp', true);
  store.save();
  const views = listAgents(store.data);
  const cline = views.find((a) => a.key === 'cline');
  const warp = views.find((a) => a.key === 'warp');
  const ran = syncActive(store, lib7.skills, undefined, 'smoke');
  const deployed = fs.existsSync(sharedDir) ? fs.readdirSync(sharedDir).sort() : [];
  const aliasPreset = desiredContext(store, lib7.skills, 'cline').preset;
  console.log('\n[primary] 指定后 warp.primaryKey =', warp?.primaryKey, '| warp.primaryExplicit =', warp?.primaryExplicit, '| cline.primaryKey =', cline?.primaryKey);
  console.log('[primary] 生效预设 =', warp?.preset, '| cline 期望预设 =', aliasPreset, '| 部署目标 =', ran.map((r) => r.agent).join(','), '| 目录内容 =', deployed);

  // 取消指定 → 回到自动判定（活跃优先、其次名称序 → cline）
  setPrimary(store.data, 'warp', false);
  store.save();
  const back = listAgents(store.data).find((a) => a.key === 'warp');
  console.log('[primary] 取消指定后 warp.primaryKey =', back?.primaryKey, '| warp 期望预设 =', desiredContext(store, lib7.skills, 'warp').preset);
  const ok =
    warp?.primaryKey === 'warp' &&
    warp?.primaryExplicit === true &&
    warp?.preset === 'solo' &&
    cline?.primaryKey === 'warp' &&
    aliasPreset === 'solo' &&
    ran.length === 1 && ran[0].agent === 'warp' &&
    deployed.includes('gamma') && !deployed.includes('alpha') &&
    back?.primaryKey === 'cline';
  console.log(ok ? '✅ 显式指定主 Agent 通过（指定优先于活跃/名称自动判定）' : '❌ 显式指定主 Agent 失败');
}
