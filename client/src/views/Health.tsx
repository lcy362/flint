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

/**
 * 诊断 summary / 分组 键的本地化映射。
 * 服务端维度 key 用单数（见 core/diagnose.ts 的 DIMS），这里补齐；
 * 复数形态一并保留，兼容历史结果的键名。
 */
const KEY_LABEL: Record<string, string> = {
  sync: '同步',
  dup: '重复技能',
  durability: '失效软链',
  config: '配置',
  repo: '仓库',
  project: '项目',
  repos: '仓库', skills: '技能', presets: '预设',
  projects: '项目', sources: '来源',
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
function nameList(names: string[], max = 8): string {
  return names.length <= max ? names.join('、') : `${names.slice(0, max).join('、')} 等 ${names.length} 个`;
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
function planFix(it: DiagItem): FixPlan {
  const key = it.key;
  const subject = it.message;

  if (key.startsWith('sync:')) {
    const d = it.detail as SyncDiff | undefined;
    const ops: ReactNode[] = [];
    if (d?.missing.length) {
      ops.push(<>补齐缺失的 <strong>{d.missing.length}</strong> 个技能：<span className="mono">{nameList(d.missing)}</span></>);
    }
    if (d?.brokenLink.length) {
      ops.push(<>重建失效软链 <strong>{d.brokenLink.length}</strong> 个：<span className="mono">{nameList(d.brokenLink)}</span></>);
    }
    if (d?.extra.length) {
      ops.push(
        <>清理多余项 <strong>{d.extra.length}</strong> 个：<span className="mono">{nameList(d.extra)}</span>
          —— 其中只有<strong>本工具自己部署的软链</strong>会被回收，你的真实目录与外部软链不动</>
      );
    }
    if (ops.length === 0) ops.push(<>按当前期望集重新对账一次，补齐缺失并修复失效软链</>);
    ops.push(<>只作用于这一个技能目录，不影响其它 Agent</>);
    return {
      key,
      subject,
      intro: <>对上面这个技能目录按当前期望集重新对账：</>,
      ops,
    };
  }

  if (key.startsWith('broken:')) {
    return {
      key,
      subject,
      intro: <>对所有「活跃」Agent 重跑一次同步（作用范围比单条更大）：</>,
      ops: [
        <>重建全部失效软链</>,
        <>顺带补齐缺失、清理多余项（同样只回收本工具部署的软链）</>,
        <>未加入活跃集合的 Agent 不受影响，你的真实目录与外部软链不动</>,
      ],
    };
  }

  if (key.startsWith('project:')) {
    const dir = key.slice('project:'.length);
    return {
      key,
      subject,
      intro: <>为该项目建设技能目录结构：</>,
      ops: [
        <>创建目录 <span className="mono">{dir}/.agents/skills</span></>,
        <>已存在则保持不变；不写入、不删除任何技能</>,
      ],
    };
  }

  if (key.startsWith('repo:')) {
    const id = key.slice('repo:'.length);
    return {
      key,
      subject,
      intro: <>为该仓库补上技能根目录：</>,
      ops: [
        <>创建仓库 <span className="mono">{id}</span> 下的 <span className="mono">skills</span> 目录</>,
        <>已存在则保持不变；不写入、不删除任何技能</>,
      ],
    };
  }

  return { key, subject, intro: <>执行该项修复：</>, ops: [<>该项没有可列出的细项</>] };
}

export default function Health() {
  const { data, loading, error, reload } = useAsync<DiagnoseResult>(() => api('/diagnose'));
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
      toast.push(res.applied ? `已修复：${res.message}` : `无法自动修复：${res.message}`, res.applied ? 'good' : 'bad');
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
  const label = (s: DiagItem['status']) => (s === 'ok' ? 'OK' : s === 'warn' ? '警告' : '错误');

  return (
    <>
      <PageHeader
        title="诊断"
        sub={data ? data.config : undefined}
        actions={<Button variant="ghost" onClick={reload}>重新诊断</Button>}
      />
      <LoadingBoundary state={{ loading, error, data }} empty={{ title: '没有诊断结果', hint: '运行诊断以检查技能库健康状态。', icon: '◎' }}>
        {(diag) => (
          <>
            <div className="panel">
              <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                {Object.entries(diag.summary).map(([k, s]) => (
                  <div key={k} style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                    <span className="field-label">{KEY_LABEL[k] ?? k}</span>
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
              <EmptyState title="一切正常" hint="没有检测到任何问题。" icon="✓" />
            ) : (
              Object.entries(diag.groups).map(([group, items]) => (
                <div key={group} className="panel" style={{ padding: 0 }}>
                  <div style={{ padding: 'var(--sp-4) var(--sp-6)', borderBottom: '1px solid var(--c-line)' }}>
                    <span className="page-head__title" style={{ fontSize: 'var(--fs-16)' }}>{KEY_LABEL[group] ?? group}</span>
                    <span className="mono" style={{ color: 'var(--c-ink-3)', marginLeft: 'var(--sp-2)' }}>{items.length}</span>
                  </div>
                  {items.length === 0 && <div style={{ padding: 'var(--sp-4) var(--sp-6)' }}><EmptyState title="无异常" /></div>}
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
                            onClick={() => setPlan(planFix(it))}
                          >
                            修复
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
        title="确认执行修复"
        onClose={() => setPlan(null)}
        width={540}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlan(null)}>取消</Button>
            <Button variant="primary" loading={!!plan && fixing === plan.key} onClick={() => void runFix()}>确认执行</Button>
          </>
        }
      >
        {plan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
              <span className="field-label">诊断项</span>
              <span style={{ fontSize: 'var(--fs-13)', color: 'var(--c-ink-2)', wordBreak: 'break-all' }}>{plan.subject}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <span className="field-label">将要执行</span>
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
