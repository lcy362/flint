import { useCallback, useEffect, useState } from 'react';
import { api, type RepoView, type SourceView, type RepoStatus } from '../../api/types';
import EntityList, { type EntityItem } from '../../components/common/EntityList';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { navigate, useRoute } from '../../state/router';
import { useI18n } from '../../i18n';
import type { WarehouseTarget } from './warehouse';
import { GitImportModal, NpxImportModal, NpxUpdateModal } from './sourceModals';
import { WarehouseModal } from './warehouse';
import { AddSkillsModal } from './repoActions';

/* 仓库管理。技能入库动作（归集 / 导入）挂在自有仓库上：第三方仓库作为独立仓库维护，
 * 但当其技能被自有仓库导入时，它只是数据源目录，无需任何登记。 */
export function ReposAndSources({ repos, sources, reload }: Readonly<{ repos: RepoView[]; sources: SourceView[]; reload: () => void }>) {
  const { t } = useI18n();
  const toast = useToast();
  const route = useRoute();
  const [busy, setBusy] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<RepoView | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // 「从 Git 仓库导入」拉取到的目录：作为新建第三方仓库的预设路径，交给登记流程
  const [gitOpen, setGitOpen] = useState(false);
  const [presetPath, setPresetPath] = useState<string | null>(null);
  // 「从 npx 命令安装」：安装成功后的目录（预设路径）+ 解析出的安装器信息（登记时落库）
  const [npxOpen, setNpxOpen] = useState(false);
  const [presetInstaller, setPresetInstaller] = useState<{ pkg: string; args: string[] } | null>(null);
  // npx 安装的上一步摘要（包名 + 笼外写入清单）：带到登记弹窗，别让安装结果凭空消失
  const [importSummary, setImportSummary] = useState<{ pkg: string; escaped: string[] } | null>(null);
  // npx 来源的「更新」弹窗（打开即一键重跑安装器，SSE 流式展示）
  const [updateTarget, setUpdateTarget] = useState<SourceView | null>(null);
  const [editTarget, setEditTarget] = useState<WarehouseTarget | null>(null);

  /**
   * 命令直达：`flint <目录>` 把目录写进地址（`#/library?addSource=<路径>`）。
   * 这里只做「打开登记弹窗 + 预填路径」，落库仍要用户点确认；
   * 参数随即从地址里清掉——它是「一次性的意图」，刷新或关掉弹窗后不该再弹回来。
   */
  const addSourceDir = route.query.get('addSource');
  useEffect(() => {
    if (!addSourceDir) return;
    setPresetPath(addSourceDir);
    setCreateOpen(true);
    const query = new URLSearchParams(route.query);
    query.delete('addSource');
    navigate({ ...route, query }, { replace: true });
  }, [addSourceDir]);
  // F4·仓库级来源：并发拉取 git 状态（远端地址 / 领先落后）。
  // mount 时不联网（fetch=false），只读本地引用秒回；「检查更新」才联网校验。
  const [repoStatus, setRepoStatus] = useState<Record<string, RepoStatus>>({});
  const refreshStatus = useCallback(async (rs: { id: string }[], fetch = false) => {
    const m: Record<string, RepoStatus> = {};
    await Promise.all(
      rs.map(async (r) => {
        try {
          const st = await api<RepoStatus>(`/repos/${encodeURIComponent(r.id)}/status${fetch ? '?fetch=1' : ''}`);
          if (st?.remote) m[r.id] = st;
        } catch { /* 非 git 仓库 → 忽略 */ }
      })
    );
    setRepoStatus(m);
  }, []);
  useEffect(() => { refreshStatus([...repos, ...sources]); }, [repos, sources, refreshStatus]);

  // 显式「检查更新」：联网 fetch 一次（后端异步 + 短超时，绝不阻塞页面）
  const [checking, setChecking] = useState<string | null>(null);
  const checkUpdates = async (id: string) => {
    setChecking(id);
    try {
      const st = await api<RepoStatus>(`/repos/${encodeURIComponent(id)}/status?fetch=1`);
      if (st?.remote) setRepoStatus((prev) => ({ ...prev, [id]: st }));
      toast.push(st?.behind ? t('repo.hasUpdates') : t('repo.upToDateChecked'), st?.behind ? 'good' : 'info');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setChecking(null); }
  };

  // 仓库同步：git pull 后重拉状态与目录列表（git 来源）。
  // npx 安装的来源不走这里——「更新」按钮打开 NpxUpdateModal 走 SSE 流式重跑安装器。
  const [syncing, setSyncing] = useState<string | null>(null);
  const syncRepo = async (id: string) => {
    setSyncing(id);
    try {
      const out = await api<{ updated: boolean }>(`/repos/${encodeURIComponent(id)}/sync`, { method: 'POST' });
      toast.push(out.updated ? t('repo.synced') : t('repo.alreadyUpToDate'), out.updated ? 'good' : 'info');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setSyncing(null);
      reload();
    }
  };

  const remove = async (kind: 'repos' | 'sources', id: string) => {
    try {
      await api(`/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast.push(t('common.deleted'), 'good');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(null);
      reload();
    }
  };

  // 两类仓库统一展示：标题取名称（自有仓库以 id 兼作名称，第三方仓库用 name、缺省回落 id），
  // 副标题取磁盘路径，类型与状态一律用徽标区分。
  const items: EntityItem[] = [
    ...repos.map((repo) => {
      const st = repoStatus[repo.id];
      return {
        id: `repo:${repo.id}`,
        title: repo.name || repo.id,
        sub: (
          <span className="mono">
            {repo.path}{repo.root ? ` · ${repo.root}` : ''}
            {st?.remote && <><br/><span className="repo-remote">{st.remote}</span></>}
          </span>
        ),
        status: <Badge tone="info">{t('repo.kind.own')}</Badge>,
        // 自有仓库恒为扁平、没有布局可配：徽标把这条契约显式说出来，避免用户以为漏配了
        badges: (
          <>
            {st?.behind != null && st.behind > 0 && (
              <Badge tone="warn" title={t('repo.remoteHint')}>{t('repo.hasUpdates')}</Badge>
            )}
            <Badge tone="neutral">{t('repo.flatOnly')}</Badge>
          </>
        ),
        actions: (
          <>
            {st?.remote && (
              <>
                <Button size="sm" variant="ghost" loading={checking === repo.id} onClick={() => checkUpdates(repo.id)} title={t('repo.checkHint')}>
                  {t('repo.check')}
                </Button>
                <Button size="sm" variant="ghost" loading={syncing === repo.id} onClick={() => syncRepo(repo.id)} title={t('repo.syncHint')}>
                  {t('repo.sync')}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditTarget({ ...repo, kind: 'repo' })}>{t('common.edit')}</Button>
            <Button size="sm" variant="primary" onClick={() => setAddFor(repo)} title={t('repo.addSkills.hint')}>
              {t('repo.addSkills')}
            </Button>
            <Button size="sm" variant="danger" loading={busy === `del:${repo.id}`} onClick={() => remove('repos', repo.id)}>{t('common.delete')}</Button>
          </>
        ),
      };
    }),
    ...sources.map((s) => {
      const st = repoStatus[s.id];
      // npx 安装的来源：无 git remote，走「重跑安装器」的更新（一键，可配专用更新命令）
      const npx = s.installer?.kind === 'npx';
      return {
        id: `source:${s.id}`,
        title: s.name || s.id,
        sub: (
          <span className="mono">
            {s.path}
            {st?.remote && <><br/><span className="repo-remote">{st.remote}</span></>}
          </span>
        ),
        status: <Badge tone="accent">{t('repo.kind.third')}</Badge>,
        badges: (
          <>
            {st?.behind != null && st.behind > 0 && <Badge tone="warn" title={t('repo.remoteHint')}>{t('repo.hasUpdates')}</Badge>}
            {npx && (
              <Badge tone="accent" title={t('repo.npxBadgeTitle', { pkg: s.installer?.pkg ?? '', args: (s.installer?.args ?? []).join(' ') })}>
                {t('repo.npxBadge')}
              </Badge>
            )}
            <Badge tone="neutral">{s.layout}</Badge>
          </>
        ),
        actions: (
          <>
            {npx && (
              <Button size="sm" variant="ghost" onClick={() => setUpdateTarget(s)} title={t('repo.npxUpdateHint')}>
                {t('repo.npxUpdate')}
              </Button>
            )}
            {st?.remote && (
              <>
                <Button size="sm" variant="ghost" loading={checking === s.id} onClick={() => checkUpdates(s.id)} title={t('repo.checkHint')}>
                  {t('repo.check')}
                </Button>
                <Button size="sm" variant="ghost" loading={syncing === s.id} onClick={() => syncRepo(s.id)} title={t('repo.syncHint')}>
                  {t('repo.sync')}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditTarget({ ...s, kind: 'source' })}>{t('common.edit')}</Button>
            <Button size="sm" variant="danger" loading={busy === `del:${s.id}`} onClick={() => remove('sources', s.id)}>{t('common.delete')}</Button>
          </>
        ),
      };
    }),
  ];

  return (
    <>
      <EntityList
        title={t('repo.section')}
        items={items}
        toolbar={
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <Button size="sm" variant="ghost" onClick={() => setGitOpen(true)}>{t('repo.gitImport')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setNpxOpen(true)}>{t('repo.npxImport')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}>{t('repo.register')}</Button>
          </div>
        }
        empty={<EmptyState title={t('repo.empty.title')} hint={t('repo.empty.hint')} />}
        hideToggle
      />
      <GitImportModal
        open={gitOpen}
        onClose={() => setGitOpen(false)}
        onPulled={(path) => { setGitOpen(false); setPresetPath(path); setCreateOpen(true); }}
      />
      <NpxImportModal
        open={npxOpen}
        onClose={() => setNpxOpen(false)}
        onInstalled={(r) => {
          setNpxOpen(false);
          setPresetPath(r.path);
          setPresetInstaller({ pkg: r.pkg, args: r.args });
          setImportSummary({ pkg: r.pkg, escaped: r.escaped ?? [] });
          setCreateOpen(true);
        }}
      />
      <NpxUpdateModal
        open={!!updateTarget}
        source={updateTarget}
        onClose={() => setUpdateTarget(null)}
        onDone={() => { setUpdateTarget(null); reload(); }}
      />
      <WarehouseModal
        open={createOpen || !!editTarget}
        target={editTarget}
        presetPath={presetPath ?? undefined}
        presetInstaller={presetInstaller ?? undefined}
        importSummary={importSummary ?? undefined}
        onClose={() => { setCreateOpen(false); setEditTarget(null); setPresetPath(null); setPresetInstaller(null); setImportSummary(null); }}
        onDone={() => { setCreateOpen(false); setEditTarget(null); setPresetPath(null); setPresetInstaller(null); setImportSummary(null); reload(); }}
      />
      <AddSkillsModal repo={addFor} onClose={() => setAddFor(null)} onDone={() => { setAddFor(null); reload(); }} />
    </>
  );
}
