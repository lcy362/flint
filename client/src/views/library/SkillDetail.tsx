import { useState } from 'react';
import { api, type StateView, type SkillContent, type SkillSecurityResult, type SkillSecurityFinding } from '../../api/types';
import SkillDistributeModal from '../../components/skill/SkillDistributeModal';
import FoldButton from '../../components/common/FoldButton';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LoadingBoundary from '../../components/ui/LoadingBoundary';
import Chip from '../../components/ui/Chip';
import { FieldInput } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { useAsync } from '../../state/useAsync';
import { useCollapsed } from '../../state/collapse';
import { joinList, useI18n, type TFunc } from '../../i18n';

export function LibraryDetailGate({
  detailId, skill, loading, error, data, allTags, onBack, onChanged,
}: Readonly<{
  detailId: string;
  skill: StateView['skills'][number] | undefined;
  loading: boolean;
  error: string | null;
  data: StateView | null;
  allTags: string[];
  onBack: () => void;
  onChanged: () => void;
}>) {
  const { t } = useI18n();
  if (skill) {
    return <SkillDetail key={skill.id} skill={skill} allTags={allTags} onBack={onBack} onChanged={onChanged} />;
  }
  return (
    <LoadingBoundary
      state={{ loading, error, data }}
      empty={{ title: t('library.notFound.title'), hint: t('library.notFound.hint', { id: detailId }), icon: '◈' }}
    >
      {() => null}
    </LoadingBoundary>
  );
}

function severityTone(sev: string): 'bad' | 'warn' | 'neutral' {
  if (sev === 'error') return 'bad';
  if (sev === 'warn') return 'warn';
  return 'neutral';
}

function severityText(sev: string, t: TFunc): string {
  if (sev === 'error') return t('health.status.error');
  if (sev === 'warn') return t('health.status.warn');
  return 'INFO';
}

function findingKey(f: SkillSecurityFinding): string {
  return `${f.file}:${f.line ?? ''}:${f.ruleId}:${f.excerpt}`;
}

function SecurityHitList({
  findings, issues,
}: Readonly<{ findings: SkillSecurityFinding[]; issues: { kind: string; message: string }[] }>) {
  const { t } = useI18n();
  return (
    <div className="diag-group" style={{ padding: 0 }}>
      {findings.map((f) => (
        <div key={findingKey(f)} className="diag-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-1)' }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <Badge tone={severityTone(f.severity)}>{severityText(f.severity, t)}</Badge>
            <span className="diag-row__msg">{f.rule}</span>
            <span className="mono" style={{ color: 'var(--c-ink-3)', fontSize: 'var(--fs-12)' }}>
              {f.line ? `${f.file}:${f.line}` : f.file}
            </span>
          </span>
          {f.excerpt && (
            <pre className="mono" style={{ margin: 0, padding: 'var(--sp-2) var(--sp-3)', background: 'var(--c-bg-2)', border: '1px solid var(--c-line)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-12)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--c-ink-2)' }}>{f.excerpt}</pre>
          )}
        </div>
      ))}
      {issues.map((it) => (
        <div key={`${it.kind}:${it.message}`} className="diag-row">
          <Badge tone="warn">{t('health.status.warn')}</Badge>
          <span className="diag-row__msg">{it.message}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 技能详情页（UI-03 / TG-01 / IM-04）：元数据 + 标签编辑 + 来源追溯 + 分发到 Agent + SKILL.md 预览。
 *
 * 与 Agent / 项目详情同一形态：详情也是地址的一部分（route.sub），刷新后仍停留在同一个技能；
 * 组件以 skill.id 作 key 挂载，切换技能时标签草稿自然重置。
 */
function SkillDetail({
  skill,
  allTags,
  onBack,
  onChanged,
}: Readonly<{
  skill: StateView['skills'][number];
  allTags: string[];
  onBack: () => void;
  /** 标签保存 / 分发变更后同步技能库（分发弹窗内部自行重读） */
  onChanged: () => void;
}>) {
  const { t } = useI18n();
  const toast = useToast();
  const [tags, setTags] = useState<string[]>(skill.tags ?? []);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [distributeOpen, setDistributeOpen] = useState(false);

  const { data: content, loading, reload: reloadContent } = useAsync<SkillContent>(
    () => api(`/skills/${encodeURIComponent(skill.id)}/content`),
    [skill.id]
  );

  // 内容体检（F1/F2）：进详情自动跑一次（单技能扫描很快），用户可点「重新检测」重跑。
  // 与体检中心 content 维度同源；第三方只读来源由服务端返回 own:false。
  const { data: security, loading: secLoading, reload: reloadSecurity } = useAsync<SkillSecurityResult>(
    () => api(`/skills/${encodeURIComponent(skill.id)}/security`),
    [skill.id]
  );

  // 内容风险区块默认折叠：不持久化，保证每次进详情都是收起态（需要时再展开）。
  const [secCollapsed, toggleSecCollapsed] = useCollapsed(undefined, true);
  // 折叠态也要能快速判读：把 error / warn 计数提到标题栏（info 级不计入，与列表徽标同口径）
  const findings = security?.findings ?? [];
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warnCount = findings.filter((f) => f.severity === 'warn').length + (security?.issues.length ?? 0);
  const riskCount = errorCount + warnCount;

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
    // 输入框中未点「添加」/未回车确认的文本，保存时一并纳入，避免「输入了却打不上」
    const finalTags = newTag.trim() ? addTagInput(newTag, tags) : tags;
    setSaving(true);
    try {
      await api(`/skills/${encodeURIComponent(skill.id)}`, { method: 'PATCH', body: JSON.stringify({ tags: finalTags }) });
      setTags(finalTags);
      setNewTag('');
      toast.push(t('skillDetail.saved'), 'good');
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setSaving(false); }
  };

  /** F4：从已登记来源刷新仓库副本（用户显式动作）。成功后在本页重拉内容。 */
  const refreshFromSource = async () => {
    if (!content?.provenance) return;
    setRefreshing(true);
    try {
      await api(`/skills/${encodeURIComponent(skill.id)}/refresh`, { method: 'POST' });
      toast.push(t('skillDetail.refreshed'), 'good');
      reloadContent();
    } catch (e) {
      toast.push(String((e as Error)?.message ?? e), 'bad');
    } finally { setRefreshing(false); }
  };

  const provenance = content?.provenance;

  return (
    <>
      <div className="detail-head">
        <Button variant="ghost" size="sm" className="back-btn" onClick={onBack}>{t('common.back')}</Button>
        <h1 className="detail-head__title">{skill.name}</h1>
        <Badge tone="info">{skill.source}</Badge>
        {skill.version && <Badge tone="neutral">v{skill.version}</Badge>}
        {skill.origin && <Badge tone="accent" title={t('badge.reason.own.title')}>{t('skillDetail.origin', { origin: skill.origin })}</Badge>}
        {provenance?.takenAt && (
          <Badge tone="neutral" title={provenance.sourceType === 'git' ? t('skillDetail.sourceGit') : t('skillDetail.sourceDir')}>
            {t('skillDetail.sourceKind', { kind: provenance.sourceType === 'git' ? t('skillDetail.kind.git') : t('skillDetail.kind.dir') })}
          </Badge>
        )}
        <div className="detail-actions">
          <Button size="sm" onClick={() => setDistributeOpen(true)} title={t('skillDetail.distribute.title', { name: skill.name })}>
            {t('skillDetail.distribute')}
          </Button>
          {provenance?.takenAt && (
            <Button size="sm" loading={refreshing} onClick={refreshFromSource} title={t('skillDetail.refreshHint')}>
              {t('skillDetail.refresh')}
            </Button>
          )}
          <Button size="sm" variant="primary" loading={saving} onClick={save}>{t('common.save')}</Button>
        </div>
      </div>

      <section className="detail-section">
        <div className="panel panel--quiet">
          <div className="mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{skill.dir}</div>
          {skill.description && <p style={{ color: 'var(--c-ink-2)', marginTop: 'var(--sp-2)' }}>{skill.description}</p>}
          {provenance?.takenAt && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
              <span className="mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{provenance.sourceRef}</span>
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
                {t('skillDetail.takenAt', { date: new Date(provenance.takenAt).toLocaleString() })}
              </span>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">{t('filter.tags')}</span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', maxWidth: 480 }}>
            <div style={{ flex: 1 }}>
              <FieldInput placeholder={t('skillDetail.newTag')} value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNew()} />
            </div>
            <Button onClick={addNew}>{t('common.add')}</Button>
          </div>
          <div style={{ marginTop: 'var(--sp-3)' }}>
            {/* 库内已有标签 + 本次新增的标签，一并作为可多选的候选项 */}
            <Chip
              options={[...allTags, ...tags.filter((tag) => !allTags.includes(tag))].map((tag) => ({ label: tag, value: tag }))}
              selected={tags}
              multiple
              onChange={setTags}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">{t('skillDetail.security.title')}</span>
            {/* 折叠态也能判读：计数 + 主动运行 / 重跑（纯只读，不改动任何文件）+ 折叠开关 */}
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              {riskCount > 0 && (
                <Badge tone={errorCount > 0 ? 'bad' : 'warn'} title={t('badge.content.title', { error: errorCount, warn: warnCount })}>
                  {riskCount}
                </Badge>
              )}
              <Button size="sm" loading={secLoading} onClick={reloadSecurity}>
                {t('skillDetail.security.run')}
              </Button>
              <FoldButton expanded={!secCollapsed} label={t('skillDetail.security.title')} onClick={toggleSecCollapsed} />
            </span>
          </div>
          {!secCollapsed && (
            <>
              {secLoading && !security && <span style={{ color: 'var(--c-ink-3)' }}>{t('common.loading')}</span>}
              {security && !security.own && (
                <span style={{ color: 'var(--c-ink-3)', fontSize: 'var(--fs-13)' }}>{t('skillDetail.security.notOwn')}</span>
              )}
              {security?.own && (riskCount === 0 ? (
                <Badge tone="good" dot="good">{t('skillDetail.security.clean')}</Badge>
              ) : (
                <SecurityHitList findings={findings} issues={security.issues} />
              ))}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">SKILL.md</span>
          </div>
          {loading && <span style={{ color: 'var(--c-ink-3)' }}>{t('common.loading')}</span>}
          {content && (
            <>
              <pre className="mono" style={{
                maxHeight: 480, overflow: 'auto', padding: 'var(--sp-3)',
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
      </section>

      {/* 分发到智能体：与智能体详情页同一套接口与卡片口径，只换了视角（技能 → 目录） */}
      <SkillDistributeModal
        open={distributeOpen}
        skill={skill}
        onClose={() => setDistributeOpen(false)}
      />
    </>
  );
}
