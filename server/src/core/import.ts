import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { scanDir, detectLayoutAbs } from './scanner.js';
import { recordIngestedSource } from './source-update.js';
import { expandTilde, repoSkillRoot } from './agents.js';
import { t } from '../i18n/index.js';

export interface ImportResult { source: string; imported: string[]; skipped: string[] }

export interface ImportPreviewItem { source: string; layout: 'flat' | 'nested'; count: number; tags: string[]; error?: string }

/**
 * 导入前预览：逐目录识别布局、统计可导入 skill 数，并汇总解析出的标签。
 * count 与 importDirs 的 nested 扫描口径一致，保证预览 = 实际导入数。
 * tags 为该目录下所有 skill 从 SKILL.md 解析出的标签并集（顶层 tags | metadata.tags）。
 */
export function previewImportDirs(sourceDirs: string[]): ImportPreviewItem[] {
  const out: ImportPreviewItem[] = [];
  for (const sd of sourceDirs) {
    const abs = expandTilde(sd);
    if (!fs.existsSync(abs)) { out.push({ source: sd, layout: 'flat', count: 0, tags: [], error: t('import.pathMissing') }); continue; }
    try {
      const det = detectLayoutAbs(abs);
      const found = scanDir(abs, 'probe', 'nested');
      out.push({
        source: sd, layout: det.layout, count: found.length,
        tags: [...new Set(found.flatMap((s) => s.tags))],
      });
    } catch (e) { out.push({ source: sd, layout: 'flat', count: 0, tags: [], error: String(e) }); }
  }
  return out;
}

/**
 * 批量导入：把若干外部 skill 目录(及其子级分类)一次性复制进某仓库 skills/。
 * 同名 skill 已在目标仓库中则跳过（去重），不会重复导入或生成 -2 副本。
 */
export function importDirs(cfg: ConfigStore, sourceDirs: string[], repoId?: string): ImportResult[] {
  const repo = cfg.data.repos.find((r) => r.id === repoId) ?? cfg.data.repos[0];
  const out: ImportResult[] = [];
  for (const sd of sourceDirs) {
    const abs = expandTilde(sd);
    const res: ImportResult = { source: sd, imported: [], skipped: [] };
    if (!fs.existsSync(abs)) { res.skipped.push(t('import.dirMissing')); out.push(res); continue; }
    if (!repo) { res.skipped.push(t('import.noRepo')); out.push(res); continue; }
    // 用统一的仓库 skill 根换算（honors repo.root）：否则自定义 root 的仓库会出现"导入了却扫不到"
    const skillsRoot = repoSkillRoot(repo);
    fs.mkdirSync(skillsRoot, { recursive: true });
    const found = scanDir(abs, 'import', 'nested');
    for (const s of found) {
      // 解引用源软链：导入的是真实位置的内容，而非把链接本身复制进仓库
      let srcReal: string;
      try { srcReal = fs.realpathSync(s.dir); }
      catch (e) { res.skipped.push(t('import.srcUnreachable', { name: s.name, msg: (e as Error).message })); out.push(res); continue; }
      const dest = path.join(skillsRoot, s.name);
      if (fs.existsSync(dest)) { res.skipped.push(t('import.existsSkip', { name: s.name })); continue; }
      try {
        fs.cpSync(srcReal, dest, { recursive: true });
        // 来源追溯（IM-04）+ 可追踪来源（F4）
        const meta = cfg.data.skillMeta[`${s.name}@${repo.id}`] ?? { tags: [] };
        meta.origin = abs;
        cfg.data.skillMeta[`${s.name}@${repo.id}`] = meta;
        recordIngestedSource(cfg, repo.id, s.name, srcReal);
        res.imported.push(s.name);
      } catch (e) { res.skipped.push(t('import.failed', { name: s.name, msg: (e as Error).message })); }
    }
    out.push(res);
  }
  cfg.save();
  return out;
}

