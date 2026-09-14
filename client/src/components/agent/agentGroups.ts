import type { AgentView } from '../../api/types';

/**
 * 把 Agent 按「实际技能目录」归并成卡片模型。
 *
 * 多个 Agent 可能解析到同一个全局目录（如 Cline / Warp 都用 ~/.agents/skills，
 * Amp / Replit 都用 ~/.config/agents/skills）。按 Agent 出卡片会出现两张路径
 * 完全相同、内容重复的卡，还得多挂一个「共享目录」徽标去解释；这里改成
 * 「一个实际目录一张卡」：组里选一个主 Agent 作为这张卡的代表，其余作为别名，
 * 只说明「它们和主 Agent 走的是同一个路径」。
 *
 * 为什么必须有主次：目录只有一份，而安装方式 / 预设是按 Agent 存的，
 * 同目录的多个 Agent 不可能各自生效（同步引擎按 Agent 逐个对账落盘，会互相覆盖，
 * 实际结果取决于谁最后同步）。所以卡片上的分发策略一律取主 Agent，
 * 别名与主 Agent 不一致时另外标出「设置冲突」，由用户去对齐。
 */
export interface AgentGroup {
  /** 组标识即解析后的绝对目录（也是卡片 id） */
  dir: string;
  /** 全部成员，主 Agent 在前，其余别名按名称序 */
  agents: AgentView[];
  /** 主 Agent：卡片的代表，安装方式 / 预设等策略取它 */
  primary: AgentView;
  /** 别名：与主 Agent 走同一路径的其它名字 */
  aliases: AgentView[];
  names: string[];
  keys: string[];
  /** 组内在活跃集合里的 Agent 数量 */
  activeCount: number;
  /** 目录是否已存在于本机（同目录必然同结果） */
  installed: boolean;
  /** 与主 Agent 的预设 / 安装方式不一致的别名：同目录只能落一份，二者会互相覆盖 */
  conflicts: AgentView[];
}

/** 主 Agent 的挑选：活跃优先（只有活跃的会被自动同步，其策略才是实际持续生效的那套），其次按名称稳定排序 */
function pickPrimary(members: AgentView[]): AgentView {
  return [...members].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
  )[0];
}

/** 预设 / 安装方式是否与主 Agent 不同 */
export function settingsDiffer(a: AgentView, b: AgentView): boolean {
  return (a.preset ?? null) !== (b.preset ?? null) || a.sync !== b.sync;
}

export function groupAgentsByDir(agents: AgentView[]): AgentGroup[] {
  const byDir = new Map<string, AgentView[]>();
  for (const a of agents) {
    const arr = byDir.get(a.globalDir) ?? [];
    arr.push(a);
    byDir.set(a.globalDir, arr);
  }

  const groups: AgentGroup[] = [];
  for (const [dir, members] of byDir) {
    const primary = pickPrimary(members);
    const aliases = [...members]
      .filter((a) => a.key !== primary.key)
      .sort((a, b) => a.name.localeCompare(b.name));
    groups.push({
      dir,
      agents: [primary, ...aliases],
      primary,
      aliases,
      names: [primary, ...aliases].map((a) => a.name),
      keys: [primary, ...aliases].map((a) => a.key),
      activeCount: members.filter((a) => a.active).length,
      installed: members.some((a) => a.installed),
      conflicts: aliases.filter((a) => settingsDiffer(a, primary)),
    });
  }

  // 卡片顺序沿用「有活跃的优先、其次已安装」的直觉排序
  return groups.sort(
    (x, y) =>
      Number(y.activeCount > 0) - Number(x.activeCount > 0) ||
      Number(y.installed) - Number(x.installed) ||
      y.activeCount - x.activeCount ||
      x.primary.name.localeCompare(y.primary.name)
  );
}
