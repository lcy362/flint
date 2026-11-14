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

/** 卡片上定位到的一条仓库：kind 与 API 路由对齐（repo → /repos，source → /sources） */
export type WarehouseTarget = (RepoView & { kind: 'repo' }) | (SourceView & { kind: 'source' });

/** 仓库表单草稿：两类仓库共用同一套字段 */
interface WarehouseDraft {
  kind: 'repo' | 'source';
  id: string;
  name: string;
  path: string;
  layout: string;
  root: string;
  /** npx 来源的专用更新命令（原始命令，可带 npx 前缀）；仅编辑 npx 安装的来源时使用 */
  updateCmd: string;
}

const EMPTY_DRAFT: WarehouseDraft = { kind: 'repo', id: '', name: '', path: '', layout: 'auto', root: '', updateCmd: '' };

/** 自有仓库缺省扫描 <路径>/skills */
function skillsRootOf(p: string): string {
  const trimmed = p.trim();
  if (!trimmed) return '';
  // 去掉结尾斜杠，避免出现 `//skills`；不用正则是为了避免回溯开销
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === '/') end -= 1;
  return `${trimmed.slice(0, end)}/skills`;
}

/** 路径末段作为缺省显示名：本地目录与托管克隆目录都适用 */
function baseNameOf(p: string): string {
  // 手写循环代替 `/[\\/]+$/`：后者在失败匹配时会回溯（S8786），这里的代价是线性的
  let end = p.length;
  while (end > 0 && (p[end - 1] === '/' || p[end - 1] === '\\')) end -= 1;
  const trimmed = p.slice(0, end);
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

function isSlugChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  const digit = c >= 48 && c <= 57;
  const upper = c >= 65 && c <= 90;
  const lower = c >= 97 && c <= 122;
  return digit || upper || lower || ch === '.' || ch === '_' || ch === '-';
}

function stripPkgVersion(pkg: string): string {
  const at = pkg.lastIndexOf('@');
  if (at <= 0) return pkg;
  if (pkg.slice(at + 1).includes('/')) return pkg;
  return pkg.slice(0, at);
}

function toSlug(raw: string): string {
  let slug = '';
  for (const ch of raw) slug += isSlugChar(ch) ? ch : '-';
  let start = 0;
  let end = slug.length;
  while (start < end && slug[start] === '-') start += 1;
  while (end > start && slug[end - 1] === '-') end -= 1;
  return slug.slice(start, end);
}

/** npm 包名 → 合法登记 ID（@scope/name → scope-name，与服务端 defaultIdFromPkg 同口径） */
function idFromPkg(pkg: string): string {
  const noVer = stripPkgVersion(pkg.trim());
  const noScope = noVer.startsWith('@') ? noVer.slice(1) : noVer;
  const slug = toSlug(noScope);
  if (!slug) return '';
  const head = slug.charCodeAt(0);
  const alnum = (head >= 48 && head <= 57) || (head >= 65 && head <= 90) || (head >= 97 && head <= 122);
  return alnum ? slug : `s-${slug}`;
}

function draftFrom(target: WarehouseTarget | null | undefined, presetPath?: string, pkg?: string): WarehouseDraft {
  // 预填路径时连显示名一起给出（id 仍交给预览按目录名推导，避免前端重复一套命名规则）
  if (!target) {
    if (!presetPath) return EMPTY_DRAFT;
    // npx 安装带入包名：直接用它做 ID 与名称——否则会登记成目录名（如 "skills"），用户还得手改
    if (pkg) {
      const id = idFromPkg(pkg);
      return { ...EMPTY_DRAFT, kind: 'source', path: presetPath, id, name: pkg };
    }
    return { ...EMPTY_DRAFT, kind: 'source', path: presetPath, name: baseNameOf(presetPath) };
  }
  if (target.kind === 'source') {
    // npx 安装的来源：把已登记的更新命令带回表单（留空 = 一键重跑安装命令）
    const updateCmd = target.installer?.kind === 'npx' ? (target.installer.updateArgs ?? []).join(' ') : '';
    return { kind: 'source', id: target.id, name: target.name ?? '', path: target.path, layout: target.layout, root: '', updateCmd };
  }
  // 自有仓库没有布局可配，草稿里的 layout 只服务于第三方来源分支
  return { kind: 'repo', id: target.id, name: target.name ?? '', path: target.path, layout: 'auto', root: target.root ?? '', updateCmd: '' };
}

/**
 * 登记 / 编辑仓库（自有与第三方共用一套表单）。
 *
 * 编辑既有仓库时可切换「自有 / 第三方」定位。两类仓库的扫描根不同
 * （自有 = root ?? <路径>/skills，第三方 = 路径本身），因此切换类型时同步换算路径，
 * 保证改定位后扫描根不变、技能不会「消失」：
 * - 自有 → 第三方：把当前扫描根写进路径（root 的语义被吸收）
 * - 第三方 → 自有：把当前路径同时记为 root，显式声明扫描根就是该目录
 *
 * presetPath：新建第三方仓库时预填的路径（来自「从 Git 仓库导入」拉取到的目录、
 * 或「从 npx 命令安装」推断出的技能扫描根），拉取后直接落到这套登记流程里，
 * 用户只需确认布局并在预览后登记。
 *
 * presetInstaller：npx 安装来源的安装器信息——登记落库时一并写入，
 * 之后该来源的「更新」= 在托管目录重跑安装命令（可配专用更新命令）。
 */
function warehouseId(d: WarehouseDraft, editing: boolean, preview: RegisterPreview | null): string {
  const typed = d.id.trim();
  if (typed) return typed;
  if (editing) return '';
  return preview?.id ?? '';
}

function warehouseDoneText(t: TFunc, editing: boolean, kind: 'repo' | 'source', id: string): string {
  if (editing) return t('repo.updated');
  const key = kind === 'repo' ? 'repo.registered.own' : 'repo.registered.third';
  return t(key, { id });
}

async function saveOwnWarehouse(id: string, d: WarehouseDraft, editing: boolean): Promise<void> {
  const body = { name: d.name.trim() || undefined, path: d.path.trim(), root: d.root.trim() || undefined };
  if (editing) {
    await api(`/repos/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...body, kind: 'repo' }) });
    return;
  }
  await api('/repos', { method: 'POST', body: JSON.stringify({ id, ...body }) });
}

async function saveThirdPartyWarehouse(opts: {
  id: string;
  d: WarehouseDraft;
  editing: boolean;
  target?: WarehouseTarget | null;
  presetInstaller?: { pkg: string; args: string[] };
  importFlow: boolean;
}): Promise<void> {
  const { id, d, editing, target, presetInstaller, importFlow } = opts;
  const name = d.name.trim() || id;
  const path = d.path.trim();
  if (editing) {
    const body: Record<string, unknown> = { name, path, layout: d.layout, root: d.root.trim() || undefined, kind: 'source' };
    const inst = target?.kind === 'source' ? target.installer : undefined;
    if (inst?.kind === 'npx') {
      body.installer = { kind: 'npx', pkg: inst.pkg, args: inst.args, updateCmd: d.updateCmd.trim() || undefined };
    }
    await api(`/sources/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
    return;
  }
  const body: Record<string, unknown> = { id, name, path, layout: d.layout };
  if (presetInstaller) body.installer = { kind: 'npx', pkg: presetInstaller.pkg, args: presetInstaller.args };
  if (importFlow) body.requireSkills = true;
  await api('/sources', { method: 'POST', body: JSON.stringify(body) });
}

function WarehouseFooter({
  editing, preview, busy, previewBusy, canSave, canPreview, previewBlocked, onClose, onSubmit, onPreview, onBack,
}: Readonly<{
  editing: boolean;
  preview: RegisterPreview | null;
  busy: boolean;
  previewBusy: boolean;
  canSave: boolean;
  canPreview: boolean;
  previewBlocked: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onPreview: () => void;
  onBack: () => void;
}>) {
  const { t } = useI18n();
  if (editing) {
    return (
      <>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" loading={busy} disabled={!canSave} onClick={onSubmit}>{t('common.save')}</Button>
      </>
    );
  }
  if (preview) {
    return (
      <>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="ghost" onClick={onBack}>{t('repo.preview.back')}</Button>
        <Button variant="primary" loading={busy} disabled={previewBlocked} onClick={onSubmit}>{t('repo.preview.confirm')}</Button>
      </>
    );
  }
  return (
    <>
      <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
      <Button variant="primary" loading={previewBusy} disabled={!canPreview} onClick={onPreview}>{t('repo.preview')}</Button>
    </>
  );
}

function PreviewIdNote({ preview }: Readonly<{ preview: RegisterPreview }>) {
  const { t } = useI18n();
  if (preview.idIssue) {
    return (
      <>
        <span style={{ color: 'var(--c-bad)' }}>{preview.idIssue}</span>
        <span style={{ color: 'var(--c-ink-3)' }}> {t('repo.preview.needId')}</span>
      </>
    );
  }
  if (preview.idTaken) return <span style={{ color: 'var(--c-bad)' }}>{t('repo.preview.idTaken', { id: preview.id })}</span>;
  if (preview.idFromDir) return <span style={{ color: 'var(--c-ink-3)' }}>{t('repo.preview.idFromDir', { id: preview.id })}</span>;
  return <span>{t('repo.preview.id', { id: preview.id })}</span>;
}

export function WarehouseModal({
  open,
  target,
  presetPath,
  presetInstaller,
  importSummary,
  onClose,
  onDone,
}: Readonly<{
  open: boolean;
  target?: WarehouseTarget | null;
  presetPath?: string;
  presetInstaller?: { pkg: string; args: string[] };
  importSummary?: { pkg: string; escaped: string[] };
  onClose: () => void;
  onDone: () => void;
}>) {
  const { t } = useI18n();
  const toast = useToast();
  const editing = !!target;
  const [d, setD] = useState<WarehouseDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  // 登记预览（仅新建）：先看识别结果，确认后才落库；编辑不预览
  const [preview, setPreview] = useState<RegisterPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // 每次打开时载入目标值（新建则重置），避免残留上一次的输入
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setD(draftFrom(target, presetPath, presetInstaller?.pkg)); setPreview(null); }
  }

  // 表单一有改动，旧预览即失效，须重新预览
  const set = <K extends keyof WarehouseDraft>(k: K, v: WarehouseDraft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
    setPreview(null);
  };

  const runPreview = async (draft?: WarehouseDraft) => {
    const cur = draft ?? d;
    if (!cur.path.trim()) return;
    setPreviewBusy(true);
    try {
      const p = await api<RegisterPreview>('/repos/preview', {
        method: 'POST',
        body: JSON.stringify({
          kind: cur.kind,
          path: cur.path.trim(),
          root: cur.kind === 'repo' ? (cur.root.trim() || undefined) : undefined,
          layout: cur.kind === 'source' ? cur.layout : undefined,
          id: cur.id.trim() || undefined,
        }),
      });
      setPreview(p);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setPreviewBusy(false);
    }
  };

  /**
   * 带预设路径打开（`flint <目录>` / 「从 Git 仓库导入」）时自动跑一次预览：
   * 弹窗一出现就是「路径已填入 + 识别结果已列出」的待确认态，用户只需核对后点确认。
   * 同一个预设路径只自动预览一次，用户返回修改后不会因重渲染被反复覆盖。
   */
  const autoPreviewed = useRef<string | null>(null);
  useEffect(() => {
    // 关窗即忘掉这次自动预览，下次（哪怕同一个目录）命令带进来时仍会自动识别
    if (!open) { autoPreviewed.current = null; return; }
    if (editing || !presetPath) return;
    if (autoPreviewed.current === presetPath) return;
    autoPreviewed.current = presetPath;
    void runPreview(draftFrom(null, presetPath, presetInstaller?.pkg));
  }, [open, editing, presetPath, presetInstaller?.pkg]);

  const switchKind = (k: 'repo' | 'source') => {
    if (k === d.kind) return;
    setPreview(null); // 布局 / 扫描根都会变，旧预览作废
    setD((prev) => {
      const p = prev.path.trim();
      if (k === 'source') {
        return { ...prev, kind: k, path: prev.root.trim() || skillsRootOf(p), root: '' };
      }
      return { ...prev, kind: k, root: p };
    });
  };

  // 把真实扫描根摊开给用户看，避免「改了定位却扫不到技能」
  const scanRoot = d.kind === 'repo' ? (d.root.trim() || skillsRootOf(d.path) || '—') : (d.path.trim() || '—');

  // 导入流程（Git 克隆 / npx 安装带路径进来）：扫不到技能就不许登记（PRD EK-07）；
  // 手动登记是用户的明确选择，允许先登记后补内容。
  const importFlow = !editing && !!presetPath;
  const previewBlocked = !editing && !!preview
    && (!!preview.idIssue || !!preview.idTaken || (importFlow && preview.skillCount === 0));

  const submit = async () => {
    setBusy(true);
    try {
      const id = warehouseId(d, editing, preview);
      if (!id || !d.path.trim()) throw new Error(t('repo.idPathRequired'));
      if (d.kind === 'repo') await saveOwnWarehouse(id, d, editing);
      else await saveThirdPartyWarehouse({ id, d, editing, target, presetInstaller, importFlow });
      toast.push(warehouseDoneText(t, editing, d.kind, id), 'good');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const kindLabel = (k: 'repo' | 'source') => (k === 'repo' ? t('repo.kind.own') : t('repo.kind.third'));

  return (
    <Modal
      open={open}
      title={editing ? t('repo.editTitle') : t('repo.registerTitle')}
      onClose={onClose}
      footer={
        <WarehouseFooter
          editing={editing}
          preview={preview}
          busy={busy}
          previewBusy={previewBusy}
          canSave={!!d.id.trim() && !!d.path.trim()}
          canPreview={!!d.path.trim()}
          previewBlocked={previewBlocked}
          onClose={onClose}
          onSubmit={submit}
          onPreview={() => { void runPreview(); }}
          onBack={() => setPreview(null)}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        {!editing && presetPath && (
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', lineHeight: 1.6 }}>
            {t('repo.prefilledHint')}
          </div>
        )}
        {/* 上一步（npx 安装）的结果摘要：装了什么、有没有写到笼子之外 */}
        {!editing && importSummary && (
          <div
            style={{
              border: '1px solid var(--c-line)',
              borderRadius: 'var(--rd-md)',
              padding: 'var(--sp-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-2)',
              fontSize: 'var(--fs-12)',
              lineHeight: 1.7,
            }}
          >
            <div>{t('repo.importSummary', { pkg: importSummary.pkg })}</div>
            {importSummary.escaped.length > 0 && (
              <div style={{ color: 'var(--c-warn)' }}>
                {t('repo.importEscaped', { paths: importSummary.escaped.join('、') })}
              </div>
            )}
          </div>
        )}
        <div>
          <span className="field-label">{t('repo.kind')}</span>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            {(['repo', 'source'] as const).map((k) => (
              <Button key={k} size="sm" variant={d.kind === k ? 'primary' : 'ghost'} onClick={() => switchKind(k)}>
                {kindLabel(k)}
              </Button>
            ))}
          </div>
          {editing && target && d.kind !== target.kind && (
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', marginTop: 'var(--sp-2)', lineHeight: 1.6 }}>
              {rich(t('repo.kindSwitch', { from: kindLabel(target.kind), to: kindLabel(d.kind), id: target.id }))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
          <FieldInput
            label={t('repo.id')}
            placeholder="my-lib"
            value={d.id}
            readOnly={editing}
            hint={editing ? t('repo.idHint') : t('repo.idDefaultHint')}
            onChange={(e) => set('id', e.target.value)}
          />
          <FieldInput
            label={t('common.name')}
            placeholder={t('repo.namePlaceholder')}
            value={d.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <PathField label={t('repo.path')} placeholder="/path/to/library" value={d.path} onChange={(v) => set('path', v)} />

        {d.kind === 'source' ? (
          <FieldSelect label={t('repo.layout')} value={d.layout} onChange={(e) => set('layout', e.target.value)}>
            <option value="auto">{t('repo.layout.auto')}</option>
            <option value="nested">{t('repo.layout.nested')}</option>
            <option value="flat">{t('repo.layout.flat')}</option>
          </FieldSelect>
        ) : (
          // 自有仓库没有布局选项：把实际扫描根摊开说清楚，避免用户以为漏配了什么
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)', lineHeight: 1.6 }}>
            {t('repo.flatOnlyHint', { root: scanRoot })}
          </div>
        )}

        {d.kind === 'repo' && (
          <FieldInput
            label={t('repo.root')}
            hint={t('repo.rootHint')}
            placeholder="skills"
            value={d.root}
            onChange={(e) => set('root', e.target.value)}
          />
        )}

        {/* npx 安装的来源：可配一条专用更新命令；留空 = 更新时一键重跑安装命令 */}
        {editing && target?.kind === 'source' && target.installer?.kind === 'npx' && (
          <FieldInput
            label={t('repo.npxUpdateCmd')}
            placeholder={t('repo.npxUpdateCmdPlaceholder')}
            hint={t('repo.npxUpdateCmdHint')}
            value={d.updateCmd}
            onChange={(e) => set('updateCmd', e.target.value)}
          />
        )}

        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>
          {t('repo.scanRoot')} <span className="mono">{scanRoot}</span>
        </div>

        {/* 登记预览面板：识别到的布局 / 技能清单 / 缺省 id，确认后才落库 */}
        {!editing && preview && (
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
            <div style={{ fontWeight: 600 }}>{t('repo.preview.title')}</div>
            {!preview.exists && (
              <div style={{ color: 'var(--c-bad)', fontSize: 'var(--fs-12)' }}>
                {t('repo.preview.missing', { root: preview.scanRoot })}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <Badge tone="neutral">{preview.layout}</Badge>
              <Badge tone="accent">{t('repo.preview.count', { n: preview.skillCount })}</Badge>
            </div>
            {preview.exists && preview.skillCount === 0 && (
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-ink-3)' }}>{t('repo.preview.none')}</div>
            )}
            {preview.exists && preview.skillCount === 0 && importFlow && (
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-bad)' }}>{t('repo.preview.zeroBlocked')}</div>
            )}
            {preview.skills.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: 180, overflowY: 'auto' }}>
                {preview.skills.map((s) => (
                  <div key={s.name} style={{ fontSize: 'var(--fs-12)', lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    {s.description && (
                      <span style={{ color: 'var(--c-ink-3)' }}>
                        {' — '}{s.description.length > 80 ? `${s.description.slice(0, 80)}…` : s.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 'var(--fs-12)', lineHeight: 1.6 }}>
              <PreviewIdNote preview={preview} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
