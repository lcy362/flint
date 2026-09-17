import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SYNC = 'symlink' as const;
export const CONFIG_PATH = process.env.FLINT_CONFIG
  ?? path.join(os.homedir(), '.flint', 'config.json');
