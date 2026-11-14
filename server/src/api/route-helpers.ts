import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigStore } from '../infra/config-store.js';
import { log } from '../infra/logger.js';
import { effectiveAgentKey, pruneAliasStrategies } from '../core/agents.js';
import { normalizeInstaller } from '../core/npx-install.js';
import { ForeignSource, SyncMode } from '../config/types.js';
/** 把第三方来源的可编辑字段写回去；installer 不合法时返回文案，调用方应 400 且不落库 */
export function editForeignSource(cfg: ConfigStore, src: ForeignSource, body: Record<string, unknown>): string | undefined {
  const { name, path: p, layout, linked, kind, root, installer } = body;
  if (name !== undefined) src.name = (typeof name === 'string' && name) || src.id;
  if (typeof p === 'string' && p) src.path = p;
  if (layout) src.layout = layout as ForeignSource['layout'];
  if (linked !== undefined) src.linked = linked === true;
  if ('installer' in body) {
    const issue = assignSourceInstaller(src, installer);
    if (issue) return issue;
  }
  if (kind === 'repo') moveSourceToRepo(cfg, src, root);
  return undefined;
}

export function assignSourceInstaller(src: ForeignSource, installer: unknown): string | undefined {
  if (installer === null) {
    delete src.installer;
    return undefined;
  }
  const norm = normalizeInstaller(installer, { knownPkg: src.installer?.pkg });
  if (norm.issue) return norm.issue;
  if (norm.installer) src.installer = norm.installer;
  return undefined;
}

export function moveSourceToRepo(cfg: ConfigStore, src: ForeignSource, root: unknown): void {
  cfg.data.foreignSources = cfg.data.foreignSources.filter((x) => x.id !== src.id);
  cfg.data.repos.push({
    id: src.id,
    name: src.name && src.name !== src.id ? src.name : undefined,
    path: src.path,
    root: typeof root === 'string' && root ? root : undefined,
  });
}

/** server 版本号，/api/logs 上报给用户用于 issue 定位（优先 cwd，兼容 dev 的 src 路径） */
export const SERVER_VERSION = (() => {
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

/** 只接受非空字符串的请求字段：对象 / 数组一律视为「未提供」，避免把 [object Object] 写进配置 */
export function asText(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * 移除一个技能落点：软链只 unlink（目标本体一律不动），真实目录 / 文件才做删除。
 *
 * 手动删除是用户的显式意图，这里不做归属拦截——「是不是本工具部署的」只约束**自动**行为
 * （自动投放不替换外部软链、prune 只回收本工具产物），不限制用户手动删掉自己目录里的东西。
 * 技能本体永远在文件系统里，删副本 / 删链接都只影响这个目录的可见性。
 */
export function removeSkillEntry(p: string, st: fs.Stats): void {
  if (st.isSymbolicLink()) fs.unlinkSync(p);
  else fs.rmSync(p, { recursive: true, force: true });
}

/** 目录覆盖属于 Agent 自身：它决定「这个 Agent 解析到哪个目录」 */
export function applyDirOverrides(cfg: ConfigStore, key: string, globalDir: unknown, projectDir: unknown): void {
  if (globalDir === undefined && projectDir === undefined) return;
  const own = cfg.data.agents[key] ?? {};
  if (globalDir !== undefined) { const dir = asText(globalDir); if (dir) own.globalDir = dir; else delete own.globalDir; }
  if (projectDir !== undefined) { const dir = asText(projectDir); if (dir) own.projectDir = dir; else delete own.projectDir; }
  if (Object.keys(own).length > 0) cfg.data.agents[key] = own;
  else delete cfg.data.agents[key];
}

/**
 * 分发策略（预设 / 安装方式 / 每关系策略）一律落到该目录的**主 Agent**：
 * 目录只有一份实体，别名与主 Agent 必须共用同一套策略，否则两边互相覆盖。
 * 返回实际写入的 Agent key（主 Agent 可能刚被重新指定，故在此重新解析）。
 */
export function applyAgentStrategy(cfg: ConfigStore, key: string, body: Record<string, unknown>): string {
  const target = effectiveAgentKey(cfg.data, key);
  const over = cfg.data.agents[target] ?? {};
  const { sync } = body;
  if (sync === 'symlink' || sync === 'copy') over.sync = sync;
  // 关联预设 = 记忆该目录「一次应用」哪套预设；保存决策，不再触发自动部署
  if ('preset' in body) { const preset = asText(body.preset); if (preset) over.preset = preset; else delete over.preset; }
  // 每关系同步策略（SY-01）：{ skill, sync } 写入 skillSync
  if ('skillSync' in body && body.skillSync && typeof body.skillSync === 'object') {
    over.skillSync = { ...over.skillSync, ...(body.skillSync as Record<string, SyncMode>) };
  }
  cfg.data.agents[target] = over;
  // 别名自己那份策略永远不生效，清掉避免配置里留下看似有效、实则被忽略的旧值
  const cleared = pruneAliasStrategies(cfg.data, target);
  if (cleared.length > 0) log.info('http', 'Cleared ignored alias strategies', { primary: target, aliases: cleared });
  return target;
}

/** 请求体里的目录数组：只保留非空字符串项 */
export function dirList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((d): d is string => typeof d === 'string' && d.length > 0);
}

/** 导入预览的目录来源：body.dirs > body.path > ?path（均为单个目录） */
export function previewDirs(body: Record<string, unknown>, queryPath?: unknown): string[] {
  const dirs = dirList(body.dirs);
  if (dirs.length > 0) return dirs;
  const single = asText(body.path) ?? asText(queryPath);
  return single ? [single] : [];
}

/** 执行导入的目录来源：body.dirs > body.path（按行拆分，便于粘贴多行） */
export function importDirsFrom(body: Record<string, unknown>): string[] {
  const dirs = dirList(body.dirs);
  if (dirs.length > 0) return dirs;
  const raw = asText(body.path);
  if (!raw) return [];
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}
