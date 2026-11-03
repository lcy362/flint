import { log } from '../log/logger';
import { getLang } from '../i18n';

/**
 * 站内接口路径白名单：必须以 `/` 开头，且只含合法 URI 字符。
 * 反斜杠、空白、控制字符、尖括号等一律拒绝——它们是把相对地址
 * 拼成外部请求（CSRF / 请求伪造）的常见载体。
 */
const API_PATH = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/;

/** 校验并返回安全的站内路径；不合法直接抛错，绝不发出可疑请求 */
export function assertApiPath(path: string): string {
  if (!API_PATH.test(path)) {
    throw new Error(`Blocked malformed API path: ${path}`);
  }
  return path;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  // 把当前界面语言带给服务端，使返回的用户可见消息（错误 / 诊断等）与之保持一致
  const headers = {
    'Content-Type': 'application/json',
    'Accept-Language': getLang(),
    ...(init?.headers as Record<string, string> | undefined),
  };
  try {
    res = await fetch(`/api${assertApiPath(path)}`, { ...init, headers });
  } catch (e) {
    log.error('api', `Request failed: ${(e as Error).message}`, { method: init?.method ?? 'GET', path });
    throw e;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as any)?.error ?? `HTTP ${res.status}`;
    log.error('api', 'Request failed', { method: init?.method ?? 'GET', path, status: res.status, message });
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

/* ---------- SSE 流式请求（耗时操作的实时进度） ---------- */

/** 下载进度（诚实口径：有确切百分比才给百分比，npm 侧只给已下载字节） */
export interface StreamProgress {
  /** 0–100；拿不到就是 undefined */
  percent?: number;
  /** 已传输字节 */
  received?: number;
  /** 总字节（拿不到就是 undefined） */
  total?: number;
  /** 阶段说明（git 阶段名 / 'download'） */
  stage?: string;
}

/** 流式事件：start（开始）/ log（一行输出）/ progress（下载进度）/ done（成功，余下字段即结果载荷）/ error（失败） */
export interface StreamEvent {
  phase: 'start' | 'log' | 'progress' | 'done' | 'error';
  line?: string;
  error?: string;
  log?: string;
  percent?: number;
  received?: number;
  total?: number;
  stage?: string;
  [key: string]: unknown;
}

/**
 * 切分 SSE 文本：完整帧（`data: {...}` 开头）与残余半帧。
 * 纯函数——流式边读边切，单测直接覆盖。
 */
export function splitSseFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  return { frames: parts.filter((f) => f.startsWith('data: ')), rest };
}

export interface StreamHandlers {
  /** 每来一行输出回调一次（已规整：限长、按 \r / \n 切分） */
  onLog?: (line: string) => void;
  /** 每来一次下载进度回调一次 */
  onProgress?: (p: StreamProgress) => void;
  signal?: AbortSignal;
}

async function streamError(res: Response, path: string): Promise<never> {
  const errBody = await res.json().catch(() => ({}));
  const message = (errBody as { error?: string })?.error ?? `HTTP ${res.status}`;
  log.error('api', 'Stream request failed', { path, status: res.status, message });
  throw new Error(message);
}

/** 处理 log / progress / error；done 由调用方返回载荷 */
function dispatchStreamEvent(ev: StreamEvent, handlers: StreamHandlers): void {
  if (ev.phase === 'log' && ev.line) {
    handlers.onLog?.(ev.line);
    return;
  }
  if (ev.phase === 'progress') {
    handlers.onProgress?.({
      percent: ev.percent,
      received: ev.received,
      total: ev.total,
      stage: ev.stage,
    });
    return;
  }
  if (ev.phase !== 'error') return;
  const err = new Error(ev.error ?? 'stream failed') as Error & { event?: StreamEvent };
  err.event = ev;
  throw err;
}

function parseStreamFrame(frame: string): StreamEvent | undefined {
  try {
    return JSON.parse(frame.slice('data: '.length)) as StreamEvent;
  } catch {
    return undefined;
  }
}

function takeStreamResult<T>(frames: string[], handlers: StreamHandlers): T | undefined {
  for (const frame of frames) {
    const ev = parseStreamFrame(frame);
    if (!ev) continue;
    if (ev.phase === 'done') return ev as unknown as T;
    dispatchStreamEvent(ev, handlers);
  }
  return undefined;
}

/**
 * POST 一个 SSE 流式接口：实时回调 log 行，resolve 出 done 事件的载荷。
 * error 事件 / 流异常 / 非 2xx 均 reject（参数校验错误发生在开流前，走普通 JSON error）。
 */
export async function streamApi<T>(path: string, body: unknown, handlers: StreamHandlers = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${assertApiPath(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': getLang() },
      body: JSON.stringify(body),
      signal: handlers.signal,
    });
  } catch (e) {
    log.error('api', `Stream request failed: ${(e as Error).message}`, { path });
    throw e;
  }
  if (!res.ok || !res.body) return streamError(res, path);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const split = splitSseFrames(buffer);
    buffer = split.rest;
    const result = takeStreamResult<T>(split.frames, handlers);
    if (result !== undefined) return result;
  }
  throw new Error('stream ended unexpectedly');
}

/* ---------- 基础数据契约 ---------- */
/** 内容体检摘要（F1/F2）：仅自有仓库技能、且存在问题时才有值 */
export interface SkillHealth { error: number; warn: number }

export interface SkillView {
  id: string; // name@来源
  name: string;
  source: string;
  dir: string;
  description?: string;
  version?: string;
  tags: string[];
  /** 来源追溯：收编自哪个 Agent / 外部目录（IM-04） */
  origin?: string;
  /** 内容体检摘要：无问题的技能不带该字段，前端据此不渲染徽标 */
  health?: SkillHealth;
}

/** 技能内容体检明细（详情页「运行检测」结果），文案已由服务端本地化 */
export interface SkillSecurityFinding {
  ruleId: string;
  category: string;
  severity: 'info' | 'warn' | 'error';
  file: string;
  line?: number;
  excerpt: string;
  /** 规则说明（本地化后的可读文案） */
  rule: string;
}

export interface SkillSecurityResult {
  /** 是否属于自有仓库；false = 第三方只读来源，不参与内容检测 */
  own: boolean;
  findings: SkillSecurityFinding[];
  issues: { kind: string; message: string }[];
}
export interface PresetView { name: string; skills: string[]; tags: string[] }
export interface AgentView {
  key: string; name: string; globalDir: string; installed: boolean;
  /**
   * 同一技能目录的主 Agent key（自身即主 Agent 时与 key 相同）。
   * 目录只有一份实体，预设 / 安装方式 / 显式开关都落在主 Agent 上；
   * primaryKey ≠ key 表示它与其它 Agent 共用同一个目录（同样是真实的 Agent，
   * 只是这套策略不是它定的）。此处返回的 preset / sync / skillSync 已是「生效值」。
   */
  primaryKey: string;
  /** 主 Agent 由用户显式指定（而非按活跃 / 名称自动推出） */
  primaryExplicit?: boolean;
  sync: 'symlink' | 'copy'; active: boolean; preset?: string;
  skillSync?: Record<string, 'symlink' | 'copy'>;
  family?: string; sharedWith: string[]; alsoUsedBy?: string[]; shared?: string; sharedDir?: string; sharedOwn?: boolean; custom?: boolean;
  project?: string;
}
export interface CustomAgentView { key: string; name: string; globalDir: string; projectDir?: string; recursive?: boolean }
export interface SettingsView { defaultSync: 'symlink' | 'copy' }
export interface StateView {
  activeAgents: string[];
  skills: SkillView[];
  presets: PresetView[];
  repos: RepoView[];
  sources: SourceView[];
  customAgents: CustomAgentView[];
  settings: SettingsView;
  /** 用户主目录；前端用它把绝对路径显示成 ~ 开头的短形式 */
  home: string;
}
/** 自有仓库；id 参与 skill 标识（name@id）不可变，name 仅作显示、缺省回落 id */
export interface RepoView { id: string; name?: string; path: string; root?: string }
/** 第三方仓库 */
export interface SourceView { id: string; name: string; path: string; layout: string; linked: boolean; installer?: SourceInstaller }
/** npx 安装来源的安装器信息：更新时在托管目录重跑安装命令（updateArgs 优先） */
export interface SourceInstaller { kind: 'npx'; pkg: string; args: string[]; updateArgs?: string[]; at?: string }
/** 从 Git 仓库导入：拉取代码到托管目录后，用返回的 path 走既有登记流程 */
export interface GitCloneResult { path: string; cloned: boolean }
/** 从 npx 命令安装：在托管目录执行安装命令后，用 suggestedRoot（缺省 path）走既有登记流程 */
export interface NpxInstallResult {
  ok: boolean;
  /** 从原始命令解析出的包名（登记时写入 installer） */
  pkg: string;
  /** 从原始命令解析出的参数（登记时写入 installer） */
  args: string[];
  path: string;
  /** 安装产物里推断出的技能扫描根（如 <staging>/.claude/skills）；装空了缺省 */
  suggestedRoot?: string;
  reused: boolean;
  /** 安装器写到托管目录之外的路径（本次运行期间被改动的家目录条目）；flint 不自动清理 */
  escaped?: string[];
  log: string;
  message?: string;
}

/* ---------- 统一技能展示契约（三处上下文共用） ---------- */
export type SkillReason = 'own' | 'preset' | 'manual' | 'external' | 'shared';
export type SkillStore = 'symlink' | 'copy' | 'own' | 'pending';
/** detail 仅客户端使用：技能库里打开技能详情 */
export type SkillActionKind = 'toggle' | 'collect' | 'merge' | 'delete' | 'detail';
export interface SkillAction { kind: SkillActionKind; label: string; disabled?: boolean; title?: string }
export interface SkillCardView {
  id: string; name: string; title?: string; description?: string; source: string; dir?: string;
  tags: string[];
  reason: SkillReason;
  store: SkillStore;
  /**
   * 缺省表示该上下文没有启用/停用语义（如技能库资产池），此时不展示状态徽标。
   * on = 该技能已在本目录中可用；off = 本工具曾分发到这里、现已移出分发名单。
   * 「本工具管不管它」不在这里表达，由 reason 徽标说明（见 isToolManaged）。
   */
  state?: 'on' | 'off';
  /** 覆盖行首开关的选中态（缺省由 state 推导）；预设等以名单为准的上下文显式传入 */
  toggleOn?: boolean;
  /** 开关置为不可交互（如预设中由标签自动纳入的技能，只能解锁标签来停用） */
  toggleDisabled?: boolean;
  /** 覆盖 reason 徽标文案（预设详情中「预设引入」→「按标签纳入」等场景） */
  reasonLabel?: string;
  reasonTitle?: string;
  offOverride?: boolean;
  /** 软链的真实目标（绝对路径） */
  linkTarget?: string;
  preset?: string;
  /** 该技能物理所在的可读目录（多目录 Agent 用于说明「来自哪个目录」） */
  fromDir?: string;
  /** own=本体目录（本工具分发）；shared=额外读取的目录（只读） */
  readVia?: 'own' | 'shared';
  /** 已接管：本目录这条是指向仓库内技能的软链（系统口径，任一自有仓库；指向仓库外的不算） */
  takenOver?: boolean;
  /** 不在本工具分发范围内的行的实际位置（软链附带真实目标，home 已压成 ~）：由服务端给好，列表直接展示 */
  pathLabel?: string;
  /** 内容体检摘要（技能库资产池从 /state 带入）：有问题的技能据此显示区别徽标 */
  health?: SkillHealth;
  /** 客户端派生：直接展示来源目录的徽标文案，仅多目录 Agent 需要 */
  dirLabel?: string;
  dirTitle?: string;
  actions: SkillAction[];
  /** 客户端派生：仅由正文命中搜索词时置位，值为命中上下文（F3） */
  bodyHit?: string;
}
export interface AddableSkill { id: string; name: string; repo: string }
export interface AgentSkillsResp { skills: SkillCardView[]; addable: AddableSkill[]; active: boolean }
/**
 * 一条技能在某个智能体**自身目录**里的存在情况（只读总览，`GET /skills/:name/agents`）。
 * 只回答「有没有」与它的来源原因：不看只读共享目录读到的行，也不算「可添加」，
 * 因此服务端不必为了它重扫技能库。
 */
export interface AgentSkillPresence { key: string; present: boolean; reason?: SkillReason }
export interface SkillAgentsResp { agents: AgentSkillPresence[] }
export interface ProjectSkillsResp { skills: SkillCardView[]; addable: AddableSkill[] }

/* ---------- 同步/诊断 ---------- */
export interface SyncResult { agent: string; created: string[]; removed: string[]; failed: { skill: string; reason: string }[]; warnings?: string[] }
export enum DiagStatus { ok = 'ok', warn = 'warn', error = 'error' }
export interface DiagItem { key: string; status: DiagStatus; message: string; detail?: unknown }
/** sync 诊断项的 detail：期望 / 缺失 / 多余 / 失效软链，供「修复」确认弹窗逐条列出改动 */
export interface SyncDiff {
  agent: string;
  missing: string[];
  extra: string[];
  brokenLink: string[];
}
export interface DiagnoseResult { config: string; summary: Record<string, { total: number; ok: number; warn: number; error: number }>; groups: Record<string, DiagItem[]>; items: DiagItem[] }
export interface ProjectSyncResult { project: string; copied: string[]; removed: string[]; agentLinks: { agent: string; created: string[] }[]; errors: string[] }
export interface ProjectPushResult { project: string; repo: string; pushed: string[]; skipped: string[]; errors: string[] }

/* ---------- 导入/收集/合并 ---------- */
/* ---------- 登记预览（登记确认前先看识别结果） ---------- */
export interface RegisterPreview {
  /** 最终将采用的 id（用户输入优先，否则目录名推导） */
  id: string;
  /** id 是否取自目录名缺省（用户未填写） */
  idFromDir: boolean;
  /** id 校验失败原因；非空时必须由用户输入合法 id */
  idIssue?: string;
  /** 与已登记仓库 / 来源重名 */
  idTaken?: boolean;
  exists: boolean;
  /** 实际扫描根（自有 = root ?? <path>/skills；第三方 = path 本身） */
  scanRoot: string;
  layout: string;
  skillCount: number;
  skills: { name: string; description?: string }[];
}

export interface ImportPreviewItem { source: string; layout: string; count: number; tags?: string[]; error?: string }
export interface ImportResult { source: string; imported: string[]; skipped: string[] }
export interface MergeCandidate { name: string; source: string; sourceLabel: string; description?: string; version?: string; dir: string; existing: boolean }
export interface MergeGroup { name: string; candidates: MergeCandidate[] }
export interface AgentCollectItem {
  name: string;
  /** skill 本体目录 */
  dir: string;
  description?: string;
  tags: string[];
  exists: boolean;
  /** skill 本体是否为软链 */
  symlink: boolean;
  /** 软链解析后的真实目标 */
  linkTarget?: string;
  /** 软链目标是否落在目标仓库内（如接管生成的仓库本体软链） */
  inRepo?: boolean;
}
export interface AgentCollectPreview { agentKey: string; agentName: string; installedDir: string; items: AgentCollectItem[] }
export interface CollectResult { collected: string[]; skipped: string[] }
/** F4：来源/版本可追踪信息（仅已登记来源时返回） */
export interface SkillProvenance { sourceRef: string; sourceType?: 'git' | 'dir'; takenAt?: string; stale?: boolean }
export interface SkillContent { id: string; dir: string; content: string; files: string[]; provenance?: SkillProvenance }

/* ---------- 正文搜索（F3） ---------- */
export interface SkillSearchHit { id: string; context?: string }
export interface SkillSearchResp { hits: SkillSearchHit[] }

/* ---------- 仓库级 git 来源 / 同步（F4） ---------- */
export interface RepoStatus { remote: string; ahead?: number; behind?: number; checked?: boolean }

/* ---------- 日志 ---------- */
export interface LogView { path: string; size: number; lines: string[]; version: string }
