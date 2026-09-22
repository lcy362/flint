import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ConfigStore } from '../infra/config-store.js';
import { log } from '../infra/logger.js';
import { pickDirectory, pickFile } from '../infra/picker.js';
import {
  listAgents, agentSkillRows, findAgentDef, resolveGlobalDir, effectiveAgentKey,
  setPrimary, pruneAliasStrategies, isManagedLinkTarget,
} from '../core/agents.js';
import { scanAll, detectLayoutAbs } from '../core/scanner.js';
import * as presets from '../core/presets.js';
import * as active from '../core/active.js';
import { syncActive, diffSync, deployOne, copySkill } from '../core/sync.js';
import { collectCandidates } from '../core/integrate.js';
import { addProject, syncProject, projectSkillRows, projectAddable, deployedAgents, pushProjectToRepo, takeoverProjectSkill, writeIndex, INDEX_NAME } from '../core/projects.js';
import { readSkill } from '../core/skill.js';
import { importDirs, previewImportDirs } from '../core/import.js';
import { previewCollect, collectAgentSkill, previewCollectSource, collectFromSource, projectCollectSource } from '../core/collect.js';
import { migrateTagsToFrontmatter } from '../core/repo-tags.js';
import { takeover } from '../core/takeover.js';
import { applyFix } from '../core/fix.js';
import { diagnose } from '../core/diagnose.js';
import { mergeSkill } from '../core/merge.js';
import { Repo, ForeignSource, CustomAgent } from '../config/types.js';
import { agentCards, projectCards } from '../domain/cards.js';
import { t } from '../i18n/index.js';

/** server 版本号，/api/logs 上报给用户用于 issue 定位（优先 cwd，兼容 dev 的 src 路径） */
const SERVER_VERSION = (() => {
  const candidates = [
    path.join(process.cwd(), 'package.json'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'),
  ];
  for (const pkg of candidates) {
    try {
      const v = (JSON.parse(fs.readFileSync(pkg, 'utf-8')) as { version?: string }).version;
      if (v) return v;
    } catch { /* 尝试下一个候选 */ }
  }
  return '0.0.0';
})();

export function makeRouter(cfg: ConfigStore, opts?: { onChanged?: () => void; onConfigChanged?: () => void }): Router {
  const r = Router();
  r.use(express.json({ limit: '2mb' }));

  // 请求日志：记录 method、path、status、耗时与 body 字段名（不记值，避免敏感信息落盘）
  r.use((req, res, next) => {
    if (req.path.startsWith('/logs')) return next();
    const started = Date.now();
    res.on('finish', () => {
      const body = req.body as unknown;
      const bodyKeys = body && typeof body === 'object'
        ? Object.keys(body as Record<string, unknown>)
        : undefined;
      log.info('http', `${req.method} ${req.originalUrl.split('?')[0]}`, {
        status: res.statusCode,
        ms: Date.now() - started,
        ...(bodyKeys && bodyKeys.length ? { bodyKeys } : {}),
      });
    });
    next();
  });
  // 结构性变更后自动同步活跃 agent，由入口注入实现
  const touch = () => opts?.onChanged?.();
  const touchConfig = () => opts?.onConfigChanged?.();

  const library = () => scanAll(cfg.data.repos, cfg.data.foreignSources);
  /** 仓库类变更的统一出参：两类仓库一起回传，便于类型转换后前端一次刷新 */
  const warehouses = () => ({ repos: cfg.data.repos, sources: cfg.data.foreignSources });

  r.get('/state', (_req, res) => {
    const lib = library();
    const skills = lib.skills.map((s) => ({
      id: s.id, name: s.name, source: s.source, dir: s.dir,
      description: s.description, version: s.version,
      // 标签：config.skillMeta 覆盖优先，其次 SKILL.md frontmatter
      tags: cfg.data.skillMeta[s.id]?.tags ?? s.tags,
      origin: cfg.data.skillMeta[s.id]?.origin,
    }));
    res.json({
      activeAgents: cfg.data.activeAgents,
      skills,
      presets: cfg.data.presets,
      repos: cfg.data.repos,
      sources: cfg.data.foreignSources,
      customAgents: cfg.data.customAgents,
      settings: { defaultSync: cfg.data.defaultSync, watchers: cfg.data.watchers },
      // 供前端把绝对路径显示成 ~ 开头的形式（如 ~/.agents/skills）
      home: os.homedir(),
    });
  });

  // ---- 全局设置（UI-03 设置） ----
  r.get('/settings', (_req, res) => {
    res.json({ defaultSync: cfg.data.defaultSync, watchers: cfg.data.watchers });
  });
  r.put('/settings', (req, res) => {
    const body = req.body ?? {};
    if (body.defaultSync === 'symlink' || body.defaultSync === 'copy') cfg.data.defaultSync = body.defaultSync;
    if (typeof body.watchers === 'boolean') cfg.data.watchers = body.watchers;
    cfg.save();
    touchConfig();
    res.json({ defaultSync: cfg.data.defaultSync, watchers: cfg.data.watchers });
  });

  // 合并仲裁（IM-02）：同名多来源时保留指定来源
  r.post('/skills/merge', (req, res) => {
    const { name, keepSource } = req.body ?? {};
    if (!name || !keepSource) return res.status(400).json({ error: 'name/keepSource required' });
    try {
      const result = mergeSkill(cfg, library().skills, String(name), String(keepSource));
      touch();
      log.info('http', 'Skill merge arbitrated', { name: String(name), keepSource: String(keepSource), merged: result.merged.length });
      res.json(result);
    } catch (e) {
      log.error('http', `Skill merge failed: ${(e as Error).message}`, { name: String(name), keepSource: String(keepSource) });
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // SKILL.md 预览（UI-03 资产库详情）
  r.get('/skills/:id/content', (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const sk = library().skills.find((s) => s.id === id);
    if (!sk) return res.status(404).json({ error: 'skill not found' });
    const file = path.join(sk.dir, 'SKILL.md');
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'SKILL.md not found' });
    let files: string[] = [];
    try { files = fs.readdirSync(sk.dir).filter((f) => f !== 'SKILL.md'); } catch { /* ignore */ }
    res.json({ id: sk.id, dir: sk.dir, content: fs.readFileSync(file, 'utf-8'), files });
  });

  // ---- filesystem ----
  // 调起系统原生选择器；path 为 null 表示用户取消。
  // 选择器会阻塞最多 120s，故使用异步 exec 避免占满事件循环。
  r.post('/filesystem/pick', async (_req, res) => {
    try { res.json({ path: await pickDirectory() }); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  r.post('/filesystem/pick-file', async (_req, res) => {
    try { res.json({ path: await pickFile() }); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- repos ----
  r.get('/repos', (_req, res) => res.json(cfg.data.repos));
  r.post('/repos', (req, res) => {
    const { id, path: p, root } = req.body as Partial<Repo>;
    if (!id || !p) return res.status(400).json({ error: 'id/path required' });
    if (cfg.data.repos.some((x) => x.id === id)) return res.status(409).json({ error: t('api.repoExists', { id }) });
    // 自有仓库恒为扁平：没有 layout 可配。按分类组织请用第三方来源（只读）或标签。
    cfg.data.repos.push({ id, path: p, root: root ?? undefined });
    cfg.save();
    touch();
    res.json(cfg.data.repos);
  });
  r.delete('/repos/:id', (req, res) => {
    cfg.data.repos = cfg.data.repos.filter((x) => x.id !== req.params.id);
    cfg.save();
    touch();
    res.json(cfg.data.repos);
  });
  // 编辑自有仓库：改名称 / 路径 / 布局 / root；kind='source' 时转为第三方仓库。
  // 转换保持 id 不变，故 skill 标识 name@id 与标签、preset、项目引用均不受影响。
  // 注意：两类仓库扫描根不同（自有 = root ?? <path>/skills，第三方 = path），
  // 路径换算由调用方给出，接口只负责落库。
  r.put('/repos/:id', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    const { path: p, root, name, kind } = req.body ?? {};
    if (p) repo.path = p;
    if (name !== undefined) repo.name = name || undefined;
    if (root !== undefined) repo.root = root || undefined;

    if (kind === 'source') {
      cfg.data.repos = cfg.data.repos.filter((x) => x.id !== repo.id);
      cfg.data.foreignSources.push({
        id: repo.id,
        name: repo.name ?? repo.id,
        path: repo.path,
        // 自有仓库没有布局概念，转为只读来源后按 auto 探测（分类目录此时才有意义）
        layout: 'auto',
        linked: true,
      });
    }
    cfg.save();
    touch();
    res.json(warehouses());
  });
  r.post('/repos/scan/:id', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    res.json(scanAll([repo], []));
  });

  // 自有仓库标签迁移到 SKILL.md frontmatter
  r.post('/repos/:id/tags-migrate', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    try {
      const result = migrateTagsToFrontmatter(cfg, repo);
      log.info('http', 'Tags migrated to SKILL.md', { repo: repo.id, migrated: result.migrated, skipped: result.skipped.length });
      res.json(result);
    } catch (e) {
      log.error('http', `Tag migration failed: ${(e as Error).message}`, { repo: repo.id });
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.post('/repos/detect', (req, res) => {
    const { path: p } = req.body ?? {};
    if (!p) return res.status(400).json({ error: 'path required' });
    try { res.json(detectLayoutAbs(p)); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // 从 agent 收集归拢 skill 到仓库（仅复制，不动 agent）
  r.get('/repos/:id/collect/preview', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    res.json(previewCollect(cfg, repo));
  });
  r.post('/repos/:id/collect', (req, res) => {
    const repo = cfg.data.repos.find((x) => x.id === req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    const { agentKey, agentKeys, names, selections, replaceNames } = req.body ?? {};
    // 优先 selections（按 agent 指定 skill 明细）；兼容旧 agentKeys/agentKey（收全部）。
    // replaceNames：确认页明确选择「用 agent 版本覆盖仓库副本」的名字。
    const repl: string[] | undefined = Array.isArray(replaceNames) ? replaceNames.map(String) : undefined;
    const sel: { agentKey: string; names?: string[] }[] = Array.isArray(selections)
      ? selections.map((s: { agentKey: unknown; names?: unknown }) => ({
          agentKey: String(s.agentKey),
          names: Array.isArray(s.names) ? s.names.map(String) : undefined,
        }))
      : (Array.isArray(agentKeys)
          ? agentKeys
          : agentKey
            ? [String(agentKey)]
            : listAgents(cfg.data).filter((a) => a.installed).map((a) => a.key)
        ).map((k) => ({ agentKey: k, names: Array.isArray(names) ? names.map(String) : undefined }));
    if (sel.length === 0) return res.status(400).json({ error: t('api.noInstalledAgent') });
    try {
      const results = sel.map((s) => collectAgentSkill(cfg, repo, s.agentKey, s.names, repl));
      touch();
      const collected = results.flatMap((x) => x.collected);
      const skipped = results.flatMap((x) => x.skipped);
      log.info('http', 'Skills collected into repository', { repo: repo.id, collected: collected.length, skipped: skipped.length });
      res.json({
        collected,
        skipped,
        byAgent: results.map((x, i) => ({ agent: sel[i].agentKey, ...x })),
      });
    } catch (e) {
      log.error('http', `Skill collection failed: ${String(e)}`, { repo: repo.id });
      res.status(500).json({ error: String(e) });
    }
  });

  // 接管：把 agent 目录里的技能条目替换为指向仓库副本的软链（内容已在仓库，故直接替换、不另做备份；需显式 confirm）
  r.post('/repos/:id/takeover', (req, res) => {
    const { agentKey, name, confirm } = req.body ?? {};
    if (!agentKey || !name) return res.status(400).json({ error: 'agentKey/name required' });
    try {
      const result = takeover(cfg, String(agentKey), String(name), req.params.id, confirm === true);
      log.info('http', 'Agent skill taken over', { repo: req.params.id, agentKey: String(agentKey), name: String(name), confirm: confirm === true });
      res.json(result);
    } catch (e) {
      log.error('http', `Takeover failed: ${(e as Error).message}`, { repo: req.params.id, agentKey: String(agentKey), name: String(name) });
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---- foreign sources ----
  r.get('/sources', (_req, res) => res.json(cfg.data.foreignSources));
  r.post('/sources', (req, res) => {
    const body = req.body as ForeignSource;
    if (!body.id || !body.path) return res.status(400).json({ error: 'id/path required' });
    cfg.data.foreignSources.push({
      ...body,
      layout: body.layout ?? 'auto',
      linked: body.linked ?? true,
    });
    cfg.save();
    touch();
    res.json(cfg.data.foreignSources);
  });
  r.delete('/sources/:id', (req, res) => {
    cfg.data.foreignSources = cfg.data.foreignSources.filter((x) => x.id !== req.params.id);
    cfg.save();
    touch();
    res.json(cfg.data.foreignSources);
  });
  // 编辑第三方仓库：改名称 / 路径 / 布局 / 只读关联；kind='repo' 时转为自有仓库
  // （此时 root 由调用方给出，用于维持原扫描根不变）。
  r.put('/sources/:id', (req, res) => {
    const src = cfg.data.foreignSources.find((x) => x.id === req.params.id);
    if (!src) return res.status(404).json({ error: 'source not found' });
    const { name, path: p, layout, linked, kind, root } = req.body ?? {};
    if (name !== undefined) src.name = name || src.id;
    if (p) src.path = p;
    if (layout) src.layout = layout;
    if (linked !== undefined) src.linked = linked === true;

    if (kind === 'repo') {
      cfg.data.foreignSources = cfg.data.foreignSources.filter((x) => x.id !== src.id);
      cfg.data.repos.push({
        id: src.id,
        name: src.name && src.name !== src.id ? src.name : undefined,
        path: src.path,
        root: root || undefined,
      });
    }
    cfg.save();
    touch();
    res.json(warehouses());
  });
  // ---- custom agents（AG-03） ----
  r.get('/agents/custom', (_req, res) => res.json(cfg.data.customAgents));
  r.post('/agents/custom', (req, res) => {
    const body = req.body as CustomAgent;
    if (!body?.key || !body?.name || !body?.globalDir) {
      return res.status(400).json({ error: 'key/name/globalDir required' });
    }
    if (cfg.data.customAgents.some((a) => a.key === body.key) || listAgents(cfg.data).some((a) => a.key === body.key)) {
      return res.status(409).json({ error: t('api.agentExists', { key: body.key }) });
    }
    cfg.data.customAgents.push({
      key: body.key,
      name: body.name,
      globalDir: body.globalDir,
      projectDir: body.projectDir || undefined,
      recursive: body.recursive === true,
    });
    cfg.save();
    res.json(cfg.data.customAgents);
  });
  r.delete('/agents/custom/:key', (req, res) => {
    cfg.data.customAgents = cfg.data.customAgents.filter((a) => a.key !== req.params.key);
    delete cfg.data.agents[req.params.key];
    cfg.data.activeAgents = cfg.data.activeAgents.filter((k) => k !== req.params.key);
    cfg.save();
    touch();
    res.json(cfg.data.customAgents);
  });

  // ---- agents / active ----
  r.get('/agents', (_req, res) => res.json(listAgents(cfg.data)));
  r.put('/agents/:key', (req, res) => {
    const key = req.params.key;
    if (!findAgentDef(cfg.data, key)) return res.status(404).json({ error: 'unknown agent' });
    const body = req.body ?? {};
    const { sync, globalDir, projectDir, primary } = body;

    // 1) 指定 / 取消主 Agent（AG-02）：这是「组的归属」而非该 Agent 的策略，
    //    写在自己身上并清掉同目录其它成员的指定，保证一个目录至多一个主 Agent。
    if (primary !== undefined) setPrimary(cfg.data, key, primary === true);

    // 2) 目录覆盖属于 Agent 自身：它决定「这个 Agent 解析到哪个目录」
    if (globalDir !== undefined || projectDir !== undefined) {
      const own = cfg.data.agents[key] ?? {};
      if (globalDir !== undefined) { if (globalDir) own.globalDir = globalDir; else delete own.globalDir; }
      if (projectDir !== undefined) { if (projectDir) own.projectDir = projectDir; else delete own.projectDir; }
      if (Object.keys(own).length > 0) cfg.data.agents[key] = own;
      else delete cfg.data.agents[key];
    }

    // 3) 分发策略（预设 / 安装方式）一律落到该目录的主 Agent：目录只有一份实体，
    //    别名与主 Agent 必须共用同一套策略，否则两边会互相覆盖。
    //    主 Agent 可能刚被 1) 改变，所以在这里重新解析。
    const target = effectiveAgentKey(cfg.data, key);
    const over = cfg.data.agents[target] ?? {};
    if (sync === 'symlink' || sync === 'copy') over.sync = sync;
    // 关联预设 = 记忆该目录「一次应用」哪套预设；保存决策，不再触发自动部署
    if ('preset' in body) { if (body.preset) over.preset = body.preset; else delete over.preset; }
    // 每关系同步策略（SY-01）：{ skill, sync } 写入 skillSync
    if ('skillSync' in body && body.skillSync && typeof body.skillSync === 'object') {
      over.skillSync = { ...(over.skillSync ?? {}), ...body.skillSync };
    }
    cfg.data.agents[target] = over;
    // 别名自己那份策略永远不生效，清掉避免配置里留下看似有效、实则被忽略的旧值
    const cleared = pruneAliasStrategies(cfg.data, target);
    if (cleared.length > 0) log.info('http', 'Cleared ignored alias strategies', { primary: target, aliases: cleared });
    cfg.save();
    res.json(cfg.data.agents[target] ?? {});
  });
  r.get('/agents/:key/skills', (req, res) => {
    const key = req.params.key;
    const lib = library();
    const rows = agentSkillRows(key, cfg.data, lib.skills);
    const present = new Set(rows.filter((x) => x.present).map((x) => x.name));
    // 「可添加」= 技能库里尚未出现在该目录的实际行（物理为准，不看期望集）
    const seenAddable = new Set<string>();
    const addable = lib.skills
      .filter((s) => !present.has(s.name))
      .map((s) => ({ id: s.id, name: s.name, repo: s.source }))
      .filter((a) => { if (seenAddable.has(a.name)) return false; seenAddable.add(a.name); return true; });
    res.json({ skills: agentCards(rows), addable, active: cfg.data.activeAgents.includes(key) });
  });
  // 「添加」：把单个技能部署进该 agent 目录（软链/复制，遵循其同步策略），不写 config（物理即真相）
  r.post('/agents/:key/skills', (req, res) => {
    const key = req.params.key;
    if (!findAgentDef(cfg.data, key)) return res.status(404).json({ error: 'unknown agent' });
    const { id } = req.body ?? {};
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id (name@source) required' });
    const lib = library();
    const result = deployOne(cfg, key, id, lib.skills, { prune: false });
    log.info('http', 'Agent skill added', {
      agent: key, skill: String(id),
      created: result.created.length, failed: result.failed.map((f) => f.skill),
    });
    res.json(result);
  });
  r.post('/agents/:key/sync', (req, res) => {
    const key = req.params.key;
    // 用户显式点「同步（应用预设）」：以该 agent 绑定预设为一次性部署并允许回收多余软链
    const r_ = syncActive(cfg, library().skills, [key], 'route:agent-sync', { prune: true });
    res.json(r_[0] ?? { agent: key, created: [], removed: [], failed: [] });
  });
  // 「删除」：移除本工具部署到该 agent 目录的软链/副本，绝不删真实目录或外部软链（物理为准）
  r.delete('/agents/:key/skills/:skillName', (req, res) => {
    const key = req.params.key;
    const name = req.params.skillName;
    const def = findAgentDef(cfg.data, key);
    if (!def) return res.status(404).json({ error: 'unknown agent' });
    const dir = resolveGlobalDir(def, cfg.data.agents[key]?.globalDir);
    const target = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(target, { throwIfNoEntry: false }); } catch { st = undefined; }
    if (!st) return res.status(404).json({ error: 'skill not found' });
    if (st.isDirectory() && !st.isSymbolicLink()) {
      // 实体目录 = 用户自带技能：即便内容与本工具副本一致也不删，绝不破坏用户内容
      return res.status(400).json({ error: t('api.onlyRealDir') });
    }
    if (!st.isSymbolicLink()) return res.status(400).json({ error: 'not a managed link' });
    // 只有指向自有仓库（本工具部署）的软链才允许删除；外部软链不归本工具管，绝不删
    let linkTarget: string | undefined;
    try { linkTarget = fs.readlinkSync(target); } catch { /* 读不到按外部处理 */ }
    if (!isManagedLinkTarget(cfg.data, linkTarget, dir)) {
      return res.status(400).json({ error: t('sync.externalLink', { dir }) });
    }
    fs.unlinkSync(target);
    res.json({ ok: true, removed: name });
  });
  // 活跃 Agent 集合（AA-01 / AA-04）
  r.get('/activeAgents', (_req, res) => res.json(cfg.data.activeAgents));
  r.put('/activeAgents', (req, res) => {
    const keys = Array.isArray(req.body) ? req.body : req.body?.agents;
    const out = active.set(cfg, keys ?? []);
    touch();
    log.info('http', 'Active agent set updated', { agents: out.length });
    res.json(out);
  });

  // ---- skills / tags ----
  // 打标签：只写入 config.skillMeta（覆盖 SKILL.md frontmatter），满足 TG-01
  r.patch('/skills/:id', (req, res) => {
    const id = decodeURIComponent(req.params.id);
    // 防御：skill id 不应含控制字符（如换行），避免 config 再次出现损坏 key
    if (/[\u0000-\u001f]/.test(id)) return res.status(400).json({ error: 'Invalid skill id (contains control characters)' });
    if (!Array.isArray(req.body?.tags)) return res.status(400).json({ error: 'tags required' });
    // 归一化：仅收字符串、按换行拆分、trim、去空、去重，保证落库标签始终干净
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const raw of req.body.tags) {
      if (typeof raw !== 'string') continue;
      for (const seg of raw.split(/[\r\n]+/)) {
        const t = seg.trim();
        if (t && !seen.has(t)) { seen.add(t); tags.push(t); }
      }
    }
    const meta = cfg.data.skillMeta[id] ?? { tags: [] };
    meta.tags = tags;
    cfg.data.skillMeta[id] = meta;
    cfg.save();
    touch();
    log.info('http', 'Skill tags saved', { id, tags: tags.length });
    res.json(meta);
  });

  // ---- presets ----
  r.get('/presets', (_req, res) => res.json(cfg.data.presets));
  r.post('/presets', (req, res) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      if (!name) return res.status(400).json({ error: 'name required' });
      const p = presets.create(cfg, name);
      // 兼容前端一次传入 skills/tags
      if (Array.isArray(req.body?.skills)) p.skills = req.body.skills;
      if (Array.isArray(req.body?.tags)) p.tags = req.body.tags;
      cfg.save();
      touch();
      log.info('http', 'Preset created', { name, skills: p.skills.length, tags: p.tags.length });
      res.json(p);
    } catch (e) {
      log.error('http', `Preset creation failed: ${(e as Error).message}`, { name: String(req.body?.name ?? '') });
      res.status(400).json({ error: (e as Error).message });
    }
  });
  // 编辑预设：保存配置即可，**不再触发自动同步**——预设只作一次性「应用」，由 Agent/项目页显式触发。
  r.put('/presets/:name', (req, res) => {
    try {
      const p = presets.update(cfg, req.params.name, req.body ?? {});
      log.info('http', 'Preset updated', { name: req.params.name, skills: p.skills.length, tags: p.tags.length });
      res.json(p);
    } catch (e) {
      log.error('http', `Preset update failed: ${(e as Error).message}`, { name: req.params.name });
      res.status(400).json({ error: (e as Error).message });
    }
  });
  r.delete('/presets/:name', (req, res) => {
    presets.remove(cfg, req.params.name);
    touch();
    log.info('http', 'Preset deleted', { name: req.params.name });
    res.json({ ok: true });
  });

  // ---- projects (项目级 skill) ----
  r.get('/projects', (_req, res) => {
    res.json(cfg.data.projects.map((p, i) => ({ ...p, id: i, agents: deployedAgents(cfg, p.path), hasAgents: fs.existsSync(path.join(p.path, '.agents', 'skills')) })));
  });
  r.post('/projects', (req, res) => {
    try {
      const p = addProject(cfg, String(req.body?.path), Array.isArray(req.body?.tags) ? req.body.tags : []);
      const wanted = Array.isArray(req.body?.agents) ? new Set<string>(req.body.agents as string[]) : undefined;
      syncProject(cfg, p, library().skills, wanted);
      res.json(cfg.data.projects);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.put('/projects/:id/tags', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    if (Array.isArray(req.body?.tags)) proj.tags = req.body.tags;
    cfg.save();
    const syncResult = syncProject(cfg, proj.path, library().skills);
    res.json({ ...proj, agents: deployedAgents(cfg, proj.path), sync: syncResult });
  });
  r.put('/projects/:id/agents', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const syncResult = syncProject(cfg, proj.path, library().skills, new Set<string>(Array.isArray(req.body?.agents) ? req.body.agents : []));
    res.json({ ...proj, agents: deployedAgents(cfg, proj.path), sync: syncResult });
  });
  // 回写仓库（PJ-05）
  r.post('/projects/:id/push', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const { repoId, names } = req.body ?? {};
    try {
      const result = pushProjectToRepo(cfg, proj.path, repoId ? String(repoId) : undefined, Array.isArray(names) ? names : undefined);
      log.info('http', 'Project skills pushed back to repository', { repo: repoId ? String(repoId) : undefined, names: Array.isArray(names) ? names.length : undefined });
      res.json(result);
    } catch (e) {
      log.error('http', `Project push-back failed: ${(e as Error).message}`, { proj: proj.path });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  r.get('/projects/:id/skills', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const lib = library();
    res.json({ skills: projectCards(projectSkillRows(cfg, proj, lib.skills)), addable: projectAddable(cfg, proj, lib.skills) });
  });
  // 项目技能：物理为准（期望集已停用）。GET 只读实际目录；PUT 仅刷新（原 on/off 分支已删除）；
  // 「添加」POST 部署一份副本；「删除」移除本工具部署的副本（真实目录），绝不删软链/接管项之外的东西。
  r.put('/projects/:id/skills', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    // 显式开关/期望集已取消：PUT 仅返回当前物理列表，供前端刷新
    const lib = library();
    const rows = projectSkillRows(cfg, proj, lib.skills);
    res.json({ skills: projectCards(rows), addable: projectAddable(cfg, proj, lib.skills) });
  });
  // 「添加」：把单个技能以**副本**形式部署进项目 .agents/skills，并登记进 INDEX.md（物理为准）
  r.post('/projects/:id/skills', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const { id: skillId } = req.body ?? {};
    if (!skillId || typeof skillId !== 'string') return res.status(400).json({ error: 'id (name@source) required' });
    const lib = library();
    const skill = lib.skills.find((s) => s.id === skillId);
    if (!skill) return res.status(400).json({ error: t('merge.skillNotFound', { name: skillId }) });
    const agentsRoot = path.join(proj.path, '.agents', 'skills');
    fs.mkdirSync(agentsRoot, { recursive: true });
    const dest = path.join(agentsRoot, skill.name);
    const st = fs.lstatSync(dest, { throwIfNoEntry: false });
    // 软链（已被接管）不重复落副本；真实目录视为已落地（幂等）
    if (st?.isSymbolicLink() && fs.existsSync(dest)) return res.status(409).json({ error: t('sync.externalLink', { dir: dest }) });
    copySkill(dest, skill.dir);
    // 登记进 INDEX.md，使该副本可被本工具识别为「曾投放」的内容（供未来安全回收）
    const managed = fs.readdirSync(agentsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.isSymbolicLink() && e.name !== INDEX_NAME)
      .map((e) => ({ name: e.name, title: e.name, description: readSkill(path.join(agentsRoot, e.name))?.description }));
    writeIndex(agentsRoot, managed);
    log.info('http', 'Project skill added (copy)', { project: proj.path, name: String(skillId) });
    res.json({ ok: true, copied: skill.name });
  });
  // 「删除」：移除项目里本工具部署的副本（真实目录）。软链（接管项）与真实目录都属安全边界：
  // 这里只删「实体目录」，即本工具曾落副本（已登记 INDEX）内容；不删软链、不删用户自有内容。
  r.delete('/projects/:id/skills/:name', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const name = req.params.name;
    const target = path.join(proj.path, '.agents', 'skills', name);
    const st = fs.lstatSync(target, { throwIfNoEntry: false });
    if (!st) return res.status(404).json({ error: 'skill not found' });
    if (!st.isDirectory() || st.isSymbolicLink()) {
      // 软链（接管项）或非目录：不删
      return res.status(400).json({ error: t('api.onlyRealDir') });
    }
    fs.rmSync(target, { recursive: true, force: true });
    log.info('http', 'Project skill removed', { project: id, name });
    res.json({ ok: true, removed: name });
  });

  // 项目「自带」技能的归集 / 接管：与 Agent 目录共用同一套核心逻辑（collect.ts / takeover.ts），
  // 因此用户看到的流程与 Agent 页完全一致（选仓库 → 预览 → 可选「同时接管」）。
  r.get('/projects/:id/collect/preview', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const repo = cfg.data.repos.find((x) => x.id === String(req.query.repo ?? ''));
    if (!repo) return res.status(400).json({ error: 'repo required' });
    const source = projectCollectSource(proj.path, id);
    // 复用 AgentCollectPreview 形状（agentKey 用 sourceRef 填充），前端共用同一个归集弹窗
    res.json({
      sourceRef: source.ref,
      agentKey: source.ref,
      agentName: proj.path,
      installedDir: source.dir,
      items: previewCollectSource(repo, source),
    });
  });
  r.post('/projects/:id/collect', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const { repoId, name, names, replaceNames } = req.body ?? {};
    const repo = cfg.data.repos.find((x) => x.id === String(repoId ?? '')) ?? cfg.data.repos[0];
    if (!repo) return res.status(400).json({ error: t('api.noRepoToCollect') });
    const want = name ? [String(name)] : Array.isArray(names) ? names.map(String) : undefined;
    try {
      const result = collectFromSource(
        cfg, repo, projectCollectSource(proj.path, id), want,
        Array.isArray(replaceNames) ? replaceNames.map(String) : undefined,
      );
      touch();
      log.info('http', 'Project skills collected into repository', { project: proj.path, repo: repo.id, collected: result.collected.length, skipped: result.skipped.length });
      res.json(result);
    } catch (e) {
      log.error('http', `Project skill collection failed: ${(e as Error).message}`, { proj: proj.path });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  // 项目技能「接管」：与 Agent 接管刻意不同 —— 项目里落**真实副本**而非软链。
  // 语义 = 用仓库那一版替换项目里的这条 + 登记为项目受管技能（.agents/skills 要提交 git，
  // 放绝对软链会让队友断链；细则见 takeoverProjectSkill 的注释）。
  r.post('/projects/:id/takeover', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const { name, repoId, confirm } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      const result = takeoverProjectSkill(cfg, proj, repoId ? String(repoId) : undefined, String(name), confirm === true);
      log.info('http', 'Project skill taken over (copy)', {
        project: proj.path, name: String(name), repo: repoId ? String(repoId) : undefined, taken: result.taken,
      });
      res.json(result);
    } catch (e) {
      log.error('http', `Project skill takeover failed: ${(e as Error).message}`, { proj: proj.path });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  r.post('/projects/:id/sync', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const lib = library();
    const result = syncProject(cfg, proj.path, lib.skills);
    cfg.save();
    res.json(result);
  });

  // ---- batch import / diagnose ----
  // 预览：GET(?path=) 与 POST({dirs}) 均可
  const importPreview = (req: express.Request, res: express.Response) => {
    const body = req.body ?? {};
    const dirs = Array.isArray(body.dirs)
      ? body.dirs
      : body.path
        ? [String(body.path)]
        : req.query?.path
          ? [String(req.query.path)]
          : [];
    res.json(previewImportDirs(dirs));
  };
  r.get('/import/preview', importPreview);
  r.post('/import/preview', importPreview);
  r.post('/import', (req, res) => {
    const dirs = Array.isArray(req.body?.dirs)
      ? req.body.dirs
      : req.body?.path
        ? String(req.body.path).split('\n').map((s: string) => s.trim()).filter(Boolean)
        : [];
    const repoId = req.body?.repoId;
    try {
      const result = importDirs(cfg, dirs, repoId);
      touch();
      const imported = result.reduce((n, x) => n + x.imported.length, 0);
      const skipped = result.reduce((n, x) => n + x.skipped.length, 0);
      log.info('http', 'Skills batch-imported', { dirs: dirs.length, repo: repoId ?? undefined, imported, skipped });
      res.json(result);
    } catch (e) {
      log.error('http', `Batch import failed: ${(e as Error).message}`, { dirs: dirs.length, repo: repoId ?? undefined });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  r.get('/diagnose', (_req, res) => {
    try {
      const lib = library();
      res.json(diagnose(cfg, {
        lib,
        candidates: collectCandidates(cfg, lib),
        desired: new Map(),
      }));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  // 就地修复：按 diagnose 项 key 分发（Health 视图调用）
  r.post('/fix', (req, res) => {
    const { key } = req.body ?? {};
    if (!key) return res.status(400).json({ error: 'key required' });
    try {
      const lib = library();
      const result = applyFix(cfg, { lib }, String(key));
      touch();
      log.info('http', 'Diagnostic item fixed in place', { key: String(key) });
      res.json(result);
    } catch (e) {
      log.error('http', `Diagnostic fix failed: ${(e as Error).message}`, { key: String(key) });
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---- sync ----
  r.get('/sync/status', (_req, res) => {
    const lib = library();
    res.json(diffSync(cfg, lib.skills));
  });
  r.post('/sync', (req, res) => {
    try {
      const lib = library();
      const only = Array.isArray(req.body?.agents) ? req.body.agents : undefined;
      // 用户显式触发的同步：允许回收本工具多部署的软链
      const results = syncActive(cfg, lib.skills, only, 'route:manual', { prune: true });
      const created = results.reduce((n, r) => n + r.created.length, 0);
      const removed = results.reduce((n, r) => n + r.removed.length, 0);
      log.info('http', 'Manual sync', { agents: results.length, created, removed });
      res.json(results);
    } catch (e) {
      log.error('http', `Manual sync failed: ${(e as Error).message}`);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---- logs（开源后用户复制/下载上报问题） ----
  r.get('/logs', (req, res) => {
    const tail = Math.max(1, Math.min(Number(req.query.tail) || 200, 1000));
    const logPath = log.getPath();
    let lines: string[] = [];
    let size = 0;
    try {
      if (fs.existsSync(logPath)) {
        size = fs.statSync(logPath).size;
        lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean).slice(-tail);
      }
    } catch (e) {
      log.error('http', `Failed to read log file: ${(e as Error).message}`);
      return res.status(500).json({ error: (e as Error).message });
    }
    res.json({ path: logPath, size, lines, version: SERVER_VERSION });
  });
  r.get('/logs/download', (_req, res) => {
    const logPath = log.getPath();
    if (!fs.existsSync(logPath)) return res.status(404).json({ error: 'no log file' });
    res.download(logPath, 'flint.log');
  });

  return r;
}
