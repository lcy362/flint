import { useMemo, useState } from 'react';
import { api, type AgentView, type AgentSkillsResp, type PresetView, type SkillAction, type SkillCardView, type AddableSkill, type SyncResult } from '../api/types';
import SkillList from '../components/skill/SkillList';
import AddableSkillList from '../components/skill/AddableSkillList';
import EntityList, { type EntityItem } from '../components/common/EntityList';
import FilterBar from '../components/common/FilterBar';
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
import { groupAgentsByDir } from '../components/agent/agentGroups';
import {
  AGENT_BADGE_LEGEND,
  activeBadge,
  familyBadge,
  notInstalledBadge,
  ownerBadge,
  presetBadge,
  syncBadge,
} from '../components/agent/agentBadges';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { useViewMode } from '../state/viewMode';
import { navigate, useQueryFlag, useQueryParam, useRoute } from '../state/router';

export default function Agents() {
  const { data, loading, error, reload } = useAsync<AgentView[]>(() => api('/agents'));
  const route = useRoute();
  const [q, setQ] = useQueryParam('q');
  const [onlyInstalled, setOnlyInstalled] = useQueryFlag('installed');

  // 详情页由地址决定：直达 / 刷新都能稳定回到同一个 Agent
  const selectedKey = route.sub;
  const selected = selectedKey ? (data ?? []).find((a) => a.key === selectedKey) : null;
  const openAgent = (key: string) => navigate({ ...route, sub: key });
  const backToList = () => navigate({ ...route, sub: null });

  // 一个实际技能目录一张卡片：同目录的多个 Agent 收进同一张卡
  const groups = useMemo(() => groupAgentsByDir(data ?? []), [data]);
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (onlyInstalled && !g.installed) return false;
      if (!kw) return true;
      return `${g.names.join(' ')} ${g.keys.join(' ')} ${g.dir}`.toLowerCase().includes(kw);
    });
  }, [groups, q, onlyInstalled]);
  const filtered = !!q.trim() || onlyInstalled;
  const [viewMode, setViewMode] = useViewMode();

  // 同一目录的其它 Agent（详情页里互相跳转用）
  const siblings: AgentView[] = selected
    ? (data ?? []).filter((a) => a.globalDir === selected.globalDir && a.key !== selected.key)
    : [];

  const items: EntityItem[] = shown.map((g) => {
    const { primary } = g;
    const multi = g.agents.length > 1;
    return {
      id: g.dir,
      // 标题罗列使用该目录的全部 Agent —— 它们都是真实的 Agent，不把谁叫「别名」；
      // 每个名字可单独点开自己的详情，卡片空白处仍进主 Agent
      title: multi ? (
        // 外层包一个元素：列表视图的标题是 inline-flex，多个兄弟节点会被拉开间距
        <span>
          {g.agents.map((a, i) => (
            <span key={a.key}>
              {i > 0 && <span className="entity-title__sep"> / </span>}
              <button
                type="button"
                className="entity-title__link"
                title={`打开 ${a.name} 的详情`}
                onClick={(e) => { e.stopPropagation(); openAgent(a.key); }}
              >
                {a.name}
              </button>
            </span>
          ))}
        </span>
      ) : primary.name,
      sub: <span className="mono">{g.keys.join(' / ')}</span>,
      desc: <span className="mono">{g.dir}</span>,
      status: activeBadge({ active: g.anyActive }),
      // 分发策略展示主 Agent 的生效值：目录只有一份，策略也只有一套，
      // 所以多 Agent 共用一个目录时用「策略随 X」交代这套策略属于谁
      badges: (
        <>
          {multi && ownerBadge(primary.name)}
          {syncBadge(primary.sync)}
          {presetBadge(primary.preset ?? null)}
          {!g.installed && notInstalledBadge()}
        </>
      ),
      onClick: () => openAgent(primary.key),
      muted: !g.anyActive,
    };
  });

  return (
    <>
      <PageHeader
        title="智能体"
        sub={data ? `共 ${groups.length} 个技能目录 · ${data.length} 个 Agent` : undefined}
        actions={<Button variant="ghost" onClick={reload}>刷新</Button>}
      />
      {selectedKey ? (
        selected ? (
          <AgentDetail agent={selected} siblings={siblings} onOpenAgent={openAgent} onBack={backToList} onChanged={reload} />
        ) : (
          <LoadingBoundary
            state={{ loading, error, data }}
            empty={{ title: '未找到该 Agent', hint: `没有 key 为「${selectedKey}」的 Agent。`, icon: '◉' }}
          >
            {() => null}
          </LoadingBoundary>
        )
      ) : (
        <>
          <div className="panel">
            <FilterBar
              search={{ value: q, onChange: setQ, placeholder: '搜索名称 / key / 目录' }}
              controls={<SwitchLabel checked={onlyInstalled} onChange={setOnlyInstalled}>只看已安装</SwitchLabel>}
              hasFilters={filtered}
              onReset={() => { setQ(''); setOnlyInstalled(false); }}
              actions={
                <BadgeLegend
                  title="卡片上的标签是什么意思？"
                  items={AGENT_BADGE_LEGEND}
                  intro={
                    <>
                      每张卡片对应一个<strong>实际的技能目录</strong>。多个 Agent 用同一个目录时合成一张卡：标题罗列这些 Agent（可逐个点开各自详情），其中的<strong>主 Agent</strong> 决定这个目录的分发策略——徽标里的「策略随 X」就说明这套设置属于谁，改动也落在它身上（可在 Agent 详情页更换主 Agent）。
                    </>
                  }
                />
              }
              view={{ value: viewMode, onChange: setViewMode }}
            />
          </div>
          <LoadingBoundary
            state={{ loading, error, data }}
            empty={{ title: '暂无 Agent', hint: '系统中尚未登记任何 Agent。', icon: '◉' }}
          >
            {() => (
              <EntityList
                items={items}
                title={`${filtered ? '筛选结果' : '全部技能目录'} · ${items.length}${filtered ? ` / ${groups.length}` : ''}`}
                hideToggle
              />
            )}
          </LoadingBoundary>
        </>
      )}
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
  const toast = useToast();
  const { data, loading, error, reload } = useAsync<AgentSkillsResp>(
    () => api(`/agents/${encodeURIComponent(agent.key)}/skills`),
    [agent.key]
  );
  const { data: presets } = useAsync<PresetView[]>(() => api('/presets'));
  const [addOpen, setAddOpen] = useState(false);
  const [dirOpen, setDirOpen] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  const busy = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      // 非活跃 Agent 的显式改动由服务端就地同步，因此与活跃态一样是「已同步」
      toast.push('已更新并同步', 'good');
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
      if (failed > 0) toast.push(`同步完成，但有 ${failed} 项失败`, 'bad');
      else toast.push(`已同步：新增 ${res.created.length} / 移除 ${res.removed.length}`, 'good');
      for (const w of res.warnings ?? []) toast.push(w, 'bad');
      reload();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setSyncing(false); }
  };

  const handleAction = (item: SkillCardView, action: SkillAction) => {
    void busy(async () => {
      switch (action.kind) {
        case 'delete':
          await api(`/agents/${encodeURIComponent(agent.key)}/skills/${encodeURIComponent(item.name)}`, { method: 'DELETE' });
          break;
        case 'collect':
          await api(`/agents/${encodeURIComponent(agent.key)}/sync`, { method: 'POST' });
          break;
        case 'toggle':
        default:
          await api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: item.state !== 'on' }) });
      }
    });
  };

  const handleToggle = (item: SkillCardView) =>
    void busy(() =>
      api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: item.state !== 'on' }) })
    );

  const collectAddable = (item: AddableSkill) =>
    void busy(() =>
      api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ skill: item.name, on: true }) })
    );

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

  const managed = (data?.skills ?? []).filter((s) => s.state === 'on');

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
    status: <Badge tone="bad">失败</Badge>,
  }));

  const syncModeItems: EntityItem[] = managed.map((s) => ({
    id: s.id,
    title: s.name,
    sub: <span className="mono">{s.source}</span>,
    actions: (
      <FieldSelect
        aria-label={`${s.name} 安装方式`}
        value={agent.skillSync?.[s.name] ?? agent.sync}
        onChange={(e) => setSkillSync(s.name, e.target.value as 'symlink' | 'copy')}
      >
        <option value="symlink">软链安装（不复制文件，即时生效）</option>
        <option value="copy">复制安装（独立副本，需重新同步）</option>
      </FieldSelect>
    ),
  }));

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>← 返回</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{agent.name}</h2>
        {activeBadge(agent)}
        {siblings.length > 0 && (isAlias
          ? <Badge tone="info" title="它与同目录的主 Agent 共用一个技能目录：预设 / 安装方式以主 Agent 为准">同目录</Badge>
          : <Badge tone="accent" title="该技能目录的主 Agent：预设 / 安装方式与同步都以它为准">主 Agent</Badge>)}
        {familyBadge(agent)}
        <div className="detail-actions">
          <Button size="sm" variant={agent.active ? 'ghost' : 'primary'} onClick={toggleActive} title="加入/移出活跃集合（加入即刻就位）">
            {agent.active ? '移出活跃' : '设为活跃'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDirOpen(true)} title="覆盖该 Agent 的全局/项目 skill 目录">
            目录
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} title="把技能库里的技能加入此 Agent">添加</Button>
          <Button size="sm" variant="primary" loading={syncing} onClick={() => void runSync()} title="重新部署该 Agent 的技能">同步</Button>
        </div>
      </div>

      {!agent.active && (
        <div className="notice">
          <span className="notice__title">此 Agent 未加入活跃集合</span>
          <span className="notice__body">
            {activeSiblings.length > 0
              ? `它所在的技能目录由 ${activeSiblings.join('、')} 的活跃状态保持自动同步（策略仍以主 Agent 为准）；本 Agent 的改动会立即落盘。`
              : '你在本页的改动会立即同步到它；但预设、仓库等变更不会自动跟随，需要在这里手动点「同步」。加入活跃集合即可自动跟随。'}
          </span>
        </div>
      )}

      {isAlias && (
        <div className="notice">
          <span className="notice__title">它与「{primaryAgent?.name ?? agent.primaryKey}」共用一个技能目录</span>
          <span className="notice__body">
            目录只有一份实体，预设 / 安装方式也只有一套，以主 Agent「{primaryAgent?.name ?? agent.primaryKey}」为准。
            在这里改策略等同改主 Agent，两边看到的始终一致。
          </span>
        </div>
      )}

      <div className="panel">
        <div className="page-head__title" style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--sp-3)' }}>
          分发策略{isAlias ? `（作用于主 Agent ${primaryAgent?.name ?? agent.primaryKey}）` : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--sp-3)' }}>
          {siblings.length > 0 && (
            <FieldSelect
              label="主 Agent"
              value={designatedKey}
              hint="同一个目录只有一套策略，由主 Agent 决定；换主 Agent 即换这套策略"
              onChange={(e) => setPrimaryAgent(e.target.value)}
            >
              <option value="auto">自动（活跃优先，其次名称序）</option>
              {members.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
            </FieldSelect>
          )}
          <FieldSelect
            label="关联预设"
            value={agent.preset ?? ''}
            hint="取一个预设作为分发基准；不选则只分发下方单独开启的技能"
            onChange={(e) => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ preset: e.target.value || null }) }))}
          >
            <option value="">不使用预设</option>
            {(presets ?? []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </FieldSelect>
          <FieldSelect
            label="默认安装方式"
            value={agent.sync}
            hint="可在下方按技能单独覆盖"
            onChange={(e) => void busy(() => api(`/agents/${encodeURIComponent(agent.key)}`, { method: 'PUT', body: JSON.stringify({ sync: e.target.value }) }))}
          >
            <option value="symlink">软链安装（不复制文件，即时生效）</option>
            <option value="copy">复制安装（独立副本，需重新同步）</option>
          </FieldSelect>
        </div>
        <div style={{ marginTop: 'var(--sp-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          <span className="mono">全局 {agent.globalDir}</span>
          {agent.project && <span className="mono">项目 {agent.project}</span>}
          {siblings.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
              与
              {siblings.map((o) => (
                <Tag key={o.key} onClick={() => onOpenAgent(o.key)}>{o.name}</Tag>
              ))}
              指向同一个技能目录（目录只有一份，分发一次它们共用）
            </span>
          )}
          {agent.alsoUsedBy?.length ? <span>该目录也被 {agent.alsoUsedBy.join('、')} 直接读取，无需单独安装</span> : null}
        </div>
      </div>

      {lastSync && lastSync.failed.length > 0 && (
        <div className="panel">
          <EntityList title="同步失败项" items={failedItems} />
        </div>
      )}

      <LoadingBoundary state={{ loading, error, data }} empty={{ title: '该 Agent 暂无技能', icon: '○' }}>
        {(resp) => (
          <div className="panel">
            <SkillList
              title={`该目录技能（${resp.skills.length}）`}
              items={resp.skills}
              onToggle={handleToggle}
              onAction={handleAction}
            />
          </div>
        )}
      </LoadingBoundary>

      <div className="panel">
        <EntityList
          title="按技能覆盖安装方式"
          items={syncModeItems}
          empty={<EmptyState title="当前没有已启用的技能" />}
        />
      </div>

      <Modal open={addOpen} title="添加技能" onClose={() => setAddOpen(false)}
        footer={<Button variant="ghost" onClick={() => setAddOpen(false)}>关闭</Button>}>
        <AddableSkillList items={data?.addable ?? []} onAdd={collectAddable} />
      </Modal>

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
      toast.push('目录已覆盖', 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title={`覆盖目录 · ${agent.name}`}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={save}>保存</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <PathField label="全局技能目录" value={globalDir} onChange={setGlobalDir} />
        <FieldInput
          label="项目级技能目录（相对项目根）"
          hint="相对路径，不支持系统选择器，请手动输入"
          value={projectDir}
          onChange={(e) => setProjectDir(e.target.value)}
        />
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>留空恢复内置约定；覆盖后视为已安装可用。</span>
      </div>
    </Modal>
  );
}
