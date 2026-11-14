import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type StateView, type SkillSearchResp, type SkillCardView } from '../api/types';
import { skillViewToCard } from '../components/skill/adapters';
import SkillList from '../components/skill/SkillList';
import { skillBadgeLegend } from '../components/skill/SkillBadges';
import BadgeLegend from '../components/common/BadgeLegend';
import FilterBar from '../components/common/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import MultiSelect from '../components/ui/MultiSelect';
import SwitchLabel from '../components/ui/SwitchLabel';
import { useAsync } from '../state/useAsync';
import { useViewMode } from '../state/viewMode';
import { navigate, useQueryFlag, useQueryList, useQueryParam, useRoute } from '../state/router';
import { rich, useI18n } from '../i18n';
import { LibraryDetailGate } from './library/SkillDetail';
import { ReposAndSources } from './library/ReposAndSources';

interface CardFilters {
  facets: string[];
  srcs: string[];
  untaggedOnly: boolean;
  kw: string;
  bodyHits: Record<string, string> | null;
}

/**
 * 关键词命中结果：
 * null = 没命中（应排除）；undefined = 未启用关键词；字符串 = 仅正文命中时的上下文。
 */
function keywordBodyHit(c: SkillCardView, f: CardFilters): string | undefined | null {
  if (!f.kw) return undefined;
  const hay = `${c.name} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase();
  const bodyCtx = f.bodyHits ? f.bodyHits[c.id] : undefined;
  // 元数据命中 → 常规展示；仅正文命中 → 附上下文；都没命中 → 排除
  if (hay.includes(f.kw)) return bodyCtx;
  return bodyCtx ?? null;
}

/** 标签 / 来源 / 未打标签三项条件是否都通过（关键词另算） */
function matchesFacetFilters(c: SkillCardView, f: CardFilters): boolean {
  if (f.facets.length > 0 && !f.facets.some((tag) => c.tags.includes(tag))) return false;
  if (f.srcs.length > 0 && !f.srcs.includes(c.source)) return false;
  if (f.untaggedOnly && c.tags.length > 0) return false;
  return true;
}

/** 技能库筛选：标签 / 来源 / 未打标签 / 关键词 */
function filterCards(cards: SkillCardView[], f: CardFilters): SkillCardView[] {
  const out: SkillCardView[] = [];
  for (const c of cards) {
    if (!matchesFacetFilters(c, f)) continue;
    const bodyCtx = keywordBodyHit(c, f);
    if (bodyCtx === null) continue;
    out.push(c.bodyHit ? c : { ...c, bodyHit: bodyCtx });
  }
  return out;
}

export default function Library() {
  const { data, loading, error, reload } = useAsync<StateView>(() => api('/state'));
  const { t } = useI18n();
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
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const allSources = useMemo(() => {
    const set = new Set<string>();
    data?.skills.forEach((s) => set.add(s.source));
    return [...set].sort((a, b) => a.localeCompare(b));
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

  // 正文搜索（F3）：关键词非空时按需拉取正文命中（防抖，避免连打触发多次请求）。
  // bodyHits: id -> 命中上下文；null 表示尚未加载（此时仅正文命中的卡片稍后出现）。
  const qTrim = q.trim().toLowerCase();
  const [bodyHits, setBodyHits] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!qTrim) { setBodyHits(null); return; }
    let alive = true;
    const handle = setTimeout(async () => {
      try {
        const resp = await api<SkillSearchResp>(`/skills/search?q=${encodeURIComponent(qTrim)}`);
        if (!alive) return;
        setBodyHits(Object.fromEntries(resp.hits.map((h) => [h.id, h.context ?? ''])));
      } catch {
        if (alive) setBodyHits({});
      }
    }, 220);
    return () => { alive = false; clearTimeout(handle); };
  }, [qTrim]);

  const shown = useMemo(
    () => filterCards(cards, { facets, srcs, untaggedOnly, kw: qTrim, bodyHits }),
    [cards, facets, qTrim, srcs, untaggedOnly, bodyHits],
  );

  // 来源默认值（自有仓库）不算筛选；仅当用户在地址栏显式筛过来源时，重置才出现
  const srcInUrl = route.query.get('src');
  const hasFilter = !!(facets.length > 0 || untaggedOnly || q.trim() || (!!srcInUrl && srcs.length > 0));
  const clearFilters = () => {
    setQ(''); setSrcs([]); setFacets([]); setUntaggedOnly(false);
  };

  // 重新拉取 /state 期间 data 会短暂为 null：详情页不能因此被卸载（会闪一下、并丢掉页面内的弹窗与编辑态），
  // 用最近一次成功的数据兜住详情目标。
  const lastData = useRef<StateView | null>(null);
  if (data) lastData.current = data;
  const detailTarget = detailId ? (data ?? lastData.current)?.skills.find((s) => s.id === detailId) : undefined;

  return (
    <>
      {/* 详情页不再重复列表标题：页名在顶栏面包屑，本节标题由详情头承担 */}
      {detailId === null && (
        <PageHeader
          title={t('nav.library')}
          sub={data ? t('library.subtitle', { n: data.skills.length }) : undefined}
        />
      )}

      {detailId !== null ? (
        <LibraryDetailGate
          detailId={detailId}
          skill={detailTarget}
          loading={loading}
          error={error}
          data={data}
          allTags={allTags}
          onBack={closeDetail}
          onChanged={reload}
        />
      ) : (
        <>
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

          <div className="listing">
            <LoadingBoundary
              state={{ loading, error, data }}
              empty={{ title: t('library.empty.title'), hint: t('library.empty.hint'), icon: '◈' }}
            >
              {() => (
                <SkillList
                  title={`${hasFilter ? t('list.filtered') : t('list.allSkills')} · ${shown.length}${hasFilter ? ' / ' + cards.length : ''}`}
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
            <div className="listing">
              <ReposAndSources repos={data.repos} sources={data.sources} reload={reload} />
            </div>
          )}
        </>
      )}
    </>
  );
}
