import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasSkill, normalizeTags, parseSkillMeta, readSkill } from '../src/core/skill.js';
import { tmpDir, writeSkill } from './helpers.js';

describe('normalizeTags', () => {
  it('空值返回空数组', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it('数组去重并去掉空白项', () => {
    expect(normalizeTags([' a ', 'b', 'a', '  '])).toEqual(['a', 'b']);
  });

  it('字符串按半角逗号 / 分号 / 中文逗号切分', () => {
    expect(normalizeTags('a, b;c，d')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('非字符串元素统一转成字符串后去重', () => {
    expect(normalizeTags([1, 2, '1'])).toEqual(['1', '2']);
  });

  it('其它类型（对象 / 数字）返回空数组', () => {
    expect(normalizeTags(42)).toEqual([]);
    expect(normalizeTags({ a: 1 })).toEqual([]);
  });
});

describe('parseSkillMeta', () => {
  it('解析顶层 name / description / tags', () => {
    const md = '---\nname: alpha\ndescription: 一个技能\ntags: [x, y]\n---\nBody\n';
    expect(parseSkillMeta(md)).toMatchObject({
      name: 'alpha',
      description: '一个技能',
      tags: ['x', 'y'],
    });
  });

  it('解析 metadata.tags（agentskills.io 合规路径）', () => {
    const md = '---\nname: alpha\nmetadata:\n  tags:\n    - m1\n    - m2\n---\nBody\n';
    expect(parseSkillMeta(md).tags).toEqual(['m1', 'm2']);
  });

  it('顶层 tags 与 metadata.tags 合并去重，顶层在前', () => {
    const md = '---\ntags: [a, b]\nmetadata:\n  tags: [b, c]\n---\nBody\n';
    expect(parseSkillMeta(md).tags).toEqual(['a', 'b', 'c']);
  });

  it('字符串形式的 tags 同样兼容', () => {
    const md = '---\ntags: "a, b"\n---\nBody\n';
    expect(parseSkillMeta(md).tags).toEqual(['a', 'b']);
  });

  it('没有 frontmatter 时返回空 tags', () => {
    expect(parseSkillMeta('# 标题\n正文\n')).toEqual({ tags: [] });
  });

  it('YAML 非法时不抛错，回落空 tags', () => {
    expect(parseSkillMeta('---\nfoo: [unclosed\n---\nBody\n').tags).toEqual([]);
  });

  it('version 只接受字符串（数字版本号被忽略）', () => {
    expect(parseSkillMeta('---\nversion: 1\n---\nBody\n').version).toBeUndefined();
    expect(parseSkillMeta('---\nversion: "1.0.0"\n---\nBody\n').version).toBe('1.0.0');
  });
});

describe('readSkill / hasSkill', () => {
  it('读取目录里的 SKILL.md，name 缺省回落目录名', () => {
    const root = tmpDir();
    const dir = writeSkill(root, 'alpha');
    expect(hasSkill(dir)).toBe(true);
    expect(readSkill(dir)).toMatchObject({
      name: 'alpha',
      description: 'test skill alpha',
      dir,
      tags: [],
    });
  });

  it('frontmatter 里的 name 优先于目录名', () => {
    const root = tmpDir();
    const dir = path.join(root, 'folder-name');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: real-name\n---\nBody\n', 'utf-8');
    expect(readSkill(dir)?.name).toBe('real-name');
  });

  it('目录里没有 SKILL.md 时返回 undefined', () => {
    const root = tmpDir();
    fs.mkdirSync(path.join(root, 'not-a-skill'), { recursive: true });
    expect(hasSkill(path.join(root, 'not-a-skill'))).toBe(false);
    expect(readSkill(path.join(root, 'not-a-skill'))).toBeUndefined();
  });
});
