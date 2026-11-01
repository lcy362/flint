import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 笼外写入检测（C19 的诚实面）。
 *
 * npx 安装器只保证「工作目录」被限制在托管目录内，但它能通过 HOME 探测到用户真实的
 * Agent 目录（实测：impeccable 会往 ~/.claude/agents、~/.grok/skills、
 * ~/.config/opencode/skills 写）。本模块在安装后对比文件系统时间戳，
 * 找出「本次运行期间、笼子之外被改动」的路径，供界面如实告知用户。
 *
 * 只读、只报不改：flint 不自动清理笼外内容（C13 的自动边界），出路是手动删除或
 * 「归集 + 接管」收编。
 */

/** 家目录下不参与检测的大目录（体积大、与技能投放无关、扫描代价高） */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.npm', '.cache', '.cargo', '.rustup', '.gradle', '.m2',
  '.nvm', '.pyenv', '.venv', '.Trash', 'Library', 'Applications', '.ssh', '.gnupg',
  '.docker', '.local', '.vscode', '.composer', '.gem', '.bun', '.deno',
]);

/** 检测深度上限：家目录下一层（~/.x）与其下一层（~/.x/y） */
const MAX_DEPTH = 2;
/** 单次检测最多看多少个子项，避免在超大目录上耗时 */
const MAX_ENTRIES = 4000;

/** 路径缩写：家目录前缀压成 ~（与 Agent 页展示口径一致） */
export function abbrevHome(p: string): string {
  const home = os.homedir();
  return p === home || p.startsWith(`${home}${path.sep}`) ? `~${p.slice(home.length)}` : p;
}

/** 路径 mtime（毫秒）；读不到返回 0 */
function mtimeOf(p: string): number {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}

/**
 * 找出在 startedAt 之后被改动的、位于 exclude 之外的路径。
 * 判据：目录 mtime 变化（新建 / 删除子项会改父目录 mtime），
 * 或其直接子项的 mtime 变化（覆盖写文件只改文件 mtime）。
 * 返回家目录缩写的路径列表（去重、按路径排序）。
 */
export function detectOutsideWrites(startedAt: number, exclude: string): string[] {
  const home = os.homedir();
  const excluded = path.resolve(exclude);
  const hits = new Set<string>();

  const isUnder = (p: string) => p === excluded || p.startsWith(`${excluded}${path.sep}`);
  const inHome = (p: string) => p.startsWith(`${home}${path.sep}`);

  const checkDir = (dir: string, depth: number) => {
    if (isUnder(dir) || !inHome(dir)) return;
    if (mtimeOf(dir) >= startedAt) hits.add(dir);
    if (depth >= MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    let n = 0;
    for (const e of entries) {
      if (n++ > MAX_ENTRIES) return;
      if (e.name.startsWith('.') && SKIP_DIRS.has(e.name)) continue;
      const child = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (mtimeOf(child) >= startedAt) hits.add(child);
        if (depth + 1 < MAX_DEPTH) checkDir(child, depth + 1);
      } else if (mtimeOf(child) >= startedAt) {
        hits.add(child);
      }
    }
  };

  // 家目录下的点目录（~/.claude、~/.grok …）
  let top: fs.Dirent[] = [];
  try { top = fs.readdirSync(home, { withFileTypes: true }); } catch { top = []; }
  for (const e of top) {
    if (!e.isDirectory() || !e.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    checkDir(path.join(home, e.name), 1);
  }
  // ~/.config 下的子目录（~/.config/opencode …）
  const cfgDir = path.join(home, '.config');
  let cfgEntries: fs.Dirent[] = [];
  try { cfgEntries = fs.readdirSync(cfgDir, { withFileTypes: true }); } catch { cfgEntries = []; }
  for (const e of cfgEntries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
    checkDir(path.join(cfgDir, e.name), 1);
  }

  return [...hits].map(abbrevHome).sort();
}

/** 从安装器输出里解析它声明要写入的家目录位置（如 `Claude Code  ~/.claude`） */
export function parseDeclaredHomePaths(text: string): string[] {
  const home = os.homedir();
  const out = new Set<string>();
  // 家目录相对写法：~/.claude、~/.config/opencode
  for (const m of text.matchAll(/~(?:\/[\w.@+-]+)+/g)) {
    const p = m[0].replace(/\/+$/, '');
    if (p && p !== '~') out.add(p);
  }
  // 绝对写法：/Users/xxx/.claude → 压成 ~/.claude
  for (const m of text.matchAll(new RegExp(`${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[\\w.@+-]+(?:/[\\w.@+-]+)*`, 'g'))) {
    const abs = m[0].replace(/\/+$/, '');
    out.add(abbrevHome(abs));
  }
  // 去掉被其它路径包含的（~/.claude 已在时不再单列 ~/.claude/skills）
  const list = [...out].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  for (const p of list) {
    if (!kept.some((k) => p === k || p.startsWith(`${k}/`))) kept.push(p);
  }
  return kept;
}

/**
 * 判定真正的越界写入：安装器**声明**要写的位置里，哪些在本次运行期间真的被改了。
 *
 * 只看时间戳会误报：用户同时在跑的 IDE / 客户端也会写自己的配置目录（实测把
 * ~/.codebuddy、~/.qwenworkcn 误算成安装器越界）。因此以「安装器自己报出来的位置」
 * 为准，再用时间戳确认它确实动了——两个信号都成立才算数。
 * 安装器没报位置时，退化为「看起来像技能落点」的路径（skill / agent 关键字）。
 */
export function detectEscapedWrites(startedAt: number, exclude: string, declared: string[]): string[] {
  const changed = detectOutsideWrites(startedAt, exclude);
  if (declared.length === 0) {
    return changed.filter((p) => /skill|agent/i.test(p));
  }
  return declared.filter((d) => changed.some((c) => c === d || c.startsWith(`${d}/`)));
}
