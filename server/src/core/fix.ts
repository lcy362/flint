import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { expandTilde } from './agents.js';
import { syncActive } from './sync.js';
import { migrateTagsToFrontmatter } from './repo-tags.js';
import { Skill } from './skill.js';
import { t } from '../i18n/index.js';

export interface FixResult {
  key: string;
  applied: boolean;
  fix?: string;
  message: string;
  result?: unknown;
}

interface FixDeps { lib: { skills: Skill[] } }

/**
 * Health 就地修复分发：按 diagnose 的 DiagItem.key 约定执行对应修复，全部幂等。
 * - sync:<agent>   → 重同步该 agent（补 missing、清失效软链、去多余软链）
 * - broken:*       → 重同步所有活跃 agent（消除失效软链）
 * - project:PATH   → 确保项目目录与 .agents/skills 存在
 * - repo:ID        → 创建仓库 skills 目录
 * - tags:ID        → 标签迁移到 SKILL.md frontmatter（PRD 流程三-A）
 */
export function applyFix(cfg: ConfigStore, deps: FixDeps, key: string): FixResult {
  try {
    if (key.startsWith('sync:')) {
      // 用户在体检中心显式点修复：允许回收该 agent 上本工具多部署的软链
      syncActive(cfg, deps.lib.skills, [key.slice(5)], 'fix', { prune: true });
      return { key, applied: true, fix: 'sync', message: t('fix.resynced', { agent: key.slice(5) }) };
    }
    if (key.startsWith('broken:')) {
      syncActive(cfg, deps.lib.skills, cfg.data.activeAgents, 'fix', { prune: true });
      return { key, applied: true, fix: 'sync', message: t('fix.resyncedActive') };
    }
    if (key.startsWith('project:')) {
      const p = expandTilde(key.slice('project:'.length));
      fs.mkdirSync(path.join(p, '.agents', 'skills'), { recursive: true });
      return { key, applied: true, fix: 'mkdir', message: t('fix.projectReady', { path: p }) };
    }
    if (key.startsWith('repo:')) {
      const id = key.slice(5);
      const repo = cfg.data.repos.find((x) => x.id === id);
      if (!repo) return { key, applied: false, message: t('fix.repoNotFound') };
      fs.mkdirSync(path.join(expandTilde(repo.path), 'skills'), { recursive: true });
      return { key, applied: true, fix: 'mkdir', message: t('fix.repoCreated', { path: `${repo.path}/skills` }) };
    }
    if (key.startsWith('tags:')) {
      const id = key.slice(5);
      const repo = cfg.data.repos.find((x) => x.id === id);
      if (!repo) return { key, applied: false, message: t('fix.repoNotFound') };
      const r = migrateTagsToFrontmatter(cfg, repo);
      return { key, applied: true, fix: 'tags-migrate', message: t('fix.tagsMigrated', { n: r.migrated }), result: r };
    }
    return { key, applied: false, message: t('fix.nothing') };
  } catch (e) {
    return { key, applied: false, message: (e as Error).message };
  }
}