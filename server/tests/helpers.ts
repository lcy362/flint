import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../src/config/store.js';
import { emptyConfig, HubConfig } from '../src/config/types.js';
import { Skill } from '../src/core/skill.js';

/** 建一个临时目录（测试结束后由系统清理 /tmp，不碰用户真实目录） */
export function tmpDir(prefix = 'flint-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** 在给定根目录下落一个最小可用的 skill（仅 SKILL.md） */
export function writeSkill(root: string, name: string, frontmatterExtra = ''): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: test skill ${name}\n${frontmatterExtra}---\nBody\n`,
    'utf-8',
  );
  return dir;
}

/** 构造一个落在临时路径上的 ConfigStore（避免读写真实 ~/.skills-hub） */
export function makeStore(overrides: Partial<HubConfig> = {}): ConfigStore {
  const store = new ConfigStore(path.join(tmpDir('flint-cfg-'), 'config.json'));
  store.replace({ ...emptyConfig(), ...overrides });
  return store;
}

/** 构造内存中的 Skill 对象（不落盘） */
export function skill(name: string, source = 'default', tags: string[] = []): Skill {
  return { id: `${name}@${source}`, name, source, dir: `/nonexistent/${name}`, tags };
}

export { emptyConfig };
export type { HubConfig };
