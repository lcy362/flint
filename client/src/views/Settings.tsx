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

/**
 * 设置：默认同步策略、watcher 开关、自定义 Agent、日志。
 *
 * 不含「活跃 Agent 集合」——它回答的是「这个目录要不要跟着自动同步」，
 * 属于 Agent 自身的决策，放在「智能体」页各 Agent 详情页里设置（单 Agent 粒度，就近可改）。
 */
export default function Settings() {
  const { data: settings, loading: settingsLoading, error: settingsError, reload: reloadSettings } = useAsync<SettingsView>(() => api('/settings'));
  const { data: customs, reload: reloadCustoms } = useAsync<CustomAgentView[]>(() => api('/agents/custom'));
  const { data: logs, reload: reloadLogs } = useAsync<LogView>(() => api('/logs?tail=300'));
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const putSetting = async (patch: Partial<SettingsView>) => {
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(patch) });
      toast.push('设置已保存', 'good');
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
      toast.push('日志已下载', 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  /** 一键复制诊断信息（markdown），直接粘贴到 GitHub issue */
  const copyDiag = async () => {
    const md = [
      '# skills-hub 诊断信息',
      '',
      `- 版本：${logs?.version ?? '?'}`,
      `- 平台：${navigator.platform}`,
      `- 浏览器：${navigator.userAgent}`,
      `- 服务端日志路径：${logs?.path ?? '?'}`,
      `- 服务端日志大小：${logs?.size ?? 0} bytes`,
      '',
      '## 最近日志',
      '```',
      ...(logs?.lines ?? []),
      '```',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(md);
      toast.push('已复制，可在 GitHub issue 中粘贴', 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  return (
    <>
      <PageHeader
        title="设置"
        sub="默认同步策略、自定义 Agent 与日志"
        actions={<Button variant="ghost" onClick={() => { reloadSettings(); reloadCustoms(); reloadLogs(); }}>刷新</Button>}
      />

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">同步策略</span>
        </div>
        <LoadingBoundary state={{ loading: settingsLoading, error: settingsError, data: settings }} empty={{ title: '无设置', icon: '⚙' }}>
          {(s) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div style={{ maxWidth: 300 }}>
                <FieldSelect
                  label="默认安装方式"
                  value={s.defaultSync}
                  hint="新建 Agent 的默认值；可在各 Agent 详情页单独覆盖"
                  onChange={(e) => void putSetting({ defaultSync: e.target.value as SettingsView['defaultSync'] })}
                >
                  <option value="symlink">软链（不复制文件，即时生效）</option>
                  <option value="copy">复制（独立副本，需重新同步）</option>
                </FieldSelect>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <Switch checked={s.watchers} onChange={(v) => void putSetting({ watchers: v })} />
                  <span style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }}>
                    自动跟随技能库变化（可选，默认关闭）
                  </span>
                </label>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'var(--sp-1)' }}>
                  开启后会监听技能库的变化，自动把改动同步给用「复制」的 Agent（复制出来的副本不会自己更新）。
                  平时同步都由操作触发，不需要常驻进程。
                </div>
              </div>
            </div>
          )}
        </LoadingBoundary>
      </div>

      <div className="panel">
        <EntityList
          title="自定义 Agent"
          toolbar={<Button size="sm" onClick={() => setAddOpen(true)}>新增</Button>}
          hideToggle
          empty={<EmptyState title="暂无自定义 Agent" hint="内置清单之外的工具可在此登记，填写其全局 skill 目录。" />}
          items={(customs ?? []).map((c) => ({
            id: c.key,
            title: c.name,
            sub: <span className="mono">{c.key}</span>,
            desc: <span className="mono">{c.globalDir}{c.projectDir ? ` · ${c.projectDir}` : ''}</span>,
            status: c.recursive ? <Badge tone="info">递归扫描</Badge> : undefined,
            actions: (
              <Button size="sm" variant="danger" onClick={async () => {
                try { await api(`/agents/custom/${encodeURIComponent(c.key)}`, { method: 'DELETE' }); toast.push('已删除', 'good'); reloadCustoms(); }
                catch (e) { toast.push(e instanceof Error ? e.message : String(e), 'bad'); }
              }}>删除</Button>
            ),
          }))}
        />
      </div>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">日志</span>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginLeft: 'auto' }}>
            <Button size="sm" variant="ghost" onClick={() => reloadLogs()}>刷新</Button>
            <Button size="sm" variant="ghost" onClick={() => void downloadLogs()}>下载日志</Button>
            <Button size="sm" onClick={() => void copyDiag()}>复制诊断信息</Button>
          </div>
        </div>
        <p style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)', marginBottom: 'var(--sp-3)' }}>
          遇到问题时可下载完整日志或复制诊断信息，粘贴到 GitHub issue 即可上报；日志会脱敏本地路径。
        </p>
        <LoadingBoundary state={{ loading: !logs, error: undefined, data: logs }} empty={{ title: '暂无日志', icon: '▤' }}>
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
              }}>{lg.lines.join('\n') || '（暂无日志内容）'}</pre>
            </>
          )}
        </LoadingBoundary>
      </div>

      <AddAgentModal open={addOpen} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reloadCustoms(); }} />
    </>
  );
}
