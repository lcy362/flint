import { useMemo, useState } from 'react';
import { api, type StateView, type RepoView, type SourceView, type SkillContent, type AgentCollectPreview, type AgentCollectItem, type ImportPreviewItem, type SkillAction } from '../api/types';
import { skillViewToCard } from '../components/skill/adapters';
import SkillList from '../components/skill/SkillList';
import { skillBadgeLegend } from '../components/skill/SkillBadges';
import EntityList, { type EntityItem } from '../components/common/EntityList';
import BadgeLegend from '../components/common/BadgeLegend';
import FilterBar from '../components/common/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Segment from '../components/ui/Segment';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Chip from '../components/ui/Chip';
import MultiSelect from '../components/ui/MultiSelect';
import { FieldInput, FieldSelect } from '../components/ui/Field';
import SwitchLabel from '../components/ui/SwitchLabel';
import { PathField, PathListField } from '../components/ui/PathField';
import Switch from '../components/ui/Switch';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { useViewMode } from '../state/viewMode';
import { navigate, useQueryFlag, useQueryList, useQueryParam, useRoute } from '../state/router';
import { joinList, rich, useI18n } from '../i18n';

export default function Library() {
  const { data, loading, error, reload } = useAsync<StateView>(() => api('/state'));
  const { t } = useI18n();
  const toast = useToast();
  const route = useRoute();

  // 详情弹层与筛选条件都写进地址，刷新后可完整复原当前页面
  const detailId = route.sub;
  const openDetail = (id: string) => navigate({ ...route, sub: id });
  const closeDetail = () => navigate({ ...route, sub: null });
  const [facets, setFacets] = useQueryList('tag');
  const [q, setQ] = useQueryParam('q');
  /** 来源筛选默认只选中自有仓库；URL 显式带 src 时以 URL 为准 */
  const defaultSrcs = useMemo(() => (data?.repos ?? []).map((r) => r.id), [data]);
  const [srcs, setSrcs] = useQueryList('src', defaultSrcs);
  const [untaggedOnly, setUntaggedOnly] = useQueryFlag('untagged');
  const [viewMode, setViewMode] = useViewMode();

  const allTags = useMemo(() => {
    const set = new Set<string>();
    data?.skills.forEach((s) => s.tags?.forEach((tag) => set.add(tag)));
    return [...set].sort();
  }, [data]);

  const allSources = useMemo(() => {
    const set = new Set<string>();
    data?.skills.forEach((s) => set.add(s.source));
    return [...set].sort();
  }, [data]);

  /** 每个标签 / 来源下的技能数，供筛选器展示 */
  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    data?.skills.forEach((s) => s.tags?.forEach((tag) => { m[tag] = (m[tag] ?? 0) + 1; }));
    return m;
  }, [data]);

  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {};
    data?.skills.forEach((s) => { m[s.source] = (m[s.source] ?? 0) + 1; });
    return m;
  }, [data]);

  const cards = useMemo(() => (data?.skills ?? []).map((s) => skillViewToCard(s, [{ kind: 'detail', label: t('library.detail') }])), [data, t]);
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return cards.filter((c) => {
      // 多选条件之间为「或」：命中任一选中项即保留，与来源筛选保持一致
      if (facets.length > 0 && !facets.some((tag) => c.tags.includes(tag))) return false;
      if (srcs.length > 0 && !srcs.includes(c.source)) return false;
      if (untaggedOnly && c.tags.length > 0) return false;
      if (kw) {
        const hay = `${c.name} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [cards, facets, q, srcs, untaggedOnly]);

  // 来源默认值（自有仓库）不算筛选；仅当用户在地址栏显式筛过来源时，重置才出现
  const srcInUrl = route.query.get('src');
  const hasFilter = !!(facets.length > 0 || untaggedOnly || q.trim() || (!!srcInUrl && srcs.length > 0));
  const clearFilters = () => {
    setQ(''); setSrcs([]); setFacets([]); setUntaggedOnly(false);
  };

  const detailTarget = detailId ? data?.skills.find((s) => s.id === detailId) : undefined;

  return (
    <>
      <PageHeader
        title={t('nav.library')}
        sub={data ? t('library.subtitle', { n: data.skills.length }) : undefined}
      />

      <div className="panel">
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: t('filter.searchSkills') }}
          controls={
            <>
              <MultiSelect
                label={t('filter.source')}
                options={allSources.map((s) => ({ label: s, value: s, count: sourceCounts[s] }))}
                selected={srcs}
                onChange={setSrcs}
                emptyHint={t('library.sourceEmpty')}
              />
              <MultiSelect
                label={t('filter.tags')}
                options={allTags.map((tag) => ({ label: tag, value: tag, count: tagCounts[tag] }))}
                selected={facets}
                onChange={setFacets}
                emptyHint={t('library.tagsEmpty', { n: data?.skills.length ?? 0 })}
              />
              <SwitchLabel checked={untaggedOnly} onChange={setUntaggedOnly}>{t('library.untaggedOnly')}</SwitchLabel>
            </>
          }
          hasFilters={hasFilter}
          onReset={clearFilters}
          actions={
            <BadgeLegend
              title={t('library.legend.title')}
              items={skillBadgeLegend(t)}
              intro={rich(t('library.legend.intro'))}
            />
          }
          view={{ value: viewMode, onChange: setViewMode }}
        />
      </div>

      <div className="panel">
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: t('library.empty.title'), hint: t('library.empty.hint'), icon: '◈' }}
        >
          {() => (
            <SkillList
              title={`${hasFilter ? t('list.filtered') : t('list.allSkills')} · ${shown.length}${hasFilter ? ` / ${cards.length}` : ''}`}
              items={shown}
              onAction={(item) => openDetail(item.id)}
              onTag={(item) => openDetail(item.id)}
              onOpen={(item) => openDetail(item.id)}
              hideToggle
              collapsible
              storageKey="lsh.collapsed.library.skills"
            />
          )}
        </LoadingBoundary>
      </div>

      {data && (
        <div className="panel">
          <ReposAndSources repos={data.repos} sources={data.sources} reload={reload} />
        </div>
      )}

      <SkillDetailModal
        id={detailTarget ? detailId : null}
        skill={detailTarget}
        allTags={allTags}
        onClose={closeDetail}
        onSaved={() => { closeDetail(); reload(); }}
      />
    </>
  );
}

/** 卡片上定位到的一条仓库：kind 与 API 路由对齐（repo → /repos，source → /sources） */
type WarehouseTarget = (RepoView & { kind: 'repo' }) | (SourceView & { kind: 'source' });

/* 仓库管理。技能入库动作（归集 / 导入）挂在自有仓库上：第三方仓库作为独立仓库维护，
 * 但当其技能被自有仓库导入时，它只是数据源目录，无需任何登记。 */
function ReposAndSources({ repos, sources, reload }: { repos: RepoView[]; sources: SourceView[]; reload: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<RepoView | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WarehouseTarget | null>(null);

  const remove = async (kind: 'repos' | 'sources', id: string) => {
    try {
      await api(`/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast.push(t('common.deleted'), 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(null);
      reload();
    }
  };

  // 两类仓库统一展示：标题取名称（自有仓库以 id 兼作名称，第三方仓库用 name、缺省回落 id），
  // 副标题取磁盘路径，类型与状态一律用徽标区分。
  const items: EntityItem[] = [
    ...repos.map((repo) => ({
      id: `repo:${repo.id}`,
      title: repo.name || repo.id,
      sub: <span className="mono">{repo.path}{repo.root ? ` · ${repo.root}` : ''}</span>,
      status: <Badge tone="info">{t('repo.kind.own')}</Badge>,
      // 自有仓库恒为扁平、没有布局可配：徽标把这条契约显式说出来，避免用户以为漏配了
      badges: <Badge tone="neutral">{t('repo.flatOnly')}</Badge>,
      actions: (
        <>
          <Button size="sm" variant="ghost" onClick={() => setEditTarget({ ...repo, kind: 'repo' })}>{t('common.edit')}</Button>
          <Button size="sm" variant="primary" onClick={() => setAddFor(repo)} title={t('repo.addSkills.hint')}>
            {t('repo.addSkills')}
          </Button>
          <Button size="sm" variant="danger" loading={busy === `del:${repo.id}`} onClick={() => remove('repos', repo.id)}>{t('common.delete')}</Button>
        </>
      ),
    })),
    ...sources.map((s) => ({
      id: `source:${s.id}`,
      title: s.name || s.id,
      sub: <span className="mono">{s.path}</span>,
      status: <Badge tone="accent">{t('repo.kind.third')}</Badge>,
      badges: <Badge tone="neutral">{s.layout}</Badge>,
      actions: (
        <>
          <Button size="sm" variant="ghost" onClick={() => setEditTarget({ ...s, kind: 'source' })}>{t('common.edit')}</Button>
          <Button size="sm" variant="danger" loading={busy === `del:${s.id}`} onClick={() => remove('sources', s.id)}>{t('common.delete')}</Button>
        </>
      ),
    })),
  ];

  return (
    <>
      <EntityList
        title={t('repo.section')}
        items={items}
        toolbar={<Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}>{t('repo.register')}</Button>}
        empty={<EmptyState title={t('repo.empty.title')} hint={t('repo.empty.hint')} />}
        hideToggle
      />
      <WarehouseModal
        open={createOpen || !!editTarget}
        target={editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
        onDone={() => { setCreateOpen(false); setEditTarget(null); reload(); }}
      />
      <AddSkillsModal repo={addFor} onClose={() => setAddFor(null)} onDone={() => { setAddFor(null); reload(); }} />
    </>
  );
}

/** 添加技能到自有仓库：归集（Agent 目录）与导入（外部数据源目录）的合并入口，进入后再选方式 */
function AddSkillsModal({ repo, onClose, onDone }: { repo: RepoView | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'collect' | 'import'>('collect');
  const [wasOpen, setWasOpen] = useState(false);
  if (!!repo !== wasOpen) {
    setWasOpen(!!repo);
    if (repo) setMode('collect');
  }
  return (
    <Modal open={!!repo} title={repo ? t('repo.addTo', { name: repo.name || repo.id }) : ''} onClose={onClose} width={560}>
      {repo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <Segment
            options={[
              { label: t('repo.collectTab'), value: 'collect' },
              { label: t('repo.importTab'), value: 'import' },
            ]}
            value={mode}
            onChange={setMode}
          />
          {/* key 保证切换方式时重置面板内部状态 */}
          {mode === 'collect'
            ? <CollectPanel key="collect" repo={repo} onClose={onClose} onDone={onDone} />
            : <ImportPanel key="import" repo={repo} onClose={onClose} onDone={onDone} />}
        </div>
      )}
    </Modal>
  );
}

/** 确认页候选里的「仓库内版本」占位 agentKey（保持现状，不写入） */
const REPO_KEY = '__repo__';

/**
 * 从 Agent 归集（IM-01）：两步流程（面板，由 AddSkillsModal 承载）。
 * 第一步按 Agent 分组（默认折叠）展示 skill 清单，标注存储形态与 Agent 接管状态；
 * 已接管但外链指向非仓库位置的 skill 可一键「调整」改指仓库本体；
 * 第二步确认页按名字分组，仓库内版本与各 agent 版本一起作为候选（仓库已有同名时）：
 * 选仓库版本保持现状，选 agent 版本则覆盖仓库副本；逐项展示写入路径后由用户确认。
 */
function CollectPanel({ repo, onClose, onDone }: { repo: RepoView; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'confirm' | 'final'>('select');
  /** agentKey → 已勾选的 skill 名 */
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  /** 确认页：每个技能名采纳哪个 agent 的版本 */
  const [choices, setChoices] = useState<Record<string, string>>({});
  const { data, loading, reload } = useAsync<AgentCollectPreview[]>(
    () => api(`/repos/${encodeURIComponent(repo.id)}/collect/preview`),
    [repo.id]
  );

  const agents = data ?? [];
  /**
   * 可接管：本仓库里已有同名副本（exists），且本目录这条还没指向本仓库。
   * 覆盖两种对象——① agent 自带的真实目录；② 指向仓库之外（或别的仓库）的软链。
   * 接管后本目录这条统一变成指向本仓库副本的软链。
   */
  const adjustable = (it: AgentCollectItem) => !it.inRepo && it.exists;

  /** Agent 接管状态：所有 skill 均为指向仓库的软链 = 已接管 */
  const takeoverStatus = (a: AgentCollectPreview): { tone: 'good' | 'accent' | 'neutral'; label: string; title: string } => {
    const linked = a.items.filter((it) => it.symlink && it.inRepo).length;
    if (a.items.length > 0 && linked === a.items.length) return { tone: 'good', label: t('collect.taken.fully'), title: t('collect.taken.fully.title') };
    if (linked > 0) return { tone: 'accent', label: t('collect.taken.partial'), title: t('collect.taken.partial.title') };
    return { tone: 'neutral', label: t('collect.taken.none'), title: t('collect.taken.none.title') };
  };

  const toggleSkill = (agentKey: string, name: string) =>
    setPicked((p) => {
      const cur = p[agentKey] ?? [];
      return { ...p, [agentKey]: cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name] };
    });

  const toggleAgent = (a: AgentCollectPreview) => {
    const names = a.items.map((it) => it.name);
    setPicked((p) => {
      const cur = p[a.agentKey] ?? [];
      const all = names.length > 0 && names.every((n) => cur.includes(n));
      return { ...p, [a.agentKey]: all ? [] : names };
    });
  };

  /** 接管：把指向外部的软链改指仓库副本（软链只换链接，原位置不受影响） */
  const adjust = async (agentKey: string, name: string) => {
    setAdjusting(`${agentKey}:${name}`);
    try {
      const res = await api<{ linked: boolean; reason?: string }>(
        `/repos/${encodeURIComponent(repo.id)}/takeover`,
        { method: 'POST', body: JSON.stringify({ agentKey, name, confirm: true }) }
      );
      if (res.linked) toast.push(t('collect.takenToast', { name }), 'good');
      else toast.push(res.reason ?? t('collect.takeoverFailed'), 'bad');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setAdjusting(null); }
  };

  const selections = agents
    .map((a) => ({ agent: a, names: picked[a.agentKey] ?? [] }))
    .filter((s) => s.names.length > 0);
  const totalPicked = selections.reduce((n, s) => n + s.names.length, 0);

  /** 确认页按名字分组：同名技能可能勾选自多个 agent；仓库已有同名时，仓库内版本也作为候选 */
  const selectedGroups = useMemo(() => {
    const m = new Map<string, { agent: AgentCollectPreview; item: AgentCollectItem }[]>();
    for (const s of selections) {
      for (const name of s.names) {
        const item = s.agent.items.find((it) => it.name === name);
        if (item) (m.get(name) ?? m.set(name, []).get(name)!).push({ agent: s.agent, item });
      }
    }
    return [...m.entries()];
  }, [data, picked]);

  /** 每个名字的候选与采纳结果：仓库版本默认选中（保持现状），选 agent 版本则覆盖仓库副本 */
  const repoRootDisplay = repo.root ?? `${repo.path}/skills`;
  const plan = selectedGroups.map(([name, cands]) => {
    // agent 内是「软链指向仓库本体」的项：内容即仓库副本本身，不存在独立版本，不作为候选
    const agentCands = cands.filter((c) => !(c.item.symlink && c.item.inRepo));
    const exists = cands[0].item.exists;
    const noop = agentCands.length === 0;
    const options = noop
      ? []
      : [
          ...(exists ? [{ label: t('collect.keepRepoVersion'), value: REPO_KEY }] : []),
          ...agentCands.map((c) => ({ label: c.agent.agentName, value: c.agent.agentKey })),
        ];
    let chosen = choices[name];
    if (noop || !chosen || !options.some((o) => o.value === chosen)) {
      chosen = !noop && agentCands.length > 0 ? (exists ? REPO_KEY : agentCands[0].agent.agentKey) : REPO_KEY;
    }
    return { name, cands: agentCands, allCands: cands, exists, options, chosen, noop };
  });
  const writePlans = plan.filter((p) => p.chosen !== REPO_KEY);
  const keepCount = plan.length - writePlans.length;
  const overwriteCount = writePlans.filter((p) => p.exists).length;

  const run = async () => {
    setBusy(true);
    try {
      const byAgent: Record<string, string[]> = {};
      const replaceNames: string[] = [];
      for (const p of plan) {
        if (p.chosen === REPO_KEY) continue;
        (byAgent[p.chosen] ??= []).push(p.name);
        if (p.exists) replaceNames.push(p.name);
      }
      const sels = Object.entries(byAgent).map(([agentKey, names]) => ({ agentKey, names }));
      if (sels.length === 0) {
        toast.push(t('collect.allKept'), 'good');
        onDone();
        return;
      }
      const res = await api<{ collected: string[]; skipped: string[] }>(
        `/repos/${encodeURIComponent(repo.id)}/collect`,
        { method: 'POST', body: JSON.stringify({ selections: sels, replaceNames }) }
      );
      toast.push(
        res.skipped.length ? t('collect.doneSkipped', { n: res.collected.length, s: res.skipped.length }) : t('collect.done', { n: res.collected.length }),
        'good',
      );
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  if (step === 'confirm') {
    return (
      <>
        <div style={{ fontSize: 'var(--fs-13)', color: 'var(--c-ink-2)' }}>
          {rich(t('collect.confirm.summary', {
            write: writePlans.length,
            repo: repo.name || repo.id,
            added: writePlans.length - overwriteCount,
            overwritten: overwriteCount,
            kept: keepCount,
            picked: totalPicked,
            groups: selectedGroups.length,
          }))}
        </div>
        <EntityList
          mode="list"
          toggle={false}
          items={plan.map((p) => {
            const adoptingRepo = p.chosen === REPO_KEY;
            const cand = p.cands.find((c) => c.agent.agentKey === p.chosen);
            const dest = `${repoRootDisplay}/${p.name}`;
            if (p.noop) {
              const src = p.allCands[0];
              return {
                id: p.name,
                title: p.name,
                sub: (
                  <span className="mono">
                    {src.agent.agentName} · {t('collect.sub.symlinkToBody', { target: src.item.linkTarget ?? t('collect.dangling') })}
                  </span>
                ),
                status: <Badge tone="info" title={t('collect.badge.repoBody.title')}>{t('collect.badge.repoBody')}</Badge>,
              };
            }
            return {
              id: p.name,
              title: p.name,
              sub: adoptingRepo ? (
                <span className="mono">{t('collect.sub.repoVersion', { dest })}</span>
              ) : (
                <span className="mono">
                  {cand!.agent.agentName} · {cand!.item.dir}
                  {cand!.item.symlink ? `（${t('collect.sub.symlink')}）` : ''}
                </span>
              ),
              desc: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                  {p.options.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{t('collect.adoptVersion')}</span>
                      <Chip
                        options={p.options}
                        selected={[p.chosen]}
                        onChange={(arr) => { const v = arr[0]; if (v) setChoices((prev) => ({ ...prev, [p.name]: v })); }}
                      />
                    </div>
                  )}
                  {!adoptingRepo && (
                    <div className="mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-2)' }}>
                      {t('collect.writeTo', { src: cand!.item.dir, dest })}
                    </div>
                  )}
                </div>
              ),
              status: adoptingRepo ? (
                <Badge tone="info" title={t('collect.badge.keep.title')}>{t('collect.badge.keep')}</Badge>
              ) : p.exists ? (
                <Badge tone="warn" title={t('collect.badge.overwrite.title', { dest })}>{t('collect.badge.overwrite')}</Badge>
              ) : (
                <Badge tone="good">{t('collect.badge.new')}</Badge>
              ),
            };
          })}
        />
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          {rich(t('collect.confirm.note', { root: repoRootDisplay }))}
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setStep('select')}>{t('common.back')}</Button>
          <Button variant="primary" onClick={() => setStep('final')}>{t('collect.confirm.button')}</Button>
        </div>
      </>
    );
  }

  /** 最终确认：脱离上下文即可读懂的完整操作清单（复制什么到哪、删什么、什么不动） */
  if (step === 'final') {
    let n = 0;
    const opItems = plan.map((p) => {
      const dest = `${repoRootDisplay}/${p.name}`;
      if (p.chosen === REPO_KEY) {
        return {
          id: p.name,
          title: t('collect.final.noop', { dest }),
          sub: t('collect.final.keep'),
          status: <Badge tone="info">{t('collect.badge.keep')}</Badge>,
        };
      }
      const cand = p.cands.find((c) => c.agent.agentKey === p.chosen)!;
      const realSrc = cand.item.symlink ? (cand.item.linkTarget ?? cand.item.dir) : cand.item.dir;
      const srcNote = cand.item.symlink
        ? `${cand.item.dir}（${t('collect.sub.symlink')}，${t('badge.symlink.title', { target: realSrc })}）`
        : cand.item.dir;
      n += 1;
      return p.exists
        ? {
            id: p.name,
            title: t('collect.final.overwriteTitle', { n, dest }),
            sub: (
              <span style={{ fontSize: 'var(--fs-12)' }}>
                {rich(t('collect.final.overwriteOps', { dest, src: srcNote }))}
              </span>
            ),
            status: <Badge tone="warn">{t('collect.final.overwrite')}</Badge>,
          }
        : {
            id: p.name,
            title: t('collect.final.newTitle', { n, dest }),
            sub: (
              <span style={{ fontSize: 'var(--fs-12)' }}>
                {rich(t('collect.final.newOps', { src: srcNote }))}
              </span>
            ),
            status: <Badge tone="good">{t('collect.badge.new')}</Badge>,
          };
    });
    return (
      <>
        <div style={{ fontSize: 'var(--fs-13)', color: 'var(--c-ink-2)' }}>
          {t('collect.final.summary', {
            write: writePlans.length,
            added: writePlans.length - overwriteCount,
            overwritten: overwriteCount,
            kept: keepCount,
          })}
        </div>
        <EntityList mode="list" toggle={false} items={opItems} />
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', lineHeight: 1.7 }}>
          {t('collect.final.notesIntro')}
          <br />{t('collect.final.note1')}
          <br />{t('collect.final.note2')}
          <br />{t('collect.final.note3')}
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setStep('confirm')}>{t('common.back')}</Button>
          <Button variant="primary" loading={busy} onClick={run}>{t('common.confirmRun')}</Button>
        </div>
      </>
    );
  }

  return (
    <>
      {loading && <span style={{ color: 'var(--c-ink-3)' }}>{t('common.scanning')}</span>}
      {!loading && agents.length === 0 && <EmptyState title={t('collect.noAgents')} />}
      {agents.map((a) => {
        const st = takeoverStatus(a);
        const cur = picked[a.agentKey] ?? [];
        const selectedCount = a.items.filter((it) => cur.includes(it.name)).length;
        const allSelected = a.items.length > 0 && selectedCount === a.items.length;
        return (
          <EntityList
            key={a.agentKey}
            mode="list"
            toggle={false}
            collapsible
            defaultCollapsed
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                {a.agentName}
                <Badge tone={st.tone} title={st.title}>{st.label}</Badge>
                <span className="mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
                  {t('collect.agentMeta', { key: a.agentKey, n: a.items.length })}
                </span>
              </span>
            }
            toolbar={
              <>
                {st.label === t('collect.taken.none') && (
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
                    {t('collect.noTakeoverNote')}
                  </span>
                )}
                {a.items.length > 0 && (
                  <SwitchLabel checked={allSelected} onChange={() => toggleAgent(a)}>
                    {t('collect.selectAll', { a: selectedCount, b: a.items.length })}
                  </SwitchLabel>
                )}
              </>
            }
            items={a.items.map((it) => ({
              id: it.name,
              title: it.name,
              sub: <span className="mono">{it.symlink ? t('collect.sub.symlinkTo', { target: it.linkTarget ?? t('collect.dangling') }) : t('collect.sub.realDir')}</span>,
              desc: it.description,
              status: it.symlink && it.inRepo ? (
                <Badge tone="info" title={t('collect.repoVersionBadge.title', { target: it.linkTarget ?? '' })}>{t('badge.takenOver')}</Badge>
              ) : it.exists ? (
                <Badge tone="neutral" title={t('collect.existsBadge.title')}>{t('collect.existsBadge')}</Badge>
              ) : it.symlink ? (
                <Badge tone="accent">{t('collect.sub.symlink')}</Badge>
              ) : undefined,
              toggle: (
                <Switch
                  aria-label={t('collect.toggleAria', { name: it.name })}
                  checked={cur.includes(it.name)}
                  onChange={() => toggleSkill(a.agentKey, it.name)}
                />
              ),
              actions: adjustable(it) ? (
                <Button
                  size="sm"
                  loading={adjusting === `${a.agentKey}:${it.name}`}
                  onClick={() => adjust(a.agentKey, it.name)}
                  title={it.symlink ? t('collect.takeover.symlinkTitle') : t('collect.takeover.realTitle')}
                >
                  {t('collect.takeover')}
                </Button>
              ) : undefined,
            }))}
          />
        );
      })}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
        <Button variant="primary" disabled={totalPicked === 0} onClick={() => setStep('confirm')}>{t('collect.next')}</Button>
      </div>
    </>
  );
}

/** 仓库表单草稿：两类仓库共用同一套字段 */
interface WarehouseDraft {
  kind: 'repo' | 'source';
  id: string;
  name: string;
  path: string;
  layout: string;
  root: string;
}

const EMPTY_DRAFT: WarehouseDraft = { kind: 'repo', id: '', name: '', path: '', layout: 'auto', root: '' };

/** 自有仓库缺省扫描 <路径>/skills */
function skillsRootOf(p: string): string {
  const t = p.trim();
  return t ? `${t.replace(/\/+$/, '')}/skills` : '';
}

function draftFrom(target: WarehouseTarget | null | undefined): WarehouseDraft {
  if (!target) return EMPTY_DRAFT;
  if (target.kind === 'source') {
    return { kind: 'source', id: target.id, name: target.name ?? '', path: target.path, layout: target.layout, root: '' };
  }
  // 自有仓库没有布局可配，草稿里的 layout 只服务于第三方来源分支
  return { kind: 'repo', id: target.id, name: target.name ?? '', path: target.path, layout: 'auto', root: target.root ?? '' };
}

/**
 * 登记 / 编辑仓库（自有与第三方共用一套表单）。
 *
 * 编辑既有仓库时可切换「自有 / 第三方」定位。两类仓库的扫描根不同
 * （自有 = root ?? <路径>/skills，第三方 = 路径本身），因此切换类型时同步换算路径，
 * 保证改定位后扫描根不变、技能不会「消失」：
 * - 自有 → 第三方：把当前扫描根写进路径（root 的语义被吸收）
 * - 第三方 → 自有：把当前路径同时记为 root，显式声明扫描根就是该目录
 */
function WarehouseModal({
  open,
  target,
  onClose,
  onDone,
}: {
  open: boolean;
  target?: WarehouseTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const editing = !!target;
  const [d, setD] = useState<WarehouseDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // 每次打开时载入目标值（新建则重置），避免残留上一次的输入
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setD(draftFrom(target));
  }

  const set = <K extends keyof WarehouseDraft>(k: K, v: WarehouseDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const switchKind = (k: 'repo' | 'source') => {
    if (k === d.kind) return;
    setD((prev) => {
      const p = prev.path.trim();
      if (k === 'source') {
        return { ...prev, kind: k, path: prev.root.trim() || skillsRootOf(p), root: '' };
      }
      return { ...prev, kind: k, root: p };
    });
  };

  // 把真实扫描根摊开给用户看，避免「改了定位却扫不到技能」
  const scanRoot = d.kind === 'repo' ? (d.root.trim() || skillsRootOf(d.path) || '—') : (d.path.trim() || '—');

  const submit = async () => {
    setBusy(true);
    try {
      if (!d.id.trim() || !d.path.trim()) throw new Error(t('repo.idPathRequired'));
      const id = d.id.trim();
      if (d.kind === 'repo') {
        // 自有仓库不接受 layout：恒为扁平，按分类组织请走第三方来源或标签
        const body = { name: d.name.trim() || undefined, path: d.path.trim(), root: d.root.trim() || undefined };
        if (editing) {
          await api(`/repos/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...body, kind: 'repo' }) });
        } else {
          await api('/repos', { method: 'POST', body: JSON.stringify({ id, ...body }) });
        }
      } else {
        const name = d.name.trim() || id;
        const path = d.path.trim();
        if (editing) {
          await api(`/sources/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify({ name, path, layout: d.layout, root: d.root.trim() || undefined, kind: 'source' }),
          });
        } else {
          await api('/sources', { method: 'POST', body: JSON.stringify({ id, name, path, layout: d.layout }) });
        }
      }
      toast.push(editing ? t('repo.updated') : t(d.kind === 'repo' ? 'repo.registered.own' : 'repo.registered.third', { id }), 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const kindLabel = (k: 'repo' | 'source') => (k === 'repo' ? t('repo.kind.own') : t('repo.kind.third'));

  return (
    <Modal
      open={open}
      title={editing ? t('repo.editTitle') : t('repo.registerTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!d.id.trim() || !d.path.trim()} onClick={submit}>
            {editing ? t('common.save') : t('common.register')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div>
          <span className="field-label">{t('repo.kind')}</span>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            {(['repo', 'source'] as const).map((k) => (
              <Button key={k} size="sm" variant={d.kind === k ? 'primary' : 'ghost'} onClick={() => switchKind(k)}>
                {kindLabel(k)}
              </Button>
            ))}
          </div>
          {editing && target && d.kind !== target.kind && (
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'var(--sp-2)', lineHeight: 1.6 }}>
              {rich(t('repo.kindSwitch', { from: kindLabel(target.kind), to: kindLabel(d.kind), id: target.id }))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
          <FieldInput
            label={t('repo.id')}
            placeholder="my-lib"
            value={d.id}
            readOnly={editing}
            hint={editing ? t('repo.idHint') : undefined}
            onChange={(e) => set('id', e.target.value)}
          />
          <FieldInput
            label={t('common.name')}
            placeholder={t('repo.namePlaceholder')}
            value={d.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <PathField label={t('repo.path')} placeholder="/path/to/library" value={d.path} onChange={(v) => set('path', v)} />

        {d.kind === 'source' ? (
          <FieldSelect label={t('repo.layout')} value={d.layout} onChange={(e) => set('layout', e.target.value)}>
            <option value="auto">{t('repo.layout.auto')}</option>
            <option value="nested">{t('repo.layout.nested')}</option>
            <option value="flat">{t('repo.layout.flat')}</option>
          </FieldSelect>
        ) : (
          // 自有仓库没有布局选项：把实际扫描根摊开说清楚，避免用户以为漏配了什么
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', lineHeight: 1.6 }}>
            {t('repo.flatOnlyHint', { root: scanRoot })}
          </div>
        )}

        {d.kind === 'repo' && (
          <FieldInput
            label={t('repo.root')}
            hint={t('repo.rootHint')}
            placeholder="skills"
            value={d.root}
            onChange={(e) => set('root', e.target.value)}
          />
        )}

        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          {t('repo.scanRoot')} <span className="mono">{scanRoot}</span>
        </div>
      </div>
    </Modal>
  );
}

/** 技能详情：SKILL.md 预览 + 标签编辑 + 来源追溯（UI-03 / TG-01 / IM-04） */
function SkillDetailModal({
  id,
  skill,
  allTags,
  onClose,
  onSaved,
}: {
  id: string | null;
  skill?: StateView['skills'][number];
  allTags: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncedId, setSyncedId] = useState<string | null>(null);

  if (id && skill && syncedId !== id) {
    setSyncedId(id);
    setTags(skill.tags ?? []);
    setNewTag('');
  }
  if (!id && syncedId !== null) setSyncedId(null);

  const { data: content, loading } = useAsync<SkillContent>(
    () => (id ? api(`/skills/${encodeURIComponent(id)}/content`) : Promise.resolve(null as unknown as SkillContent)),
    [id]
  );

  /** 标签输入归一化：按换行拆分、trim、去空、去重（兼容粘贴多行/未确认直接保存） */
  const addTagInput = (input: string, base: string[]): string[] => {
    const out = [...base];
    for (const seg of input.split(/\r?\n/)) {
      const tag = seg.trim();
      if (tag && !out.includes(tag)) out.push(tag);
    }
    return out;
  };

  const addNew = () => {
    setTags((p) => addTagInput(newTag, p));
    setNewTag('');
  };

  const save = async () => {
    if (!skill) return;
    // 输入框中未点「添加」/未回车确认的文本，保存时一并纳入，避免「输入了却打不上」
    const finalTags = newTag.trim() ? addTagInput(newTag, tags) : tags;
    setSaving(true);
    try {
      await api(`/skills/${encodeURIComponent(skill.id)}`, { method: 'PATCH', body: JSON.stringify({ tags: finalTags }) });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open={!!id}
      title={skill ? `${t('library.detail')} · ${skill.name}` : ''}
      width={720}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.close')}</Button><Button variant="primary" loading={saving} onClick={save}>{t('common.save')}</Button></>}
    >
      {skill && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            <Badge tone="info">{skill.source}</Badge>
            {skill.version && <Badge tone="neutral">v{skill.version}</Badge>}
            {skill.origin && <Badge tone="accent" title={t('badge.reason.own.title')}>{t('skillDetail.origin', { origin: skill.origin })}</Badge>}
          </div>
          <div className="mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{skill.dir}</div>
          {skill.description && <p style={{ color: 'var(--c-ink-2)' }}>{skill.description}</p>}

          <div>
            <span className="field-label">{t('filter.tags')}</span>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <div style={{ flex: 1 }}>
                <FieldInput placeholder={t('skillDetail.newTag')} value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNew()} />
              </div>
              <Button onClick={addNew}>{t('common.add')}</Button>
            </div>
            <div style={{ marginTop: 'var(--sp-2)' }}>
              {/* 库内已有标签 + 本次新增的标签，一并作为可多选的候选项 */}
              <Chip
                options={[...allTags, ...tags.filter((tag) => !allTags.includes(tag))].map((tag) => ({ label: tag, value: tag }))}
                selected={tags}
                multiple
                onChange={setTags}
              />
            </div>
          </div>

          <div>
            <span className="field-label">SKILL.md</span>
            {loading && <span style={{ color: 'var(--c-ink-3)' }}>{t('common.loading')}</span>}
            {content && (
              <>
                <pre className="mono" style={{
                  maxHeight: 320, overflow: 'auto', padding: 'var(--sp-3)',
                  background: 'var(--c-bg-2)', border: '1px solid var(--c-line)', borderRadius: 'var(--r-md)',
                  fontSize: 'var(--fs-12)', whiteSpace: 'pre-wrap',
                }}>
                  {content.content}
                </pre>
                {content.files.length > 0 && (
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'var(--sp-2)' }}>
                    {t('skillDetail.files', { files: joinList(content.files) })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * 仓库级批量导入（EK-02）：把外部目录里的 skill 拷贝进指定自有仓库（面板，由 AddSkillsModal 承载）。
 * 目录仅作为本次导入的数据源（如第三方库的 skills 目录），不会登记进系统；
 * 同名 skill 已在目标仓库则去重跳过，导入的技能带来源追溯（origin=源目录）。
 */
function ImportPanel({ repo, onClose, onDone }: { repo: RepoView; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreviewItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const dirs = text.split('\n').map((s) => s.trim()).filter(Boolean);

  const runPreview = async () => {
    setBusy(true);
    try {
      const res = await api<ImportPreviewItem[]>('/import/preview', { method: 'POST', body: JSON.stringify({ dirs }) });
      setPreview(res);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  const runImport = async () => {
    setBusy(true);
    try {
      const res = await api<{ source: string; imported: string[]; skipped: string[] }[]>('/import', { method: 'POST', body: JSON.stringify({ dirs, repoId: repo.id }) });
      const imported = res.reduce((n, r) => n + r.imported.length, 0);
      const skipped = res.reduce((n, r) => n + r.skipped.length, 0);
      toast.push(skipped ? t('import.doneSkipped', { n: imported, s: skipped }) : t('import.done', { n: imported }), 'good');
      setText(''); setPreview(null);
      onClose(); onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  const items: EntityItem[] = (preview ?? []).map((p) => ({
    id: p.source,
    title: <span className="mono">{p.source}</span>,
    sub: <span className="mono">{p.layout}{p.error ? ` · ${p.error}` : ''}</span>,
    status: <Badge tone="accent">{t('common.itemCount', { n: p.count })}</Badge>,
  }));

  return (
    <>
      <PathListField
        label={t('import.dirsLabel')}
        placeholder={'/path/to/skills\n/path/to/third-party-lib/skills'}
        rows={4}
        value={text}
        onChange={setText}
      />
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'calc(-1 * var(--sp-2))' }}>
        {t('import.note')}
      </div>
      {preview && (
        <EntityList items={items} title={t('import.previewCount', { n: items.length })} toggle={false} />
      )}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
        <Button size="sm" onClick={runPreview} loading={busy} disabled={dirs.length === 0}>{t('import.detect')}</Button>
        <Button variant="primary" loading={busy} disabled={!preview} onClick={runImport}>{t('import.start')}</Button>
      </div>
    </>
  );
}
