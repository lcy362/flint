import { useEffect, useState } from 'react';
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
  /** 接管：把来源目录里的条目换成指向仓库副本的软链（含登记为受管项） */
  takeover: (repoId: string, name: string) => Promise<{ linked: boolean; reason?: string }>;
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
      return t;
    },
  };
}

/** 项目 .agents/skills 作为归集来源（服务端接管时已同步登记为项目期望项） */
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
    takeover: (repoId, name) =>
      api<{ linked: boolean; reason?: string }>(`/projects/${projectId}/takeover`, {
        method: 'POST',
        body: JSON.stringify({ repoId, name, confirm: true }),
      }),
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
      if (res.collected.length) toast.push(`已归集「${name}」到仓库`, 'good');
      else toast.push(`未复制到仓库：${res.skipped.join('；') || '无变化'}`, 'bad');

      if (takeoverOn) {
        const t = await source.takeover(repo, name);
        if (!t.linked) toast.push(`接管未完成：${t.reason ?? '未知原因'}`, 'bad');
        else toast.push('已接管：该目录已改为指向仓库副本的软链', 'good');
      }
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!item}
      title="归集到仓库"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} disabled={!repo || !canCollect} onClick={() => void run()}>归集</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <p className="panel__hint" style={{ marginBottom: 0 }}>
          把 <span className="mono">{item?.name}</span> 复制进选定仓库，之后各 Agent / 项目都能共享；
          <strong>该目录里的原技能保持不动</strong>。
        </p>
        {(repos ?? []).length === 0 ? (
          <EmptyState title="还没有登记仓库" hint="先到「技能库」登记一个自有仓库，再来归集。" />
        ) : (
          <FieldSelect label="目标仓库" value={repo} onChange={(e) => setRepo(e.target.value)}>
            {(repos ?? []).map((r) => <option key={r.id} value={r.id}>{r.name || r.id}</option>)}
          </FieldSelect>
        )}

        {item?.reason === 'external' && (
          <p className="panel__hint" style={{ marginBottom: 0 }}>
            注意：该目录里当前是一个指向别处的软链。归集会把<span className="mono">{item.linkTarget}</span>里的内容复制进仓库
            （该外部目录本身不会被改动或删除）。
          </p>
        )}

        {previewState === 'loading' && repo && (
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>正在检查该仓库是否已有同名技能…</span>
        )}
        {previewState === 'none' && (
          <p className="panel__hint" style={{ marginBottom: 0 }}>
            这一条不在可归集清单里（可能是失效软链，或不是带 SKILL.md 的技能目录），暂时无法归集。
          </p>
        )}
        {previewState === 'ready' && previewInRepo && (
          <p className="panel__hint" style={{ marginBottom: 0 }}>
            它已经是指向本仓库的软链，内容就是仓库本体，无需归集。
          </p>
        )}
        {previewState === 'ready' && !previewInRepo && previewExists && (
          <FieldSelect
            label="仓库已有同名技能"
            hint="与技能库归集一致：保持现状则不动仓库副本，覆盖会先删除仓库里的同名目录再写入来源版本"
            value={overwrite ? 'overwrite' : 'keep'}
            onChange={(e) => setOverwrite(e.target.value === 'overwrite')}
          >
            <option value="keep">保持仓库现状（不覆盖）</option>
            <option value="overwrite">用来源版本覆盖仓库副本</option>
          </FieldSelect>
        )}

        <SwitchLabel checked={takeoverOn} onChange={setTakeoverOn} disabled={!canCollect}>
          同时接管：把该目录里的技能换成指向仓库副本的软链
        </SwitchLabel>
        {takeoverOn && (
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
            <span>接管在归集完成后执行：</span>
            {item?.reason === 'external' ? (
              <span>· 该目录这条软链改为<strong>指向仓库副本</strong>；它指向的外部目录不受影响，原链接不再保留。</span>
            ) : previewExists && !overwrite ? (
              <span>· 该目录里的这条技能会被移除：你选的是「保持仓库现状」，这版内容不会进仓库，接管后使用方读到的是仓库那一版。</span>
            ) : (
              <span>· 该目录里的这条技能<strong>直接移除</strong>（内容已在仓库副本里，不会丢失）。</span>
            )}
            <span>· 在原位置建立<strong>指向仓库副本的软链</strong>：以后改仓库里这份技能，使用方立刻生效，不再有第二份副本。</span>
            <span>· 该技能<strong>登记为受管项</strong>，之后由本工具维护它。</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
