import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import Library from '../src/views/Library';
import { ToastProvider } from '../src/components/ui/Toast';
import { I18nProvider } from '../src/i18n';
import { navigate } from '../src/state/router';
import type { StateView } from '../src/api/types';

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

const STATE: StateView = {
  activeAgents: [],
  skills: [
    { id: 'alpha@default', name: 'alpha', source: 'default', dir: '/r/alpha', tags: ['x'], description: 'Alpha skill' },
    { id: 'beta@upstream', name: 'beta', source: 'upstream', dir: '/u/beta', tags: [], description: 'Beta skill' },
  ],
  presets: [],
  repos: [{ id: 'default', name: 'My Repo', path: '/tmp/repo' }],
  sources: [{ id: 'upstream', name: 'Upstream', path: '/tmp/up', layout: 'nested', linked: true }],
  customAgents: [],
  settings: { defaultSync: 'symlink' },
  home: '/tmp',
} as StateView;

function baseRoutes(overrides: Record<string, Handler> = {}) {
  installRoutes({
    '/state': () => STATE,
    '/skills/search': () => ({ hits: [{ id: 'alpha@default', context: 'body ctx' }] }),
    '/skills/alpha%40default/content': () => ({
      id: 'alpha@default', dir: '/r/alpha', content: '# alpha', files: [],
    }),
    'PATCH /skills/alpha%40default': () => ({ tags: ['x', 'y'] }),
    'POST /skills/alpha%40default/refresh': () => ({ refreshed: true }),
    // 详情里的「分发到 Agent」面板：默认一个目录、里面还没有这个技能
    '/agents': () => [
      { key: 'codex', name: 'Codex', globalDir: '/tmp/agents/skills', installed: true, primaryKey: 'codex', sync: 'symlink', active: true, sharedWith: [] },
    ],
    '/agents/codex/skills': () => ({ skills: [], addable: [], active: true }),
    '/repos/default/status': () => ({ remote: 'git@x:y', behind: 2 }),
    'POST /repos/default/sync': () => ({ updated: true }),
    'DELETE /repos/default': () => [],
    '/sources/upstream/status': () => ({ remote: 'git@x:z', behind: 0 }),
    'DELETE /sources/upstream': () => [],
    '/import/preview': () => [{ source: '/tmp/up', layout: 'flat', count: 2, tags: [] }],
    'POST /import': () => [{ source: '/tmp/up', imported: ['gamma'], skipped: [] }],
    ...overrides,
  });
}

beforeEach(() => {
  localStorage.clear();
  navigate({ tab: 'library', sub: null, query: new URLSearchParams() });
});

describe('Library 技能库', () => {
  it('渲染技能卡片、仓库与来源区块', async () => {
    baseRoutes();
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    expect(screen.getAllByText('alpha').length).toBeGreaterThan(0);
    expect(screen.getByText('Repositories')).toBeTruthy();
    expect(screen.getByText('Own repo')).toBeTruthy();
    expect(screen.getByText('Third-party repo')).toBeTruthy();
    expect(screen.getByText('My Repo')).toBeTruthy();
  });

  it('空库时给出空状态', async () => {
    baseRoutes({ '/state': () => ({ ...STATE, skills: [], repos: [], sources: [] }) });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('No repositories')).toBeTruthy());
    expect(screen.getAllByText('No data').length).toBeGreaterThan(0);
  });

  it('搜索触发正文检索，并可按标签/来源筛选与重置', async () => {
    baseRoutes();
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());

    await userEvent.type(screen.getByRole('searchbox'), 'alpha');
    await waitFor(() => expect(apiMock.mock.calls.some((c) => String(c[0]).startsWith('/skills/search'))).toBe(true));
    await waitFor(() => expect(screen.getByText(/Filtered · 1 \/ 2/)).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    // 默认来源筛选只含自有仓库：重置不会把第三方来源一并放开
    await waitFor(() => expect(screen.getByText(/All skills · 1/)).toBeTruthy());
  });

  it('按来源筛选：勾选第三方来源后出现对应技能', async () => {
    baseRoutes();
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText(/All skills · 1/)).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /Source/ }));
    await userEvent.click(screen.getByRole('option', { name: /upstream/ }));
    await waitFor(() => expect(screen.getByText('beta')).toBeTruthy());
  });

  it('「仅未打标签」开关可用', async () => {
    baseRoutes();
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.queryByText('alpha')).toBeNull());
  });

  it('徽标说明弹窗可打开', async () => {
    baseRoutes();
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Badge guide' })[0]);
    expect(screen.getByText('What do the badges on a skill card mean?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
  });

  it('仓库检查更新 / 同步 / 删除', async () => {
    baseRoutes();
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(screen.getAllByText('Updates available').length).toBeGreaterThan(1));

    await userEvent.click(screen.getAllByRole('button', { name: 'Sync' })[0]);
    await waitFor(() => expect(screen.getByText('Synced from remote')).toBeTruthy());

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => expect(screen.getByText('Deleted')).toBeTruthy());
    expect(apiMock.mock.calls.some((c) => c[0] === '/repos/default' && c[1]?.method === 'DELETE')).toBe(true);
  });

  it('检查失败时提示错误', async () => {
    let calls = 0;
    baseRoutes({
      '/repos/default/status': () => {
        calls += 1;
        if (calls > 1) throw new Error('no remote');
        return { remote: 'git@x:y', behind: 0 };
      },
    });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());
    const check = await screen.findByRole('button', { name: 'Check' });
    await userEvent.click(check);
    await waitFor(() => expect(screen.getByText('no remote')).toBeTruthy());
  });

  it('注册自有仓库并提示；缺 id/路径时提示必填', async () => {
    baseRoutes({ 'POST /repos': () => [], 'PUT /repos/1': () => ({ repos: [], sources: [] }) });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Register repository' }));
    const submit = await screen.findByRole('button', { name: 'Register' });
    // 未填必填项时提交按钮禁用
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^ID/), 'team');
    await userEvent.type(screen.getByPlaceholderText('/path/to/library'), '/tmp/team');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(screen.getByText(/Own repository team registered/)).toBeTruthy());
    expect(apiMock.mock.calls.some((c) => c[0] === '/repos' && c[1]?.method === 'POST')).toBe(true);
  });

  it('编辑仓库：改名并切换类型为第三方来源', async () => {
    const put = vi.fn(() => ({ repos: [], sources: [] }));
    baseRoutes({ 'PUT /repos/default': put, 'PUT /sources/default': () => ({ repos: [], sources: [] }) });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await waitFor(() => expect(screen.getByText('Edit repository')).toBeTruthy());
    // 类型切换为第三方来源（按钮组），保存走 PUT /sources/:id
    await userEvent.click(screen.getByRole('button', { name: 'Third-party repo' }));
    await waitFor(() => expect(screen.getByText(/Switching from/)).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Repository updated')).toBeTruthy());
    const putCall = apiMock.mock.calls.find((c) => c[0] === '/sources/default' && c[1]?.method === 'PUT');
    expect(JSON.parse(putCall?.[1]?.body as string)).toMatchObject({ kind: 'source', name: 'My Repo' });
  });

  it('编辑第三方来源并保存', async () => {
    baseRoutes({ 'PUT /sources/upstream': () => ({ repos: [], sources: [] }) });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('Upstream')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    await waitFor(() => expect(screen.getByText('Edit repository')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Repository updated')).toBeTruthy());
    expect(apiMock.mock.calls.some((c) => c[0] === '/sources/upstream' && c[1]?.method === 'PUT')).toBe(true);
  });

  it('打开「添加技能」弹窗并在导入页签做预览与导入', async () => {
    baseRoutes();
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Add skills' }));
    await waitFor(() => expect(screen.getByText('Add skills to My Repo')).toBeTruthy());

    // 切到「从目录导入」
    await userEvent.click(screen.getByRole('tab', { name: 'Import from folders' }));
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, '/tmp/up');
    await userEvent.click(screen.getByRole('button', { name: 'Detect' }));
    await waitFor(() => expect(screen.getByText('Detection result (1)')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Start import' }));
    await waitFor(() => expect(screen.getByText('Imported 1 skills')).toBeTruthy());
  });

  it('导入失败时提示错误', async () => {
    baseRoutes({ 'POST /import': () => { throw new Error('import boom'); } });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Add skills' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Import from folders' }));
    await userEvent.type(screen.getByRole('textbox'), '/tmp/up');
    await userEvent.click(screen.getByRole('button', { name: 'Detect' }));
    await waitFor(() => expect(screen.getByText('Detection result (1)')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Start import' }));
    await waitFor(() => expect(screen.getByText('import boom')).toBeTruthy());
  });
});

describe('技能详情', () => {
  function openDetail(overrides: Record<string, Handler> = {}) {
    baseRoutes(overrides);
    const view = render(wrap(<Library />));
    return { view };
  }

  it('打开详情读取正文、可编辑标签并刷新来源', async () => {
    openDetail();
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    await waitFor(() => expect(screen.getByText('# alpha')).toBeTruthy());

    // 新增标签后由页面右上角「保存」提交
    await userEvent.type(screen.getByPlaceholderText('New tag'), 'y');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => expect(apiMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    const patch = apiMock.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(JSON.parse(patch?.[1]?.body as string)).toEqual({ tags: ['x', 'y'] });

    // 无来源信息（无 provenance）时不出现「从来源刷新」
    expect(screen.queryByRole('button', { name: /Refresh from source/ })).toBeNull();
  });

  it('内容取不到时详情页仍可用（只缺正文）', async () => {
    openDetail({ '/skills/alpha%40default/content': () => { throw new Error('gone'); } });
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'alpha' })).toBeTruthy());
    expect(screen.queryByText('# alpha')).toBeNull();
  });

  it('详情里可切换标签芯片，保存后提交', async () => {
    openDetail();
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    await waitFor(() => expect(screen.getByText('# alpha')).toBeTruthy());
    const chips = screen.getAllByRole('button', { name: /^x$/ });
    const chip = chips[chips.length - 1];
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chip);
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => expect(apiMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    const patch = apiMock.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(JSON.parse(patch?.[1]?.body as string)).toEqual({ tags: [] });
  });

  it('分发面板默认折叠，展开后显示该技能落在哪些目录', async () => {
    // 目录内容随分发 / 移除变化，面板据此重读「已分发到哪些 Agent」
    let installed = false;
    const deployedRow = {
      id: 'alpha@default', name: 'alpha', source: 'default', dir: '/tmp/agents/skills/alpha',
      tags: [], reason: 'manual', store: 'symlink', actions: [],
    };
    openDetail({
      '/agents/codex/skills': () => ({ skills: installed ? [deployedRow] : [], addable: [], active: true }),
      'POST /agents/codex/skills': () => { installed = true; return { agent: 'codex', created: ['alpha'], removed: [], failed: [] }; },
      'DELETE /agents/codex/skills/alpha': () => { installed = false; return { ok: true, removed: 'alpha' }; },
    });
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    await waitFor(() => expect(screen.getByText('# alpha')).toBeTruthy());

    // 默认折叠：头部保留计数，但不渲染具体目录行
    const expand = await screen.findByRole('button', { name: 'Expand Distribute to agents' });
    await waitFor(() => expect(screen.getByText('0 / 1 directories')).toBeTruthy());
    expect(screen.queryByText('Not distributed')).toBeNull();

    await userEvent.click(expand);
    const toggle = await screen.findByRole('switch', { name: 'Distribute alpha to Codex' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText('Not distributed')).toBeTruthy();
    // 目录路径按 home 压成 ~ 展示
    expect(screen.getByText('~/agents/skills')).toBeTruthy();

    await userEvent.click(toggle);
    await waitFor(() => expect(screen.getByText('Distributed to Codex')).toBeTruthy());
    const post = apiMock.mock.calls.find((c) => c[0] === '/agents/codex/skills' && c[1]?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ id: 'alpha@default' });

    // 重读后该目录显示「已分发」，再关闭开关走删除接口
    await waitFor(() => expect(screen.getByText('Distributed')).toBeTruthy());
    await userEvent.click(screen.getByRole('switch', { name: 'Distribute alpha to Codex' }));
    await waitFor(() => expect(screen.getByText('Removed from Codex')).toBeTruthy());
    expect(apiMock.mock.calls.some((c) => c[0] === '/agents/codex/skills/alpha' && c[1]?.method === 'DELETE')).toBe(true);
  });

  it('目录里是 Agent 自带技能时开关禁用并说明原因', async () => {
    openDetail({
      '/agents/codex/skills': () => ({
        skills: [{
          id: 'alpha@default', name: 'alpha', source: 'default', dir: '/tmp/agents/skills/alpha',
          tags: [], reason: 'own', store: 'own', actions: [],
        }],
        addable: [], active: true,
      }),
    });
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    await waitFor(() => expect(screen.getByText('# alpha')).toBeTruthy());

    await userEvent.click(await screen.findByRole('button', { name: 'Expand Distribute to agents' }));
    await waitFor(() => expect(screen.getByText('Distributed')).toBeTruthy());
    expect(screen.getByRole('switch', { name: 'Distribute alpha to Codex' })).toBeDisabled();
    expect(screen.getByText('Agent-owned directory')).toBeTruthy();
  });

  it('返回按钮回到技能列表', async () => {
    openDetail();
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    await waitFor(() => expect(screen.getByText('# alpha')).toBeTruthy());
    // 详情是页面而非弹窗：列表此时不在页面上
    expect(screen.queryByText(/All skills/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '← Back' }));
    await waitFor(() => expect(screen.getByText(/All skills · 1/)).toBeTruthy());
    expect(screen.queryByText('# alpha')).toBeNull();
  });
});

describe('仓库来源的操作与来源刷新', () => {
  it('第三方来源行：检查更新 / 同步 / 删除', async () => {
    baseRoutes({
      // 仓库与来源共用同一组 git 状态接口（/repos/:id/...）
      '/repos/upstream/status': () => ({ remote: 'git@x:upstream', behind: 1 }),
      'POST /repos/upstream/sync': () => ({ updated: false }),
      'DELETE /sources/upstream': () => [],
    });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('Upstream')).toBeTruthy());
    // 仓库行与来源行都有检查/同步按钮：定位到来源那一行
    const srcRow = screen.getByText('Upstream').closest('.entity-card') as HTMLElement;

    await userEvent.click(within(srcRow).getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(screen.getAllByText('Updates available').length).toBeGreaterThan(0));

    await userEvent.click(within(srcRow).getByRole('button', { name: 'Sync' }));
    await waitFor(() => expect(screen.getAllByText('Up to date').length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    await waitFor(() => expect(screen.getByText('Deleted')).toBeTruthy());
    expect(apiMock.mock.calls.some((c) => c[0] === '/sources/upstream' && c[1]?.method === 'DELETE')).toBe(true);
  });

  it('第三方来源：编辑名称 / 布局并保存', async () => {
    baseRoutes({ 'PUT /sources/upstream': () => ({ repos: [], sources: [] }) });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('Upstream')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    await waitFor(() => expect(screen.getByText('Edit repository')).toBeTruthy());
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Layout/ }), 'flat');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Repository updated')).toBeTruthy());
    const putCall = apiMock.mock.calls.find((c) => c[0] === '/sources/upstream' && c[1]?.method === 'PUT');
    expect(JSON.parse(putCall?.[1]?.body as string)).toMatchObject({ layout: 'flat', kind: 'source' });
  });

  it('导入预览失败时提示错误', async () => {
    baseRoutes({ '/import/preview': () => { throw new Error('preview boom'); } });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Add skills' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Import from folders' }));
    await userEvent.type(screen.getByRole('textbox'), '/tmp/up');
    await userEvent.click(screen.getByRole('button', { name: 'Detect' }));
    await waitFor(() => expect(screen.getByText('preview boom')).toBeTruthy());
  });

  it('同步失败时提示错误', async () => {
    baseRoutes({ 'POST /repos/default/sync': () => { throw new Error('sync boom'); } });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Sync' })[0]);
    await waitFor(() => expect(screen.getByText('sync boom')).toBeTruthy());
  });

  it('删除失败时提示错误', async () => {
    baseRoutes({ 'DELETE /repos/default': () => { throw new Error('del boom'); } });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => expect(screen.getByText('del boom')).toBeTruthy());
  });

  it('已登记来源的技能：展示来源信息、附带文件并可从来源刷新', async () => {
    baseRoutes({
      '/skills/alpha%40default/content': () => ({
        id: 'alpha@default',
        dir: '/r/alpha',
        content: '# alpha',
        files: ['extra.txt'],
        provenance: { sourceRef: '/ext/alpha', sourceType: 'dir', takenAt: '2026-01-02T03:04:05.000Z', stale: false },
      }),
      'POST /skills/alpha%40default/refresh': () => ({ refreshed: true }),
    });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    await waitFor(() => expect(screen.getByText('/ext/alpha')).toBeTruthy());
    expect(screen.getByText(/Extra files: extra\.txt/)).toBeTruthy();
    expect(screen.getByText(/Source: directory/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Refresh from source' }));
    await waitFor(() => expect(screen.getByText('Refreshed from source')).toBeTruthy());
    expect(apiMock.mock.calls.some((c) => c[0] === '/skills/alpha%40default/refresh' && c[1]?.method === 'POST')).toBe(true);
  });

  it('来源刷新失败时提示错误', async () => {
    baseRoutes({
      '/skills/alpha%40default/content': () => ({
        id: 'alpha@default', dir: '/r/alpha', content: '# alpha', files: [],
        provenance: { sourceRef: '/ext/alpha', sourceType: 'git', takenAt: '2026-01-02T03:04:05.000Z' },
      }),
      'POST /skills/alpha%40default/refresh': () => { throw new Error('refresh boom'); },
    });
    render(wrap(<Library />));
    await waitFor(() => expect(screen.getByText('2 skills in total')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    await waitFor(() => expect(screen.getByText('/ext/alpha')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Refresh from source' }));
    await waitFor(() => expect(screen.getByText('refresh boom')).toBeTruthy());
  });
});
