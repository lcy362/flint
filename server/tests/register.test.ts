import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { previewRegister, idIssue, defaultIdFromPath, type RegisterPreviewInput } from '../src/core/register.js';
import { makeStore, tmpDir, writeSkill } from './helpers.js';

describe('idIssue（id 合法性）', () => {
  it('空 / 含空格 / 中文 / 斜杠 / 连字符开头都不合法', () => {
    expect(idIssue('')).toBeTruthy();
    expect(idIssue('my lib')).toBeTruthy();
    expect(idIssue('我的库')).toBeTruthy();
    expect(idIssue('a/b')).toBeTruthy();
    expect(idIssue('-lead')).toBeTruthy();
  });

  it('字母数字与 . _ - 合法，且以字母数字开头', () => {
    expect(idIssue('my-lib_v2.1')).toBeUndefined();
    expect(idIssue('2fast')).toBeUndefined();
  });
});

describe('defaultIdFromPath（目录名推导缺省 id）', () => {
  it('合法目录名直接作为缺省 id（容忍结尾斜杠与 ~ 前缀）', () => {
    expect(defaultIdFromPath('/tmp/patent-disclosure-skill/')).toBe('patent-disclosure-skill');
    expect(defaultIdFromPath('~/my-lib')).toBe('my-lib');
  });

  it('目录名不合法（中文 / 空格）时返回 undefined，必须由用户输入', () => {
    expect(defaultIdFromPath('/tmp/我的 技能')).toBeUndefined();
  });
});

describe('previewRegister（登记预览：只扫描不落库）', () => {
  it('自有仓库：扫描根为 <path>/skills，罗列识别到的技能', () => {
    const root = tmpDir('flint-reg-');
    writeSkill(path.join(root, 'skills'), 'alpha');
    writeSkill(path.join(root, 'skills'), 'beta');
    const p = previewRegister(makeStore(), { kind: 'repo', path: root });
    expect(p.id).toBe(path.basename(root));
    expect(p.idFromDir).toBe(true);
    expect(p.idIssue).toBeUndefined();
    expect(p.idTaken).toBe(false);
    expect(p.exists).toBe(true);
    expect(p.scanRoot).toBe(path.join(root, 'skills'));
    expect(p.skillCount).toBe(2);
    expect(p.skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('root 缺省可覆盖自有仓库扫描根', () => {
    const root = tmpDir('flint-reg-');
    writeSkill(path.join(root, 'custom'), 'solo');
    const p = previewRegister(makeStore(), { kind: 'repo', path: root, root: 'custom' });
    expect(p.scanRoot).toBe(path.join(root, 'custom'));
    expect(p.skillCount).toBe(1);
  });

  it('第三方来源 auto：单 skill 仓库识别为根技能一份（skills/ 为子技能不单列）', () => {
    const root = tmpDir('flint-reg-');
    fs.writeFileSync(path.join(root, 'SKILL.md'), '---\nname: solo\n---\nBody\n', 'utf-8');
    writeSkill(path.join(root, 'skills'), 'sub');
    const p = previewRegister(makeStore(), { kind: 'source', path: root, layout: 'auto' });
    expect(p.layout).toBe('flat');
    expect(p.skillCount).toBe(1);
    expect(p.skills[0].name).toBe('solo');
  });

  it('用户未填 id 且目录名不合法 → idIssue 提示必须输入', () => {
    const root = tmpDir('flint-reg-');
    const dir = path.join(root, '我的 技能');
    fs.mkdirSync(dir, { recursive: true });
    const p = previewRegister(makeStore(), { kind: 'repo', path: dir });
    expect(p.id).toBe('');
    expect(p.idIssue).toBeTruthy();
  });

  it('id 与已登记仓库 / 来源重名 → idTaken', () => {
    const cfg = makeStore();
    cfg.data.repos.push({ id: 'taken', path: '/nowhere' });
    const p = previewRegister(cfg, { kind: 'repo', path: '/tmp/taken' });
    expect(p.idTaken).toBe(true);
  });

  it('目录不存在：exists=false、skillCount=0，但 id 推导与校验照常', () => {
    const p = previewRegister(makeStore(), { kind: 'repo', path: '/tmp/definitely-not-there-xyz' });
    expect(p.exists).toBe(false);
    expect(p.skillCount).toBe(0);
    expect(p.id).toBe('definitely-not-there-xyz');
  });
});
