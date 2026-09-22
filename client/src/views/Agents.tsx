import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AgentView, type AgentSkillsResp, type PresetView, type SkillAction, type SkillCardView, type StateView, type SyncResult } from '../api/types';
import SkillList from '../components/skill/SkillList';
import CollectSkillModal, { agentCollectSource } from '../components/skill/CollectSkillModal';
import { skillViewToCard } from '../components/skill/adapters';
import { isToolManaged, skillBadgeLegend } from '../components/skill/SkillBadges';
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
import OpenStandardTitle from '../components/agent/OpenStandardTitle';
import { AddAgentModal } from '../components/agent/AddAgentModal';
import { groupAgentsByDir, type AgentGroup } from '../components/agent/agentGroups';
import {
  agentBadgeLegend,
  activeBadge,
  customBadge,
  familyBadge,
  notInstalledBadge,
  openStandardBadge,
  openStandardBadgeForAgent,
  presetBadge,
  readsAgentsDir,
} from '../components/agent/agentBadges';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { useViewMode } from '../state/viewMode';
import { useCollapsed } from '../state/collapse';
import { navigate, useQueryFlag, useQueryParam, useRoute } from '../state/router';
import { joinList, rich, useI18n } from '../i18n';

/**
 * 本工具是否已把该技能装到本目录（= 在分发名单内且已落盘）。
 * 状态列只说明「这个目录里装没装」，自带目录 / 外部软链同样算「装着」——
 * 但它们不在本工具的分发名单里，开关不能拿它们当「已开启」。
 */
const deployedByTool = (row?: SkillCardView) => !!row && row.state === 'on' && isToolManaged(row);

/**
 * 该卡片是不是开源生态推荐目录（`~/.agents/skills`）：生态里被采纳得最广的共享技能目录。
 * 这类卡片换一套强调色突出，并在「活跃 / 非活跃」各自分组里都排第一；
 * `~/.config/agents/skills` 等其它共用目录与普通目录一样正常展示。
 */
const isStandardGroup = (g: AgentGroup) => readsAgentsDir(g.primary.shared) && !!g.primary.sharedOwn;

export default function Agents() {
  const { data, loading, error, reload } = useAsync<AgentView[]>(() => api('/agents'));
  const { t } = useI18n();
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
    return groups
      .filter((g) => {
        if (onlyInstalled && !g.installed) return false;
        if (!kw) return true;
        return `${g.names.join(' ')} ${g.keys.join(' ')} ${g.dir}`.toLowerCase().includes(kw);
      })
      // 共享标准目录排在「活跃 / 非活跃」各自分组的第一位；同组其余保持原有顺序
      .sort(
        (a, b) =>
          Number(b.anyActive) - Number(a.anyActive) ||
          Number(isStandardGroup(b)) - Number(isStandardGroup(a))
      );
  }, [groups, q, onlyInstalled]);
  const filtered = !!q.trim() || onlyInstalled;
  const [viewMode, setViewMode] = useViewMode();

  // 同一目录的其它 Agent（详情页里互相跳转用）
  const siblings: AgentView[] = selected
    ? (data ?? []).filter((a) => a.globalDir === selected.globalDir && a.key !== selected.key)
    : [];

  const items: EntityItem[] = shown.map((g) => {
    const { primary } = g;
    // 开源生态推荐目录：换色突出，主标题直接讲清「这是开源生态推荐目录」，
    // 使用它的 Agent（Codex / Warp / OpenHands…）退到副标题并弱化，活跃状态仍由右上角徽标表达。
    if (isStandardGroup(g)) {
      return {
        id: g.dir,
        variant: 'standard' as const,
        title: <OpenStandardTitle label={t('agents.openStandard.title')} tip={t('agents.openStandard.tip')} />,
        sub: <AgentNamesTitle agents={g.agents} onOpen={openAgent} quiet />,
        desc: <span className="mono">{g.dir}</span>,
        status: activeBadge(t, { active: g.anyActive }),
        badges: (
          <>
            {customBadge(t, primary)}
            {presetBadge(t, primary.preset ?? null)}
            {!g.installed && notInstalledBadge(t)}
          </>
        ),
        onClick: () => openAgent(primary.key),
        muted: !g.anyActive,
      };
    }
    return {
      id: g.dir,
      // 标题罗列使用该目录的全部 Agent —— 它们都是真实的 Agent，不把谁叫「别名」；
      // 每个名字可单独点开自己的详情，卡片空白处仍进主 Agent
      title: <AgentNamesTitle agents={g.agents} onOpen={openAgent} />,
      sub: <span className="mono">{g.keys.join(' / ')}</span>,
      desc: <span className="mono">{g.dir}</span>,
      status: activeBadge(t, { active: g.anyActive }),
      // 一个目录只有一套策略，同目录的 Agent 共用它（系统内存于主 Agent 名下）
      badges: (
        <>
          {customBadge(t, primary)}
          {presetBadge(t, primary.preset ?? null)}
          {!g.installed && notInstalledBadge(t)}
        </>
      ),
      onClick: () => openAgent(primary.key),
      muted: !g.anyActive,
    };
  });

  return (
    <>
      <PageHeader
        title={t('nav.agents')}
        sub={data ? t('agents.subtitle', { dirs: groups.length, agents: data.length }) : undefined}
        actions={<>
          <Button variant="ghost" onClick={reload}>{t('common.refresh')}</Button>
          <Button onClick={() => setAddOpen(true)} title={t('agents.addCustom.title')}>{t('agents.addCustom')}</Button>
        </>}
      />
      {selectedKey ? (
        selected ? (
          <AgentDetail agent={selected} siblings={siblings} onOpenAgent={openAgent} onBack={backToList} onChanged={reload} />
        ) : (
          <LoadingBoundary
            state={{ loading, error, data }}
            empty={{ title: t('agents.notFound.title'), hint: t('agents.notFound.hint', { key: selectedKey }), icon: '◉' }}
          >
            {() => null}
          </LoadingBoundary>
        )
      ) : (
        <>
          <div className="panel">
            <FilterBar
              search={{ value: q, onChange: setQ, placeholder: t('filter.searchAgent') }}
              controls={<SwitchLabel checked={onlyInstalled} onChange={setOnlyInstalled}>{t('agents.onlyInstalled')}</SwitchLabel>}
              hasFilters={filtered}
              onReset={() => { setQ(''); setOnlyInstalled(false); }}
              actions={
                <BadgeLegend
                  title={t('agents.legend.title')}
                  items={agentBadgeLegend(t)}
                  intro={rich(t('agents.legend.intro'))}
                />
              }
              view={{ value: viewMode, onChange: setViewMode }}
            />
          </div>
          <LoadingBoundary
            state={{ loading, error, data }}
            empty={{ title: t('agents.empty.title'), hint: t('agents.empty.hint'), icon: '◉' }}
          >
            {() => (
              <EntityList
                items={items}
                title={`${filtered ? t('list.filtered') : t('list.allSkillDirs')} · ${items.length}${filtered ? ` / ${groups.length}` : ''}`}
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
  const { t, lang } = useI18n();
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
  // 归集到仓库：与技能库「从 Agent 归集」同源（同一 preview + 同一 collect 接口）。
  // 弹窗本体与项目页共用（CollectSkillModal），这里只提供「Agent 目录」这个来源适配器。
  const [collectItem, setCollectItem] = useState<SkillCardView | null>(null);
  const collectApi = useMemo(() => agentCollectSource(agent.key, agent.name), [agent.key, agent.name]);

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
      toast.push(t('agents.synced'), 'good');
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
      if (failed > 0) toast.push(t('agents.sync.failed', { n: failed }), 'bad');
      else toast.push(t('agents.sync.done', { created: res.created.length, removed: res.removed.length }), 'good');
      for (const w of res.warnings ?? []) toast.push(w, 'bad');
      reload();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setSyncing(false); }
  };

  const handleAction = (item: SkillCardView, action: SkillAction) => {
    // 归集需要选目标仓库，交给共用的归集弹窗处理
    if (action.kind === 'collect') {
      setCollectItem(item);
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
    if (!window.confirm(t('agents.deleteConfirm', { name: agent.name }))) return;
    try {
      await api(`/agents/custom/${encodeURIComponent(agent.key)}`, { method: 'DELETE' });
      toast.push(t('agents.deletedCustom'), 'good');
      onChanged();
      onBack();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  // 「安装方式」只对由本工具分发的技能有意义：自带 / 外部软链 / 共享目录读取不参与
  const managed = (data?.skills ?? []).filter((s) => s.state === 'on' && isToolManaged(s));

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
    status: <Badge tone="bad">{t('agents.failed')}</Badge>,
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
        if (deployedByTool(rowsByName.get(k)) === d[k]) { dropped = true; continue; }
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
      const on = draftOn[s.name] ?? deployedByTool(row);
      const card = skillViewToCard(s);
      card.state = on ? 'on' : 'off';
      card.toggleOn = on;
      if (row?.reason === 'preset') {
        card.reason = 'preset';
        card.reasonLabel = t('badge.reason.preset');
        card.reasonTitle = t('agents.presetReason.title', { preset: row.preset ?? agent.preset ?? '' });
      }
      if (on && row) card.store = row.store;
      card.preset = row?.preset;
      return card;
    }),
    [library, rowsByName, draftOn, agent.preset, t]
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
    library.forEach((s) => s.tags?.forEach((tag) => { m[tag] = (m[tag] ?? 0) + 1; }));
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
      if (facets.length > 0 && !facets.some((tag) => c.tags.includes(tag))) return false;
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
        if ((s.tags ?? []).some((tag) => tagSet.has(tag))) { seen.add(s.name); out.push(s.name); }
      }
    }
    return out;
  }, [activePreset, library]);

  const enabledRows = data?.skills ?? [];
  const enabledViaPreset = enabledRows.filter((s) => s.state === 'on' && s.reason === 'preset').length;
  const enabledDirect = enabledRows.filter((s) => s.state === 'on' && s.reason === 'manual').length;

  // 多目录 Agent：给每行技能补上「来自哪个目录」的徽标，直接显示目录本身（单目录时无需展示，避免噪音）
  const sharedDir = agent.sharedDir && agent.sharedDir !== agent.globalDir ? agent.sharedDir : undefined;
  // 是否读取 `~/.agents/skills`：用于在「技能目录」行把「开源生态推荐目录」标在该目录本身
  const readsAgents = readsAgentsDir(agent.shared);
  // 目录展示：home 前缀压成 ~，更短好读；拿不到 home 就原样展示绝对路径
  const shortDir = (p: string): string => (state?.home && p.startsWith(`${state.home}/`) ? `~${p.slice(state.home.length)}` : p);
  const withDir = (items: SkillCardView[]): SkillCardView[] => {
    if (!sharedDir) return items;
    return items.map((s) => (s.fromDir
      ? { ...s, dirLabel: shortDir(s.fromDir), dirTitle: t('agents.skillDirs.title') + ` (${s.fromDir})` }
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
        aria-label={t('agents.installModeAria', { name: s.name })}
        value={agent.skillSync?.[s.name] ?? agent.sync}
        onChange={(e) => setSkillSync(s.name, e.target.value as 'symlink' | 'copy')}
      >
        <option value="symlink">{t('agents.install.symlink')}</option>
        <option value="copy">{t('agents.install.copy')}</option>
      </FieldSelect>
    ),
  }));

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>{t('common.back')}</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{agent.name}</h2>
        {activeBadge(t, agent)}
        {siblings.length > 0 && (isAlias
          ? <Badge tone="info" title={t('agents.alias.body', { name: primaryAgent?.name ?? agent.primaryKey })}>{t('agents.skillDirs')}</Badge>
          : <Badge tone="accent" title={t('agents.install.strategyHint')}>{t('agents.install.strategy')}</Badge>)}
        {familyBadge(t, agent)}
        {customBadge(t, agent)}
        {openStandardBadgeForAgent(t, agent)}
        <div className="detail-actions">
          <Button size="sm" variant={agent.active ? 'ghost' : 'primary'} onClick={toggleActive} title={t('agents.active.toggle.title')}>
            {agent.active ? t('agents.deactivate') : t('agents.activate')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDirOpen(true)} title={t('agents.dirs.title')}>
            {t('agents.dirs')}
          </Button>
          <Button size="sm" variant="primary" loading={syncing} onClick={() => void runSync()} title={t('agents.sync.title')}>{t('agents.sync')}</Button>
          {agent.custom && (
            <Button size="sm" variant="danger" onClick={() => void deleteAgent()} title={t('agents.delete.title')}>
              {t('common.delete')}
            </Button>
          )}
        </div>
      </div>

      {!agent.active && (
        <div className="notice">
          <span className="notice__title">{t('agents.inactive.title')}</span>
          <span className="notice__body">
            {activeSiblings.length > 0
              ? t('agents.inactive.bodySiblings', { names: joinList(activeSiblings) })
              : t('agents.inactive.bodyAlone')}
          </span>
        </div>
      )}

      {isAlias && (
        <div className="notice">
          <span className="notice__title">{t('agents.alias.title', { name: primaryAgent?.name ?? agent.primaryKey })}</span>
          <span className="notice__body">
            {rich(t('agents.alias.body', { name: primaryAgent?.name ?? agent.primaryKey }))}
          </span>
        </div>
      )}

      <section className="detail-section">
        <h3 className="section-head section-head--quiet">
          <span className="section-head__label">{t('agents.currentSkills')}</span>
          <span className="section-head__rule" aria-hidden="true" />
          <span className="section-head__note">{t('agents.currentSkills.note')}</span>
        </h3>

        <div className="panel panel--quiet">
          <div className="panel__hint" style={{ marginBottom: 'var(--sp-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            <span title={t('agents.skillDirs.title')}>
              {t('agents.skillDirs')}{' '}
              {[agent.globalDir, ...(sharedDir ? [sharedDir] : [])].map((d, i) => (
                <span key={d}>
                  {i > 0 && <span className="mono">{lang === 'zh' ? '、' : ', '}</span>}
                  <span className="mono">{shortDir(d)}</span>
                  {/* 「开源生态推荐目录」只标在 `~/.agents/skills` 这个目录本身 */}
                  {readsAgents && d === agent.sharedDir ? (
                    <span style={{ marginLeft: 'var(--sp-1)' }}>{openStandardBadge(t)}</span>
                  ) : null}
                </span>
              ))}
            </span>
            {agent.project && <span className="mono">{t('agents.project', { path: agent.project })}</span>}
            {agent.alsoUsedBy?.length ? <span>{t('agents.alsoUsedBy', { names: joinList(agent.alsoUsedBy) })}</span> : null}
            {siblings.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
                {t('agents.sharedWith.pre')}
                {siblings.map((o) => (
                  <Tag key={o.key} onClick={() => onOpenAgent(o.key)}>{o.name}</Tag>
                ))}
                {t('agents.sharedWith.post')}
              </span>
            )}
          </div>
          <LoadingBoundary state={{ loading, error, data }} empty={{ title: t('agents.noSkills'), icon: '○' }}>
            {(resp) => (
              <SkillList
                title={t('agents.currentSkillsCount', { n: resp.skills.length })}
                items={withDir(resp.skills)}
                onAction={handleAction}
                hideToggle
              />
            )}
          </LoadingBoundary>
        </div>

        {lastSync && lastSync.failed.length > 0 && (
          <div className="panel">
            <EntityList title={t('agents.syncFailedItems')} items={failedItems} />
          </div>
        )}
      </section>

      <section className="detail-section">
        <h3 className="section-head">
          <span className="section-head__label">{t('agents.section.control')}</span>
          <span className="section-head__rule" aria-hidden="true" />
          <span className="section-head__note">{t('agents.section.control.note')}</span>
        </h3>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">{t('agents.preset.section')}</span>
            <Badge tone={enabledViaPreset ? 'accent' : 'neutral'} title={t('agents.preset.badge.title')}>{t('common.skillCount', { n: enabledViaPreset })}</Badge>
            <FoldButton expanded={!presetCollapsed} label={t('agents.preset.section')} onClick={togglePresetCollapsed} />
          </div>
          {!presetCollapsed && (
            <>
              <p className="panel__hint">
                {t('agents.preset.hint')}
              </p>
              <FieldSelect
                label={t('agents.preset.section')}
                value={agent.preset ?? ''}
                hint={t('agents.preset.fieldHint')}
                onChange={(e) => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ preset: e.target.value || null }) }))}
              >
                <option value="">{t('agents.preset.none')}</option>
                {(presets ?? []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </FieldSelect>
              {agent.preset && (
                <div style={{ marginTop: 'var(--sp-3)' }}>
                  <p className="panel__hint" style={{ marginBottom: 'var(--sp-2)' }}>
                    {t('agents.preset.brings', { n: presetSkillNames.length })}
                    {activePreset?.tags.length ? t('agents.preset.bringsTags', { t: activePreset.tags.length }) : ''}
                  </p>
                  {presetSkillNames.length === 0 ? (
                    <EmptyState title={t('agents.preset.empty.title')} hint={t('agents.preset.empty.hint')} />
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
            <span className="panel__title">{t('agents.direct.section')}</span>
            <Badge tone={enabledDirect ? 'accent' : 'neutral'} title={t('agents.direct.badge.title')}>{t('common.skillCount', { n: enabledDirect })}</Badge>
          </div>
          <p className="panel__hint">
            {t('agents.direct.hint')}
          </p>
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: t('filter.searchSkills') }}
            controls={
              <>
                <MultiSelect
                  label={t('filter.source')}
                  options={allSources.map((s) => ({ label: s, value: s, count: sourceCounts[s] }))}
                  selected={activeSrcs}
                  onChange={setSrcs}
                  emptyHint={t('agents.source.empty')}
                />
                <MultiSelect
                  label={t('filter.tags')}
                  options={allTags.map((tag) => ({ label: tag, value: tag, count: tagCounts[tag] }))}
                  selected={facets}
                  onChange={setFacets}
                  emptyHint={t('agents.tags.empty')}
                />
              </>
            }
            hasFilters={directFiltered}
            onReset={() => { setQ(''); setSrcs(null); setFacets([]); }}
            actions={
              <BadgeLegend
                title={t('agents.legend.skill.title')}
                items={skillBadgeLegend(t)}
                intro={t('agents.legend.skill.intro')}
              />
            }
            view={{ value: viewMode, onChange: setViewMode }}
          />
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <SkillList
              title={`${directFiltered ? t('list.filtered') : t('nav.library')} · ${shownDirect.length}${directFiltered ? ` / ${directCards.length}` : ''}`}
              items={shownDirect}
              onToggle={(item) => toggleDirect(item.name, !(item.toggleOn ?? item.state === 'on'))}
              hideToggle
              collapsible
              storageKey="lsh.collapsed.agent.direct"
              empty={directFiltered
                ? <EmptyState title={t('agents.list.empty')} />
                : <EmptyState title={t('agents.libraryEmpty.title')} hint={t('agents.libraryEmpty.hint')} />}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">{t('agents.install.section')}</span>
            <FoldButton expanded={!installCollapsed} label={t('agents.install.section')} onClick={toggleInstallCollapsed} />
          </div>
          {!installCollapsed && (
            <>
              <p className="panel__hint">
                {t('agents.install.hint')}
                {siblings.length > 0 ? t('agents.install.hintSiblings') : ''}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--sp-3)' }}>
                <FieldSelect
                  label={t('agents.install.default')}
                  value={agent.sync}
                  hint={t('agents.install.defaultHint')}
                  onChange={(e) => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ sync: e.target.value }) }))}
                >
                  <option value="symlink">{t('agents.install.symlink')}</option>
                  <option value="copy">{t('agents.install.copy')}</option>
                </FieldSelect>
                {siblings.length > 0 && (
                  <FieldSelect
                    label={t('agents.install.strategy')}
                    value={designatedKey}
                    hint={t('agents.install.strategyHint')}
                    onChange={(e) => setPrimaryAgent(e.target.value)}
                  >
                    <option value="auto">{t('agents.install.auto')}</option>
                    {members.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                  </FieldSelect>
                )}
              </div>
              <div style={{ marginTop: 'var(--sp-4)' }}>
                <EntityList
                  title={t('agents.install.perSkill')}
                  items={syncModeItems}
                  empty={<EmptyState title={t('agents.install.noneEnabled')} />}
                  toggle={false}
                />
              </div>
            </>
          )}
        </div>
      </section>

      <CollectSkillModal
        item={collectItem}
        source={collectApi}
        onClose={() => setCollectItem(null)}
        onDone={() => { setCollectItem(null); reload(); onChanged(); }}
      />

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
  const { t } = useI18n();
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
      toast.push(t('agents.dir.overridden'), 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title={t('agents.dir.title', { name: agent.name })}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} onClick={save}>{t('common.save')}</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <PathField label={t('agents.dir.global')} value={globalDir} onChange={setGlobalDir} />
        <FieldInput
          label={t('agents.dir.project')}
          hint={t('agents.dir.projectHint')}
          value={projectDir}
          onChange={(e) => setProjectDir(e.target.value)}
        />
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{t('agents.dir.note')}</span>
      </div>
    </Modal>
  );
}
