import { useEffect, useRef, useState } from 'react';
import { type SourceView, type GitCloneResult, type NpxInstallResult } from '../../api/types';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { FieldInput } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { useI18n, type TFunc } from '../../i18n';
import { LogPanel, ProgressBar, StreamStatus, useStreamRunner } from './stream';

/**
 * 从 Git 仓库导入：只负责把代码拉取到本工具托管目录，成功后把该目录交给既有登记流程
 * （登记弹窗以预设路径打开，用户确认布局 → 预览 → 落库）。此步不改 config。
 * 拉取过程走 SSE 流式：实时展示 clone / fetch 输出与耗时。
 */
export function GitImportModal({
  open,
  onClose,
  onPulled,
}: Readonly<{ open: boolean; onClose: () => void; onPulled: (path: string) => void }>) {
  const { t } = useI18n();
  const toast = useToast();
  const { exec, lines, progress, status, busy, elapsed } = useStreamRunner();
  const [url, setUrl] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) { setWasOpen(open); if (open) setUrl(''); }

  const pull = async () => {
    if (!url.trim()) return;
    try {
      const r = await exec<GitCloneResult>('/sources/clone', { url: url.trim() });
      toast.push(t('repo.gitImportDone', { path: r.path }), 'good');
      onPulled(r.path);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  return (
    <Modal
      open={open}
      title={t('repo.gitImportTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!url.trim()} onClick={pull}>{t('repo.gitImportPull')}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <FieldInput
          label={t('repo.gitImportUrl')}
          placeholder="https://github.com/owner/repo.git"
          hint={t('repo.gitImportHint')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        {(busy || lines.length > 0 || progress) && (
          <>
            <StreamStatus status={status} elapsed={elapsed} runningText={t('repo.gitPhase')} />
            <ProgressBar progress={progress} />
            <LogPanel lines={lines} />
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * 展示用：把用户输入的原始 npx 命令还原成「将执行」的一行。
 * 仅供界面预览（服务端才是权威解析——那里还处理引号与包名校验）。
 */
function previewNpxCommand(cmd: string): string | undefined {
  const tokens = cmd.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] === 'npx') tokens.shift();
  while (tokens[0] === '--yes' || tokens[0] === '-y') tokens.shift();
  const pkg = tokens[0] && !tokens[0].startsWith('-') ? tokens.shift() : undefined;
  if (!pkg) return undefined;
  return `npx --yes ${pkg} ${tokens.join(' ')}`.trim();
}

/**
 * 从 npx 命令安装：用户只粘一条原始安装命令（如 `npx impeccable skills install`），
 * flint 解析出包名与参数，在托管目录里执行（笼子 + 非交互 env + git 快照），
 * 成功后把安装目录（优先用推断出的技能扫描根）交给既有登记流程。此步不改 config。
 *
 * 弹窗固定展示三段说明（规范要求 / 不满足的后果 / 执行后如何验证）——安装器行为不可控，
 * 用户必须在执行前知道失败形态与验证方式。
 */
export function NpxImportModal({
  open,
  onClose,
  onInstalled,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onInstalled: (r: { path: string; pkg: string; args: string[]; escaped?: string[] }) => void;
}>) {
  const { t } = useI18n();
  const toast = useToast();
  const { exec, lines, progress, status, busy, elapsed } = useStreamRunner();
  const [cmd, setCmd] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) { setWasOpen(open); if (open) setCmd(''); }

  // 展示用解析（服务端才是权威解析）：把原始命令还原成「将执行」的一行
  const preview = previewNpxCommand(cmd);

  const specLine = (title: string, body: string) => (
    <div style={{ fontSize: 'var(--fs-12)', lineHeight: 1.7 }}>
      <span style={{ fontWeight: 600 }}>{title}</span>
      <span style={{ color: 'var(--c-ink-3)' }}> {body}</span>
    </div>
  );

  const run = async () => {
    if (!cmd.trim()) return;
    try {
      const r = await exec<NpxInstallResult>('/sources/npx', { command: cmd.trim() });
      toast.push(t('repo.npxImportDone', { path: r.suggestedRoot ?? r.path }), 'good');
      onInstalled({ path: r.suggestedRoot ?? r.path, pkg: r.pkg, args: r.args, escaped: r.escaped });
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
      // 失败也可能写了笼子之外（如安装器半途而废）——照样告知
      const escaped = (e as Error & { event?: { escaped?: string[] } }).event?.escaped ?? [];
      if (escaped.length > 0) toast.push(t('repo.importEscaped', { paths: escaped.join('、') }), 'bad');
    }
  };

  return (
    <Modal
      open={open}
      title={t('repo.npxImportTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!cmd.trim()} onClick={run}>{t('repo.npxImportRun')}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <FieldInput
          label={t('repo.npxImportCmd')}
          placeholder={t('repo.npxImportCmdPlaceholder')}
          hint={t('repo.npxImportCmdHint')}
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
        />
        {preview && (
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
            {t('repo.npxWillRun', { cmd: preview })}
          </div>
        )}
        {/* 执行前的规范 / 风险 / 验证说明 */}
        <div
          style={{
            border: '1px solid var(--c-line)',
            borderRadius: 'var(--rd-md)',
            padding: 'var(--sp-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-2)',
          }}
        >
          <div style={{ fontWeight: 600 }}>{t('repo.npxSpecTitle')}</div>
          {specLine('①', t('repo.npxSpecReq'))}
          {specLine('②', t('repo.npxSpecRisk'))}
          {specLine('③', t('repo.npxSpecVerify'))}
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{t('repo.npxTestedNote')}</div>
        </div>
        {(busy || lines.length > 0 || progress) && (
          <>
            <StreamStatus status={status} elapsed={elapsed} runningText={t('repo.npxPhase')} />
            <ProgressBar progress={progress} />
            <LogPanel lines={lines} />
          </>
        )}
        {busy && <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{t('repo.npxImportRunning')}</div>}
      </div>
    </Modal>
  );
}

/**
 * npx 来源更新弹窗：打开即自动执行（一键更新）——SSE 流式展示安装器输出与耗时，
 * 完成后由调用方刷新列表并toast。关闭不打断执行（内容仍会落盘，刷新后可重新扫描）。
 */
function lastNonEmptyLine(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i]) return lines[i];
  }
  return undefined;
}

function npxUpdateNotes(
  t: TFunc,
  out: { updated: boolean; diff?: string; escaped?: string[] },
): Array<[string, 'good' | 'bad' | 'info']> {
  const notes: Array<[string, 'good' | 'bad' | 'info']> = [];
  const escaped = out.escaped ?? [];
  if (escaped.length > 0) notes.push([t('repo.importEscaped', { paths: escaped.join('、') }), 'bad']);
  if (!out.updated) {
    notes.push([t('repo.npxNoChange'), 'info']);
    return notes;
  }
  const summary = lastNonEmptyLine(out.diff);
  const updated = summary ? t('repo.npxUpdatedDiff', { summary }) : t('repo.npxUpdated');
  notes.push([updated, 'good'], [t('repo.npxCopyHint'), 'info']);
  return notes;
}

export function NpxUpdateModal({
  open,
  source,
  onClose,
  onDone,
}: Readonly<{
  open: boolean;
  source: SourceView | null;
  onClose: () => void;
  onDone: () => void;
}>) {
  const { t } = useI18n();
  const toast = useToast();
  const { exec, lines, progress, status, elapsed } = useStreamRunner();
  const started = useRef(false);

  useEffect(() => {
    if (!open || !source) { started.current = false; return; }
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const out = await exec<{ ok: boolean; updated: boolean; diff?: string; escaped?: string[] }>(
          `/repos/${encodeURIComponent(source.id)}/npx-update`,
          {},
        );
        for (const [text, kind] of npxUpdateNotes(t, out)) toast.push(text, kind);
        onDone();
      } catch (e) {
        toast.push(e instanceof Error ? e.message : String(e), 'bad');
      }
    })();
  }, [open, source, exec]);

  return (
    <Modal
      open={open}
      title={t('repo.npxUpdateTitle')}
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', lineHeight: 1.7 }}>
          {t('repo.npxUpdateAuto', { pkg: source?.installer?.pkg ?? '' })}
        </div>
        <StreamStatus status={status} elapsed={elapsed} runningText={t('repo.npxPhase')} />
        <ProgressBar progress={progress} />
        <LogPanel lines={lines} />
      </div>
    </Modal>
  );
}
