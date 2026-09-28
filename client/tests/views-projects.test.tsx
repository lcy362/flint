import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import Projects from '../src/views/Projects';
import { ToastProvider } from '../src/components/ui/Toast';
import { I18nProvider } from '../src/i18n';
import { navigate } from '../src/state/router';
import type { AgentView, ProjectPushResult, ProjectSkillsResp } from '../src/api/types';

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
  key: 'cursor', name: 'Cursor', globalDir: '/g', installed: true, primaryKey: 'cursor',
  sync: 'symlink', active: true, sharedWith: [], ...over,
});

const skillCard = (over: Record<string, unknown> = {}) => ({
  id: 'alpha@default', name: 'alpha', source: 'default', tags: [], reason: 'preset', store: 'symlink',
  state: 'on', actions: [], ...over,
});

const skillsResp = (over: Partial<ProjectSkillsResp> = {}): ProjectSkillsResp => ({
  skills: [skillCard({ actions: [{ kind: 'collect', label: 'Collect' }, { kind: 'delete', label: 'Delete' }] })] as never,
  addable: [{ id: 'beta@default', name: 'beta', repo: 'default' }],
  ...over,
});

/** 默认的详情页现场 */
function detailRoutes(overrides: Record<string, Handler> = {}) {
  installRoutes({
    '/projects': () => [{ id: 0, path: '/tmp/proj', tags: ['web'], agents: ['cursor'], hasAgents: true }],
    '/projects/0/skills': () => skillsResp(),
    '/agents': () => [agent(), agent({ key: 'cline', name: 'Cline' })],
    '/repos': () => [{ id: 'default', path: '/tmp/repo' }],
    'PUT /projects/0/agents': () => ({ ...skillsResp(), agents: ['cursor'], sync: {} }),
    'PUT /projects/0/tags': () => ({ id: 0, path: '/tmp/proj', tags: [] }),
    'POST /projects/0/sync': () => ({ project: '/tmp/proj', copied: [], removed: [], agentLinks: [], errors: [] }),
    'POST /projects/0/skills': () => ({ ok: true, copied: 'beta' }),
    'DELETE /projects/0/skills/alpha': () => ({ ok: true }),
    'POST /projects/0/push': () => ({ project: '/tmp/proj', repo: 'default', pushed: ['alpha'], skipped: [], errors: [] } satisfies ProjectPushResult),
    '/state': () => ({
      activeAgents: [], skills: [], presets: [], sources: [], customAgents: [],
      repos: [{ id: 'default', path: '/tmp/repo' }], settings: { defaultSync: 'symlink' }, home: '/home/u',
    }),
    '/projects/0/collect/preview': () => ({
      sourceRef: 'project:0', agentKey: 'project:0', agentName: '/tmp/proj',
      installedDir: '/tmp/proj/.agents/skills', items: [],
    }),
    ...overrides,
  });
}

beforeEach(() => {
  localStorage.clear();
  navigate({ tab: 'projects', sub: null, query: new URLSearchParams() });
});

describe('Projects 列表页', () => {
  it('渲染项目列表并可进入详情（写进地址）', async () => {
    detailRoutes();
    render(wrap(<Projects />));
    await waitFor(() => expect(screen.getByText('/tmp/proj')).toBeTruthy());
    expect(screen.getByText('#web')).toBeTruthy();
    // 进入详情：地址里带上项目 id
    await userEvent.click(screen.getByText('/tmp/proj'));
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
  });

  it('空列表走默认空状态', async () => {
    installRoutes({ '/projects': () => [] });
    render(wrap(<Projects />));
    await waitFor(() => expect(screen.getByText('No projects')).toBeTruthy());
  });

  it('新建项目：路径为空时按钮禁用，提交后回调并提示', async () => {
    detailRoutes({ 'POST /projects': () => [] });
    render(wrap(<Projects />));
    await waitFor(() => expect(screen.getByText('/tmp/proj')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();

    await userEvent.type(screen.getAllByRole('textbox')[0], '/tmp/new');
    await userEvent.type(screen.getByLabelText(/Tags/), 'a, b');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Created')).toBeTruthy());
    const body = JSON.parse(apiMock.mock.calls.find((c) => c[1]?.method === 'POST')?.[1]?.body as string);
    expect(body).toEqual({ path: '/tmp/new', tags: ['a', 'b'] });
  });

  it('新建失败时提示错误', async () => {
    detailRoutes({ 'POST /projects': () => { throw new Error('exists'); } });
    render(wrap(<Projects />));
    await waitFor(() => expect(screen.getByText('/tmp/proj')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    await userEvent.type(screen.getAllByRole('textbox')[0], '/tmp/new');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('exists')).toBeTruthy());
  });
});

describe('Projects 详情页', () => {
  function renderDetail(overrides: Record<string, Handler> = {}) {
    detailRoutes(overrides);
    navigate({ tab: 'projects', sub: '0', query: new URLSearchParams() });
    return render(wrap(<Projects />));
  }

  it('渲染技能列表、投放 Agent 列表与计数', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    expect(screen.getByText('1 deployed')).toBeTruthy();
    // 已投放 / 未投放状态
    expect(screen.getByText('Deployed')).toBeTruthy();
    expect(screen.getByText('Not deployed')).toBeTruthy();
    // 技能行
    expect(screen.getAllByText('alpha').length).toBeGreaterThan(0);
  });

  it('切换 Agent 投放会 PUT 并刷新', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    const switches = screen.getAllByRole('switch');
    await userEvent.click(switches[1]);
    await waitFor(() => expect(screen.getByText('Updated')).toBeTruthy());
    const put = apiMock.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(put?.[0]).toBe('/projects/0/agents');
  });

  it('搜索 Agent 并重置', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.type(screen.getByRole('searchbox'), 'cline');
    await waitFor(() => expect(screen.queryByText('Cursor')).toBeNull());
    expect(screen.getByText('Cline')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
  });

  it('搜索无结果时给出空状态', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    await waitFor(() => expect(screen.getByText('No matching agents')).toBeTruthy());
  });

  it('编辑标签并保存', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Tags' }));
    const input = screen.getAllByRole('textbox')[0];
    await userEvent.clear(input);
    await userEvent.type(input, 'a b');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Updated')).toBeTruthy());
    const put = apiMock.mock.calls.find((c) => c[0] === '/projects/0/tags');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({ tags: ['a', 'b'] });
  });

  it('同步项目', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() => expect(screen.getByText('Updated')).toBeTruthy());
    expect(apiMock.mock.calls.some((c) => c[0] === '/projects/0/sync' && c[1]?.method === 'POST')).toBe(true);
  });

  it('回写仓库：打开即执行，展示结果并可指定仓库再推', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Push to repository' }));
    // 打开时已自动推一次
    await waitFor(() => expect(apiMock.mock.calls.some((c) => c[0] === '/projects/0/push')).toBe(true));
    await waitFor(() => expect(screen.getByText(/Pushed back:/)).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /to default/ }));
    await waitFor(() => expect(apiMock.mock.calls.filter((c) => c[0] === '/projects/0/push').length).toBeGreaterThan(1));
  });

  it('回写失败时提示错误', async () => {
    renderDetail({ 'POST /projects/0/push': () => { throw new Error('push boom'); } });
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Push to repository' }));
    await waitFor(() => expect(screen.getByText('push boom')).toBeTruthy());
  });

  it('回写没有可推送内容时给出提示', async () => {
    renderDetail({
      'POST /projects/0/push': () => ({ project: '/tmp/proj', repo: 'default', pushed: [], skipped: ['x'], errors: ['boom'] }),
    });
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Push to repository' }));
    await waitFor(() => expect(screen.getByText('Nothing to push back')).toBeTruthy());
    expect(screen.getByText(/Skipped:/)).toBeTruthy();
    expect(screen.getByText(/Errors:/)).toBeTruthy();
  });

  it('添加技能弹窗与添加回调', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    await waitFor(() => expect(screen.getByText('Add skills')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Add' }).at(-1)!);
    await waitFor(() => expect(screen.getByText('Updated')).toBeTruthy());
    const post = apiMock.mock.calls.find((c) => c[0] === '/projects/0/skills' && c[1]?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ id: 'beta@default' });
  });

  it('技能行操作：删除与归集', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('Updated')).toBeTruthy());
    expect(apiMock.mock.calls.some((c) => c[0] === '/projects/0/skills/alpha' && c[1]?.method === 'DELETE')).toBe(true);

    // 归集：打开共用弹窗（预览接口由 CollectSkillModal 内部调用）
    await userEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await waitFor(() => expect(screen.getByText('Collect to repository')).toBeTruthy());
  });

  it('操作失败时提示错误', async () => {
    renderDetail({ 'DELETE /projects/0/skills/alpha': () => { throw new Error('locked'); } });
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('locked')).toBeTruthy());
  });

  it('返回列表', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    await waitFor(() => expect(screen.queryByText('Deploy to agents')).toBeNull());
  });

  it('详情里可折叠投放列表', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Collapse list' }));
    await waitFor(() => expect(screen.queryByText('Deployed')).toBeNull());
  });

  it('项目已不在列表时给出「找不到」', async () => {
    renderDetail({ '/projects': () => [] });
    await waitFor(() => expect(screen.getByText('Project not found')).toBeTruthy());
  });

  it('技能为空时走空状态', async () => {
    renderDetail({ '/projects/0/skills': () => ({ skills: [], addable: [] }) });
    // 技能响应是对象（含 skills/addable），空列表走 EntityList 的默认空状态
    await waitFor(() => expect(screen.getAllByText('No data').length).toBeGreaterThan(0));
  });

  it('Esc 关闭标签弹窗', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Deploy to agents')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Tags' }));
    expect(screen.getByText('Edit project tags')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Edit project tags')).toBeNull());
  });
});
