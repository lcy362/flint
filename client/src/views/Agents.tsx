import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AgentView, type AgentSkillsResp, type PresetView, type SkillAction, type SkillCardView, type StateView, type SyncResult } from '../api/types';
import SkillList from '../components/skill/SkillList';
import { skillViewToCard } from '../components/skill/adapters';
import { SKILL_BADGE_LEGEND } from '../components/skill/SkillBadges';
import EntityList, { type EntityItem } from '../components/common/EntityList';
import FilterBar from '../components/common/FilterBar';
import FoldButton from '../components/common/FoldButton';
import MultiSelect from '../components/ui/MultiSelect';
import SwitchLabel from '../components/ui/SwitchLabel';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Modal from '../components/ui/Modal';
import { FieldInput, FieldSelect } from '../components/ui/Field';
import { PathField } from '../components/ui/PathField';
import Tag from '../components/ui/Tag';
import BadgeLegend from '../components/common/BadgeLegend';
import AgentNamesTitle from '../components/agent/AgentNamesTitle';
import { AddAgentModal } from '../components/agent/AddAgentModal';
import { groupAgentsByDir } from '../components/agent/agentGroups';
import {
  AGENT_BADGE_LEGEND,
  activeBadge,
  customBadge,
  familyBadge,
  notInstalledBadge,
  presetBadge,
  sharedReadBadge,
} from '../components/agent/agentBadges';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { useViewMode } from '../state/viewMode';
import { useCollapsed } from '../state/collapse';
import { navigate, useQueryFlag, useQueryParam, useRoute } from '../state/router';

export default function Agents() {
  const { data, loading, error, reload } = useAsync<AgentView[]>(() => api('/agents'));
  const route = useRoute();
  const [q, setQ] = useQueryParam('q');
  const [onlyInstalled, setOnlyInstalled] = useQueryFlag('installed');
  const [addOpen, setAddOpen] = useState(false);

  // 详情页由地址决定：直达 / 刷新都能稳定回到同一个 Agent
  const selectedKey = route.sub;
  const selected = selectedKey ? (data ?? []).find((a) => a.key === selectedKey) : null;
  const openAgent = (key: string) => navigate({ ...route, sub: key });
  const backToList = () => navigate({ ...route, sub: null });

  // 一个实际技能目录一张卡片：同目录的多个 Agent 收进同一张卡
  const groups = useMemo(() => groupAgentsByDir(data ?? []), [data]);
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (onlyInstalled && !g.installed) return false;
      if (!kw) return true;
      return `${g.names.join(' ')} ${g.keys.join(' ')} ${g.dir}`.toLowerCase().includes(kw);
    });
  }, [groups, q, onlyInstalled]);
  const filtered = !!q.trim() || onlyInstalled;
  const [viewMode, setViewMode] = useViewMode();

  // 同一目录的其它 Agent（详情页里互相跳转用）
  const siblings: AgentView[] = selected
    ? (data ?? []).filter((a) => a.globalDir === selected.globalDir && a.key !== selected.key)
    : [];

  const items: EntityItem[] = shown.map((g) => {
    const { primary } = g;
    return {
      id: g.dir,
      // 标题罗列使用该目录的全部 Agent —— 它们都是真实的 Agent，不把谁叫「别名」；
      // 每个名字可单独点开自己的详情，卡片空白处仍进主 Agent
      title: <AgentNamesTitle agents={g.agents} onOpen={openAgent} />,
      sub: <span className="mono">{g.keys.join(' / ')}</span>,
      desc: <span className="mono">{g.dir}</span>,
      status: activeBadge({ active: g.anyActive }),
      // 一个目录只有一套策略，同目录的 Agent 共用它（系统内存于主 Agent 名下）
      badges: (
        <>
          {customBadge(primary)}
          {!primary.sharedOwn && sharedReadBadge(primary)}
          {presetBadge(primary.preset ?? null)}
          {!g.installed && notInstalledBadge()}
        </>
      ),
      onClick: () => openAgent(primary.key),
      muted: !g.anyActive,
    };
  });

  return (
    <>
      <PageHeader
        title="智能体"
        sub={data ? `共 ${groups.length} 个技能目录 · ${data.length} 个 Agent` : undefined}
        actions={<>
          <Button variant="ghost" onClick={reload}>刷新</Button>
          <Button onClick={() => setAddOpen(true)} title="新增一个内置清单之外的自定义 Agent">新增自定义 Agent</Button>
        </>}
      />
      {selectedKey ? (
        selected ? (
          <AgentDetail agent={selected} siblings={siblings} onOpenAgent={openAgent} onBack={backToList} onChanged={reload} />
        ) : (
          <LoadingBoundary
            state={{ loading, error, data }}
            empty={{ title: '未找到该 Agent', hint: `没有 key 为「${selectedKey}」的 Agent。`, icon: '◉' }}
          >
            {() => null}
          </LoadingBoundary>
        )
      ) : (
        <>
          <div className="panel">
            <FilterBar
              search={{ value: q, onChange: setQ, placeholder: '搜索名称 / key / 目录' }}
              controls={<SwitchLabel checked={onlyInstalled} onChange={setOnlyInstalled}>只看已安装</SwitchLabel>}
              hasFilters={filtered}
              onReset={() => { setQ(''); setOnlyInstalled(false); }}
              actions={
                <BadgeLegend
                  title="卡片上的标签是什么意思？"
                  items={AGENT_BADGE_LEGEND}
                  intro={
                    <>
                      每张卡片对应一个<strong>实际的技能目录</strong>。多个 Agent 用同一个目录时合成一张卡：标题罗列这些 Agent（可逐个点开各自详情），它们<strong>共用同一套策略</strong>——一个目录只有一套设置，无所谓"归谁"；系统内这套设置存在其中一个 Agent 名下（只是存放位置，可在 Agent 详情页更换）。
                    </>
                  }
                />
              }
              view={{ value: viewMode, onChange: setViewMode }}
            />
          </div>
          <LoadingBoundary
            state={{ loading, error, data }}
            empty={{ title: '暂无 Agent', hint: '系统中尚未登记任何 Agent。', icon: '◉' }}
          >
            {() => (
              <EntityList
                items={items}
                title={`${filtered ? '筛选结果' : '全部技能目录'} · ${items.length}${filtered ? ` / ${groups.length}` : ''}`}
                hideToggle
              />
            )}
          </LoadingBoundary>
        </>
      )}
      <AddAgentModal open={addOpen} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reload(); }} />
    </>
  );
}

function AgentDetail({ agent, siblings, onOpenAgent, onBack, onChanged }: {
  agent: AgentView;
  /** 与它指向同一技能目录的其它 Agent */
  siblings: AgentView[];
  onOpenAgent: (key: string) => void;
  onBack: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync<AgentSkillsResp>(
    () => api(`/agents/${encodeURIComponent(agent.key)}/skills`),
    [agent.key]
  );
  const { data: presets } = useAsync<PresetView[]>(() => api('/presets'));
  const { data: state } = useAsync<StateView>(() => api('/state'));
  const [dirOpen, setDirOpen] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  // 归集到仓库：待归集的技能 + 选定的目标仓库 + 是否顺带接管
  const [collectItem, setCollectItem] = useState<SkillCardView | null>(null);
  const [collectRepo, setCollectRepo] = useState('');
  const [collectTakeover, setCollectTakeover] = useState(false);
  const [collecting, setCollecting] = useState(false);

  // 直接添加技能：本地草稿（乐观更新）+ 串行提交，连点开关时不丢操作、不后发先至
  const [draftOn, setDraftOn] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  /** 来源筛选：null = 用默认值（只选自有仓库），[] = 不按来源筛，[...] = 只留这些来源 */
  const [srcs, setSrcs] = useState<string[] | null>(null);
  const [facets, setFacets] = useState<string[]>([]);
  const [viewMode, setViewMode] = useViewMode();
  const [presetCollapsed, togglePresetCollapsed] = useCollapsed('lsh.collapsed.agent.preset');
  const [installCollapsed, toggleInstallCollapsed] = useCollapsed('lsh.collapsed.agent.install', true);
  const directQueue = useRef<Promise<void>>(Promise.resolve());

  const busy = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      // 非活跃 Agent 的显式改动由服务端就地同步，因此与活跃态一样是「已同步」
      toast.push('已更新并同步', 'good');
      reload();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await api<SyncResult>(`/agents/${encodeURIComponent(agent.key)}/sync`, { method: 'POST' });
      setLastSync(res);
      const failed = res.failed?.length ?? 0;
      if (failed > 0) toast.push(`同步完成，但有 ${failed} 项失败`, 'bad');
      else toast.push(`已同步：新增 ${res.created.length} / 移除 ${res.removed.length}`, 'good');
      for (const w of res.warnings ?? []) toast.push(w, 'bad');
      reload();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setSyncing(false); }
  };

  const handleAction = (item: SkillCardView, action: SkillAction) => {
    // 归集需要选目标仓库，交给弹窗处理
    if (action.kind === 'collect') {
      setCollectItem(item);
      setCollectTakeover(false);
      setCollectRepo((prev) => prev || (state?.repos ?? [])[0]?.id || '');
      return;
    }
    void busy(async () => {
      if (action.kind === 'delete') {
        await api(`/agents/${encodeURIComponent(agent.key)}/skills/${encodeURIComponent(item.name)}`, { method: 'DELETE' });
        return;
      }
      await api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: item.state !== 'on' }) });
    });
  };

  // 归集到仓库：把该技能复制进选定仓库（源目录不动）；勾选「同时接管」时再把它换成指向仓库副本的软链
  const runCollect = async () => {
    if (!collectItem || !collectRepo) return;
    const name = collectItem.name;
    setCollecting(true);
    try {
      const res = await api<{ collected: string[]; skipped: string[] }>(
        `/repos/${encodeURIComponent(collectRepo)}/collect`,
        { method: 'POST', body: JSON.stringify({ agentKey: agent.key, names: [name] }) }
      );
      if (res.collected.length) toast.push(`已归集「${name}」到仓库`, 'good');
      else toast.push(`未复制到仓库：${res.skipped.join('；') || '无变化'}`, 'bad');

      if (collectTakeover) {
        const t = await api<{ linked: boolean; reason?: string }>(
          `/repos/${encodeURIComponent(collectRepo)}/takeover`,
          { method: 'POST', body: JSON.stringify({ agentKey: agent.key, name, confirm: true }) }
        );
        if (!t.linked) {
          toast.push(`接管未完成：${t.reason ?? '未知原因'}`, 'bad');
        } else {
          toast.push('已接管：本目录已改为指向仓库副本的软链', 'good');
          // 登记为该 Agent 的启用项，之后由本工具维护它
          await api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: name, on: true }) });
        }
      }
      setCollectItem(null);
      reload();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setCollecting(false); }
  };

  // 每 (skill, Agent) 关系的同步策略（SY-01）
  const setSkillSync = (name: string, mode: 'symlink' | 'copy') =>
    void busy(() =>
      api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skillSync: { [name]: mode } }) })
    );

  const toggleActive = () => void busy(async () => {
    const res = await api<string[]>('/activeAgents');
    const next = agent.active ? res.filter((k) => k !== agent.key) : [...res, agent.key];
    await api('/activeAgents', { method: 'PUT', body: JSON.stringify(next) });
  });

  // 自定义 Agent（AG-03）：删除后回到列表并刷新
  const deleteAgent = async () => {
    if (!window.confirm(`确定删除自定义 Agent「${agent.name}」？此操作不可撤销。`)) return;
    try {
      await api(`/agents/custom/${encodeURIComponent(agent.key)}`, { method: 'DELETE' });
      toast.push('已删除自定义 Agent', 'good');
      onChanged();
      onBack();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const managed = (data?.skills ?? []).filter((s) => s.state === 'on');

  // 它与别的 Agent 共用同一个目录（不是主 Agent）：目录只有一份，预设 / 安装方式都落在主 Agent 上
  const isAlias = agent.key !== agent.primaryKey;
  const primaryAgent = siblings.find((o) => o.key === agent.primaryKey);
  // 该目录的全部成员；主 Agent 可显式指定（AG-02），未指定则按活跃 / 名称自动判定
  const members = [agent, ...siblings];
  const designatedKey = members.find((m) => m.primaryExplicit)?.key ?? 'auto';
  // 同目录里活跃的其它成员：它们让这个目录持续自动同步，即使本 Agent 自己不活跃
  const activeSiblings = siblings.filter((o) => o.active).map((o) => o.name);
  const setPrimaryAgent = (v: string) =>
    void busy(() =>
      v === 'auto'
        ? api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ primary: null }) })
        : api(`/agents/${encodeURIComponent(v)}`, { method: 'PUT', body: JSON.stringify({ primary: true }) })
    );

  const failedItems: EntityItem[] = (lastSync?.failed ?? []).map((f) => ({
    id: f.skill,
    title: f.skill,
    sub: f.reason,
    status: <Badge tone="bad">失败</Badge>,
  }));

  // 当前技能行按名字索引：直接添加面板据此判断「是否已装 / 来源」
  const rowsByName = useMemo(() => {
    const m = new Map<string, SkillCardView>();
    for (const r of data?.skills ?? []) m.set(r.name, r);
    return m;
  }, [data]);

  // 服务端已跟上草稿后，丢掉对应草稿，回落到服务端数据（避免草稿长期压制真实状态）
  useEffect(() => {
    setDraftOn((d) => {
      const keys = Object.keys(d);
      if (keys.length === 0) return d;
      const next: Record<string, boolean> = {};
      let dropped = false;
      for (const k of keys) {
        if ((rowsByName.get(k)?.state === 'on') === d[k]) { dropped = true; continue; }
        next[k] = d[k];
      }
      return dropped ? next : d;
    });
  }, [rowsByName]);

  const library = state?.skills ?? [];

  // 技能库全量 → 卡片：开关 = 该技能当前是否装到此 Agent；预设带入的显式标注
  const directCards = useMemo<SkillCardView[]>(
    () => library.map((s) => {
      const row = rowsByName.get(s.name);
      const on = draftOn[s.name] ?? row?.state === 'on';
      const card = skillViewToCard(s);
      card.state = on ? 'on' : 'off';
      card.toggleOn = on;
      if (row?.reason === 'preset') {
        card.reason = 'preset';
        card.reasonLabel = '预设引入';
        card.reasonTitle = `由关联预设「${row.preset ?? agent.preset ?? ''}」带入；在这里关掉可让它只对本 Agent 不生效`;
      }
      if (on && row) card.store = row.store;
      card.preset = row?.preset;
      return card;
    }),
    [library, rowsByName, draftOn, agent.preset]
  );

  const allSources = useMemo(() => [...new Set(library.map((s) => s.source))].sort(), [library]);
  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {};
    library.forEach((s) => { m[s.source] = (m[s.source] ?? 0) + 1; });
    return m;
  }, [library]);
  const allTags = useMemo(() => [...new Set(library.flatMap((s) => s.tags ?? []))].sort(), [library]);
  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    library.forEach((s) => s.tags?.forEach((t) => { m[t] = (m[t] ?? 0) + 1; }));
    return m;
  }, [library]);

  // 来源筛选默认只选中自有仓库（与技能库 / 预设详情一致）；用户没动过就不算「筛选条件」
  const defaultSrcs = useMemo(() => (state?.repos ?? []).map((r) => r.id), [state]);
  const activeSrcs = srcs ?? defaultSrcs;
  const directFiltered = !!(q.trim() || facets.length || (srcs !== null && srcs.length > 0));
  const shownDirect = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return directCards.filter((c) => {
      if (activeSrcs.length > 0 && !activeSrcs.includes(c.source)) return false;
      if (facets.length > 0 && !facets.some((t) => c.tags.includes(t))) return false;
      if (kw) {
        const hay = `${c.name} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [directCards, q, activeSrcs, facets]);

  // 关联预设当前会带入的技能名（显式名单 ∪ 关联标签命中）
  const activePreset = (presets ?? []).find((p) => p.name === agent.preset);
  const presetSkillNames = useMemo(() => {
    if (!activePreset) return [];
    const dirName = (id: string) => { const i = id.lastIndexOf('@'); return i >= 0 ? id.slice(0, i) : id; };
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of activePreset.skills) {
      const n = dirName(id);
      const sk = library.find((s) => s.id === id) ?? library.find((s) => s.name === n);
      if (sk && !seen.has(sk.name)) { seen.add(sk.name); out.push(sk.name); }
    }
    const tagSet = new Set(activePreset.tags);
    if (tagSet.size > 0) {
      for (const s of library) {
        if (seen.has(s.name)) continue;
        if ((s.tags ?? []).some((t) => tagSet.has(t))) { seen.add(s.name); out.push(s.name); }
      }
    }
    return out;
  }, [activePreset, library]);

  const enabledRows = data?.skills ?? [];
  const enabledViaPreset = enabledRows.filter((s) => s.state === 'on' && s.reason === 'preset').length;
  const enabledDirect = enabledRows.filter((s) => s.state === 'on' && s.reason === 'manual').length;

  // 多目录 Agent：给每行技能补上「来自哪个目录」的徽标，直接显示目录本身（单目录时无需展示，避免噪音）
  const sharedDir = agent.sharedDir && agent.sharedDir !== agent.globalDir ? agent.sharedDir : undefined;
  // 目录展示：home 前缀压成 ~，更短好读；拿不到 home 就原样展示绝对路径
  const shortDir = (p: string): string => (state?.home && p.startsWith(`${state.home}/`) ? `~${p.slice(state.home.length)}` : p);
  const withDir = (items: SkillCardView[]): SkillCardView[] => {
    if (!sharedDir) return items;
    return items.map((s) => (s.fromDir
      ? { ...s, dirLabel: shortDir(s.fromDir), dirTitle: `这个技能来自 ${s.fromDir}` }
      : s));
  };

  // 直接添加技能：乐观更新 + 串行提交，成功后再刷新（草稿由 rowsByName 比对自动回收）
  const toggleDirect = (name: string, on: boolean) => {
    setDraftOn((d) => ({ ...d, [name]: on }));
    directQueue.current = directQueue.current.then(async () => {
      try {
        await api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: name, on }) });
      } catch (e) {
        setDraftOn((d) => { const n = { ...d }; delete n[name]; return n; });
        toast.push(e instanceof Error ? e.message : String(e), 'bad');
        return;
      }
      reload();
      onChanged();
    });
  };

  const syncModeItems: EntityItem[] = managed.map((s) => ({
    id: s.id,
    title: s.name,
    sub: <span className="mono">{s.source}</span>,
    actions: (
      <FieldSelect
        aria-label={`${s.name} 安装方式`}
        value={agent.skillSync?.[s.name] ?? agent.sync}
        onChange={(e) => setSkillSync(s.name, e.target.value as 'symlink' | 'copy')}
      >
        <option value="symlink">软链（不复制文件，即时生效）</option>
        <option value="copy">复制（独立副本，需重新同步）</option>
      </FieldSelect>
    ),
  }));

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>← 返回</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{agent.name}</h2>
        {activeBadge(agent)}
        {siblings.length > 0 && (isAlias
          ? <Badge tone="info" title={`它与同目录的其它 Agent 共用同一个技能目录，也共用同一套预设 / 安装方式；系统内这套设置存在「${primaryAgent?.name ?? agent.primaryKey}」名下`}>同目录</Badge>
          : <Badge tone="accent" title="同目录的这些 Agent 共用同一套预设 / 安装方式，系统内这套设置存在本 Agent 名下（只是存放位置，不代表策略归它所有）">策略存于此</Badge>)}
        {familyBadge(agent)}
        {customBadge(agent)}
        {sharedReadBadge(agent)}
        <div className="detail-actions">
          <Button size="sm" variant={agent.active ? 'ghost' : 'primary'} onClick={toggleActive} title="加入/移出活跃集合（加入即刻就位）">
            {agent.active ? '移出活跃' : '设为活跃'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDirOpen(true)} title="覆盖该 Agent 的全局/项目 skill 目录">
            目录
          </Button>
          <Button size="sm" variant="primary" loading={syncing} onClick={() => void runSync()} title="按当前策略补齐缺失技能，并回收本工具自己多部署的软链（不动你的自有内容）">同步</Button>
          {agent.custom && (
            <Button size="sm" variant="danger" onClick={() => void deleteAgent()} title="删除这个自定义 Agent（内置 Agent 不可删除）">
              删除
            </Button>
          )}
        </div>
      </div>

      {!agent.active && (
        <div className="notice">
          <span className="notice__title">未加入活跃集合，不会自动跟随变更</span>
          <span className="notice__body">
            {activeSiblings.length > 0
              ? `这个技能目录还有 ${activeSiblings.join('、')} 在活跃集合里，技能库与预设的变动仍会自动同步进来；你在本页的操作也会立即写入。`
              : '技能库、预设之后的变动不会自动同步到这个目录，需要你在这里点「同步」；你在本页的操作仍会立即写入。想让它持续跟随，点右上角「设为活跃」。'}
          </span>
        </div>
      )}

      {isAlias && (
        <div className="notice">
          <span className="notice__title">它与「{primaryAgent?.name ?? agent.primaryKey}」共用一个技能目录</span>
          <span className="notice__body">
            目录只有一份实体，所以这些 Agent <strong>共用同一套</strong>预设 / 安装方式：在这里改等同在那里改，两边看到的始终一致。
            系统内这套设置存在「{primaryAgent?.name ?? agent.primaryKey}」名下——那只是存放位置，不代表策略归它所有。
          </span>
        </div>
      )}

      <section className="detail-section">
        <h3 className="section-head section-head--quiet">
          <span className="section-head__label">现有技能</span>
          <span className="section-head__rule" aria-hidden="true" />
          <span className="section-head__note">这个目录现在装了什么，只读</span>
        </h3>

        <div className="panel panel--quiet">
          <div className="panel__hint" style={{ marginBottom: 'var(--sp-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            <span title="这个 Agent 会读取这些目录里的技能">
              技能目录 <span className="mono">{[agent.globalDir, ...(sharedDir ? [sharedDir] : [])].map(shortDir).join('、')}</span>
            </span>
            {agent.project && <span className="mono">项目 {agent.project}</span>}
            {agent.alsoUsedBy?.length ? <span>该目录也被 {agent.alsoUsedBy.join('、')} 直接读取，无需单独安装</span> : null}
            {siblings.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
                与
                {siblings.map((o) => (
                  <Tag key={o.key} onClick={() => onOpenAgent(o.key)}>{o.name}</Tag>
                ))}
                指向同一个技能目录：共用同一套策略，分发一次全部生效
              </span>
            )}
          </div>
          <LoadingBoundary state={{ loading, error, data }} empty={{ title: '该 Agent 暂无技能', icon: '○' }}>
            {(resp) => (
              <SkillList
                title={`现有技能（${resp.skills.length}）`}
                items={withDir(resp.skills)}
                onAction={handleAction}
                hideToggle
              />
            )}
          </LoadingBoundary>
        </div>

        {lastSync && lastSync.failed.length > 0 && (
          <div className="panel">
            <EntityList title="同步失败项" items={failedItems} />
          </div>
        )}
      </section>

      <section className="detail-section">
        <h3 className="section-head">
          <span className="section-head__label">技能的控制</span>
          <span className="section-head__rule" aria-hidden="true" />
          <span className="section-head__note">改动立即生效并同步</span>
        </h3>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">关联预设</span>
            <Badge tone={enabledViaPreset ? 'accent' : 'neutral'} title="由关联预设带入、当前已启用的技能数">{enabledViaPreset} 个技能</Badge>
            <FoldButton expanded={!presetCollapsed} label="关联预设" onClick={togglePresetCollapsed} />
          </div>
          {!presetCollapsed && (
            <>
              <p className="panel__hint">
                选一个预设作为分发基准：预设里开启的技能都会装到这个 Agent。不选则只用下方「直接添加技能」单独开启的技能。
              </p>
              <FieldSelect
                label="关联预设"
                value={agent.preset ?? ''}
                hint="改动立即生效并同步"
                onChange={(e) => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ preset: e.target.value || null }) }))}
              >
                <option value="">不使用预设</option>
                {(presets ?? []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </FieldSelect>
              {agent.preset && (
                <div style={{ marginTop: 'var(--sp-3)' }}>
                  <p className="panel__hint" style={{ marginBottom: 'var(--sp-2)' }}>
                    该预设当前会带入 {presetSkillNames.length} 个技能{activePreset?.tags.length ? `（含 ${activePreset.tags.length} 个关联标签命中的技能）` : ''}。
                  </p>
                  {presetSkillNames.length === 0 ? (
                    <EmptyState title="该预设还没有开启任何技能" hint="去「预设」页给它添加技能或关联标签。" />
                  ) : (
                    <div className="skill-pills">
                      {presetSkillNames.map((n) => (
                        <span className="skill-pill" key={n}><span className="skill-pill__name">{n}</span></span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">直接添加技能</span>
            <Badge tone={enabledDirect ? 'accent' : 'neutral'} title="直接开启（不经预设）的技能数">{enabledDirect} 个技能</Badge>
          </div>
          <p className="panel__hint">
            从技能库整体勾选：打开即单独装到这个 Agent（不受上方预设影响），关闭即移除。
            打「预设引入」标记的技能来自关联预设，在这里关掉只对它单独生效。
          </p>
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: '搜索技能名称 / 描述' }}
            controls={
              <>
                <MultiSelect
                  label="来源"
                  options={allSources.map((s) => ({ label: s, value: s, count: sourceCounts[s] }))}
                  selected={activeSrcs}
                  onChange={setSrcs}
                  emptyHint="技能库还没有来源。"
                />
                <MultiSelect
                  label="标签"
                  options={allTags.map((t) => ({ label: t, value: t, count: tagCounts[t] }))}
                  selected={facets}
                  onChange={setFacets}
                  emptyHint="技能都还没有标签。"
                />
              </>
            }
            hasFilters={directFiltered}
            onReset={() => { setQ(''); setSrcs(null); setFacets([]); }}
            actions={
              <BadgeLegend
                title="技能上的标签是什么意思？"
                items={SKILL_BADGE_LEGEND}
                intro={<>开关控制该技能是否装到这个 Agent；徽标说明它的来源与装入目录的形态。</>}
              />
            }
            view={{ value: viewMode, onChange: setViewMode }}
          />
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <SkillList
              title={`${directFiltered ? '筛选结果' : '技能库'} · ${shownDirect.length}${directFiltered ? ` / ${directCards.length}` : ''}`}
              items={shownDirect}
              onToggle={(item) => toggleDirect(item.name, !(item.toggleOn ?? item.state === 'on'))}
              hideToggle
              collapsible
              storageKey="lsh.collapsed.agent.direct"
              empty={directFiltered ? <EmptyState title="没有匹配的技能" /> : <EmptyState title="技能库为空" hint="先在技能库登记并导入技能。" />}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">安装与存放</span>
            <FoldButton expanded={!installCollapsed} label="安装与存放" onClick={toggleInstallCollapsed} />
          </div>
          {!installCollapsed && (
            <>
              <p className="panel__hint">
                「默认安装方式」决定新技能进来时是软链引用还是复制副本，可对单个技能单独覆盖。
                {siblings.length > 0 ? ' 同目录的 Agent 共用同一套设置，「策略存放于」只决定这套设置存在谁名下。' : ''}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--sp-3)' }}>
                <FieldSelect
                  label="默认安装方式"
                  value={agent.sync}
                  hint="可在下方按技能单独覆盖"
                  onChange={(e) => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ sync: e.target.value }) }))}
                >
                  <option value="symlink">软链（不复制文件，即时生效）</option>
                  <option value="copy">复制（独立副本，需重新同步）</option>
                </FieldSelect>
                {siblings.length > 0 && (
                  <FieldSelect
                    label="策略存放于"
                    value={designatedKey}
                    hint="这些 Agent 共用同一套策略；系统内需要存到其中一个 Agent 名下，换到谁名下都不会改变策略内容"
                    onChange={(e) => setPrimaryAgent(e.target.value)}
                  >
                    <option value="auto">自动（活跃优先，其次名称序）</option>
                    {members.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                  </FieldSelect>
                )}
              </div>
              <div style={{ marginTop: 'var(--sp-4)' }}>
                <EntityList
                  title="按技能覆盖安装方式"
                  items={syncModeItems}
                  empty={<EmptyState title="当前没有已启用的技能" />}
                  toggle={false}
                />
              </div>
            </>
          )}
        </div>
      </section>

      <Modal
        open={!!collectItem}
        title="归集到仓库"
        onClose={() => setCollectItem(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCollectItem(null)}>取消</Button>
            <Button variant="primary" loading={collecting} disabled={!collectRepo} onClick={() => void runCollect()}>归集</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <p className="panel__hint" style={{ marginBottom: 0 }}>
            把 <span className="mono">{collectItem?.name}</span> 复制进选定仓库，之后各 Agent / 项目都能共享；
            <strong>本目录里的原技能保持不动</strong>。
          </p>
          {(state?.repos ?? []).length === 0 ? (
            <EmptyState title="还没有登记仓库" hint="先到「技能库」登记一个自有仓库，再来归集。" />
          ) : (
            <FieldSelect label="目标仓库" value={collectRepo} onChange={(e) => setCollectRepo(e.target.value)}>
              {(state?.repos ?? []).map((r) => <option key={r.id} value={r.id}>{r.name || r.id}</option>)}
            </FieldSelect>
          )}

          {collectItem?.reason === 'external' && (
            <p className="panel__hint" style={{ marginBottom: 0 }}>
              注意：本目录里当前是一个指向别处的软链。归集会把<span className="mono">{collectItem.linkTarget}</span>里的内容复制进仓库
              （该外部目录本身不会被改动或删除）。
            </p>
          )}

          <SwitchLabel checked={collectTakeover} onChange={setCollectTakeover}>
            同时接管：把本目录里的技能换成指向仓库副本的软链
          </SwitchLabel>
          {collectTakeover && (
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
              <span>接管在归集完成后执行：</span>
              {collectItem?.reason === 'external' ? (
                <span>· 本目录这条软链改为<strong>指向仓库副本</strong>；它指向的外部目录不受影响，原链接不再保留。</span>
              ) : (
                <span>· 本目录里的这条技能<strong>直接移除</strong>（内容已在仓库副本里，不会丢失）。</span>
              )}
              <span>· 在原位置建立<strong>指向仓库副本的软链</strong>：以后改仓库里这份技能，该 Agent 立刻生效，不再有第二份副本。</span>
              <span>· 该技能<strong>登记为这个 Agent 的启用项</strong>，之后由本工具维护它。</span>
            </div>
          )}
        </div>
      </Modal>

      <DirModal
        open={dirOpen}
        agent={agent}
        onClose={() => setDirOpen(false)}
        onDone={() => { setDirOpen(false); onChanged(); }}
      />
    </>
  );
}

/** Agent 目录覆盖（AG-04 / AG-05） */
function DirModal({ open, agent, onClose, onDone }: { open: boolean; agent: AgentView; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [globalDir, setGlobalDir] = useState(agent.globalDir);
  const [projectDir, setProjectDir] = useState(agent.project ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/agents/${encodeURIComponent(agent.key)}`, {
        method: 'PUT',
        body: JSON.stringify({ globalDir: globalDir.trim() || null, projectDir: projectDir.trim() || null }),
      });
      toast.push('目录已覆盖', 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title={`覆盖目录 · ${agent.name}`}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={save}>保存</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <PathField label="全局技能目录" value={globalDir} onChange={setGlobalDir} />
        <FieldInput
          label="项目级技能目录（相对项目根）"
          hint="相对路径，不支持系统选择器，请手动输入"
          value={projectDir}
          onChange={(e) => setProjectDir(e.target.value)}
        />
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>留空恢复内置约定；覆盖后视为已安装可用。</span>
      </div>
    </Modal>
  );
}
