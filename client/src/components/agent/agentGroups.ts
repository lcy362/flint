import type { AgentView } from '../../api/types';

/**
 * 把 Agent 按「实际技能目录」归并成卡片模型。
 *
 * 多个 Agent 可能解析到同一个全局目录（如 Cline / Warp 都用 ~/.agents/skills，
 * Amp / Replit 都用 ~/.config/agents/skills）。按 Agent 出卡片会出现两张路径
 * 完全相同、内容重复的卡；这里改成「一个实际目录一张卡」：组里的主 Agent 是这张卡的
 * 代表，其余作为别名，只说明「它们和主 Agent 走的是同一个路径」。
 *
 * 主 Agent 由服务端判定并随 AgentView.primaryKey 下发（活跃优先、其次名称序），
 * 它同时是同步与策略读写的唯一落点——别名自己那份预设 / 安装方式不生效，
 * 所以卡片上的策略一律展示主 Agent 的生效值，不存在「两边不同」这种中间态。
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
  /**
   * 组内是否有任一 Agent 在活跃集合里。
   * 目录的「会自动跟随变更」由此决定：只要有一个成员活跃，同步就会覆盖这个目录
   * （同步目标按目录归并到主 Agent），因此不能只看主 Agent 自己的活跃标记。
   */
  anyActive: boolean;
  /** 目录是否已存在于本机（同目录必然同结果） */
  installed: boolean;
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
    const primary = members.find((a) => a.key === members[0].primaryKey) ?? members[0];
    const aliases = members
      .filter((a) => a.key !== primary.key)
      .sort((a, b) => a.name.localeCompare(b.name));
    groups.push({
      dir,
      agents: [primary, ...aliases],
      primary,
      aliases,
      names: [primary, ...aliases].map((a) => a.name),
      keys: [primary, ...aliases].map((a) => a.key),
      anyActive: members.some((a) => a.active),
      installed: members.some((a) => a.installed),
    });
  }

  // 卡片顺序沿用「活跃优先、其次已安装」的直觉排序
  return groups.sort(
    (x, y) =>
      Number(y.anyActive) - Number(x.anyActive) ||
      Number(y.installed) - Number(x.installed) ||
      x.primary.name.localeCompare(y.primary.name)
  );
}
