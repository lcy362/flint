import { useMemo, useState } from 'react';
import { api, type AgentSkillsResp, type AgentView } from '../../api/types';
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
import { useAsync } from '../../state/useAsync';
import { useViewMode } from '../../state/viewMode';
import { rich, useI18n } from '../../i18n';

/** 目录里这条技能为何不可移除：后端只允许移除本工具部署的软链 / 副本 */
type LockedReason = 'own' | 'external';

/** 一行 = 一个实际技能目录（同目录的多个 Agent 共用同一份实体，与智能体页同一口径） */
interface DirDeployRow {
  group: AgentGroup;
  /** 该技能已分发到这个目录（目录里实际有这条同名的自身技能） */
  distributed: boolean;
  /** 已存在但不可移除的原因（Agent 自带真实目录 / 外部软链） */
  locked?: LockedReason;
}

/**
 * 「分发到智能体」弹窗：技能视角下的智能体管理。
 *
 * 只是把已有的两个入口搬到技能视角（接口与智能体详情页「从技能库添加 / 删除」完全一致）：
 * - 打开开关 → `POST /agents/:key/skills { id }`（一次性部署，软链 / 复制遵循该目录策略）
 * - 关闭开关 → `DELETE /agents/:key/skills/:name`（只删本工具部署的软链 / 副本）
 *
 * 列表与智能体页共用同一套卡片口径（`agentGroupItem`）：一个实际目录一张卡、搜索与视图切换
 * 都在同一条筛选栏上，只多出一个「这个技能有没有分发过来」的开关。默认卡片视图。
 */
export default function SkillDistributeModal({
  open,
  skill,
  onClose,
  onChanged,
}: Readonly<{
  open: boolean;
  skill: { id: string; name: string };
  onClose: () => void;
  /** 分发结果会改变技能库可见到的状态，通知外层刷新 */
  onChanged: () => void;
}>) {
  const { t } = useI18n();
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyInstalled, setOnlyInstalled] = useState(false);
  const [viewMode, setViewMode] = useViewMode();

  // 已分发清单：按目录读实际内容，命中同名技能即已分发。
  // 只读共享目录读到的行不算「分发到本目录」——那边由标准目录自己的策略管理。
  const { data, loading, error, reload } = useAsync<DirDeployRow[]>(
    async () => {
      if (!open) return [];
      const agents = await api<AgentView[]>('/agents');
      return Promise.all(
        groupAgentsByDir(agents).map(async (g) => {
          const resp = await api<AgentSkillsResp>(`/agents/${encodeURIComponent(g.primary.key)}/skills`);
          const row = resp.skills.find((s) => s.name === skill.name && s.readVia !== 'shared');
          return {
            group: g,
            distributed: !!row,
            locked: !row
              ? undefined
              : row.reason === 'own'
                ? ('own' as const)
                : row.reason === 'external'
                  ? ('external' as const)
                  : undefined,
          };
        })
      );
    },
    [open, skill.id, skill.name]
  );

  const rows = data ?? [];
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

  /** 分发 / 移除：沿用智能体详情页的两个接口，成功后重读本弹窗并通知外层 */
  const toggle = (row: DirDeployRow, on: boolean) => {
    const agent = row.group.names.join(' / ');
    const key = row.group.primary.key;
    setBusyKey(key);
    const req = on
      ? api(`/agents/${encodeURIComponent(key)}/skills`, { method: 'POST', body: JSON.stringify({ id: skill.id }) })
      : api(`/agents/${encodeURIComponent(key)}/skills/${encodeURIComponent(skill.name)}`, { method: 'DELETE' });
    req
      .then(() => {
        toast.push(t(on ? 'skillDetail.distribute.added' : 'skillDetail.distribute.removed', { agent }), 'good');
        reload();
        onChanged();
      })
      .catch((e) => toast.push(e instanceof Error ? e.message : String(e), 'bad'))
      .finally(() => setBusyKey(null));
  };

  const items: EntityItem[] = shown.map((row) =>
    agentGroupItem(row.group, t, {
      // 这个技能与目录的关系是本弹窗的主信息，排在 Agent 自身徽标之前
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
          onChange={(on) => toggle(row, on)}
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
        actions={data && (
          <Badge tone={deployed > 0 ? 'accent' : 'neutral'} title={t('skillDetail.distribute.count.title')}>
            {t('skillDetail.distribute.count', { n: deployed, total: rows.length })}
          </Badge>
        )}
        view={{ value: viewMode, onChange: setViewMode }}
      />
      <div style={{ marginTop: 'var(--sp-4)' }}>
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: t('skillDetail.distribute.empty'), icon: '◉' }}
        >
          {() => (
            <EntityList
              title={`${filtered ? t('list.filtered') : t('list.allSkillDirs')} · ${shown.length}${filtered ? ' / ' + rows.length : ''}`}
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
