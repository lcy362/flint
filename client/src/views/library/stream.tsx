import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, streamApi, type StateView, type RepoView, type SourceView, type SkillContent, type AgentCollectPreview, type AgentCollectItem, type ImportPreviewItem, type SkillSearchResp, type SkillCardView, type RepoStatus, type RegisterPreview, type SkillSecurityResult, type SkillSecurityFinding, type GitCloneResult, type NpxInstallResult, type StreamProgress } from '../../api/types';
import { skillViewToCard } from '../../components/skill/adapters';
import SkillList from '../../components/skill/SkillList';
import SkillDistributeModal from '../../components/skill/SkillDistributeModal';
import { skillBadgeLegend } from '../../components/skill/SkillBadges';
import EntityList, { type EntityItem } from '../../components/common/EntityList';
import BadgeLegend from '../../components/common/BadgeLegend';
import FoldButton from '../../components/common/FoldButton';
import FilterBar from '../../components/common/FilterBar';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Segment from '../../components/ui/Segment';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import LoadingBoundary from '../../components/ui/LoadingBoundary';
import Chip from '../../components/ui/Chip';
import MultiSelect from '../../components/ui/MultiSelect';
import { FieldInput, FieldSelect } from '../../components/ui/Field';
import SwitchLabel from '../../components/ui/SwitchLabel';
import { PathField, PathListField } from '../../components/ui/PathField';
import Switch from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { useAsync } from '../../state/useAsync';
import { useCollapsed } from '../../state/collapse';
import { useViewMode } from '../../state/viewMode';
import { navigate, useQueryFlag, useQueryList, useQueryParam, useRoute } from '../../state/router';
import { joinList, rich, useI18n, type TFunc } from '../../i18n';

/** 流式执行日志面板：等宽、自动滚到底、只保留最近 N 行（进度行可能很多） */
const LOG_KEEP = 300;

/**
 * 流式请求的静默兜底（毫秒）：服务端有 5 分钟无输出看门狗，这里留 1 分钟余量——
 * 正常情况下服务端的错误事件先到，这个兜底只接「连接被掐」（重启 / 断网）。
 */
const STREAM_IDLE_GUARD_MS = 360_000;

export function LogPanel({ lines }: Readonly<{ lines: string[] }>) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  return (
    <div
      ref={boxRef}
      className="mono"
      style={{
        border: '1px solid var(--c-line)',
        borderRadius: 'var(--rd-md)',
        padding: 'var(--sp-2) var(--sp-3)',
        maxHeight: 180,
        overflowY: 'auto',
        fontSize: 'var(--fs-12)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        color: 'var(--c-ink-2)',
        background: 'var(--c-surface-2)',
      }}
    >
      {lines.length === 0 ? '…' : lines.join('\n')}
    </div>
  );
}

/** 执行阶段 + 耗时的一行说明（流式任务进行中展示） */
function streamStatusLabel(status: 'running' | 'done' | 'failed', runningText: string, t: TFunc): string {
  if (status === 'running') return runningText;
  if (status === 'failed') return t('stream.failed');
  return t('stream.done');
}

export function StreamStatus({ status, elapsed, runningText }: Readonly<{ status: 'idle' | 'running' | 'done' | 'failed'; elapsed: number; runningText: string }>) {
  const { t } = useI18n();
  if (status === 'idle') return null;
  const label = streamStatusLabel(status, runningText, t);
  return (
    <div style={{ fontSize: 'var(--fs-12)', color: status === 'failed' ? 'var(--c-bad)' : 'var(--c-ink-3)' }}>
      {label} · {t('stream.elapsed', { s: elapsed })}
    </div>
  );
}

/** 字节 → 人类可读（B / KB / MB / GB） */
function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(1)} ${units[i]}`;
}

/**
 * 下载进度条：两种形态——
 * - 有确切百分比（git 自带进度）：确定型进度条 + 百分比数字；
 * - 只有已下载体积（npm 非 TTY 不给百分比）：不定型动画条 + 体积文本，不伪造百分比。
 */
function progressSizeText(received?: number, total?: number): string | undefined {
  if (received === undefined || received <= 0) return undefined;
  const got = fmtBytes(received);
  if (total !== undefined && total > 0) return `${got} / ${fmtBytes(total)}`;
  return got;
}

function progressStageText(stage: string | undefined, t: TFunc): string {
  if (stage === 'install') return t('stream.installing');
  if (stage && stage !== 'download') return stage;
  return t('stream.progress');
}

export function ProgressBar({ progress }: Readonly<{ progress: StreamProgress | undefined }>) {
  const { t } = useI18n();
  if (!progress) return null;
  const { percent, received, total, stage } = progress;
  const determinate = typeof percent === 'number' && Number.isFinite(percent);
  const sizeText = progressSizeText(received, total);
  const label = determinate ? `${Math.round(percent)}%` : sizeText;
  // git 的阶段名（Receiving objects 等）是技术术语，原样展示；npm 侧区分「下载中 / 安装中」
  const stageText = progressStageText(stage, t);
  if (!label && !stageText) return null;
  const meter = determinate ? { value: Math.min(100, Math.max(0, percent)) } : {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
      <progress
        className={determinate ? 'progress' : 'progress progress--indeterminate'}
        max={100}
        aria-label={stageText}
        {...meter}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-2)', fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
        <span>{stageText}</span>
        <span>{label}</span>
      </div>
    </div>
  );
}

/**
 * 跑一个 SSE 流式任务：聚合日志行、计时、收集下载进度，resolve 出 done 载荷。
 * 每个调用方（导入 / 安装 / 更新弹窗）各持一份实例，互不干扰。
 */
export function useStreamRunner() {
  const { t } = useI18n();
  const [lines, setLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<StreamProgress | undefined>(undefined);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const busy = status === 'running';
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearInterval(timer.current); }, []);
  const exec = useCallback(async <T,>(path: string, body: unknown): Promise<T> => {
    setLines([]);
    setProgress(undefined);
    setElapsed(0);
    setStatus('running');
    const started = Date.now();
    timer.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    // 兜底：长时间收不到任何事件（服务端重启 / 连接被掐）就中断，避免界面永远停在「进行中」
    const ctrl = new AbortController();
    let lastEvent = Date.now();
    const guard = window.setInterval(() => {
      if (Date.now() - lastEvent > STREAM_IDLE_GUARD_MS) ctrl.abort();
    }, 15_000);
    try {
      const out = await streamApi<T>(path, body, {
        onLog: (line) => { lastEvent = Date.now(); setLines((prev) => [...prev, line].slice(-LOG_KEEP)); },
        onProgress: (p) => { lastEvent = Date.now(); setProgress(p); },
        signal: ctrl.signal,
      });
      setStatus('done');
      return out;
    } catch (e) {
      setStatus('failed');
      if (ctrl.signal.aborted) throw new Error(t('stream.interrupted'));
      throw e;
    } finally {
      window.clearInterval(guard);
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;
    }
  }, [t]);
  return { exec, lines, progress, status, busy, elapsed };
}
