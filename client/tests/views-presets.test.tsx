import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import Presets from '../src/views/Presets';
import { ToastProvider } from '../src/components/ui/Toast';
import { I18nProvider } from '../src/i18n';
import { navigate } from '../src/state/router';
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

const STATE: StateView = {
  activeAgents: ['cursor'],
  skills: [
    { id: 'alpha@default', name: 'alpha', source: 'default', dir: '/r/a', tags: ['x'], description: 'A skill' },
    { id: 'gamma@default', name: 'gamma', source: 'default', dir: '/r/g', tags: ['x'] },
    { id: 'beta@default', name: 'beta', source: 'default', dir: '/r/b', tags: [] },
  ],
  presets: [{ name: 'demo', skills: ['alpha@default'], tags: ['x'] }],
  repos: [{ id: 'default', path: '/r' }],
  sources: [],
  customAgents: [],
  settings: { defaultSync: 'symlink' },
  home: '/tmp',
} as StateView;

function baseRoutes(overrides: Record<string, Handler> = {}) {
  installRoutes({
    '/state': () => STATE,
    '/agents': () => [agent({ preset: 'demo' }), agent({ key: 'cline', name: 'Cline', globalDir: '/tmp/a/cline', active: false, primaryKey: 'cline' })],
    ...overrides,
  });
}

beforeEach(() => {
  localStorage.clear();
  navigate({ tab: 'presets', sub: null, query: new URLSearchParams() });
});

describe('Presets 列表页', () => {
  it('展示预设卡片与生效技能数', async () => {
    baseRoutes();
    render(wrap(<Presets />));
    await waitFor(() => expect(screen.getByText('demo')).toBeTruthy());
    expect(screen.getByText('All presets')).toBeTruthy();
    // demo 显式 1 个 + 标签纳入 1 个（gamma）
    expect(screen.getByText('2 skills enabled')).toBeTruthy();
  });

  it('没有预设时给出空状态', async () => {
    baseRoutes({ '/state': () => ({ ...STATE, presets: [] }) });
    render(wrap(<Presets />));
    // 预设列表由 EntityList 渲染，空数组走默认空状态
    await waitFor(() => expect(screen.getAllByText('No data').length).toBeGreaterThan(0));
  });

  it('新建预设：名称空时禁用，创建后进入详情并提示', async () => {
    baseRoutes({ 'POST /presets': () => ({ name: 'review', skills: [], tags: [] }) });
    render(wrap(<Presets />));
    await waitFor(() => expect(screen.getByText('demo')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'New preset' }));
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Preset name/), 'review');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText(/Created; opening the detail page/)).toBeTruthy());
    const post = apiMock.mock.calls.find((c) => c[0] === '/presets' && c[1]?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ name: 'review' });
  });

  it('新建失败时提示错误', async () => {
    baseRoutes({ 'POST /presets': () => { throw new Error('duplicate'); } });
    render(wrap(<Presets />));
    await waitFor(() => expect(screen.getByText('demo')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'New preset' }));
    await userEvent.type(screen.getByLabelText(/Preset name/), 'review');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('duplicate')).toBeTruthy());
  });

  it('地址指向不存在的预设时安静降级', async () => {
    baseRoutes();
    navigate({ tab: 'presets', sub: 'ghost', query: new URLSearchParams() });
    render(wrap(<Presets />));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Presets' })).toBeTruthy());
    expect(screen.queryByText('Current state')).toBeNull();
  });
});

describe('预设详情页', () => {
  function renderDetail(overrides: Record<string, Handler> = {}) {
    baseRoutes({ 'PUT /presets/demo': () => ({ name: 'demo', skills: ['alpha@default'], tags: ['x'] }), ...overrides });
    navigate({ tab: 'presets', sub: 'demo', query: new URLSearchParams() });
    return render(wrap(<Presets />));
  }

  it('渲染当前状态：生效技能与使用该预设的 Agent', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Current state')).toBeTruthy());
    expect(screen.getByText('Enabled skills')).toBeTruthy();
    expect(screen.getByText('Agents using this preset')).toBeTruthy();
    // 标题里给出「含按标签纳入」的说明
    expect(screen.getByText(/including 1 included by tag/)).toBeTruthy();
    expect(screen.getByText('Distributed')).toBeTruthy();
  });

  it('按标签纳入的技能开关被锁定并带徽标', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Include by skill')).toBeTruthy());
    expect(screen.getAllByText('Included by tag').length).toBeGreaterThan(0);
    const switches = screen.getAllByRole('switch');
    expect(switches.some((s) => s.hasAttribute('disabled'))).toBe(true);
  });

  it('切换技能开关会按顺序 PUT 技能名单', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Include by skill')).toBeTruthy());
    // beta 未纳入 → 打开它
    const betaSwitch = screen.getAllByRole('switch').find((s) => !s.hasAttribute('disabled'))!;
    await userEvent.click(betaSwitch);
    await waitFor(() => expect(apiMock.mock.calls.some((c) => c[0] === '/presets/demo' && c[1]?.method === 'PUT')).toBe(true));
  });

  it('技能保存失败时回退草稿并提示', async () => {
    renderDetail({ 'PUT /presets/demo': () => { throw new Error('save boom'); } });
    await waitFor(() => expect(screen.getByText('Include by skill')).toBeTruthy());
    const betaSwitch = screen.getAllByRole('switch').find((s) => !s.hasAttribute('disabled'))!;
    await userEvent.click(betaSwitch);
    await waitFor(() => expect(screen.getByText('save boom')).toBeTruthy());
  });

  it('关联标签：点选即保存并提示', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Include by tag')).toBeTruthy());
    // 取消已关联的 x
    await userEvent.click(screen.getByRole('button', { name: /^x/ }));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    const put = apiMock.mock.calls.find((c) => c[0] === '/presets/demo' && c[1]?.method === 'PUT');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({ tags: [] });
  });

  it('标签保存失败时提示', async () => {
    renderDetail({ 'PUT /presets/demo': () => { throw new Error('tag boom'); } });
    await waitFor(() => expect(screen.getByText('Include by tag')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /^x/ }));
    await waitFor(() => expect(screen.getByText('tag boom')).toBeTruthy());
  });

  it('技能筛选：搜索与重置', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Include by skill')).toBeTruthy());
    // 搜索只作用于「按技能纳入」这一块（当前状态里的 pill 不受影响）
    const panel = screen.getByText('Include by skill').closest('.panel') as HTMLElement;
    expect(within(panel).getAllByRole('switch')).toHaveLength(3);
    await userEvent.type(within(panel).getByRole('searchbox'), 'beta');
    await waitFor(() => expect(within(panel).getAllByRole('switch')).toHaveLength(1));
    await userEvent.click(within(panel).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(within(panel).getAllByRole('switch')).toHaveLength(3));
  });

  it('删除预设：成功后回到列表', async () => {
    renderDetail({ 'DELETE /presets/demo': () => ({ ok: true }) });
    await waitFor(() => expect(screen.getByText('Current state')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('Deleted')).toBeTruthy());
  });

  it('删除失败时提示错误', async () => {
    renderDetail({ 'DELETE /presets/demo': () => { throw new Error('in use'); } });
    await waitFor(() => expect(screen.getByText('Current state')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('in use')).toBeTruthy());
  });

  it('返回列表', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Current state')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    await waitFor(() => expect(screen.queryByText('Current state')).toBeNull());
  });

  it('点击已应用的 Agent 跳到 Agent 详情', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Agents using this preset')).toBeTruthy());
    await userEvent.click(screen.getByText('Cursor'));
    await waitFor(() => expect(window.location.hash).toContain('#/agents/cursor'));
  });

  it('预设没有任何生效技能 / 没有 Agent 使用时给出空态', async () => {
    renderDetail({
      '/state': () => ({ ...STATE, presets: [{ name: 'demo', skills: [], tags: [] }] }),
      '/agents': () => [agent({ preset: undefined })],
    });
    await waitFor(() => expect(screen.getByText(/No skill enabled yet/)).toBeTruthy());
    expect(screen.getByText('No agent uses this preset')).toBeTruthy();
  });

  it('徽标说明与折叠面板可用', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Include by skill')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Badge guide' })[0]);
    expect(screen.getByText('What do the badges on a skill mean?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await userEvent.click(screen.getByRole('button', { name: 'Collapse Include by tag' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^x/ })).toBeNull());
  });
});
