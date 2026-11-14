import { useMemo, useState, type ReactNode } from 'react';
import { api, type RepoView, type AgentCollectPreview, type AgentCollectItem, type ImportPreviewItem } from '../../api/types';
import EntityList, { type EntityItem } from '../../components/common/EntityList';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Segment from '../../components/ui/Segment';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Chip from '../../components/ui/Chip';
import SwitchLabel from '../../components/ui/SwitchLabel';
import { PathListField } from '../../components/ui/PathField';
import Switch from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { useAsync } from '../../state/useAsync';
import { rich, useI18n, type TFunc } from '../../i18n';

function collectStatusBadge(t: TFunc, adoptingRepo: boolean, exists: boolean, dest: string): ReactNode {
  if (adoptingRepo) return <Badge tone="info" title={t('collect.badge.keep.title')}>{t('collect.badge.keep')}</Badge>;
  if (exists) return <Badge tone="warn" title={t('collect.badge.overwrite.title', { dest })}>{t('collect.badge.overwrite')}</Badge>;
  return <Badge tone="good">{t('collect.badge.new')}</Badge>;
}

/** 「从 Agent 归集」预览行的状态徽标：仓库版 > 已存在 > 软链 > 无 */
function collectItemBadge(t: TFunc, it: AgentCollectItem): ReactNode {
  if (it.symlink && it.inRepo) {
    return <Badge tone="info" title={t('collect.repoVersionBadge.title', { target: it.linkTarget ?? '' })}>{t('badge.takenOver')}</Badge>;
  }
  if (it.exists) return <Badge tone="neutral" title={t('collect.existsBadge.title')}>{t('collect.existsBadge')}</Badge>;
  if (it.symlink) return <Badge tone="accent">{t('collect.sub.symlink')}</Badge>;
  return undefined;
}

/** 添加技能到自有仓库：归集（Agent 目录）与导入（外部数据源目录）的合并入口，进入后再选方式 */
export function AddSkillsModal({ repo, onClose, onDone }: Readonly<{ repo: RepoView | null; onClose: () => void; onDone: () => void }>) {
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
function CollectPanel({ repo, onClose, onDone }: Readonly<{ repo: RepoView; onClose: () => void; onDone: () => void }>) {
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
      // 有 Agent 候选时默认取第一个（已存在则默认保留仓库版），否则一律写回仓库
      if (!noop && agentCands.length > 0) chosen = exists ? REPO_KEY : agentCands[0].agent.agentKey;
      else chosen = REPO_KEY;
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
        byAgent[p.chosen] ??= [];
        byAgent[p.chosen].push(p.name);
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
              status: collectStatusBadge(t, adoptingRepo, p.exists, dest),
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
              status: collectItemBadge(t, it),
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

/**
 * 仓库级批量导入（EK-02）：把外部目录里的 skill 拷贝进指定自有仓库（面板，由 AddSkillsModal 承载）。
 * 目录仅作为本次导入的数据源（如第三方库的 skills 目录），不会登记进系统；
 * 同名 skill 已在目标仓库则去重跳过，导入的技能带来源追溯（origin=源目录）。
 */
function ImportPanel({ repo, onClose, onDone }: Readonly<{ repo: RepoView; onClose: () => void; onDone: () => void }>) {
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
