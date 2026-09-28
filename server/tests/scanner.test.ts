import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLayoutAbs, resolveLayout, scanDir, scanForeign, scanRepo } from '../src/core/scanner.js';
import { ForeignSource, Repo } from '../src/config/types.js';
import { tmpDir, writeSkill } from './helpers.js';

const names = (skills: { name: string }[]) => skills.map((s) => s.name).sort();

/** 仓库现场：alpha 平铺在根下，beta 落在分类子目录 devops/ 里 */
function repoFixture() {
  const root = path.join(tmpDir('flint-scan-'), 'repo');
  const skillsRoot = path.join(root, 'skills');
  writeSkill(skillsRoot, 'alpha');
  writeSkill(path.join(skillsRoot, 'devops'), 'beta');
  return { root, skillsRoot };
}

describe('scanDir（两种布局的读取范围）', () => {
  it('flat 只收根下的技能目录，不递归分类子目录', () => {
    const { skillsRoot } = repoFixture();
    expect(names(scanDir(skillsRoot, 'probe', 'flat'))).toEqual(['alpha']);
  });

  it('nested 是 flat 的超集：根下与深层一起收', () => {
    const { skillsRoot } = repoFixture();
    expect(names(scanDir(skillsRoot, 'probe', 'nested'))).toEqual(['alpha', 'beta']);
  });
});

describe('detectLayoutAbs（布局判定）', () => {
  it('技能全在根下 → flat', () => {
    const root = path.join(tmpDir('flint-scan-'), 'r');
    writeSkill(root, 'alpha');
    writeSkill(root, 'zeta');
    expect(detectLayoutAbs(root)).toMatchObject({ layout: 'flat', count: 2 });
  });

  it('只有分类子目录里有技能 → nested', () => {
    const root = path.join(tmpDir('flint-scan-'), 'r');
    writeSkill(path.join(root, 'devops'), 'beta');
    expect(detectLayoutAbs(root)).toMatchObject({ layout: 'nested', count: 1 });
  });

  it('顶层与分类子目录都有技能 → nested（不能只看顶层有没有）', () => {
    // 这是本次修复的核心：旧规则「顶层只要有一个技能就判 flat」会让
    // devops/beta 在随后的 flat 扫描里被静默丢掉。
    const { skillsRoot } = repoFixture();
    expect(detectLayoutAbs(skillsRoot)).toMatchObject({ layout: 'nested', count: 2 });
  });

  it('目录里没有任何技能 → flat 且计数为 0', () => {
    const root = path.join(tmpDir('flint-scan-'), 'r');
    fs.mkdirSync(path.join(root, 'empty'), { recursive: true });
    expect(detectLayoutAbs(root)).toMatchObject({ layout: 'flat', count: 0 });
  });

  it('布局判定与计数口径一致（count 等于实际能扫到的技能数）', () => {
    const { skillsRoot } = repoFixture();
    const det = detectLayoutAbs(skillsRoot);
    expect(scanDir(skillsRoot, 'probe', det.layout)).toHaveLength(det.count);
  });
});

describe('resolveLayout', () => {
  it('显式 flat / nested 原样返回，不去探测', () => {
    const { skillsRoot } = repoFixture();
    expect(resolveLayout(skillsRoot, 'flat')).toBe('flat');
    expect(resolveLayout(skillsRoot, 'nested')).toBe('nested');
  });

  it('auto 才走探测', () => {
    const { skillsRoot } = repoFixture();
    expect(resolveLayout(skillsRoot, 'auto')).toBe('nested');
  });

  it('目录不存在时按 flat 处理', () => {
    expect(resolveLayout(path.join(tmpDir('flint-scan-'), 'nope'), 'auto')).toBe('flat');
  });
});

describe('scanRepo（自有仓库恒为扁平）', () => {
  it('只认根下的技能，分类子目录里的技能不会被识别', () => {
    const { root } = repoFixture();
    const repo: Repo = { id: 'own', path: root };
    const res = scanRepo(repo);
    expect(names(res.skills)).toEqual(['alpha']);
    expect(res.skills[0].id).toBe('alpha@own');
  });

  it('honors repo.root：自定义 skills 根优先', () => {
    const base = tmpDir('flint-scan-');
    const custom = path.join(base, 'custom-root');
    writeSkill(custom, 'solo');
    const repo: Repo = { id: 'own', path: path.join(base, 'irrelevant'), root: custom };
    expect(names(scanRepo(repo).skills)).toEqual(['solo']);
  });
});

describe('scanForeign（第三方来源保留嵌套读取）', () => {
  function foreignFixture(layout: ForeignSource['layout']): ForeignSource {
    const base = tmpDir('flint-scan-');
    const src = path.join(base, 'ume');
    writeSkill(src, 'alpha');                       // 顶层
    writeSkill(path.join(src, 'skills/frontend'), 'gamma'); // 分类子目录
    return { id: 'ume', name: 'ume-skills', path: src, layout, linked: true };
  }

  it('nested 能同时发现顶层与分类目录里的技能', () => {
    expect(names(scanForeign(foreignFixture('nested')).skills)).toEqual(['alpha', 'gamma']);
  });

  it('auto 不再丢掉分类目录里的技能（修复前会判成 flat 而漏掉 gamma）', () => {
    expect(names(scanForeign(foreignFixture('auto')).skills)).toEqual(['alpha', 'gamma']);
  });

  it('显式 flat 时只读顶层——这是用户明确要求的行为', () => {
    expect(names(scanForeign(foreignFixture('flat')).skills)).toEqual(['alpha']);
  });
});

/* ---------- 单 skill 仓库（根自身就是技能） ---------- */

/** 根自身落一个 SKILL.md（单 skill 仓库，如 patent-disclosure-skill） */
function writeRootSkill(root: string, name: string): void {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'SKILL.md'),
    `---\nname: ${name}\ndescription: single-skill repo ${name}\n---\nBody\n`,
    'utf-8',
  );
}

/** patent-disclosure-skill 式现场：根是技能，skills/ 下是它的子技能 */
function singleSkillFixture() {
  const root = path.join(tmpDir('flint-scan-'), 'patent-disclosure-skill');
  writeRootSkill(root, 'patent-disclosure-skill');
  writeSkill(path.join(root, 'skills'), 'patent-reader');
  writeSkill(path.join(root, 'skills'), 'patent-disclosure');
  return root;
}

describe('单 skill 仓库（根自身就是技能）', () => {
  it('scanDir 只识别根技能，skills/ 里的子技能不再单独列出', () => {
    const root = singleSkillFixture();
    expect(names(scanDir(root, 'probe', 'nested'))).toEqual(['patent-disclosure-skill']);
  });

  it('布局判定为 flat 且计数 1（旧逻辑会误判 nested 并丢掉根技能）', () => {
    const root = singleSkillFixture();
    expect(detectLayoutAbs(root)).toEqual({ layout: 'flat', count: 1, root });
  });

  it('判定与扫描口径一致：按判定布局扫描即得根技能一份', () => {
    const root = singleSkillFixture();
    const det = detectLayoutAbs(root);
    const found = scanDir(root, 'probe', det.layout);
    expect(found).toHaveLength(det.count);
    expect(names(found)).toEqual(['patent-disclosure-skill']);
  });

  it('外部源即使显式 nested 也以根技能为准（不拆子技能）', () => {
    const root = singleSkillFixture();
    const src: ForeignSource = { id: 'patent', name: 'patent', path: root, layout: 'nested', linked: true };
    expect(names(scanForeign(src).skills)).toEqual(['patent-disclosure-skill']);
  });
});
