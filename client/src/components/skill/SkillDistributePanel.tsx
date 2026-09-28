import { useState } from 'react';
import { api, type AgentSkillsResp, type AgentView } from '../../api/types';
import { groupAgentsByDir } from '../agent/agentGroups';
import { notInstalledBadge } from '../agent/agentBadges';
import EntityList, { type EntityItem } from '../common/EntityList';
import Badge from '../ui/Badge';
import LoadingBoundary from '../ui/LoadingBoundary';
import Switch from '../ui/Switch';
import { useToast } from '../ui/Toast';
import { useAsync } from '../../state/useAsync';
import { rich, useI18n } from '../../i18n';

/** 目录里这条技能为何不可移除：后端只允许移除本工具部署的软链 / 副本 */
type LockedReason = 'own' | 'external';

/** 一行 = 一个实际技能目录（同目录的多个 Agent 共用同一份实体，与 Agent 页同一口径） */
interface DirDeployRow {
  /** 目录的主 Agent key：分发 / 移除都落在它身上（一个目录只有一套策略） */
  key: string;
  dir: string;
  /** 使用该目录的全部 Agent 名（主 Agent 在前） */
  names: string[];
  /** 该技能已分发到这个目录（目录里实际有这条同名的自身技能） */
  distributed: boolean;
  /** 该目录在本机已存在（未安装的目录也能部署，这里只作提示） */
  dirInstalled: boolean;
  /** 已存在但不可移除的原因（Agent 自带真实目录 / 外部软链） */
  locked?: LockedReason;
}

/**
 * 技能详情里的「分发到 Agent」。
 *
 * 只是把已有的两个入口搬到技能视角（接口与 Agent 详情页「直接添加 / 删除」完全一致）：
 * - 打开开关 → `POST /agents/:key/skills { id }`（一次性部署，软链 / 复制遵循该目录策略）
 * - 关闭开关 → `DELETE /agents/:key/skills/:name`（只删本工具部署的软链 / 副本）
 * 「已分发到哪些 Agent」按各目录的实际内容反查（物理为准），不读任何期望集。
 */
export default function SkillDistributePanel({
  skill,
  home,
  onChanged,
}: Readonly<{
  skill: { id: string; name: string };
  /** 用户主目录：把绝对路径显示成 ~ 开头的短形式 */
  home?: string;
  /** 分发结果会改变技能库可见到的状态，通知外层刷新 */
  onChanged: () => void;
}>) {
  const { t } = useI18n();
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // 已分发清单：按目录读实际内容，命中同名技能即已分发。
  // 只读共享目录读到的行不算「分发到本目录」——那边由标准目录自己的策略管理。
  const { data, loading, error, reload } = useAsync<DirDeployRow[]>(
    async () => {
      const agents = await api<AgentView[]>('/agents');
      return Promise.all(
        groupAgentsByDir(agents).map(async (g) => {
          const resp = await api<AgentSkillsResp>(`/agents/${encodeURIComponent(g.primary.key)}/skills`);
          const row = resp.skills.find((s) => s.name === skill.name && s.readVia !== 'shared');
          return {
            key: g.primary.key,
            dir: g.dir,
            names: g.names,
            distributed: !!row,
            dirInstalled: g.installed,
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
    [skill.id, skill.name]
  );

  const rows = data ?? [];
  const deployed = rows.filter((r) => r.distributed).length;

  const lockedLabel = (reason: LockedReason) =>
    reason === 'own' ? t('skillDetail.distribute.locked.own') : t('skillDetail.distribute.locked.external');
  const lockedTitle = (reason: LockedReason) =>
    reason === 'own' ? t('skillDetail.distribute.locked.own.title') : t('skillDetail.distribute.locked.external.title');

  /** 分发 / 移除：沿用 Agent 详情页的两个接口，成功后重读本面板并通知外层 */
  const toggle = (row: DirDeployRow, on: boolean) => {
    const agent = row.names.join(' / ');
    setBusyKey(row.key);
    const req = on
      ? api(`/agents/${encodeURIComponent(row.key)}/skills`, { method: 'POST', body: JSON.stringify({ id: skill.id }) })
      : api(`/agents/${encodeURIComponent(row.key)}/skills/${encodeURIComponent(skill.name)}`, { method: 'DELETE' });
    req
      .then(() => {
        toast.push(t(on ? 'skillDetail.distribute.added' : 'skillDetail.distribute.removed', { agent }), 'good');
        reload();
        onChanged();
      })
      .catch((e) => toast.push(e instanceof Error ? e.message : String(e), 'bad'))
      .finally(() => setBusyKey(null));
  };

  const shortDir = (p: string) => (home && p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p);

  // 已分发的目录排前面：这一区的首要用途就是「看这个技能装到了哪些 Agent」；
  // 本机还没这个目录的 Agent 沉到最后（照样可部署，只是不占视线）
  const items: EntityItem[] = [...rows]
    .sort(
      (a, b) =>
        Number(b.distributed) - Number(a.distributed) ||
        Number(b.dirInstalled) - Number(a.dirInstalled) ||
        a.names[0].localeCompare(b.names[0])
    )
    .map((row) => ({
      id: row.key,
      title: row.names.join(' / '),
      sub: <span className="mono">{shortDir(row.dir)}</span>,
      badges: (
        <>
          {row.locked && <Badge tone="neutral" title={lockedTitle(row.locked)}>{lockedLabel(row.locked)}</Badge>}
          {!row.dirInstalled && notInstalledBadge(t)}
        </>
      ),
      status: row.distributed
        ? <Badge tone="good">{t('skillDetail.distribute.installed')}</Badge>
        : <Badge tone="neutral">{t('skillDetail.distribute.missing')}</Badge>,
      toggle: (
        <Switch
          aria-label={t('skillDetail.distribute.toggleAria', { name: skill.name, agent: row.names.join(' / ') })}
          checked={row.distributed}
          disabled={busyKey === row.key || (row.distributed && !!row.locked)}
          onChange={(on) => toggle(row, on)}
        />
      ),
    }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <span className="field-label" style={{ marginBottom: 0 }}>{t('skillDetail.distribute')}</span>
        {data && (
          <Badge tone={deployed > 0 ? 'accent' : 'neutral'} title={t('skillDetail.distribute.count.title')}>
            {t('skillDetail.distribute.count', { n: deployed, total: rows.length })}
          </Badge>
        )}
      </div>
      <p className="panel__hint" style={{ marginTop: 'var(--sp-1)' }}>{rich(t('skillDetail.distribute.hint'))}</p>
      <LoadingBoundary
        state={{ loading, error, data }}
        empty={{ title: t('skillDetail.distribute.empty'), icon: '◉' }}
      >
        {() => <EntityList mode="list" toggle={false} items={items} hideToggle />}
      </LoadingBoundary>
    </div>
  );
}
