import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import Agents from '../src/views/Agents';
import { ToastProvider } from '../src/components/ui/Toast';
import { I18nProvider } from '../src/i18n';
import { getRoute, navigate } from '../src/state/router';
import type { AgentView, StateView } from '../src/api/types';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api/types', () => ({
  api: apiMock,
  assertApiPath: (p: string) => p,
}));

type Handler = (init?: RequestInit) => unknown;
let routes: Record<string, Handler>;

function installRoutes(next: Record<string, Handler>) {
  routes = next;
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const clean = path.split('?')[0];
    const handler = routes[`${method} ${clean}`] ?? routes[clean];
    if (!handler) throw new Error(`unmocked api call: ${method} ${clean}`);
    return handler(init);
  });
}

function wrap(ui: ReactNode) {
  return (
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>
  );
}

const agent = (over: Partial<AgentView> = {}): AgentView => ({
  key: 'cursor', name: 'Cursor', globalDir: '/tmp/a/cursor', installed: true, primaryKey: 'cursor',
  sync: 'symlink', active: true, sharedWith: [], ...over,
});

const AGENTS: AgentView[] = [
  agent(),
  agent({ key: 'warp', name: 'Warp', active: false, primaryKey: 'cursor' }),
  agent({ key: 'cline', name: 'Cline', globalDir: '/tmp/a/cline', active: false, installed: false, primaryKey: 'cline' }),
  agent({
    key: 'codex', name: 'Codex', globalDir: '/tmp/a/agents', active: false, primaryKey: 'codex',
    shared: 'agents', sharedOwn: true, sharedDir: '/tmp/a/agents',
  }),
];

const skillRow = (over: Record<string, unknown> = {}) => ({
  id: 'alpha@default', name: 'alpha', source: 'default', tags: [], reason: 'manual', store: 'symlink',
  state: 'on', actions: [{ kind: 'collect', label: 'Collect' }, { kind: 'delete', label: 'Delete' }], ...over,
});

const STATE: StateView = {
  activeAgents: ['cursor'],
  skills: [
    { id: 'alpha@default', name: 'alpha', source: 'default', dir: '/r/a', tags: ['x'], description: 'd' },
    { id: 'beta@default', name: 'beta', source: 'default', dir: '/r/b', tags: [] },
  ],
  presets: [{ name: 'demo', skills: [], tags: [] }],
  repos: [{ id: 'default', path: '/r' }],
  sources: [],
  customAgents: [],
  settings: { defaultSync: 'symlink' },
  home: '/tmp',
} as StateView;

function baseRoutes(overrides: Record<string, Handler> = {}) {
  installRoutes({
    '/agents': () => AGENTS,
    '/agents/cursor/skills': () => ({ skills: [skillRow()], addable: [], active: true }),
    '/agents/cline/skills': () => ({ skills: [], addable: [], active: false }),
    '/agents/codex/skills': () => ({ skills: [], addable: [], active: false }),
    '/presets': () => [{ name: 'demo', skills: [], tags: [] }],
    '/state': () => STATE,
    '/activeAgents': () => ['cursor'],
    ...overrides,
  });
}

beforeEach(() => {
  localStorage.clear();
  navigate({ tab: 'agents', sub: null, query: new URLSearchParams() });
});

describe('Agents 列表页', () => {
  it('按目录归并卡片：同目录合并、推荐目录单独表述', async () => {
    baseRoutes();
    render(wrap(<Agents />));
    await waitFor(() => expect(screen.getByText('cursor / warp')).toBeTruthy());
    // 推荐目录卡片用「开源生态推荐目录」作主标题
    expect(screen.getByText('Ecosystem-recommended directory')).toBeTruthy();
    // cursor + warp 合成一张卡片：4 个 Agent 落在 3 个目录上
    expect(screen.getByText(/3 skill directories · 4 agents/)).toBeTruthy();
  });

  it('按名称 / key / 目录搜索，并可重置', async () => {
    baseRoutes();
    render(wrap(<Agents />));
    await waitFor(() => expect(screen.getByText('cursor / warp')).toBeTruthy());
    await userEvent.type(screen.getByRole('searchbox'), 'cline');
    await waitFor(() => expect(screen.queryByText('cursor / warp')).toBeNull());
    expect(screen.getByText('Cline')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(screen.getByText('cursor / warp')).toBeTruthy());
  });

  it('「仅已安装」开关过滤未安装目录', async () => {
    baseRoutes();
    render(wrap(<Agents />));
    await waitFor(() => expect(screen.getByText('Cline')).toBeTruthy());
    await userEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.queryByText('Cline')).toBeNull());
  });

  it('空库时展示空状态', async () => {
    baseRoutes({ '/agents': () => [] });
    render(wrap(<Agents />));
    await waitFor(() => expect(screen.getByText('No agents')).toBeTruthy());
  });

  it('徽标说明弹窗可打开', async () => {
    baseRoutes();
    render(wrap(<Agents />));
    await waitFor(() => expect(screen.getByText('cursor / warp')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Badge guide' })[0]);
    expect(screen.getByText('What do the badges on a card mean?')).toBeTruthy();
  });

  it('点击卡片进入详情；别名地址被规范到主 Agent', async () => {
    baseRoutes();
    render(wrap(<Agents />));
    await waitFor(() => expect(screen.getByText('cursor / warp')).toBeTruthy());
    await userEvent.click(screen.getByText('cursor / warp'));
    await waitFor(() => expect(screen.getByText('Current skills')).toBeTruthy());

    // 地址指向别名（warp）时，规范到该目录的主 Agent（cursor）
    navigate({ tab: 'agents', sub: 'warp', query: new URLSearchParams() });
    await waitFor(() => expect(getRoute().sub).toBe('cursor'));
  });

  it('地址里的 Agent 不存在时安静降级（既不渲染详情，也不报错）', async () => {
    baseRoutes();
    navigate({ tab: 'agents', sub: 'nope', query: new URLSearchParams() });
    render(wrap(<Agents />));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy());
    expect(screen.queryByText('Current skills')).toBeNull();
  });

  it('打开「新增自定义 Agent」弹窗', async () => {
    baseRoutes();
    render(wrap(<Agents />));
    await waitFor(() => expect(screen.getByText('cursor / warp')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Add custom agent' }));
    // 弹窗标题与入口按钮同名：确认弹窗确实出现
    await waitFor(() => expect(screen.getAllByText('Add custom agent').length).toBeGreaterThan(1));
  });
});

describe('Agent 详情页', () => {
  function renderDetail(key = 'cursor', overrides: Record<string, Handler> = {}) {
    baseRoutes(overrides);
    navigate({ tab: 'agents', sub: key, query: new URLSearchParams() });
    return render(wrap(<Agents />));
  }

  it('渲染目录、当前技能与别名提示', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Current skills')).toBeTruthy());
    expect(screen.getByText('Skill directories')).toBeTruthy();
    // 技能行（可归集 / 删除）
    expect(screen.getAllByRole('button', { name: 'Delete' }).length).toBeGreaterThan(0);
  });

  it('未在活跃集合时给出提示', async () => {
    renderDetail('cline');
    await waitFor(() => expect(screen.getByText(/not in the active set/)).toBeTruthy());
  });

  it('加入 / 移出活跃集合', async () => {
    renderDetail('cline', {
      '/activeAgents': () => ['cursor'],
      'PUT /activeAgents': () => ['cursor', 'cline'],
      'GET /agents/cline/skills': () => ({ skills: [], addable: [], active: false }),
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set active' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Set active' }));
    await waitFor(() => expect(screen.getByText('Updated and synced')).toBeTruthy());
    const put = apiMock.mock.calls.find((c) => c[0] === '/activeAgents' && c[1]?.method === 'PUT');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual(['cursor', 'cline']);
  });

  it('取消活跃（当前活跃时按钮为「移出活跃」）', async () => {
    renderDetail('cursor', {
      'PUT /activeAgents': () => [],
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from active' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Remove from active' }));
    await waitFor(() => expect(screen.getByText('Updated and synced')).toBeTruthy());
  });

  it('同步：成功与失败两条路径', async () => {
    renderDetail('cursor', {
      'POST /agents/cursor/sync': () => ({ agent: 'cursor', created: ['a'], removed: ['b'], failed: [] }),
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() => expect(screen.getByText(/Synced: 1 added \/ 1 removed/)).toBeTruthy());
  });

  it('同步出现失败项时列出明细并提示', async () => {
    renderDetail('cursor', {
      'POST /agents/cursor/sync': () => ({
        agent: 'cursor', created: [], removed: [],
        failed: [{ skill: 'x@default', reason: 'blocked' }], warnings: ['careful'],
      }),
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() => expect(screen.getByText('Failed sync items')).toBeTruthy());
    expect(screen.getByText('x@default')).toBeTruthy();
    expect(screen.getByText('careful')).toBeTruthy();
  });

  it('同步抛错时提示', async () => {
    renderDetail('cursor', { 'POST /agents/cursor/sync': () => { throw new Error('sync boom'); } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() => expect(screen.getByText('sync boom')).toBeTruthy());
  });

  it('目录覆盖弹窗保存与失败提示', async () => {
    renderDetail('cursor', { 'PUT /agents/cursor': () => ({}) });
    await waitFor(() => expect(screen.getByText('Current skills')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Directories' }));
    expect(screen.getByText('Override directories · Cursor')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Directories overridden')).toBeTruthy());
    const put = apiMock.mock.calls.find((c) => c[0] === '/agents/cursor' && c[1]?.method === 'PUT');
    expect(JSON.parse(put?.[1]?.body as string)).toMatchObject({ globalDir: '/tmp/a/cursor', projectDir: null });
  });

  it('目录覆盖保存失败时提示', async () => {
    renderDetail('cursor', { 'PUT /agents/cursor': () => { throw new Error('dir boom'); } });
    await waitFor(() => expect(screen.getByText('Current skills')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Directories' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('dir boom')).toBeTruthy());
  });

  it('绑定预设：选择后写入并出现「应用预设」', async () => {
    renderDetail('cursor', { 'PUT /agents/cursor': () => ({}) });
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Linked preset/ })).toBeTruthy());
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Linked preset/ }), 'demo');
    await waitFor(() => expect(screen.getByText('Updated and synced')).toBeTruthy());
    const put = apiMock.mock.calls.find((c) => c[0] === '/agents/cursor' && c[1]?.method === 'PUT');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({ preset: 'demo' });
  });

  it('已有预设时展示「应用预设」按钮，点击即同步', async () => {
    renderDetail('cursor', {
      '/agents': () => [agent({ preset: 'demo', primaryExplicit: true })],
      'POST /agents/cursor/sync': () => ({ agent: 'cursor', created: ['a'], removed: [], failed: [] }),
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply preset' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Apply preset' }));
    await waitFor(() => expect(screen.getByText(/Synced:/)).toBeTruthy());
  });

  it('按技能覆盖安装方式', async () => {
    renderDetail('cursor', { 'PUT /agents/cursor': () => ({}) });
    await waitFor(() => expect(screen.getByText('Current skills')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Override install mode per skill')).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(/Install mode for alpha/), 'copy');
    await waitFor(() => expect(screen.getByText('Updated and synced')).toBeTruthy());
    const put = apiMock.mock.calls.find((c) => c[0] === '/agents/cursor' && c[1]?.method === 'PUT');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({ skillSync: { alpha: 'copy' } });
  });

  it('默认安装方式与存储归属', async () => {
    renderDetail('cursor', { 'PUT /agents/cursor': () => ({}) });
    await waitFor(() => expect(screen.getByText('Current skills')).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText(/Default install mode/)).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(/Default install mode/), 'copy');
    await waitFor(() => expect(screen.getByText('Updated and synced')).toBeTruthy());
  });

  it('从技能库直接添加 / 已装技能置灰，并支持筛选与重置', async () => {
    renderDetail('cursor', {
      'POST /agents/cursor/skills': () => ({ agent: 'cursor', created: [], removed: [], failed: [] }),
    });
    await waitFor(() => expect(screen.getByText('Add from the vault')).toBeTruthy());
    // alpha 已在目录中（Added 置灰），beta 可添加
    expect(screen.getByRole('button', { name: 'Added' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByText('Updated and synced')).toBeTruthy());
    const post = apiMock.mock.calls.find((c) => c[0] === '/agents/cursor/skills' && c[1]?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ id: 'beta@default' });

    // 搜索 + 重置
    // 技能库搜索只过滤「从技能库添加」那一块：alpha 已装（Added 置灰），筛掉后不应再出现
    await userEvent.type(screen.getByRole('searchbox'), 'beta');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Added' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
    await userEvent.click(screen.getAllByRole('button', { name: 'Reset' })[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Added' })).toBeTruthy());
  });

  it('技能行操作：归集与删除', async () => {
    renderDetail('cursor', {
      'DELETE /agents/cursor/skills/alpha': () => ({ ok: true }),
      '/agents/cursor/collect/preview': () => ({
        agentKey: 'cursor', agentName: 'Cursor', installedDir: '/tmp/a/cursor', items: [],
      }),
    });
    await waitFor(() => expect(screen.getByText('Current skills')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('Updated and synced')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await waitFor(() => expect(screen.getByText('Collect to repository')).toBeTruthy());
  });

  it('删除自定义 Agent（含确认弹窗）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetail('cursor', {
      '/agents': () => [agent({ custom: true })],
      'DELETE /agents/custom/cursor': () => [],
    });
    const del = await screen.findByTitle('Delete this custom agent (built-in agents cannot be deleted)');
    await userEvent.click(del);
    await waitFor(() => expect(screen.getByText('Custom agent deleted')).toBeTruthy());
    // 删除后回到列表
    await waitFor(() => expect(getRoute().sub).toBeNull());
    confirmSpy.mockRestore();
  });

  it('取消确认时不删除', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderDetail('cursor', { '/agents': () => [agent({ custom: true })] });
    const del = await screen.findByTitle('Delete this custom agent (built-in agents cannot be deleted)');
    await userEvent.click(del);
    expect(apiMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
    confirmSpy.mockRestore();
  });

  it('删除失败时提示错误', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetail('cursor', {
      '/agents': () => [agent({ custom: true })],
      'DELETE /agents/custom/cursor': () => { throw new Error('in use'); },
    });
    const del = await screen.findByTitle('Delete this custom agent (built-in agents cannot be deleted)');
    await userEvent.click(del);
    await waitFor(() => expect(screen.getByText('in use')).toBeTruthy());
    confirmSpy.mockRestore();
  });

  it('返回列表', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Current skills')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    await waitFor(() => expect(screen.queryByText('Current skills')).toBeNull());
  });

  it('收藏 / 折叠面板与徽标说明在详情页同样可用', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Current skills')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Badge guide' })[0]);
    expect(screen.getByText('What do the badges on a skill mean?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));

    // 折叠「按预设」面板：折叠后下拉消失，只剩折叠按钮
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Linked preset' }));
    await waitFor(() => expect(screen.queryByRole('combobox', { name: /Linked preset/ })).toBeNull());
  });
});
