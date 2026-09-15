import { useState } from 'react';
import { api, type CustomAgentView, type LogView, type SettingsView } from '../api/types';
import EntityList from '../components/common/EntityList';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Switch from '../components/ui/Switch';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import { FieldSelect } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { AddAgentModal } from '../components/agent/AddAgentModal';
import { useAsync } from '../state/useAsync';
import { LANG_OPTIONS, useI18n } from '../i18n';

/**
 * 设置：界面语言、默认同步策略、watcher 开关、自定义 Agent、日志。
 *
 * 不含「活跃 Agent 集合」——它回答的是「这个目录要不要跟着自动同步」，
 * 属于 Agent 自身的决策，放在「智能体」页各 Agent 详情页里设置（单 Agent 粒度，就近可改）。
 */
export default function Settings() {
  const { data: settings, loading: settingsLoading, error: settingsError, reload: reloadSettings } = useAsync<SettingsView>(() => api('/settings'));
  const { data: customs, reload: reloadCustoms } = useAsync<CustomAgentView[]>(() => api('/agents/custom'));
  const { data: logs, reload: reloadLogs } = useAsync<LogView>(() => api('/logs?tail=300'));
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const putSetting = async (patch: Partial<SettingsView>) => {
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(patch) });
      toast.push(t('settings.saved'), 'good');
      reloadSettings();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  /** 下载服务端日志文件（供 issue 上报） */
  const downloadLogs = async () => {
    try {
      const res = await fetch('/api/logs/download');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'skills-hub.log';
      a.click();
      URL.revokeObjectURL(url);
      toast.push(t('settings.logs.downloaded'), 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  /** 一键复制诊断信息（markdown），直接粘贴到 GitHub issue */
  const copyDiag = async () => {
    const md = [
      t('settings.diag.title'),
      '',
      t('settings.diag.version', { v: logs?.version ?? '?' }),
      t('settings.diag.platform', { v: navigator.platform }),
      t('settings.diag.browser', { v: navigator.userAgent }),
      t('settings.diag.logPath', { v: logs?.path ?? '?' }),
      t('settings.diag.logSize', { v: logs?.size ?? 0 }),
      '',
      t('settings.diag.recentLogs'),
      '```',
      ...(logs?.lines ?? []),
      '```',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(md);
      toast.push(t('settings.diag.copied'), 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  return (
    <>
      <PageHeader
        title={t('nav.settings')}
        sub={t('app.settings.sub')}
        actions={<Button variant="ghost" onClick={() => { reloadSettings(); reloadCustoms(); reloadLogs(); }}>{t('common.refresh')}</Button>}
      />

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">{t('settings.section.language')}</span>
        </div>
        <div style={{ maxWidth: 300 }}>
          <FieldSelect
            label={t('settings.language.label')}
            value={lang}
            hint={t('settings.language.hint')}
            onChange={(e) => setLang(e.target.value as 'en' | 'zh')}
          >
            {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FieldSelect>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">{t('settings.section.sync')}</span>
        </div>
        <LoadingBoundary state={{ loading: settingsLoading, error: settingsError, data: settings }} empty={{ title: t('settings.syncEmpty'), icon: '⚙' }}>
          {(s) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div style={{ maxWidth: 300 }}>
                <FieldSelect
                  label={t('settings.defaultSync')}
                  value={s.defaultSync}
                  hint={t('settings.defaultSync.hint')}
                  onChange={(e) => void putSetting({ defaultSync: e.target.value as SettingsView['defaultSync'] })}
                >
                  <option value="symlink">{t('settings.sync.symlink')}</option>
                  <option value="copy">{t('settings.sync.copy')}</option>
                </FieldSelect>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <Switch checked={s.watchers} onChange={(v) => void putSetting({ watchers: v })} />
                  <span style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }}>
                    {t('settings.watchers')}
                  </span>
                </label>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'var(--sp-1)' }}>
                  {t('settings.watchers.hint')}
                </div>
              </div>
            </div>
          )}
        </LoadingBoundary>
      </div>

      <div className="panel">
        <EntityList
          title={t('settings.section.custom')}
          toolbar={<Button size="sm" onClick={() => setAddOpen(true)}>{t('settings.custom.add')}</Button>}
          hideToggle
          empty={<EmptyState title={t('settings.custom.empty.title')} hint={t('settings.custom.empty.hint')} />}
          items={(customs ?? []).map((c) => ({
            id: c.key,
            title: c.name,
            sub: <span className="mono">{c.key}</span>,
            desc: <span className="mono">{c.globalDir}{c.projectDir ? ` · ${c.projectDir}` : ''}</span>,
            status: c.recursive ? <Badge tone="info">{t('settings.custom.recursive')}</Badge> : undefined,
            actions: (
              <Button size="sm" variant="danger" onClick={async () => {
                try { await api(`/agents/custom/${encodeURIComponent(c.key)}`, { method: 'DELETE' }); toast.push(t('common.deleted'), 'good'); reloadCustoms(); }
                catch (e) { toast.push(e instanceof Error ? e.message : String(e), 'bad'); }
              }}>{t('common.delete')}</Button>
            ),
          }))}
        />
      </div>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">{t('settings.section.logs')}</span>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginLeft: 'auto' }}>
            <Button size="sm" variant="ghost" onClick={() => reloadLogs()}>{t('common.refresh')}</Button>
            <Button size="sm" variant="ghost" onClick={() => void downloadLogs()}>{t('settings.logs.download')}</Button>
            <Button size="sm" onClick={() => void copyDiag()}>{t('settings.logs.copyDiag')}</Button>
          </div>
        </div>
        <p style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)', marginBottom: 'var(--sp-3)' }}>
          {t('settings.logs.hint')}
        </p>
        <LoadingBoundary state={{ loading: !logs, error: undefined, data: logs }} empty={{ title: t('settings.logs.empty'), icon: '▤' }}>
          {(lg) => (
            <>
              <div className="mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-2)', marginBottom: 'var(--sp-2)' }}>
                {lg.path} · {lg.size} bytes · v{lg.version}
              </div>
              <pre style={{
                maxHeight: 360,
                overflow: 'auto',
                margin: 0,
                padding: 'var(--sp-3)',
                background: 'var(--c-bg-2)',
                border: '1px solid var(--c-line)',
                borderRadius: 'var(--r-md)',
                fontSize: 'var(--fs-12)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>{lg.lines.join('\n') || t('settings.logs.noContent')}</pre>
            </>
          )}
        </LoadingBoundary>
      </div>

      <AddAgentModal open={addOpen} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reloadCustoms(); }} />
    </>
  );
}
