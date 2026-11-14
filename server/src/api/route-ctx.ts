import type { Router } from 'express';
import type { ConfigStore } from '../infra/config-store.js';
import type { scanAll } from '../core/scanner.js';

export interface RouteCtx {
  cfg: ConfigStore;
  library: () => ReturnType<typeof scanAll>;
  touch: () => void;
  touchConfig: () => void;
  warehouses: () => { repos: ConfigStore['data']['repos']; sources: ConfigStore['data']['foreignSources'] };
}

export type MountFn = (r: Router, ctx: RouteCtx) => void;
