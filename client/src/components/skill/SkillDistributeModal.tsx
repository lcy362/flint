import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type AgentView, type SkillAgentsResp, type SyncResult } from '../../api/types';
import { groupAgentsByDir, type AgentGroup } from '../agent/agentGroups';
import { agentGroupItem } from '../agent/agentGroupItems';
import EntityList, { type EntityItem } from '../common/EntityList';
import FilterBar from '../common/FilterBar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import LoadingBoundary from '../ui/LoadingBoundary';
import Modal from '../ui/Modal';
import Switch from '../ui/Switch';
import SwitchLabel from '../ui/SwitchLabel';
import { useToast } from '../ui/Toast';
import { useViewMode } from '../../state/viewMode';
import { rich, useI18n } from '../../i18n';

/** 目录里这条技能为何不可移除：后端只允许移除本工具部署的软链 / 副本 */
type LockedReason = 'own' | 'external';

/** 一行 = 一个实际技能目录（同目录的多个智能体共用同一份实体，与智能体页同一口径） */
interface DirDeployRow {
  group: AgentGroup;
  /** 该技能已分发到这个目录（目录里实际有这条同名的自身技能） */
  distributed: boolean;
  /** 已存在但不可移除的原因（智能体自带真实目录 / 外部软链） */
  locked?: LockedReason;
}

/**
 * 「分发到智能体」弹窗：技能视角下的智能体管理。
 *
 * 只是把已有的两个入口搬到技能视角（接口与智能体详情页「从技能库添加 / 删除」完全一致）：
 * - 打开开关 → `POST /agents/:key/skills { id }`（一次性部署，软链 / 复制遵循该目录策略）
 * - 关闭开关 → `DELETE /agents/:key/skills/:name`（只删本工具部署的软链 / 副本）
 *
 * 已分发清单走一次聚合只读查询 `GET /skills/:name/agents`（各目录只看自己那一条），
 * 不再逐个目录调 `/agents/:key/skills`——那样每个请求都会整体重扫一遍技能库，目录一多就明显卡。
 *
 * 列表与智能体页共用同一套卡片口径（`agentGroupItem`）：一个实际目录一张卡、搜索与视图切换
 * 都在同一条筛选栏上，只多出一个「这个技能有没有分发过来」的开关。默认卡片视图。
 */
export default function SkillDistributeModal({
  open,
  skill,
  onClose,
}: Readonly<{
  open: boolean;
  skill: { id: string; name: string };
  onClose: () => void;
}>) {
  const { t } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<DirDeployRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 首次拉取完成前不给列表（LoadingBoundary 用）；完成后即使再拉也保留旧行，避免闪一下 */
  const [loaded, setLoaded] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyInstalled, setOnlyInstalled] = useState(false);
  const [viewMode, setViewMode] = useViewMode();

  /** 一次问两件事：各目录的卡片口径（/agents）＋ 这条技能都落在哪些目录里（/skills/:name/agents） */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agents, presence] = await Promise.all([
        api<AgentView[]>('/agents'),
        api<SkillAgentsResp>(`/skills/${encodeURIComponent(skill.name)}/agents`),
      ]);
      const byKey = new Map(presence.agents.map((a) => [a.key, a]));
      const next: DirDeployRow[] = groupAgentsByDir(agents).map((g) => {
        const hit = byKey.get(g.primary.key);
        const locked: LockedReason | undefined =
          hit?.reason === 'own' ? 'own' : hit?.reason === 'external' ? 'external' : undefined;
        return { group: g, distributed: !!hit?.present, locked };
      });
      setRows(next);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [skill.name]);

  // 每次打开重读一次；关闭后清空，下次打开不展示上一次的旧状态
  useEffect(() => {
    if (open) {
      void load();
      return;
    }
    setRows([]);
    setLoaded(false);
    setError(null);
  }, [open, load]);

  const deployed = rows.filter((r) => r.distributed).length;

  // 与智能体页同一套搜索口径：Agent 名、key 与目录路径都参与匹配
  const kw = q.trim().toLowerCase();
  const filtered = !!kw || onlyInstalled;
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (onlyInstalled && !r.group.installed) return false;
        if (!kw) return true;
        return `${r.group.names.join(' ')} ${r.group.keys.join(' ')} ${r.group.dir}`.toLowerCase().includes(kw);
      }),
    [rows, kw, onlyInstalled]
  );

  const lockedLabel = (reason: LockedReason) =>
    reason === 'own' ? t('skillDetail.distribute.locked.own') : t('skillDetail.distribute.locked.external');
  const lockedTitle = (reason: LockedReason) =>
    reason === 'own' ? t('skillDetail.distribute.locked.own.title') : t('skillDetail.distribute.locked.external.title');

  /**
   * 分发 / 移除：沿用智能体详情页的两个接口。
   * 成功后就地改这一行的状态（乐观更新，与预设页的高频开关同一约定）——不重新拉取整份清单，
   * 开关不会因为「重拉期间列表被清空」而闪一下；失败保持原状并由 toast 说明原因。
   */
  const toggle = async (row: DirDeployRow, on: boolean) => {
    const key = row.group.primary.key;
    const agent = row.group.names.join(' / ');
    setBusyKey(key);
    try {
      if (on) {
        const res = await api<SyncResult>(`/agents/${encodeURIComponent(key)}/skills`, {
          method: 'POST',
          body: JSON.stringify({ id: skill.id }),
        });
        // 部署可能「静默失败」（HTTP 200 但 failed 非空，如技能已不在库里）：按结果判成败
        const failed = res.failed ?? [];
        if (failed.length > 0) throw new Error(failed[0].reason);
      } else {
        await api(`/agents/${encodeURIComponent(key)}/skills/${encodeURIComponent(skill.name)}`, { method: 'DELETE' });
      }
      setRows((prev) => prev.map((r) => (r.group.primary.key === key ? { ...r, distributed: on, locked: undefined } : r)));
      toast.push(t(on ? 'skillDetail.distribute.added' : 'skillDetail.distribute.removed', { agent }), 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusyKey(null);
    }
  };

  const items: EntityItem[] = shown.map((row) =>
    agentGroupItem(row.group, t, {
      // 这个技能与目录的关系是本弹窗的主信息，排在智能体自身徽标之前
      extraBadges: (
        <>
          {row.distributed
            ? <Badge tone="good">{t('skillDetail.distribute.installed')}</Badge>
            : <Badge tone="neutral">{t('skillDetail.distribute.missing')}</Badge>}
          {row.locked && <Badge tone="neutral" title={lockedTitle(row.locked)}>{lockedLabel(row.locked)}</Badge>}
        </>
      ),
      toggle: (
        <Switch
          aria-label={t('skillDetail.distribute.toggleAria', { name: skill.name, agent: row.group.names.join(' / ') })}
          checked={row.distributed}
          disabled={busyKey === row.group.primary.key || (row.distributed && !!row.locked)}
          onChange={(on) => void toggle(row, on)}
        />
      ),
    })
  );

  return (
    <Modal
      open={open}
      width={720}
      title={t('skillDetail.distribute.title', { name: skill.name })}
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}
    >
      <p className="panel__hint">{rich(t('skillDetail.distribute.hint'))}</p>
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: t('filter.searchAgent') }}
        controls={<SwitchLabel checked={onlyInstalled} onChange={setOnlyInstalled}>{t('agents.onlyInstalled')}</SwitchLabel>}
        hasFilters={filtered}
        onReset={() => { setQ(''); setOnlyInstalled(false); }}
        actions={loaded && (
          <Badge tone={deployed > 0 ? 'accent' : 'neutral'} title={t('skillDetail.distribute.count.title')}>
            {t('skillDetail.distribute.count', { n: deployed, total: rows.length })}
          </Badge>
        )}
        view={{ value: viewMode, onChange: setViewMode }}
      />
      <div style={{ marginTop: 'var(--sp-4)' }}>
        <LoadingBoundary
          state={{ loading, error, data: loaded ? rows : null }}
          empty={{ title: t('skillDetail.distribute.empty'), icon: '◉' }}
        >
          {() => (
            <EntityList
              title={`${filtered ? t('list.filtered') : t('skillDetail.distribute.list')} · ${shown.length}${filtered ? ' / ' + rows.length : ''}`}
              items={items}
              hideToggle
              empty={<EmptyState title={filtered ? t('skillDetail.distribute.empty.match') : t('skillDetail.distribute.empty')} />}
            />
          )}
        </LoadingBoundary>
      </div>
    </Modal>
  );
}
