import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { Layout } from '../config/types.js';
import { expandTilde } from './agents.js';
import { scanDir, resolveLayout } from './scanner.js';
import { t } from '../i18n/index.js';

/**
 * 登记预览（WA-01）：落库前把「能扫到什么」摊开给用户确认。
 * 只扫描、只推导，不写 config、不动文件系统。
 */

/** id 规则：参与技能标识 name@id（会进 URL 与界面键），只允许字母数字与 . _ -，且以字母或数字开头 */
export function idIssue(id: string): string | undefined {
  if (!id) return t('register.idEmpty');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) return t('register.idInvalid', { id });
  return undefined;
}

/** 目录名推导缺省 id：目录名本身合法才可作为缺省，否则返回 undefined（必须由用户输入） */
export function defaultIdFromPath(p: string): string | undefined {
  const real = expandTilde(p.trim());
  const base = path.basename(real.replace(/[\\/]+$/, ''));
  return idIssue(base) ? undefined : base;
}

export interface RegisterPreviewInput {
  kind: 'repo' | 'source';
  path: string;
  /** 自有仓库的 skills 根（相对 path），缺省 <path>/skills */
  root?: string;
  /** 第三方来源布局，缺省 auto（扫描时自动检测） */
  layout?: Layout;
  /** 用户指定的 id；缺省取目录名（目录名不合法时必须由用户输入） */
  id?: string;
}

export interface RegisterPreview {
  /** 最终将采用的 id（用户输入优先，否则目录名推导） */
  id: string;
  /** id 是否取自目录名缺省（用户未填写） */
  idFromDir: boolean;
  /** id 校验失败原因；非空时必须由用户输入合法 id 才能登记 */
  idIssue?: string;
  /** 与已登记仓库 / 来源重名 */
  idTaken?: boolean;
  /** 扫描根是否存在 */
  exists: boolean;
  /** 实际扫描根（自有 = root ?? <path>/skills；第三方 = path 本身） */
  scanRoot: string;
  /** 解析后的布局（auto 已落地为 flat / nested） */
  layout: 'flat' | 'nested';
  skillCount: number;
  /** 识别到的技能清单（预览口径与登记后扫描一致） */
  skills: { name: string; description?: string }[];
}

/** 登记预览：识别扫描根、布局与技能清单，并校验缺省 id */
export function previewRegister(cfg: ConfigStore, input: RegisterPreviewInput): RegisterPreview {
  const kind = input.kind === 'source' ? 'source' : 'repo';
  const abs = expandTilde(input.path.trim());
  const scanRoot = kind === 'repo'
    ? (input.root?.trim() ? path.join(abs, input.root.trim()) : path.join(abs, 'skills'))
    : abs;
  const layoutReq: Layout = kind === 'source' ? (input.layout ?? 'auto') : 'flat';
  const exists = fs.existsSync(scanRoot);
  const resolved = resolveLayout(scanRoot, layoutReq);
  // 预览与登记后的扫描同口径：auto 先解析，单 skill 仓库由 scanDir 识别为根技能一份
  const skills = exists ? scanDir(scanRoot, 'preview', resolved) : [];
  const dirId = defaultIdFromPath(input.path);
  const id = input.id?.trim() || dirId || '';
  return {
    id,
    idFromDir: !input.id?.trim() && !!dirId,
    idIssue: idIssue(id),
    idTaken: cfg.data.repos.some((x) => x.id === id) || cfg.data.foreignSources.some((x) => x.id === id),
    exists,
    scanRoot,
    layout: resolved,
    skillCount: skills.length,
    skills: skills.map((s) => ({ name: s.name, description: s.description })),
  };
}
