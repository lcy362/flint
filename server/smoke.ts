import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));
process.env.FLINT_CONFIG = path.join(base, 'config.json');

const { ConfigStore } = await import('./src/config/store.js');
const { scanAll } = await import('./src/core/scanner.js');
const { syncActive } = await import('./src/core/sync.js');
import * as presets from './src/core/presets.js';
import * as active from './src/core/active.js';

const store = new ConfigStore();
const cfg = store.data;

// Temporary repo: skills/alpha is a recognised skill; skills/devops/beta sits in a category
// directory. Own repositories are flat-only, so beta must NOT be picked up — it is asserted below.
const repoDir = path.join(base, 'repo');
const mkSkill = (d, name) => { fs.mkdirSync(path.join(d, name), { recursive: true }); fs.writeFileSync(path.join(d, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Test skill ${name}\nversion: 1.0.0\n---\nBody`); };
mkSkill(path.join(repoDir, 'skills'), 'alpha');
mkSkill(path.join(repoDir, 'skills', 'devops'), 'beta');

cfg.repos.push({ id: 'default', path: repoDir });

// External source: nested categories (mimics ume-skills)
const extDir = path.join(base, 'ext');
mkSkill(path.join(extDir, 'skills', 'frontend'), 'gamma');
cfg.foreignSources.push({ id: 'ume', name: 'ume-skills', path: extDir, layout: 'nested', linked: true });

// Active agent target directory (overridden into the temp dir to avoid touching the real ~/.trae-cn)
// Note: a preset must be linked explicitly to provide a baseline — no link means no preset follows
const targetDir = path.join(base, 'agent-tmp');
cfg.agents['trae_cn'] = { globalDir: targetDir, sync: 'symlink', preset: 'demo' };
store.save();

const lib = scanAll(cfg.repos, cfg.foreignSources);
console.log('Discovered skills =', lib.skills.map((s) => s.id).sort());

// 自有仓库恒扁平：skills/devops/beta 位于分类子目录，不应被识别（只收根下直接子目录）
console.log(
  lib.skills.some((s) => s.name === 'beta')
    ? 'FAIL: flat-only own repository picked up a skill from a category directory'
    : 'PASS: own repository is flat-only (category directory ignored)',
);

const alpha = lib.skills.find((s) => s.name === 'alpha');
presets.create(store, 'demo');
presets.update(store, 'demo', { skills: [alpha.id] });
active.set(store, ['trae_cn']);

// Call the sync engine directly (no HTTP)
const results = syncActive(store, lib.skills);
console.log('Sync result =', JSON.stringify(results, null, 2));

const link = path.join(targetDir, 'alpha');
const isLink = fs.lstatSync(link).isSymbolicLink();
console.log('Verify symlink:', path.basename(link), 'isSymlink=', isLink, '→', fs.readdirSync(targetDir));
console.log(isLink && fs.readdirSync(link).includes('SKILL.md') ? 'PASS: minimal loop closed' : 'FAIL');

// ---- Batch 2: project-level skill smoke ----
let projBase = '';
{
  const { addProject, syncProject } = await import('./src/core/projects.js');
  projBase = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-proj-'));
  addProject(store, projBase, ['frontend']);
  // Tag alpha with "frontend"
  store.data.skillMeta['alpha@default'] = { tags: ['frontend'] };
  store.save();
  const lib3 = scanAll(store.data.repos, store.data.foreignSources);
  const res = syncProject(store, projBase, lib3.skills);
  console.log('\n[project] .agents copied =', res.copied, '| agent project dir links =', res.agentLinks.map((x) => `${x.agent}`).join(','));
  const ag = path.join(projBase, '.agents', 'skills');
  console.log('.agents content =', fs.existsSync(ag) ? fs.readdirSync(ag) : 'none');
  if (fs.existsSync(ag) && fs.readdirSync(ag).includes('alpha')) console.log('PASS: project-level sync');
  else console.log('FAIL: project-level sync');
}

// ---- Batch 2.5: push back to repository smoke (PJ-05) ----
{
  const { pushProjectToRepo } = await import('./src/core/projects.js');
  // Simulate a teammate editing the in-project skill
  fs.writeFileSync(path.join(projBase, '.agents', 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: Team-edited version\n---\nBody');
  const push = pushProjectToRepo(store, projBase, 'default');
  console.log('\n[push] pushed back =', JSON.stringify(push, null, 2));
  const back = fs.readFileSync(path.join(repoDir, 'skills', 'alpha', 'SKILL.md'), 'utf-8');
  console.log(back.includes('Team-edited version') ? 'PASS: pushed back to repository' : 'FAIL: pushed back to repository');
}

// ---- Batch 3: batch import + diagnostics smoke ----
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
  // 期望集已停用：diagnose 的 desired 传空（物理为准，仅报告实际目录）
  const diag = diagnose(store, { lib: lib4, candidates: collectCandidates(store, lib4), desired: new Map() });
  console.log('[diagnose] items =', diag.items.length, '| config =', diag.config);
  console.log('Repository contains new skill echarts =', fs.existsSync(path.join(repoDir, 'skills', 'echarts', 'SKILL.md')));
}

// ---- Batch 4: preset linked tags smoke (PR-05) ----
{
  store.data.skillMeta['echarts@default'] = { tags: ['viz'] };
  presets.update(store, 'demo', { tags: ['viz'] });
  store.save();
  const lib5 = scanAll(store.data.repos, store.data.foreignSources);
  const { presetSkillSet } = await import('./src/core/sync.js');
  const names = [...presetSkillSet(store, lib5.skills, 'trae_cn').values()].map((s) => s.name);
  console.log('\n[preset-tags] desired set =', names.sort());
  console.log(names.includes('echarts') ? 'PASS: preset tag matching' : 'FAIL: preset tag not effective');
}

// ---- Batch 5: same-directory sharing smoke (one directory, one strategy) ----
{
  const { listAgents, effectiveAgentKey } = await import('./src/core/agents.js');
  const sharedDir = path.join(base, 'shared-skills');
  // cline and warp normally own .cline/skills and the shared ~/.agents/skills; here both are
  // overridden into one temp directory to simulate "same-directory sharing"
  store.data.agents['cline'] = { globalDir: sharedDir, sync: 'symlink', preset: 'demo' };
  store.data.agents['warp'] = { globalDir: sharedDir, preset: 'solo' }; // the other agent's own preset must not apply
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
  // alias 沿用主 Agent 的 preset：直接读折算出主 Agent 后 config.agents 里的 preset
  const aliasPreset = store.data.agents[effectiveAgentKey(store.data, 'warp')]?.preset;
  console.log('\n[alias] warp.primaryKey =', warp?.primaryKey, '| warp effective preset =', warp?.preset, '| shared with =', cline?.sharedWith);
  console.log('[alias] two active agents deployed =', ran.length, 'time(s) | directory content =', deployed, '| alias sync landed on =', aliasSync?.agent, '| alias desired preset =', aliasPreset);
  const ok =
    warp?.primaryKey === 'cline' &&
    warp?.preset === 'demo' &&
    ran.length === 1 &&
    aliasSync?.agent === 'cline' &&
    aliasPreset === 'demo' &&
    deployed.includes('alpha') &&
    !deployed.includes('gamma');
  console.log(ok ? 'PASS: same-directory sharing (only the primary agent deploys; members reuse its strategy)' : 'FAIL: same-directory sharing');
}

// ---- Batch 6: explicit primary agent smoke (AG-02) ----
{
  const { listAgents, setPrimary, effectiveAgentKey } = await import('./src/core/agents.js');
  const sharedDir = path.join(base, 'shared-skills');
  const lib7 = scanAll(store.data.repos, store.data.foreignSources);

  // With both active, auto resolution picks cline (same active → name order); explicitly
  // designating warp must take precedence
  setPrimary(store.data, 'warp', true);
  store.save();
  const views = listAgents(store.data);
  const cline = views.find((a) => a.key === 'cline');
  const warp = views.find((a) => a.key === 'warp');
  // 显式指定主 Agent 属于 AGENTS.md 所列的「Agent 策略变更」＝显式操作，
  // 语义上要带 prune 回收旧策略留下的部署；否则上一轮 demo 的 alpha/echarts 会残留，
  // 断言里的 !deployed.includes('alpha') 永远不成立（prune:false 只补不删）。
  const ran = syncActive(store, lib7.skills, undefined, 'smoke', { prune: true });
  const deployed = fs.existsSync(sharedDir) ? fs.readdirSync(sharedDir).sort() : [];
  const aliasPreset = store.data.agents[effectiveAgentKey(store.data, 'cline')]?.preset;
  console.log('\n[primary] after designation warp.primaryKey =', warp?.primaryKey, '| warp.primaryExplicit =', warp?.primaryExplicit, '| cline.primaryKey =', cline?.primaryKey);
  console.log('[primary] effective preset =', warp?.preset, '| cline desired preset =', aliasPreset, '| deploy targets =', ran.map((r) => r.agent).join(','), '| directory content =', deployed);

  // Remove the designation → back to auto resolution (active first, then name order → cline)
  setPrimary(store.data, 'warp', false);
  store.save();
  const back = listAgents(store.data).find((a) => a.key === 'warp');
  console.log('[primary] after clearing warp.primaryKey =', back?.primaryKey, '| warp desired preset =', store.data.agents[effectiveAgentKey(store.data, 'warp')]?.preset);
  const ok =
    warp?.primaryKey === 'warp' &&
    warp?.primaryExplicit === true &&
    warp?.preset === 'solo' &&
    cline?.primaryKey === 'warp' &&
    aliasPreset === 'solo' &&
    ran.length === 1 && ran[0].agent === 'warp' &&
    deployed.includes('gamma') && !deployed.includes('alpha') &&
    back?.primaryKey === 'cline';
  console.log(ok ? 'PASS: explicit primary agent (designation beats active/name auto resolution)' : 'FAIL: explicit primary agent');
}
