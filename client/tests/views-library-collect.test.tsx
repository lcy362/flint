import { render, screen, waitFor } from '@testing-library/react';
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

const STATE = {
  activeAgents: [],
  skills: [],
  presets: [],
  repos: [{ id: 'default', name: 'My Repo', path: '/tmp/repo' }],
  sources: [],
  customAgents: [],
  settings: { defaultSync: 'symlink' },
  home: '/tmp',
} as unknown as StateView;

/** 一个 Agent 分组：alpha 仓库已有同名（可接管），gamma 全新 */
const AGENTS = [
  {
    agentKey: 'cursor',
    agentName: 'Cursor',
    installedDir: '/tmp/a/cursor',
    items: [
      { name: 'alpha', dir: '/tmp/a/cursor/alpha', tags: [], exists: true, symlink: false },
      { name: 'gamma', dir: '/tmp/a/cursor/gamma', tags: [], exists: false, symlink: false },
    ],
  },
];

function openCollect(overrides: Record<string, Handler> = {}) {
  installRoutes({
    '/state': () => STATE,
    '/repos/default/collect/preview': () => AGENTS,
    'POST /repos/default/collect': () => ({ collected: ['gamma'], skipped: [] }),
    'POST /repos/default/takeover': () => ({ linked: true }),
    ...overrides,
  });
  render(wrap(<Library />));
}

/** 打开「添加技能」弹窗（默认停在「从 Agent 归集」页签），并展开默认折叠的 Agent 分组 */
async function openAddPanel(expand = true) {
  await waitFor(() => expect(screen.getByText('My Repo')).toBeTruthy());
  await userEvent.click(screen.getByRole('button', { name: 'Add skills' }));
  await waitFor(() => expect(screen.getByText('Add skills to My Repo')).toBeTruthy());
  if (expand) {
    await userEvent.click(await screen.findByRole('button', { name: 'Expand list' }));
  }
}

beforeEach(() => {
  localStorage.clear();
  navigate({ tab: 'library', sub: null, query: new URLSearchParams() });
});

describe('归集面板（从 Agent 归集）', () => {
  it('两步流程：勾选 → 确认 → 执行', async () => {
    openCollect();
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());

    // 未勾选时不能进入下一步
    expect(screen.getByRole('button', { name: 'Next: confirm' })).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: 'Collect gamma' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next: confirm' })).toBeEnabled());

    await userEvent.click(screen.getByRole('button', { name: 'Next: confirm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm collect' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Confirm collect' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and run' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await waitFor(() => expect(screen.getByText('Collected 1 skills')).toBeTruthy());

    const post = apiMock.mock.calls.find((c) => c[0] === '/repos/default/collect' && c[1]?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      selections: [{ agentKey: 'cursor', names: ['gamma'] }],
      replaceNames: [],
    });
  });

  it('按 Agent 一键全选 / 取消全选', async () => {
    openCollect();
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
    const all = screen.getByRole('switch', { name: /Select all/ });
    await userEvent.click(all);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next: confirm' })).toBeEnabled());
    await userEvent.click(all);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next: confirm' })).toBeDisabled());
  });

  it('可接管的条目：接管成功提示', async () => {
    openCollect();
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(screen.getByText(/Took over alpha/)).toBeTruthy());
  });

  it('接管未成功时给出原因', async () => {
    openCollect({ 'POST /repos/default/takeover': () => ({ linked: false, reason: 'blocked' }) });
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Take over' })[0]);
    await waitFor(() => expect(screen.getByText('blocked')).toBeTruthy());
  });

  it('接管请求抛错时提示错误', async () => {
    openCollect({ 'POST /repos/default/takeover': () => { throw new Error('takeover boom'); } });
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(screen.getByText('takeover boom')).toBeTruthy());
  });

  it('仓库已有同名时可选择沿用仓库版本，全部沿用则不写文件', async () => {
    openCollect();
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
    // alpha 在仓库已有同名 → 默认沿用仓库版本
    await userEvent.click(screen.getByRole('switch', { name: 'Collect alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next: confirm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm collect' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Confirm collect' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and run' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await waitFor(() => expect(screen.getByText(/Everything keeps the repository as is/)).toBeTruthy());
  });

  it('确认页可在「仓库版本 / 各 Agent 版本」之间切换采纳对象', async () => {
    openCollect();
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
    await userEvent.click(screen.getByRole('switch', { name: 'Collect alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next: confirm' }));
    // 候选：仓库版本 + Cursor 版本
    await waitFor(() => expect(screen.getByRole('button', { name: 'Repository copy (keep as is)' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Cursor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm collect' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and run' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await waitFor(() => expect(screen.getByText(/Collected/)).toBeTruthy());
    const post = apiMock.mock.calls.find((c) => c[0] === '/repos/default/collect' && c[1]?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      selections: [{ agentKey: 'cursor', names: ['alpha'] }],
      replaceNames: ['alpha'],
    });
  });

  it('确认页可返回上一步', async () => {
    openCollect();
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
    await userEvent.click(screen.getByRole('switch', { name: 'Collect gamma' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next: confirm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm collect' })).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: /Back/ })[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next: confirm' })).toBeTruthy());
  });

  it('归集请求失败时提示错误', async () => {
    openCollect({ 'POST /repos/default/collect': () => { throw new Error('collect boom'); } });
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
    await userEvent.click(screen.getByRole('switch', { name: 'Collect gamma' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next: confirm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm collect' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await waitFor(() => expect(screen.getByText('collect boom')).toBeTruthy());
  });

  it('没有可归集的 Agent 时给出空状态', async () => {
    openCollect({ '/repos/default/collect/preview': () => [] });
    await openAddPanel(false);
    await waitFor(() => expect(screen.getByText('No installed agent to collect from')).toBeTruthy());
  });

  it('已是仓库软链的条目：无需归集且不可接管', async () => {
    openCollect({
      '/repos/default/collect/preview': () => [
        {
          agentKey: 'cursor',
          agentName: 'Cursor',
          installedDir: '/tmp/a/cursor',
          items: [{ name: 'delta', dir: '/repo/skills/delta', tags: [], exists: true, symlink: true, inRepo: true, linkTarget: '/repo/skills/delta' }],
        },
      ],
    });
    await openAddPanel();
    await waitFor(() => expect(screen.getByText('Cursor')).toBeTruthy());
    expect(screen.getAllByText('Taken over').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Take over' })).toBeNull();

    // 全选后进入确认页：软链指向仓库本体，没有独立版本 → 标记「无需归集」
    await userEvent.click(screen.getByRole('switch', { name: /Select all/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Next: confirm' }));
    await waitFor(() => expect(screen.getByText(/no collect needed/)).toBeTruthy());
  });

  it('切到「从目录导入」页签', async () => {
    openCollect();
    await openAddPanel();
    await userEvent.click(screen.getByRole('tab', { name: 'Import from folders' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Detect' })).toBeTruthy());
  });
});
