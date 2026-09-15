import { ConfigStore } from '../config/store.js';
import { Preset } from '../config/types.js';
import { t } from '../i18n/index.js';

export function list(c: ConfigStore): Preset[] {
  return c.data.presets;
}

export function create(c: ConfigStore, name: string): Preset {
  const cfg = c.data;
  if (cfg.presets.some((p) => p.name === name)) throw new Error(t('preset.exists', { name }));
  const p: Preset = { name, skills: [], tags: [] };
  cfg.presets.push(p);
  c.save();
  return p;
}

export function update(c: ConfigStore, name: string, patch: Partial<Pick<Preset, 'skills' | 'tags'>>): Preset {
  const p = c.data.presets.find((x) => x.name === name);
  if (!p) throw new Error(t('preset.notFound', { name }));
  if (patch.skills) p.skills = patch.skills;
  if (patch.tags) p.tags = patch.tags;
  c.save();
  return p;
}

export function remove(c: ConfigStore, name: string): void {
  c.data.presets = c.data.presets.filter((x) => x.name !== name);
  c.save();
}
