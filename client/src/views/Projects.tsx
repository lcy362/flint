import { useMemo, useState } from 'react';
import { api, type ProjectSkillsResp, type SkillCardView, type SkillAction, type AddableSkill, type AgentView, type RepoView, type ProjectPushResult } from '../api/types';
import SkillList from '../components/skill/SkillList';
import CollectSkillModal, { projectCollectSource } from '../components/skill/CollectSkillModal';
import AddableSkillList from '../components/skill/AddableSkillList';
import EntityList, { type EntityItem } from '../components/common/EntityList';
import FilterBar from '../components/common/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Modal from '../components/ui/Modal';
import { FieldInput } from '../components/ui/Field';
import { PathField } from '../components/ui/PathField';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../state/useAsync';
import { navigate, useRoute } from '../state/router';
import { joinList, useI18n } from '../i18n';

interface ProjectItem {
  id: number;
  path: string;
  tags: string[];
  agents?: string[];
  hasAgents?: boolean;
}

export default function Projects() {
  const { data, loading, error, reload } = useAsync<ProjectItem[]>(() => api('/projects'));
  const { t } = useI18n();
  const route = useRoute();
  const [createOpen, setCreateOpen] = useState(false);

  // 项目详情同样是地址的一部分，刷新后仍停留在原项目
  const selectedId = route.sub;
  const selected = selectedId ? (data ?? []).find((p) => String(p.id) === selectedId) : null;
  const openProject = (id: number) => navigate({ ...route, sub: String(id) });
  const backToList = () => navigate({ ...route, sub: null });

  const items: EntityItem[] = (data ?? []).map((p) => ({
    id: String(p.id),
    title: p.path,
    sub: p.tags.length ? p.tags.map((tag) => `#${tag}`).join(' ') : t('common.noTags'),
    onClick: () => openProject(p.id),
    actions: <span style={{ color: 'var(--c-ink-3)' }}>→</span>,
  }));

  return (
    <>
      <PageHeader
        title={t('nav.projects')}
        sub={data ? t('projects.subtitle', { n: data.length }) : undefined}
        actions={<Button onClick={() => setCreateOpen(true)}>{t('projects.new')}</Button>}
      />
      {selectedId ? (
        selected ? (
          <ProjectDetail project={selected} onBack={backToList} onChanged={reload} />
        ) : (
          <LoadingBoundary
            state={{ loading, error, data }}
            empty={{ title: t('projects.notFound.title'), hint: t('projects.notFound.hint', { id: selectedId }), icon: '❐' }}
          >
            {() => null}
          </LoadingBoundary>
        )
      ) : (
        <LoadingBoundary
          state={{ loading, error, data }}
          empty={{ title: t('projects.empty.title'), hint: t('projects.empty.hint'), icon: '❐' }}
        >
          {() => <EntityList items={items} title={t('list.allProjects')} />}
        </LoadingBoundary>
      )}

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); reload(); }} />
    </>
  );
}

function CreateProjectModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [path, setPath] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open={open}
      title={t('projects.new')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!path.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await api('/projects', {
                  method: 'POST',
                  body: JSON.stringify({ path, tags: tags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean) }),
                });
                toast.push(t('projects.created'), 'good');
                setPath(''); setTags('');
                onDone();
              } catch (e) {
                toast.push(e instanceof Error ? e.message : String(e), 'bad');
              } finally { setSaving(false); }
            }}
          >
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <PathField label={t('projects.path')} placeholder="/path/to/project" value={path} onChange={setPath} />
        <FieldInput
          label={t('projects.tags')}
          hint={t('projects.tagsHint')}
          placeholder="react, frontend"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function ProjectDetail({ project, onBack, onChanged }: { project: ProjectItem; onBack: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync<ProjectSkillsResp>(
    () => api(`/projects/${project.id}/skills`),
    [project.id]
  );
  const { data: agentData, reload: reloadAgents } = useAsync<AgentView[]>(() => api('/agents'));
  const { data: repos } = useAsync<RepoView[]>(() => api('/repos'));
  const [addOpen, setAddOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<ProjectPushResult | null>(null);
  // 归集到仓库：自带技能与 Agent 页共用同一个弹窗，这里只提供「项目 .agents/skills」来源适配器
  const [collectItem, setCollectItem] = useState<SkillCardView | null>(null);
  const collectApi = useMemo(() => projectCollectSource(project.id), [project.id]);
  /** 「部署到 Agent」列表的搜索词（与其它页面同一套 FilterBar 交互） */
  const [agentQ, setAgentQ] = useState('');
  const deployed = project.agents ?? [];

  const busy = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.push(t('common.updated'), 'good');
      reload();
      reloadAgents();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const toggleDeploy = (key: string, on: boolean) =>
    void busy(async () => {
      const next = on ? [...deployed, key] : deployed.filter((k) => k !== key);
      await api(`/projects/${project.id}/agents`, { method: 'PUT', body: JSON.stringify({ agents: next }) });
    });

  // 项目技能行的操作按 kind 分发：归集交给共用弹窗，删除走删除接口（无 on/off 开关）
  const handleAction = (item: SkillCardView, action: SkillAction) => {
    if (action.kind === 'collect') {
      setCollectItem(item);
      return;
    }
    if (action.kind === 'delete') {
      void busy(() => api(`/projects/${project.id}/skills/${encodeURIComponent(item.name)}`, { method: 'DELETE' }));
    }
  };

  const collectAddable = (item: AddableSkill) =>
    void busy(() =>
      api(`/projects/${project.id}/skills`, { method: 'POST', body: JSON.stringify({ id: item.id }) })
    );

  const saveTags = (tags: string[]) =>
    void busy(() => api(`/projects/${project.id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }));

  // 回写仓库（PJ-05）
  const push = async (repoId?: string) => {
    setPushing(true);
    try {
      const res = await api<ProjectPushResult>(`/projects/${project.id}/push`, {
        method: 'POST',
        body: JSON.stringify({ repoId: repoId || undefined }),
      });
      setPushResult(res);
      toast.push(res.pushed.length ? t('projects.push.done', { n: res.pushed.length }) : t('projects.push.nothing'), res.pushed.length ? 'good' : 'bad');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setPushing(false); }
  };

  // 先按搜索词过滤 Agent，再映射成列表项（EntityItem.title 是 ReactNode，不便直接搜索）
  const agentKeyword = agentQ.trim().toLowerCase();
  const shownAgents = useMemo(() => {
    const list = agentData ?? [];
    return agentKeyword ? list.filter((a) => `${a.name} ${a.key}`.toLowerCase().includes(agentKeyword)) : list;
  }, [agentData, agentKeyword]);

  const deployItems: EntityItem[] = shownAgents.map((a) => ({
    id: a.key,
    title: a.name,
    sub: <span className="mono">{a.key}</span>,
    status: deployed.includes(a.key) ? <Badge tone="good">{t('projects.deployed')}</Badge> : <Badge tone="neutral">{t('projects.notDeployed')}</Badge>,
    toggle: (
      <Switch
        aria-label={t('projects.deployAria', { name: a.name })}
        checked={deployed.includes(a.key)}
        onChange={(v) => toggleDeploy(a.key, v)}
      />
    ),
  }));

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>{t('common.back')}</Button>
        <h2 className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>{project.path}</h2>
        {project.tags.map((tag) => <Badge key={tag} tone="accent">#{tag}</Badge>)}
        <div className="detail-actions">
          <Button size="sm" variant="ghost" onClick={() => setTagOpen(true)} title={t('projects.tags.button.title')}>{t('projects.tags.button')}</Button>
          <Button size="sm" variant="ghost" loading={pushing} onClick={() => { setPushOpen(true); void push(); }} title={t('projects.push.title')}>{t('projects.push')}</Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>{t('common.add')}</Button>
          <Button size="sm" variant="primary" onClick={() => void busy(() => api(`/projects/${project.id}/sync`, { method: 'POST' }))} title={t('projects.sync.title')}>
            {t('projects.sync')}
          </Button>
        </div>
      </div>

      <LoadingBoundary state={{ loading, error, data }} empty={{ title: t('projects.noSkills'), icon: '○' }}>
        {(resp) => (
          <div className="panel">
            <SkillList title={t('projects.skillsCount', { n: resp.skills.length })} items={resp.skills} onAction={handleAction} />
          </div>
        )}
      </LoadingBoundary>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">{t('projects.deploy.section')}</span>
          <Badge tone={deployed.length ? 'accent' : 'neutral'} title={t('projects.deploy.badge.title')}>
            {t('projects.deploy.count', { n: deployed.length })}
          </Badge>
        </div>
        <p className="panel__hint">
          {t('projects.deploy.hint')}
        </p>
        <FilterBar
          search={{ value: agentQ, onChange: setAgentQ, placeholder: t('filter.searchAgentName') }}
          hasFilters={agentKeyword !== ''}
          onReset={() => setAgentQ('')}
        />
        <div style={{ marginTop: 'var(--sp-4)' }}>
          <EntityList
            title={agentKeyword ? `${t('list.filtered')} · ${deployItems.length} / ${(agentData ?? []).length}` : `${t('list.allAgents')} · ${deployItems.length}`}
            items={deployItems}
            collapsible
            storageKey="lsh.collapsed.project.agents"
            empty={agentKeyword ? <EmptyState title={t('projects.deploy.empty.match')} /> : <EmptyState title={t('projects.deploy.empty.none')} />}
          />
        </div>
      </div>

      <CollectSkillModal
        item={collectItem}
        source={collectApi}
        onClose={() => setCollectItem(null)}
        onDone={() => { setCollectItem(null); reload(); onChanged(); }}
      />

      <Modal open={addOpen} title={t('projects.addSkill.title')} onClose={() => setAddOpen(false)}
        footer={<Button variant="ghost" onClick={() => setAddOpen(false)}>{t('common.close')}</Button>}>
        <AddableSkillList items={data?.addable ?? []} onAdd={collectAddable} />
      </Modal>

      <TagModal
        open={tagOpen}
        tags={project.tags}
        onClose={() => setTagOpen(false)}
        onSave={(tags) => { saveTags(tags); setTagOpen(false); }}
      />

      <Modal open={pushOpen} title={t('projects.push')} onClose={() => setPushOpen(false)}
        footer={<Button variant="ghost" onClick={() => setPushOpen(false)}>{t('common.close')}</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <span style={{ fontSize: 'var(--fs-13)', color: 'var(--c-ink-2)' }}>
            {t('projects.push.note')}
          </span>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            {(repos ?? []).map((r) => (
              <Button key={r.id} size="sm" loading={pushing} onClick={() => void push(r.id)}>{t('projects.push.toRepo', { id: r.id })}</Button>
            ))}
          </div>
          {pushResult && (
            <div style={{ fontSize: 'var(--fs-13)' }}>
              <div>{t('projects.pushResult.pushed')} {joinList(pushResult.pushed) || t('projects.pushResult.none')}</div>
              {pushResult.skipped.length > 0 && <div style={{ color: 'var(--c-ink-3)' }}>{t('projects.pushResult.skipped')} {joinList(pushResult.skipped)}</div>}
              {pushResult.errors.length > 0 && <div style={{ color: 'var(--c-bad)' }}>{t('projects.pushResult.errors')} {joinList(pushResult.errors)}</div>}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function TagModal({ open, tags, onClose, onSave }: { open: boolean; tags: string[]; onClose: () => void; onSave: (tags: string[]) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(tags.join(', '));
  return (
    <Modal
      open={open}
      title={t('projects.tagsEdit.title')}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" onClick={() => onSave(text.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean))}>{t('common.save')}</Button></>}
    >
      <FieldInput
        label={t('projects.tags')}
        hint={t('projects.tagsEdit.hint')}
        placeholder="react, frontend"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  );
}
