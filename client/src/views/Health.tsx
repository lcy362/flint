import { useState, type ReactNode } from 'react';
import { api, type DiagnoseResult, type DiagItem, type SyncDiff } from '../api/types';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingBoundary from '../components/ui/LoadingBoundary';
import Modal from '../components/ui/Modal';
import { useAsync } from '../state/useAsync';
import { useToast } from '../components/ui/Toast';
import { joinList, rich, useI18n, type MsgKey, type TFunc } from '../i18n';

/**
 * 诊断 summary / 分组 键的展示键映射。
 * 服务端维度 key 用单数（见 core/diagnose.ts 的 DIMS），这里补齐；
 * 复数形态一并保留，兼容历史结果的键名。
 */
const DIM_MSG_KEY: Record<string, MsgKey> = {
  sync: 'health.dim.sync',
  dup: 'health.dim.dup',
  durability: 'health.dim.durability',
  config: 'health.dim.config',
  repo: 'health.dim.repo',
  project: 'health.dim.project',
  repos: 'health.dim.repos',
  skills: 'health.dim.skills',
  presets: 'health.dim.presets',
  projects: 'health.dim.projects',
  sources: 'health.dim.sources',
};

/**
 * 可一键修复的诊断项 key 判定。
 * 必须与服务端 applyFix 实际实现的分支一一对应，否则会出现「点了却修不了」的死按钮。
 */
function fixable(it: DiagItem): boolean {
  if (it.status === 'ok') return false;
  return /^(sync:|broken:|project:|repo:)/.test(it.key);
}

/** 名称清单过长时截断，避免确认弹窗被一长串名字撑爆 */
function nameList(t: TFunc, names: string[], max = 8): string {
  return names.length <= max ? joinList(names) : `${joinList(names.slice(0, max))}${t('health.andMore', { n: names.length })}`;
}

/** 一次待确认的修复：由诊断项推导出「将要执行什么」，供确认弹窗逐条列出 */
interface FixPlan {
  key: string;
  /** 诊断项原文，让用户确认改的正是这一条 */
  subject: string;
  /** 一句话概括作用范围 */
  intro: ReactNode;
  /** 具体操作清单 */
  ops: ReactNode[];
}

/**
 * 把诊断项翻译成「将要执行的具体操作」。
 * 修复一律先经此生成清单、由用户确认后再执行，不做点击即改。
 */
function planFix(t: TFunc, it: DiagItem): FixPlan {
  const key = it.key;
  const subject = it.message;

  if (key.startsWith('sync:')) {
    const d = it.detail as SyncDiff | undefined;
    const ops: ReactNode[] = [];
    if (d?.missing.length) {
      ops.push(rich(t('health.plan.sync.missing', { n: d.missing.length, names: nameList(t, d.missing) })));
    }
    if (d?.brokenLink.length) {
      ops.push(rich(t('health.plan.sync.broken', { n: d.brokenLink.length, names: nameList(t, d.brokenLink) })));
    }
    if (d?.extra.length) {
      ops.push(rich(t('health.plan.sync.extra', { n: d.extra.length, names: nameList(t, d.extra) })));
    }
    if (ops.length === 0) ops.push(t('health.plan.sync.reconcile'));
    ops.push(t('health.plan.sync.scope'));
    return {
      key,
      subject,
      intro: t('health.plan.sync.intro'),
      ops,
    };
  }

  if (key.startsWith('broken:')) {
    return {
      key,
      subject,
      intro: rich(t('health.plan.broken.intro')),
      ops: [
        t('health.plan.broken.op1'),
        t('health.plan.broken.op2'),
        t('health.plan.broken.op3'),
      ],
    };
  }

  if (key.startsWith('project:')) {
    const dir = key.slice('project:'.length);
    return {
      key,
      subject,
      intro: t('health.plan.project.intro'),
      ops: [
        rich(t('health.plan.project.op1', { dir })),
        t('health.plan.project.op2'),
      ],
    };
  }

  if (key.startsWith('repo:')) {
    const id = key.slice('repo:'.length);
    return {
      key,
      subject,
      intro: t('health.plan.repo.intro'),
      ops: [
        rich(t('health.plan.repo.op1', { id, skills: 'skills' })),
        t('health.plan.repo.op2'),
      ],
    };
  }

  return { key, subject, intro: t('health.plan.generic.intro'), ops: [t('health.plan.generic.ops')] };
}

export default function Health() {
  const { data, loading, error, reload } = useAsync<DiagnoseResult>(() => api('/diagnose'));
  const { t } = useI18n();
  // 点「修复」只打开确认弹窗；确认后才真正调用 /fix
  const [plan, setPlan] = useState<FixPlan | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const toast = useToast();

  const runFix = async () => {
    if (!plan) return;
    const { key } = plan;
    setFixing(key);
    try {
      const res = await api<{ key: string; applied: boolean; message: string }>('/fix', { method: 'POST', body: JSON.stringify({ key }) });
      toast.push(
        res.applied ? t('health.fix.applied', { msg: res.message }) : t('health.fix.failed', { msg: res.message }),
        res.applied ? 'good' : 'bad',
      );
      setPlan(null);
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setFixing(null);
    }
  };

  const tone = (s: DiagItem['status']) => {
    if (s === 'ok') return 'good' as const;
    if (s === 'warn') return 'warn' as const;
    return 'bad' as const;
  };
  const label = (s: DiagItem['status']) => (s === 'ok' ? 'OK' : s === 'warn' ? t('health.status.warn') : t('health.status.error'));

  return (
    <>
      <PageHeader
        title={t('nav.health')}
        sub={data ? data.config : undefined}
        actions={<Button variant="ghost" onClick={reload}>{t('health.rediagnose')}</Button>}
      />
      <LoadingBoundary state={{ loading, error, data }} empty={{ title: t('health.empty.title'), hint: t('health.empty.hint'), icon: '◎' }}>
        {(diag) => (
          <>
            <div className="panel">
              <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                {Object.entries(diag.summary).map(([k, s]) => (
                  <div key={k} style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                    <span className="field-label">{t(DIM_MSG_KEY[k] ?? k as MsgKey)}</span>
                    <span style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                      <Badge tone="good">{s.ok}</Badge>
                      <Badge tone="warn">{s.warn}</Badge>
                      <Badge tone="bad">{s.error}</Badge>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {Object.keys(diag.groups).length === 0 ? (
              <EmptyState title={t('health.allGood.title')} hint={t('health.allGood.hint')} icon="✓" />
            ) : (
              Object.entries(diag.groups).map(([group, items]) => (
                <div key={group} className="panel" style={{ padding: 0 }}>
                  <div style={{ padding: 'var(--sp-4) var(--sp-6)', borderBottom: '1px solid var(--c-line)' }}>
                    <span className="page-head__title" style={{ fontSize: 'var(--fs-16)' }}>{t(DIM_MSG_KEY[group] ?? group as MsgKey)}</span>
                    <span className="mono" style={{ color: 'var(--c-ink-3)', marginLeft: 'var(--sp-2)' }}>{items.length}</span>
                  </div>
                  {items.length === 0 && <div style={{ padding: 'var(--sp-4) var(--sp-6)' }}><EmptyState title={t('health.noneInGroup')} /></div>}
                  <div className="diag-group" style={{ padding: 'var(--sp-2) var(--sp-6)' }}>
                    {items.map((it) => (
                      <div key={it.key} className="diag-row">
                        <Badge tone={tone(it.status)} dot={it.status === 'ok' ? 'good' : it.status === 'warn' ? 'warn' : 'bad'}>
                          {label(it.status)}
                        </Badge>
                        <span className="diag-row__msg">{it.message}</span>
                        {/* detail 多为结构化负载（SyncDiff / 候选列表），直接 String() 会显示 [object Object]，
                            只展示本身可读的标量；结构化内容改由「修复」确认弹窗逐条解读 */}
                        {(typeof it.detail === 'string' || typeof it.detail === 'number') && (
                          <span className="diag-row__detail">{String(it.detail)}</span>
                        )}
                        {fixable(it) && (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={fixing === it.key}
                            onClick={() => setPlan(planFix(t, it))}
                          >
                            {t('health.fix')}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </LoadingBoundary>

      <Modal
        open={!!plan}
        title={t('health.fixModal.title')}
        onClose={() => setPlan(null)}
        width={540}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlan(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={!!plan && fixing === plan.key} onClick={() => void runFix()}>{t('common.confirmRun')}</Button>
          </>
        }
      >
        {plan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
              <span className="field-label">{t('health.fixModal.subject')}</span>
              <span style={{ fontSize: 'var(--fs-13)', color: 'var(--c-ink-2)', wordBreak: 'break-all' }}>{plan.subject}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <span className="field-label">{t('health.fixModal.ops')}</span>
              <span style={{ fontSize: 'var(--fs-13)', color: 'var(--c-ink-2)' }}>{plan.intro}</span>
              <ul style={{ margin: 0, paddingLeft: '1.2em', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                {plan.ops.map((op, i) => (
                  <li key={i} style={{ fontSize: 'var(--fs-13)', color: 'var(--c-ink-2)', wordBreak: 'break-all' }}>{op}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
