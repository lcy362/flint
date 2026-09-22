/** 目录布局 */
export type Layout = 'flat' | 'nested' | 'auto';
/** 安装方式 */
export type SyncMode = 'symlink' | 'copy';

/**
 * 自有仓库：个人 skill 资产库本体。
 *
 * **恒为扁平布局**（`<root>/<name>/SKILL.md`，root 缺省 `<path>/skills`），没有 layout 概念。
 * 原因：本工具对自有仓库的所有写入（归集 / 导入 / 项目回写）都落在根下，读取也按
 * 「位置 = 根 / 名字」定位副本；若允许分类子目录，读写两边就会各按一套位置理解，
 * 结果是同名技能在同一来源里出现两份（归集会认为"仓库里没有"而再复制一份），
 * 违反「name 物理唯一」。收敛为扁平后，读写共用同一套位置规则。
 *
 * 需要按分类组织的场景走两条路：分类目录放在**第三方来源**（只读关联），
 * 或用**标签**给自有仓库的技能分类。
 */
export interface Repo {
  id: string;
  /** 显示名称，缺省回落到 id。id 参与 skill 标识（name@id），不可变 */
  name?: string;
  path: string;
  /** 真实 skills 根目录，缺省 <path>/skills */
  root?: string;
}

/**
 * 第三方仓库：外部 / 上游的开放内容库。
 * 只读，因此可以保留分类组织 —— `layout` 在这里才有意义（自有仓库恒为扁平）。
 */
export interface ForeignSource {
  id: string;
  name: string;
  path: string;
  layout: Layout;
  /** true=只读关联（不拷贝本体）；false=已收编（拷贝进仓库） */
  linked: boolean;
}

/** 自定义 Agent（AG-03）：内置清单之外由用户新增的任意工具 */
export interface CustomAgent {
  key: string;
  name: string;
  /** 全局 skill 目录（绝对路径或 ~/ 开头） */
  globalDir: string;
  /** 项目级相对目录，可空 */
  projectDir?: string;
  /** 目录为嵌套分类结构，需递归发现 SKILL.md */
  recursive?: boolean;
}

export interface AgentOverride {
  globalDir?: string;
  projectDir?: string;
  sync?: SyncMode;
  /** 每条 (skill, Agent) 关系的同步策略覆盖，键为 skill 名（SY-01） */
  skillSync?: Record<string, SyncMode>;
  /**
   * 关联的预设：记录「该目录应用哪套预设」的决策。
   * 仅作一次性「应用」的记忆，不再推导期望集，也不再自动同步补回。
   */
  preset?: string;
  /**
   * 显式指定该 Agent 为其技能目录的主 Agent（AG-02 / C18）。
   * 同一目录至多一个；未指定时按「活跃优先、其次名称序」自动判定。
   */
  primary?: boolean;
}

/**
 * 预设：一组命名的技能集合（显式成员 ∪ 关联标签命中）。
 * 不设「启用开关」——预设就是决策本身，成员或标签一变即刻进入期望集并分发到活跃 Agent；
 * 非活跃 Agent 不自动跟随，可在其详情页手动同步（手动操作即时生效）。
 */
export interface Preset {
  name: string;
  /** skill id（name@来源） */
  skills: string[];
  /** 关联标签：打有这些标签的 skill 一并纳入本预设（PR-05） */
  tags: string[];
}

export interface SkillMeta {
  tags: string[];
  /** 合并仲裁后保留来源（POST /skills/merge 记录归属） */
  mergeSource?: string;
  /** 来源追溯：收编自哪个 Agent / 外部目录（IM-04） */
  origin?: string;
}

export interface ProjectLink {
  path: string;
  /** 标签=投放策略 */
  tags: string[];
}

export interface HubConfig {
  schemaVersion: number;
  repos: Repo[];
  foreignSources: ForeignSource[];
  /** 用户自定义 Agent（AG-03） */
  customAgents: CustomAgent[];
  agents: Record<string, AgentOverride>;
  activeAgents: string[];
  presets: Preset[];
  skillMeta: Record<string, SkillMeta>;
  projects: ProjectLink[];
  defaultSync: SyncMode;
  /** 复制模式下的目录级 watcher 开关（SY-04）；PRD 要求可选、默认关闭 */
  watchers: boolean;
}

export const emptyConfig = (): HubConfig => ({
  schemaVersion: 3,
  repos: [],
  foreignSources: [],
  customAgents: [],
  agents: {},
  activeAgents: [],
  presets: [],
  skillMeta: {},
  projects: [],
  defaultSync: 'symlink',
  watchers: false,
});
