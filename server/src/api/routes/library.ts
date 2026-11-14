import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { Router } from 'express';
import { log } from '../../infra/logger.js';
import { listAgents, expandTilde } from '../../core/agents.js';
import { scanAll, detectLayoutAbs, scanDir, resolveLayout } from '../../core/scanner.js';
import { previewRegister, idIssue, type RegisterPreviewInput } from '../../core/register.js';
import { cloneSourceRepo, gitUrlIssue } from '../../core/source-clone.js';
import { npxInstall, npxUpdate, npxPkgIssue, normalizeInstaller, parseArgs, parseNpxCommand } from '../../core/npx-install.js';
import { sseHead, sseSend, sseEnd, createLineEmitter, createProgressReporter } from '../sse.js';
import { collectCandidates } from '../../core/integrate.js';
import { bodyText, firstHitContext, type BodyCache } from '../../core/skillindex.js';
import { detectStale, refreshSkill } from '../../core/source-update.js';
import { pullRepo, repoStatus } from '../../core/repo-sync.js';
import { importDirs, previewImportDirs } from '../../core/import.js';
import { previewCollect, collectAgentSkill } from '../../core/collect.js';
import { migrateTagsToFrontmatter } from '../../core/repo-tags.js';
import { takeover } from '../../core/takeover.js';
import { diagnose } from '../../core/diagnose.js';
import { cachedContentHealthMap, inspectSkill } from '../../core/content.js';
import { mergeSkill } from '../../core/merge.js';
import { Repo, ForeignSource } from '../../config/types.js';
import { t } from '../../i18n/index.js';
import type { MsgKey } from '../../i18n/en.js';
import type { RouteCtx } from '../route-ctx.js';
import {
  editForeignSource, previewDirs, importDirsFrom,
} from '../route-helpers.js';

export function mountLibraryRoutes(r: Router, ctx: RouteCtx): void {
  const { cfg, library, touch, warehouses } = ctx;
  r.get('/state', (_req, res) => {
    const lib = library();
    // 内容体检摘要（F1/F2）：只回传诊断或详情页已经算过、且文件尚未改动的计数。
    // 全量规则扫描在 /diagnose 与 /skills/:id/security，列表不再每次重跑。
    const health = cachedContentHealthMap(lib.skills, new Set(cfg.data.repos.map((r) => r.id)));
    const skills = lib.skills.map((s) => ({
      id: s.id, name: s.name, source: s.source, dir: s.dir,
      description: s.description, version: s.version,
      // 标签：config.skillMeta 覆盖优先，其次 SKILL.md frontmatter
      tags: cfg.data.skillMeta[s.id]?.tags ?? s.tags,
      origin: cfg.data.skillMeta[s.id]?.origin,
      // 无问题时省略该字段，前端据此不渲染徽标
      health: health.get(s.id),
    }));
    res.json({
      activeAgents: cfg.data.activeAgents,
      skills,
      presets: cfg.data.presets,
      repos: cfg.data.repos,
      sources: cfg.data.foreignSources,
      customAgents: cfg.data.customAgents,
      settings: { defaultSync: cfg.data.defaultSync },
      // 供前端把绝对路径显示成 ~ 开头的形式（如 ~/.agents/skills）
      home: os.homedir(),
    });
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
  r.get('/skills/:id/content', async (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const sk = library().skills.find((s) => s.id === id);
    if (!sk) return res.status(404).json({ error: 'skill not found' });
    const file = path.join(sk.dir, 'SKILL.md');
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'SKILL.md not found' });
    let files: string[] = [];
    try { files = fs.readdirSync(sk.dir).filter((f) => f !== 'SKILL.md'); } catch { /* ignore */ }
    // F4：来源/版本可追踪信息（仅已登记来源才返回）。detectStale 异步执行 git，不阻塞事件循环。
    const meta = cfg.data.skillMeta[id];
    const provenance = meta?.sourceRef
      ? { sourceRef: meta.sourceRef, sourceType: meta.sourceType, takenAt: meta.takenAt, stale: await detectStale(sk.dir, meta) }
      : undefined;
    res.json({ id: sk.id, dir: sk.dir, content: fs.readFileSync(file, 'utf-8'), files, provenance });
  });

  // 内容体检明细（F1 + F2）：技能详情页「运行检测 / 重新检测」。
  // 与 /diagnose 的 content 维度同源，这里只针对单个技能；规则文案在服务端本地化，
  // 前端不必再维护一份规则说明（避免 36 条规则文案双份漂移）。
  r.get('/skills/:id/security', (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const sk = library().skills.find((s) => s.id === id);
    if (!sk) return res.status(404).json({ error: 'skill not found' });
    const { own, findings, issues } = inspectSkill(sk, new Set(cfg.data.repos.map((r) => r.id)));
    res.json({
      own,
      findings: findings.map((f) => ({
        ruleId: f.ruleId,
        category: f.category,
        severity: f.severity,
        file: f.file,
        line: f.line,
        excerpt: f.excerpt,
        rule: t(f.titleKey as MsgKey),
      })),
      issues: issues.map((i) => ({ kind: i.kind, message: t(`diag.content.${i.kind}` as MsgKey) })),
    });
  });

  // F4：从已登记来源刷新仓库副本（用户显式动作，来源只读、不联网）
  r.post('/skills/:id/refresh', (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const sk = library().skills.find((s) => s.id === id);
    if (!sk) return res.status(404).json({ error: 'skill not found' });
    const repo = cfg.data.repos.find((r) => r.id === sk.source);
    if (!repo) return res.status(400).json({ error: 'skill is not in a managed repo' });
    const out = refreshSkill(cfg, repo, sk.name);
    if (!out.refreshed) return res.status(400).json({ error: `refresh failed: ${out.reason ?? 'unknown'}` });
    touch();
    res.json({ refreshed: true });
  });

  // 技能正文全文搜索（F3）：关键词命中 SKILL.md 正文，返回命中 id 与上下文样例。
  // 与 /state 分工：/state 只给元数据；正文检索按需走这里，不加重冷启动。
  r.get('/skills/search', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    if (!q) return res.json({ hits: [] });
    const cache = new Map<string, BodyCache>();
    const hits: { id: string; context?: string }[] = [];
    for (const s of library().skills) {
      const body = bodyText(s.dir, cache);
      if (!body.includes(q)) continue;
      const context = firstHitContext(body, q);
      hits.push({ id: s.id, ...(context ? { context } : {}) });
    }
    res.json({ hits });
  });

  // ---- repos ----
  r.get('/repos', (_req, res) => res.json(cfg.data.repos));
  // 登记预览：只扫描不落库。返回扫描根 / 布局 / 技能清单与缺省 id（缺省取目录名，不合法须用户输入）
  r.post('/repos/preview', (req, res) => {
    const body = req.body as Partial<RegisterPreviewInput>;
    if (!body?.path) return res.status(400).json({ error: 'path required' });
    try { res.json(previewRegister(cfg, body as RegisterPreviewInput)); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  r.post('/repos', (req, res) => {
    const { id, path: p, root } = req.body as Partial<Repo>;
    if (!id || !p) return res.status(400).json({ error: 'id/path required' });
    // 兜底校验：前端预览已拦一道，直接调 API 也不能绕过 id 规则
    const issue = idIssue(id);
    if (issue) return res.status(400).json({ error: issue });
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
  // F4·仓库级来源（git remote）：读取远端地址与相对远端的领先/落后提交数。
  // 自有仓库与第三方仓库（foreignSources）均可；非 git 仓库 / 无 remote 返回 404。
  r.get('/repos/:id/status', async (req, res) => {
    const target = cfg.data.repos.find((x) => x.id === req.params.id)
      ?? cfg.data.foreignSources.find((x) => x.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'repo not found' });
    // fetch=1 才联网校验（短超时）；默认读本地引用秒回，避免拖慢/卡死
    const st = await repoStatus(target.path, { fetch: req.query.fetch === '1' });
    if (!st) return res.status(404).json({ error: 'repo has no git remote' });
    res.json(st);
  });
  // F4·仓库级同步：直接 git pull（自有/第三方均可），成功后触发 resync 让变更生效。
  // npx 安装的来源（ForeignSource.installer）不走 pull——在托管目录里重跑安装器
  // （updateArgs 优先，否则重跑安装命令 = 一键更新）。
  r.post('/repos/:id/sync', async (req, res) => {
    const target = cfg.data.repos.find((x) => x.id === req.params.id)
      ?? cfg.data.foreignSources.find((x) => x.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'repo not found' });
    const installer = 'installer' in target ? target.installer : undefined;
    if (installer?.kind === 'npx') {
      const out = await npxUpdate({ dir: target.path, pkg: installer.pkg, args: installer.args, updateArgs: installer.updateArgs });
      if (!out.ok) return res.status(500).json({ error: out.message || t('register.npxInstallFailed'), log: out.log });
      if (out.updated) {
        installer.at = new Date().toISOString();
        cfg.save();
      }
      touch();
      return res.json(out);
    }
    const out = await pullRepo(target.path);
    if (!out.ok) return res.status(500).json({ error: out.message || 'pull failed' });
    touch();
    res.json(out);
  });
  // npx 来源更新（SSE 流式）：在托管目录里重跑安装器（updateArgs 优先，否则重跑安装命令）。
  // 与 /repos/:id/sync 分开：那边保持 git pull 的 JSON 契约，这边专服「跑安装器」的长任务。
  r.post('/repos/:id/npx-update', async (req, res) => {
    const target = cfg.data.foreignSources.find((x) => x.id === req.params.id);
    if (target?.installer?.kind !== 'npx') {
      return res.status(404).json({ error: 'npx source not found' });
    }
    const inst = target.installer;
    const progress = createProgressReporter(res);
    const emit = createLineEmitter(res, progress.emit);
    sseHead(res);
    sseSend(res, { phase: 'start', pkg: inst.pkg, args: inst.updateArgs?.length ? inst.updateArgs : inst.args });
    try {
      const out = await npxUpdate({
        dir: target.path,
        pkg: inst.pkg,
        args: inst.args,
        updateArgs: inst.updateArgs,
        onOutput: emit,
        onProgress: progress.emit,
      });
      if (!out.ok) {
        sseSend(res, { phase: 'error', error: out.message || t('register.npxInstallFailed'), log: out.log });
        return sseEnd(res);
      }
      if (out.updated) {
        inst.at = new Date().toISOString();
        cfg.save();
      }
      touch();
      progress.flush();
      sseSend(res, { phase: 'done', ...out });
    } catch (e) {
      sseSend(res, { phase: 'error', error: (e as Error).message });
    }
    sseEnd(res);
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
    // 未给 selections 时回退到「显式 agentKeys > 单个 agentKey > 全部已安装 Agent」
    let fallbackKeys: string[] = [];
    if (Array.isArray(agentKeys)) fallbackKeys = agentKeys.map(String);
    else if (agentKey) fallbackKeys = [String(agentKey)];
    else fallbackKeys = listAgents(cfg.data).filter((a) => a.installed).map((a) => a.key);
    const everyNames: string[] | undefined = Array.isArray(names) ? names.map(String) : undefined;
    const sel: { agentKey: string; names?: string[] }[] = Array.isArray(selections)
      ? selections.map((s: { agentKey: unknown; names?: unknown }) => ({
          agentKey: String(s.agentKey),
          names: Array.isArray(s.names) ? s.names.map(String) : undefined,
        }))
      : fallbackKeys.map((k) => ({ agentKey: k, names: everyNames }));
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
  // 从 Git 地址拉取第三方仓库代码到托管目录（SSE 流式：实时转发 clone / fetch 输出）。
  // 只拉代码、不改 config；完成后前端用返回的 path 走既有的登记流程（预览 → 落库）。
  r.post('/sources/clone', async (req, res) => {
    const url = typeof (req.body as { url?: unknown })?.url === 'string' ? String((req.body as { url: string }).url).trim() : '';
    if (!url) return res.status(400).json({ error: 'url required' });
    const issue = gitUrlIssue(url);
    if (issue) return res.status(400).json({ error: issue });
    const progress = createProgressReporter(res);
    const emit = createLineEmitter(res, progress.emit);
    sseHead(res);
    sseSend(res, { phase: 'start', url });
    try {
      const r = await cloneSourceRepo(url, emit);
      progress.flush();
      sseSend(res, { phase: 'done', ...r });
    } catch (e) {
      sseSend(res, { phase: 'error', error: (e as Error).message });
    }
    sseEnd(res);
  });
  // 从 npx 命令安装（SSE 流式）：用户粘一条原始安装命令（如 `npx impeccable skills install`），
  // 这里解析出包名与参数，在托管目录里执行（笼子 + 非交互 env + git 快照），实时转发安装器输出；
  // 成功后把目录（含建议的技能扫描根）交给既有登记流程。此步不改 config。
  r.post('/sources/npx', async (req, res) => {
    const body = (req.body ?? {}) as { command?: unknown; pkg?: unknown; args?: unknown; id?: unknown };
    // 原始命令优先（用户只填一条命令）；兼容旧的 pkg + args 形态
    const rawCmd = typeof body.command === 'string' ? body.command.trim() : '';
    let pkg: string;
    let args: string[];
    if (rawCmd) {
      const parsed = parseNpxCommand(rawCmd);
      pkg = parsed.pkg ?? '';
      args = parsed.args;
      if (!pkg) return res.status(400).json({ error: t('register.npxCmdNoPkg') });
    } else {
      pkg = typeof body.pkg === 'string' ? body.pkg.trim() : '';
      args = parseArgs(body.args as string | string[] | undefined);
    }
    const issue = npxPkgIssue(pkg);
    if (issue) return res.status(400).json({ error: issue });
    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : undefined;
    if (id && idIssue(id)) return res.status(400).json({ error: idIssue(id) });
    const progress = createProgressReporter(res);
    const emit = createLineEmitter(res, progress.emit);
    sseHead(res);
    sseSend(res, { phase: 'start', pkg, args, command: `npx ${pkg} ${args.join(' ')}`.trim() });
    try {
      const r = await npxInstall({ pkg, args, id, onOutput: emit, onProgress: progress.emit });
      if (!r.ok) {
        sseSend(res, { phase: 'error', error: r.message, log: r.log, escaped: r.escaped ?? [] });
        return sseEnd(res);
      }
      progress.flush();
      sseSend(res, { phase: 'done', ...r });
    } catch (e) {
      sseSend(res, { phase: 'error', error: (e as Error).message });
    }
    sseEnd(res);
  });
  r.post('/sources', (req, res) => {
    const body = req.body as ForeignSource & { requireSkills?: boolean };
    if (!body.id || !body.path) return res.status(400).json({ error: 'id/path required' });
    // 兜底校验：id 规则与重名检查（仓库 / 来源共用一个 id 命名空间）
    const issue = idIssue(body.id);
    if (issue) return res.status(400).json({ error: issue });
    if (cfg.data.repos.some((x) => x.id === body.id) || cfg.data.foreignSources.some((x) => x.id === body.id)) {
      return res.status(409).json({ error: t('api.repoExists', { id: body.id }) });
    }
    // npx 安装来源携带 installer（更新时重跑安装器）；手动 / git 克隆来源无此字段
    const norm = normalizeInstaller(body.installer);
    if (norm.issue) return res.status(400).json({ error: norm.issue });
    // 导入流程（Git 克隆 / npx 安装）：扫不到技能就不许登记（PRD EK-07 / C19），
    // 避免留下一个永远空着的来源；手动登记是用户的明确选择，不拦。
    if (body.requireSkills) {
      const scanRoot = expandTilde(String(body.path ?? '').trim());
      const skills = fs.existsSync(scanRoot)
        ? scanDir(scanRoot, 'preview', resolveLayout(scanRoot, body.layout ?? 'auto'))
        : [];
      if (skills.length === 0) return res.status(400).json({ error: t('register.zeroSkills') });
    }
    const { requireSkills, ...rest } = body;
    cfg.data.foreignSources.push({
      ...rest,
      ...(norm.installer ? { installer: norm.installer } : {}),
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
  // installer：npx 来源的安装器信息——更新命令可改（留空 = 重跑安装命令的一键更新），
  // 显式传 null 表示清除（退化为普通目录来源）。
  r.put('/sources/:id', (req, res) => {
    const src = cfg.data.foreignSources.find((x) => x.id === req.params.id);
    if (!src) return res.status(404).json({ error: 'source not found' });
    const issue = editForeignSource(cfg, src, (req.body ?? {}) as Record<string, unknown>);
    if (issue) return res.status(400).json({ error: issue });
    cfg.save();
    touch();
    res.json(warehouses());
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

  // ---- batch import / diagnose ----
  // 预览：GET(?path=) 与 POST({dirs}) 均可
  const importPreview = (req: express.Request, res: express.Response) => {
    res.json(previewImportDirs(previewDirs((req.body ?? {}) as Record<string, unknown>, req.query?.path)));
  };
  r.get('/import/preview', importPreview);
  r.post('/import/preview', importPreview);
  r.post('/import', (req, res) => {
    const dirs = importDirsFrom((req.body ?? {}) as Record<string, unknown>);
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
}
