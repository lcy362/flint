import { useEffect, useState, type ReactNode } from 'react';
import {
  api,
  type AgentCollectItem,
  type AgentCollectPreview,
  type CollectResult,
  type SkillCardView,
  type StateView,
} from '../../api/types';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import { FieldSelect } from '../ui/Field';
import SwitchLabel from '../ui/SwitchLabel';
import { useToast } from '../ui/Toast';
import { useAsync } from '../../state/useAsync';
import { joinList, rich, useI18n } from '../../i18n';

/**
 * 归集来源适配器：把「某目录里的技能 → 仓库」这条链路的接口差异收敛到一处，
 * 让 Agent 全局技能目录与项目 .agents/skills 复用同一个归集弹窗 ——
 * 用户在两处看到的流程、文案与状态判定完全一致。
 */
export interface CollectSourceApi {
  /** 该来源在指定仓库下的归集预览项（不存在时 null） */
  preview: (repoId: string, name: string) => Promise<AgentCollectItem | null>;
  /** 把该技能复制进仓库；replaceNames 用于覆盖仓库里已有的同名副本 */
  collect: (repoId: string, name: string, replaceNames?: string[]) => Promise<CollectResult>;
  /** 接管：把来源目录里的条目纳入本工具管理（落地形态由 takeoverKind 决定） */
  takeover: (repoId: string, name: string) => Promise<{ ok: boolean; reason?: string }>;
  /**
   * 接管落地的形态，决定弹窗文案与预期结果：
   * - symlink：换成指向仓库副本的软链。用于 Agent 目录——本机私有、不进 git，只留一份本体；
   * - copy：用仓库那一版覆盖为真实副本。用于项目 .agents/skills——要提交、要跨机器自包含。
   */
  takeoverKind: 'symlink' | 'copy';
}

/** Agent 全局技能目录作为归集来源 */
export function agentCollectSource(agentKey: string, agentName: string): CollectSourceApi {
  return {
    preview: async (repoId, name) => {
      const list = await api<AgentCollectPreview[]>(`/repos/${encodeURIComponent(repoId)}/collect/preview`);
      const a = list.find((x) => x.agentKey === agentKey) ?? list.find((x) => x.agentName === agentName);
      return a?.items.find((it) => it.name === name) ?? null;
    },
    collect: (repoId, name, replaceNames) =>
      api<CollectResult>(`/repos/${encodeURIComponent(repoId)}/collect`, {
        method: 'POST',
        body: JSON.stringify({ agentKey, names: [name], replaceNames }),
      }),
    takeoverKind: 'symlink',
    // 接管成功后登记为该 Agent 的启用项（与技能库/Agent 页原流程一致），之后由本工具维护它
    takeover: async (repoId, name) => {
      const t = await api<{ linked: boolean; reason?: string }>(`/repos/${encodeURIComponent(repoId)}/takeover`, {
        method: 'POST',
        body: JSON.stringify({ agentKey, name, confirm: true }),
      });
      if (t.linked) {
        await api(`/agents/${encodeURIComponent(agentKey)}`, {
          method: 'PUT',
          body: JSON.stringify({ skill: name, on: true }),
        });
      }
      return { ok: t.linked, reason: t.reason };
    },
  };
}

/** 项目 .agents/skills 作为归集来源（接管落真实副本，服务端同时登记为项目期望项） */
export function projectCollectSource(projectId: number): CollectSourceApi {
  return {
    preview: async (repoId, name) => {
      const g = await api<AgentCollectPreview>(`/projects/${projectId}/collect/preview?repo=${encodeURIComponent(repoId)}`);
      return g.items.find((it) => it.name === name) ?? null;
    },
    collect: (repoId, name, replaceNames) =>
      api<CollectResult>(`/projects/${projectId}/collect`, {
        method: 'POST',
        body: JSON.stringify({ repoId, name, replaceNames }),
      }),
    takeoverKind: 'copy',
    takeover: async (repoId, name) => {
      const t = await api<{ taken: boolean; reason?: string }>(`/projects/${projectId}/takeover`, {
        method: 'POST',
        body: JSON.stringify({ repoId, name, confirm: true }),
      });
      return { ok: t.taken, reason: t.reason };
    },
  };
}

/**
 * 归集到仓库弹窗（Agent 详情 / 项目详情共用）。
 * 流程：选目标仓库 → 预览（仓库是否已有同名、是否已指向仓库本体）→ 归集（可选「同时接管」）。
 */
export default function CollectSkillModal({
  item,
  source,
  onClose,
  onDone,
}: {
  /** 待归集的技能；null 表示关闭 */
  item: SkillCardView | null;
  /** 归集来源适配器（页面用 useMemo 保持引用稳定，避免预览重复请求） */
  source: CollectSourceApi;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const { data: state } = useAsync<StateView>(() => api('/state'));
  const repos = state?.repos;
  const [repo, setRepo] = useState('');
  const [takeoverOn, setTakeoverOn] = useState(false);
  const [preview, setPreview] = useState<AgentCollectItem | null>(null);
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'none'>('loading');
  /** 仓库已有同名时：false=保持仓库现状（默认），true=用来源版本覆盖仓库副本 */
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  // 打开时重置接管开关；目标仓库沿用上次选择（多仓库时少一次点选）
  useEffect(() => {
    if (!item) return;
    setTakeoverOn(false);
    setRepo((prev) => prev || (state?.repos ?? [])[0]?.id || '');
  }, [item, state]);

  // 归集前先查该仓库的归集预览：仓库是否已有同名、是否已指向仓库本体
  useEffect(() => {
    if (!item || !repo) { setPreview(null); setPreviewState('none'); return; }
    let alive = true;
    setPreviewState('loading');
    setPreview(null);
    setOverwrite(false);
    source.preview(repo, item.name)
      .then((it) => { if (alive) { setPreview(it); setPreviewState(it ? 'ready' : 'none'); } })
      .catch(() => { if (alive) { setPreview(null); setPreviewState('none'); } });
    return () => { alive = false; };
  }, [item, repo, source]);

  const previewExists = preview?.exists === true;
  const previewInRepo = !!preview && preview.symlink && preview.inRepo === true;
  const canCollect = previewState === 'ready' && !previewInRepo;

  const run = async () => {
    if (!item || !repo || !canCollect) return;
    const name = item.name;
    setBusy(true);
    try {
      const res = await source.collect(repo, name, previewExists && overwrite ? [name] : undefined);
      if (res.collected.length) toast.push(t('collectModal.collected', { name }), 'good');
      else toast.push(t('collectModal.notCollected', { reason: joinList(res.skipped) || t('collectModal.noChange') }), 'bad');

      if (takeoverOn) {
        const tr = await source.takeover(repo, name);
        if (!tr.ok) toast.push(t('collectModal.takeoverFailed', { reason: tr.reason ?? t('collectModal.takeoverUnknown') }), 'bad');
        else toast.push(
          symlinkMode
            ? t('collectModal.takeoverDone.symlink')
            : t('collectModal.takeoverDone.copy'),
          'good',
        );
      }
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  // 接管形态决定文案：Agent 目录建软链（省一份副本），项目 .agents/skills 落真实副本（要提交、要自包含）
  const symlinkMode = source.takeoverKind === 'symlink';
  const takeoverLabel = symlinkMode
    ? t('collectModal.takeover.symlink')
    : t('collectModal.takeover.copy');
  const takeoverNotes: ReactNode[] = [];
  if (takeoverOn) {
    takeoverNotes.push(<span key="order">{t('collectModal.note.order')}</span>);
    if (item?.reason === 'external') {
      takeoverNotes.push(
        <span key="ext">{rich(symlinkMode ? t('collectModal.note.externalSymlinkToLink') : t('collectModal.note.externalSymlinkToCopy'))}</span>
      );
    } else if (previewExists && !overwrite) {
      takeoverNotes.push(<span key="keep">{rich(t('collectModal.note.keepRepo'))}</span>);
    } else {
      takeoverNotes.push(<span key="replace">{rich(t('collectModal.note.replaceByRepo'))}</span>);
    }
    takeoverNotes.push(
      <span key="form">{rich(symlinkMode ? t('collectModal.note.formSymlink') : t('collectModal.note.formCopy'))}</span>
    );
    takeoverNotes.push(<span key="reg">{rich(t('collectModal.note.register'))}</span>);
  }

  return (
    <Modal
      open={!!item}
      title={t('collectModal.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!repo || !canCollect} onClick={() => void run()}>{t('collectModal.button')}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <p className="panel__hint" style={{ marginBottom: 0 }}>
          {rich(t('collectModal.intro', { name: item?.name ?? '' }))}
        </p>
        {(repos ?? []).length === 0 ? (
          <EmptyState title={t('collectModal.noRepo.title')} hint={t('collectModal.noRepo.hint')} />
        ) : (
          <FieldSelect label={t('collectModal.targetRepo')} value={repo} onChange={(e) => setRepo(e.target.value)}>
            {(repos ?? []).map((r) => <option key={r.id} value={r.id}>{r.name || r.id}</option>)}
          </FieldSelect>
        )}

        {item?.reason === 'external' && (
          <p className="panel__hint" style={{ marginBottom: 0 }}>
            {rich(t('collectModal.externalNote', { target: item.linkTarget ?? '' }))}
          </p>
        )}

        {previewState === 'loading' && repo && (
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{t('collectModal.checking')}</span>
        )}
        {previewState === 'none' && (
          <p className="panel__hint" style={{ marginBottom: 0 }}>
            {t('collectModal.notCollectable')}
          </p>
        )}
        {previewState === 'ready' && previewInRepo && (
          <p className="panel__hint" style={{ marginBottom: 0 }}>
            {t('collectModal.alreadyLinked')}
          </p>
        )}
        {previewState === 'ready' && !previewInRepo && previewExists && (
          <FieldSelect
            label={t('collectModal.existsLabel')}
            hint={t('collectModal.existsHint')}
            value={overwrite ? 'overwrite' : 'keep'}
            onChange={(e) => setOverwrite(e.target.value === 'overwrite')}
          >
            <option value="keep">{t('collectModal.keep')}</option>
            <option value="overwrite">{t('collectModal.overwrite')}</option>
          </FieldSelect>
        )}

        <SwitchLabel checked={takeoverOn} onChange={setTakeoverOn} disabled={!canCollect}>
          {takeoverLabel}
        </SwitchLabel>
        {takeoverOn && (
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
            {takeoverNotes}
          </div>
        )}
      </div>
    </Modal>
  );
}
