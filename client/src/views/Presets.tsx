import { useMemo, useRef, useState } from 'react';
import { api, type AgentView, type PresetView, type StateView, type SkillCardView, type SkillView } from '../api/types';
import SkillList from '../components/skill/SkillList';
import { skillViewToCard } from '../components/skill/adapters';
import { skillBadgeLegend } from '../components/skill/SkillBadges';
import EntityList, { type EntityItem } from '../components/common/EntityList';
import BadgeLegend from '../components/common/BadgeLegend';
import FoldButton from '../components/common/FoldButton';
import FilterBar from '../components/common/FilterBar';
import MultiSelect from '../components/ui/MultiSelect';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { notInstalledBadge } from '../components/agent/agentBadges';
import AgentNamesTitle from '../components/agent/AgentNamesTitle';
import { groupAgentsByDir } from '../components/agent/agentGroups';
import Chip from '../components/ui/Chip';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import { FieldInput } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { useViewMode } from '../state/viewMode';
import { useCollapsed } from '../state/collapse';
import { navigate, useRoute } from '../state/router';
import { useI18n } from '../i18n';

/** 技能 id → 部署目录名（与后端 nameOf 一致，用于按技能名归一去重） */
function skillDirName(id: string): string {
  const at = id.lastIndexOf('@');
  return at >= 0 ? id.slice(0, at) : id;
}

/** 预设最终生效的一项技能 */
interface EffectiveSkill {
  /** 部署目录名：同名视为同一个技能（与后端并集口径一致） */
  name: string;
  skill?: SkillView;
  /** 纳入方式：显式枚举 / 由关联标签命中 */
  via: 'explicit' | 'tag';
}

/**
 * 计算预设最终生效的技能集合 = 显式名单 ∪ 关联标签命中的技能。
 * 口径与后端 desiredContext 的基准集合保持一致：按部署目录名归一去重，
 * 且只统计技能库中真实存在的技能（已被删除的引用不会生效）。
 */
function effectiveSkills(preset: PresetView, skills: SkillView[]): EffectiveSkill[] {
  const out: EffectiveSkill[] = [];
  const seen = new Set<string>();
  for (const id of preset.skills) {
    const n = skillDirName(id);
    const sk = skills.find((s) => s.id === id) ?? skills.find((s) => s.name === n);
    if (sk && !seen.has(sk.name)) {
      seen.add(sk.name);
      out.push({ name: sk.name, skill: sk, via: 'explicit' });
    }
  }
  const tagSet = new Set(preset.tags);
  if (tagSet.size > 0) {
    for (const s of skills) {
      if (seen.has(s.name)) continue;
      if ((s.tags ?? []).some((tag) => tagSet.has(tag))) {
        seen.add(s.name);
        out.push({ name: s.name, skill: s, via: 'tag' });
      }
    }
  }
  return out;
}

/**
 * 预设（PR-05）：先添加（只填名称），随后进入预设详情页
 * 增删显式关联技能、管理关联标签。标签命中的技能会自动纳入预设，
 * 与显式技能取并集。详情态由地址 sub 决定，可直达、可刷新复原。
 *
 * 预设没有启用开关：它就是「要分发什么」的决策本身，成员或标签一变即刻同步到活跃 Agent；
 * 非活跃 Agent 不自动跟随，可在其详情页手动操作（手动操作即时对账）。
 *
 * 展示口径统一到「最终生效」：主页卡片只给技能总数，详情页汇总已开启技能
 * 与已施加到哪些 Agent，避免把中间态（显式名单 / 标签列表）抛给用户。
 * 详情页按「当前状态（只读）」与「调整方式（可写）」两组分区，「调整方式」
 * 下的两个操作块结构对齐，各自可折叠。
 */
export default function Presets() {
  const { data, loading, error, reload } = useAsync<StateView>(() => api('/state'));
  const { t } = useI18n();
  const route = useRoute();
  const [createOpen, setCreateOpen] = useState(false);

  const presets = data?.presets ?? [];

  const selectedName = route.sub;
  const selected = selectedName ? presets.find((p) => p.name === selectedName) : undefined;
  const open = (name: string) => navigate({ ...route, sub: name });
  const back = () => navigate({ ...route, sub: null });

  const allTags = useMemo(() => {
    const set = new Set<string>();
    data?.skills.forEach((s) => s.tags?.forEach((tag) => set.add(tag)));
    return [...set].sort();
  }, [data]);

  return (
    <>
      <PageHeader
        title={t('nav.presets')}
        sub={data ? t('presets.subtitle', { n: presets.length }) : undefined}
        actions={<Button onClick={() => setCreateOpen(true)}>{t('presets.new')}</Button>}
      />

      {selectedName && !selected && (
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: t('presets.notFound.title'), hint: t('presets.notFound.hint', { name: selectedName }), icon: '◉' }}
        >
          {() => null}
        </LoadingBoundary>
      )}

      {selected && (
        <PresetDetail
          preset={selected}
          skills={data?.skills ?? []}
          allTags={allTags}
          ownSources={(data?.repos ?? []).map((r) => r.id)}
          onBack={back}
          onChanged={reload}
        />
      )}

      {!selectedName && (
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: t('presets.empty.title'), hint: t('presets.empty.hint'), icon: '□' }}
        >
          {(state) => (
            <EntityList
              items={presets.map((p) => {
                // 主页只暴露最终结果：本预设最终会开启多少个技能（含按标签自动纳入）
                const on = effectiveSkills(p, state.skills);
                return {
                  id: p.name,
                  title: p.name,
                  sub: on.length ? t('presets.enabledCount', { n: on.length }) : t('presets.noneEnabled'),
                  onClick: () => open(p.name),
                };
              })}
              title={t('list.allPresets')}
            />
          )}
        </LoadingBoundary>
      )}

      <CreatePresetModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(name) => { setCreateOpen(false); reload(); open(name); }}
      />
    </>
  );
}

/** 新建预设：只填名称，创建后立即进入详情页做后续管理 */
function CreatePresetModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName('');
  }

  const create = async () => {
    setBusy(true);
    try {
      const res = await api<PresetView>('/presets', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      toast.push(t('presets.created'), 'good');
      onCreated(res.name);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title={t('presets.new')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={create}>{t('common.create')}</Button>
        </>
      }
    >
      <FieldInput
        label={t('presets.name')}
        placeholder={t('presets.namePlaceholder')}
        hint={t('presets.nameHint')}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && void create()}
      />
    </Modal>
  );
}

/** 预设详情：增删显式技能、管理关联标签、删除 */
function PresetDetail({
  preset,
  skills,
  allTags,
  ownSources,
  onBack,
  onChanged,
}: {
  preset: PresetView;
  skills: SkillView[];
  allTags: string[];
  /** 自有仓库 id 列表；来源筛选默认只选中这些 */
  ownSources: string[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  /** 来源筛选默认只选中自有仓库 */
  const [srcs, setSrcs] = useState<string[]>(ownSources);
  const [facets, setFacets] = useState<string[]>([]);
  const [viewMode, setViewMode] = useViewMode();
  /** 技能名单的本地草稿：连点多个开关时不丢操作；保存失败或切换预设后回退到服务端数据 */
  const [draftSkills, setDraftSkills] = useState<string[] | null>(null);
  /** 两个操作块的折叠态：各自独立，分别持久化 */
  const [tagsCollapsed, toggleTagsCollapsed] = useCollapsed('lsh.collapsed.preset.tags');
  const [skillsCollapsed, toggleSkillsCollapsed] = useCollapsed('lsh.collapsed.preset.skills');
  const [synced, setSynced] = useState<string | null>(null);
  if (preset.name !== synced) {
    setSynced(preset.name);
    setDraftSkills(null);
  }
  const current = draftSkills ?? preset.skills;
  /** 技能全量覆盖的 PUT 串行队列，避免连点开关时后发先至覆盖掉前面的操作 */
  const skillQueue = useRef<Promise<void>>(Promise.resolve());
  /** Agent 列表：用于展示本预设已应用到哪些 Agent（走全局刷新总线，变更后自动重取） */
  const { data: agents } = useAsync<AgentView[]>(() => api('/agents'));

  /** 统一保存入口：PUT 覆盖 skills/tags 并刷新；silent 用于开关这类高频操作 */
  const save = async (patch: { skills?: string[]; tags?: string[] }, opts?: { silent?: boolean; noReload?: boolean }) => {
    try {
      await api(`/presets/${encodeURIComponent(preset.name)}`, { method: 'PUT', body: JSON.stringify(patch) });
      if (!opts?.silent) toast.push(t('presets.saved'), 'good');
      if (!opts?.noReload) onChanged();
    } catch (e) {
      setDraftSkills(null);
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const removePreset = async () => {
    try {
      await api(`/presets/${encodeURIComponent(preset.name)}`, { method: 'DELETE' });
      toast.push(t('common.deleted'), 'good');
      onChanged();
      onBack();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const setTags = (tags: string[]) => void save({ tags });

  const toggleSkill = (id: string, on: boolean) => {
    const next = on ? [...current, id] : current.filter((x) => x !== id);
    setDraftSkills(next);
    // 不触发整页重载：UI 由本地草稿即时反映，队列保证提交顺序
    skillQueue.current = skillQueue.current.then(() => save({ skills: next }, { silent: true, noReload: true }));
  };

  // 因打有预设标签而自动纳入、且未显式枚举的技能：打「按标签纳入」徽标并锁定开关
  const autoIds = useMemo(() => {
    const set = new Set<string>();
    if (preset.tags.length === 0) return set;
    const ex = new Set(current);
    skills.forEach((s) => {
      if (!ex.has(s.id) && s.tags.some((tag) => preset.tags.includes(tag))) set.add(s.id);
    });
    return set;
  }, [skills, preset.tags, current]);

  // 全库技能统一成卡片：开关选中态 = 显式纳入或按标签纳入；按标签纳入的锁死不可关，并打「按标签纳入」徽标
  const cards = useMemo(() => {
    const ex = new Set(current);
    return skills.map((s) => {
      const card = skillViewToCard(s);
      const auto = autoIds.has(s.id);
      card.toggleOn = ex.has(s.id) || auto;
      card.toggleDisabled = auto;
      if (auto) {
        card.reason = 'preset';
        card.reasonLabel = t('presets.autoTag');
        card.reasonTitle = t('presets.autoTag.title');
      }
      return card;
    });
  }, [skills, autoIds, current, t]);

  const allSources = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((s) => set.add(s.source));
    return [...set].sort();
  }, [skills]);

  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    skills.forEach((s) => s.tags?.forEach((tag) => { m[tag] = (m[tag] ?? 0) + 1; }));
    return m;
  }, [skills]);

  /**
   * 关联标签候选项 = 全库现存标签 ∪ 预设里的历史标签。
   * 后者包含早期版本手动创建、如今已无技能使用的标签，命中数为 0，点一下即可移除。
   */
  const tagOptions = useMemo(
    () =>
      [...allTags, ...preset.tags.filter((tag) => !allTags.includes(tag))].map((tag) => ({
        label: tag,
        value: tag,
        count: tagCounts[tag] ?? 0,
      })),
    [allTags, preset.tags, tagCounts]
  );

  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {};
    skills.forEach((s) => { m[s.source] = (m[s.source] ?? 0) + 1; });
    return m;
  }, [skills]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return cards.filter((c) => {
      // 多选条件之间为「或」：命中任一选中项即保留，与技能库一致
      if (srcs.length > 0 && !srcs.includes(c.source)) return false;
      if (facets.length > 0 && !facets.some((tag) => c.tags.includes(tag))) return false;
      if (kw) {
        const hay = `${c.name} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [cards, facets, q, srcs]);

  const hasFilter = !!(facets.length > 0 || srcs.length > 0 || q.trim());
  const clearFilters = () => {
    setQ(''); setSrcs([]); setFacets([]);
  };

  /** 最终生效技能 = 显式名单 ∪ 标签命中；跟随本地草稿即时更新 */
  const enabled = useMemo(() => {
    const out: EffectiveSkill[] = [];
    const seen = new Set<string>();
    for (const id of current) {
      const n = skillDirName(id);
      const sk = skills.find((s) => s.id === id) ?? skills.find((s) => s.name === n);
      if (sk && !seen.has(sk.name)) {
        seen.add(sk.name);
        out.push({ name: sk.name, skill: sk, via: 'explicit' });
      }
    }
    for (const id of autoIds) {
      const sk = skills.find((s) => s.id === id);
      if (sk && !seen.has(sk.name)) {
        seen.add(sk.name);
        out.push({ name: sk.name, skill: sk, via: 'tag' });
      }
    }
    return out;
  }, [current, autoIds, skills]);

  const enabledExplicit = enabled.filter((e) => e.via === 'explicit').length;
  const enabledAuto = enabled.length - enabledExplicit;

  /**
   * 应用本预设的 Agent = 显式关联了本预设的 Agent。
   * 不关联就不参与——不存在「未绑定即跟随全部预设」的兜底，故这里没有其它来源。
   *
   * 与智能体页一致：同一技能目录只出一行，标题罗列使用该目录的全部 Agent。
   * 「是否分发」也按目录判断——同步目标按目录归并，同目录里任一 Agent 活跃就会覆盖该目录。
   */
  const appliedAgents = useMemo(
    () => (agents ?? []).filter((a) => a.preset === preset.name),
    [agents, preset.name]
  );
  const appliedGroups = useMemo(() => groupAgentsByDir(appliedAgents), [appliedAgents]);
  const activeDirs = useMemo(
    () => new Set((agents ?? []).filter((a) => a.active).map((a) => a.globalDir)),
    [agents]
  );
  const openAgent = (key: string) => navigate({ tab: 'agents', sub: key, query: new URLSearchParams() });

  const agentItems: EntityItem[] = appliedGroups.map((g) => ({
    id: g.dir,
    title: <AgentNamesTitle agents={g.agents} onOpen={openAgent} />,
    sub: <span className="mono">{g.dir}</span>,
    badges: (
      <>
        {activeDirs.has(g.dir) ? (
          <Badge tone="good" dot="good" title={t('presets.deployed.title')}>{t('presets.deployed')}</Badge>
        ) : (
          <Badge tone="neutral" dot="neutral" title={t('presets.notDeployed.title')}>{t('presets.notDeployed')}</Badge>
        )}
        {!g.installed && notInstalledBadge(t)}
      </>
    ),
    onClick: () => openAgent(g.primary.key),
  }));

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>{t('common.back')}</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{preset.name}</h2>
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          {enabledAuto > 0
            ? t('presets.detail.enabledWithAuto', { n: enabled.length, auto: enabledAuto })
            : t('presets.detail.enabled', { n: enabled.length })}
        </span>
        <div className="detail-actions">
          <Button size="sm" variant="danger" onClick={() => void removePreset()}>{t('common.delete')}</Button>
        </div>
      </div>

      <section className="detail-section">
        <h3 className="section-head section-head--quiet">
          <span className="section-head__label">{t('presets.section.current')}</span>
          <span className="section-head__rule" aria-hidden="true" />
          <span className="section-head__note">{t('presets.section.current.note')}</span>
        </h3>

        <div className="detail-summary">
          <div className="panel panel--quiet">
            <div className="panel__head">
              <span className="panel__title">{t('presets.enabled.section')}</span>
              <Badge tone={enabled.length ? 'good' : 'neutral'}>{enabled.length}</Badge>
            </div>
            <p className="panel__hint">
              {t('presets.enabled.hint', { explicit: enabledExplicit })}
              {enabledAuto > 0 ? t('presets.enabled.hintAuto', { auto: enabledAuto }) : ''}.
            </p>
            {enabled.length === 0 ? (
              <EmptyState title={t('presets.enabled.empty.title')} hint={t('presets.enabled.empty.hint')} />
            ) : (
              <div className="skill-pills">
                {enabled.map((e) => (
                  <span
                    key={e.name}
                    className={`skill-pill${e.via === 'tag' ? ' skill-pill--auto' : ''}`}
                    title={e.skill?.description ?? e.name}
                  >
                    <span className="skill-pill__name">{e.name}</span>
                    <span className="skill-pill__via">{e.via === 'tag' ? t('presets.via.tag') : t('presets.via.explicit')}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="panel panel--quiet">
            <div className="panel__head">
              <span className="panel__title">{t('presets.applied.section')}</span>
              <Badge tone={appliedAgents.length ? 'good' : 'neutral'}>{appliedAgents.length}</Badge>
            </div>
            <p className="panel__hint">
              {t('presets.applied.hint')}
            </p>
            <EntityList
              mode="list"
              toggle={false}
              items={agentItems}
              empty={
                <EmptyState
                  title={t('presets.applied.empty.title')}
                  hint={t('presets.applied.empty.hint')}
                />
              }
            />
          </div>
        </div>
      </section>

      <section className="detail-section">
        <h3 className="section-head">
          <span className="section-head__label">{t('presets.section.adjust')}</span>
          <span className="section-head__rule" aria-hidden="true" />
          <span className="section-head__note">{t('presets.section.adjust.note')}</span>
        </h3>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">{t('presets.byTag.section')}</span>
            <Badge tone={enabledAuto ? 'accent' : 'neutral'} title={t('presets.byTag.badge.title')}>
              {t('common.skillCount', { n: enabledAuto })}
            </Badge>
            <FoldButton expanded={!tagsCollapsed} label={t('presets.byTag.section')} onClick={toggleTagsCollapsed} />
          </div>
          {!tagsCollapsed && (
            <>
              <p className="panel__hint">
                {t('presets.byTag.hint', { n: preset.tags.length })}
              </p>
              {tagOptions.length === 0 ? (
                <p className="panel__hint" style={{ marginBottom: 0 }}>
                  {t('presets.byTag.empty')}
                </p>
              ) : (
                <Chip size="lg" options={tagOptions} selected={preset.tags} multiple onChange={setTags} />
              )}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">{t('presets.bySkill.section')}</span>
            <Badge tone={enabledExplicit ? 'accent' : 'neutral'} title={t('presets.bySkill.badge.title')}>
              {t('common.skillCount', { n: enabledExplicit })}
            </Badge>
            <FoldButton expanded={!skillsCollapsed} label={t('presets.bySkill.section')} onClick={toggleSkillsCollapsed} />
          </div>
          {!skillsCollapsed && (
            <>
              <p className="panel__hint">
                {t('presets.bySkill.hint')}
              </p>
              <FilterBar
                search={{ value: q, onChange: setQ, placeholder: t('filter.searchSkills') }}
                controls={
                  <>
                    <MultiSelect
                      label={t('filter.source')}
                      options={allSources.map((s) => ({ label: s, value: s, count: sourceCounts[s] }))}
                      selected={srcs}
                      onChange={setSrcs}
                      emptyHint={t('presets.source.empty')}
                    />
                    <MultiSelect
                      label={t('filter.tags')}
                      options={allTags.map((tag) => ({ label: tag, value: tag, count: tagCounts[tag] }))}
                      selected={facets}
                      onChange={setFacets}
                      emptyHint={t('presets.tags.empty')}
                    />
                  </>
                }
                hasFilters={hasFilter}
                onReset={clearFilters}
                actions={
                  <BadgeLegend
                    title={t('presets.legend.title')}
                    items={[
                      { label: t('presets.autoTag'), tone: 'accent', desc: t('presets.legend.autoTag.desc') },
                      ...skillBadgeLegend(t),
                    ]}
                    intro={t('presets.legend.intro')}
                  />
                }
                view={{ value: viewMode, onChange: setViewMode }}
              />
              <div style={{ marginTop: 'var(--sp-4)' }}>
                <SkillList
                  title={`${hasFilter ? t('list.filtered') : t('list.allSkills')} · ${shown.length}${hasFilter ? ` / ${cards.length}` : ''}`}
                  items={shown}
                  onToggle={(item) => toggleSkill(item.id, !current.includes(item.id))}
                  hideToggle
                  empty={hasFilter
                    ? <EmptyState title={t('agents.list.empty')} />
                    : <EmptyState title={t('agents.libraryEmpty.title')} hint={t('agents.libraryEmpty.hint')} />}
                />
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
