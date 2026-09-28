import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CollectSkillModal, {
  agentCollectSource,
  projectCollectSource,
  type CollectSourceApi,
} from '../src/components/skill/CollectSkillModal';
import { ToastProvider } from '../src/components/ui/Toast';
import { I18nProvider } from '../src/i18n';
import type { AgentCollectItem, SkillCardView } from '../src/api/types';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api/types', () => ({
  api: apiMock,
  assertApiPath: (p: string) => p,
}));

function wrap(ui: React.ReactNode) {
  return (
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>
  );
}

const item = (over: Partial<SkillCardView> = {}): SkillCardView => ({
  id: 'alpha@default', name: 'alpha', source: 'default', tags: [], reason: 'preset', store: 'symlink',
  state: 'on', actions: [], ...over,
});

const preview = (over: Partial<AgentCollectItem> = {}): AgentCollectItem => ({
  name: 'alpha', dir: '/tmp/a/alpha', tags: [], exists: false, symlink: false, ...over,
});

/** 用可控的假适配器渲染弹窗，避免测试被具体来源实现绑住 */
function makeSource(over: Partial<CollectSourceApi> = {}): CollectSourceApi {
  return {
    preview: vi.fn(async () => preview()),
    collect: vi.fn(async () => ({ collected: ['alpha'], skipped: [] })),
    takeover: vi.fn(async () => ({ ok: true })),
    takeoverKind: 'symlink',
    ...over,
  };
}

/** /state 提供可选的仓库列表 */
function mockState(repos: { id: string; name?: string }[]) {
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/state')) {
      return { activeAgents: [], skills: [], presets: [], sources: [], customAgents: [], settings: { defaultSync: 'symlink' }, home: '/tmp', repos };
    }
    throw new Error(`unmocked api call: ${path}`);
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('CollectSkillModal', () => {
  it('未登记仓库时提示先去登记', async () => {
    mockState([]);
    render(wrap(<CollectSkillModal item={item()} source={makeSource()} onClose={vi.fn()} onDone={vi.fn()} />));
    await waitFor(() => expect(screen.getByText('Collect to repository')).toBeTruthy());
    expect(screen.getByText('No repository registered yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collect' })).toBeDisabled();
  });

  it('预览通过后归集成功，并回调 onDone', async () => {
    mockState([{ id: 'default', name: 'My Repo' }]);
    const source = makeSource();
    const onDone = vi.fn();
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={onDone} />));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Target repository/ })).toBeTruthy());

    const btn = await screen.findByRole('button', { name: 'Collect' });
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);
    await waitFor(() => expect(screen.getByText(/Collected "alpha" into the repository/)).toBeTruthy());
    expect(source.collect).toHaveBeenCalledWith('default', 'alpha', undefined);
    expect(onDone).toHaveBeenCalled();
  });

  it('仓库已有同名：可选保留 / 覆盖，覆盖时把 replaceNames 传下去', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource({ preview: vi.fn(async () => preview({ exists: true })) });
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={vi.fn()} />));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Repository already has this skill name/ })).toBeTruthy());

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Repository already has this skill name/ }), 'overwrite');
    await userEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await waitFor(() => expect(source.collect).toHaveBeenCalledWith('default', 'alpha', ['alpha']));
  });

  it('已是仓库软链：说明无需归集且按钮禁用', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource({ preview: vi.fn(async () => preview({ symlink: true, inRepo: true, linkTarget: '/repo/alpha' })) });
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={vi.fn()} />));
    await waitFor(() => expect(screen.getByText(/already a link to this repository/)).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Collect' })).toBeDisabled();
  });

  it('不可归集的条目：给出说明并禁用', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource({ preview: vi.fn(async () => null) });
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={vi.fn()} />));
    await waitFor(() => expect(screen.getByText(/not collectable/)).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Collect' })).toBeDisabled();
  });

  it('预览请求失败时按「不可归集」处理', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource({ preview: vi.fn(async () => { throw new Error('boom'); }) });
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={vi.fn()} />));
    await waitFor(() => expect(screen.getByText(/not collectable/)).toBeTruthy());
  });

  it('归集未产生任何副本时提示原因', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource({ collect: vi.fn(async () => ({ collected: [], skipped: ['same content'] })) });
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={vi.fn()} />));
    const btn = await screen.findByRole('button', { name: 'Collect' });
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);
    await waitFor(() => expect(screen.getByText(/Nothing copied into the repository: same content/)).toBeTruthy());
  });

  it('归集抛错时提示错误信息', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource({ collect: vi.fn(async () => { throw new Error('disk full'); }) });
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={vi.fn()} />));
    const btn = await screen.findByRole('button', { name: 'Collect' });
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);
    await waitFor(() => expect(screen.getByText('disk full')).toBeTruthy());
  });

  it('同时接管：软链形态下的说明与成功提示', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource();
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={vi.fn()} />));
    await waitFor(() => expect(screen.getByRole('switch')).toBeTruthy());
    await userEvent.click(screen.getByRole('switch'));
    // 接管流程说明
    expect(screen.getByText(/Takeover runs after collection/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await waitFor(() => expect(screen.getByText(/this directory is now a link to the repository copy/)).toBeTruthy());
    expect(source.takeover).toHaveBeenCalledWith('default', 'alpha');
  });

  it('同时接管：副本形态（项目来源）成功提示不同', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource({ takeoverKind: 'copy' });
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={vi.fn()} />));
    await waitFor(() => expect(screen.getByRole('switch')).toBeTruthy());
    await userEvent.click(screen.getByRole('switch'));
    expect(screen.getByText(/self-contained and git-committable/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await waitFor(() => expect(screen.getByText(/the project now holds a real copy/)).toBeTruthy());
  });

  it('接管失败时给出失败原因', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource({ takeover: vi.fn(async () => ({ ok: false, reason: 'busy' })) });
    render(wrap(<CollectSkillModal item={item()} source={source} onClose={vi.fn()} onDone={vi.fn()} />));
    await waitFor(() => expect(screen.getByRole('switch')).toBeTruthy());
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await waitFor(() => expect(screen.getByText(/Takeover incomplete: busy/)).toBeTruthy());
  });

  it('外部软链来源：说明会被替换成什么', async () => {
    mockState([{ id: 'default' }]);
    const source = makeSource();
    render(
      wrap(
        <CollectSkillModal
          item={item({ reason: 'external', linkTarget: '/outside/alpha' })}
          source={source}
          onClose={vi.fn()}
          onDone={vi.fn()}
        />,
      ),
    );
    await waitFor(() => expect(screen.getByText(/this directory currently holds a link pointing elsewhere/)).toBeTruthy());
    await userEvent.click(screen.getByRole('switch'));
    expect(screen.getByText(/the external directory it pointed to is unaffected/)).toBeTruthy();
  });

  it('关闭弹窗回调 onClose', async () => {
    mockState([{ id: 'default' }]);
    const onClose = vi.fn();
    render(wrap(<CollectSkillModal item={item()} source={makeSource()} onClose={onClose} onDone={vi.fn()} />));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('归集来源适配器', () => {
  it('agentCollectSource：按 agentKey 找到预览项，接管后登记为启用', async () => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/repos/default/collect/preview') {
        return [{ agentKey: 'cursor', agentName: 'Cursor', installedDir: '/tmp/a', items: [{ name: 'alpha' }] }];
      }
      if (path === '/repos/default/collect') return { collected: ['alpha'], skipped: [] };
      if (path === '/repos/default/takeover') return { linked: true };
      if (path === '/agents/cursor' && init?.method === 'PUT') return {};
      throw new Error(`unmocked: ${path}`);
    });

    const src = agentCollectSource('cursor', 'Cursor');
    expect(src.takeoverKind).toBe('symlink');
    await expect(src.preview('default', 'alpha')).resolves.toMatchObject({ name: 'alpha' });
    await expect(src.preview('default', 'ghost')).resolves.toBeNull();
    await expect(src.collect('default', 'alpha', ['alpha'])).resolves.toEqual({ collected: ['alpha'], skipped: [] });
    await expect(src.takeover('default', 'alpha')).resolves.toEqual({ ok: true });
    // 接管成功后登记 skill 启用
    expect(apiMock.mock.calls.some((c) => c[0] === '/agents/cursor' && (c[1] as RequestInit)?.method === 'PUT')).toBe(true);
  });

  it('agentCollectSource：接管未成功时不登记启用', async () => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (path: string) => {
      if (path === '/repos/default/takeover') return { linked: false, reason: 'blocked' };
      throw new Error(`unmocked: ${path}`);
    });
    const src = agentCollectSource('cursor', 'Cursor');
    await expect(src.takeover('default', 'alpha')).resolves.toEqual({ ok: false, reason: 'blocked' });
    expect(apiMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'PUT')).toBe(false);
  });

  it('agentCollectSource：agentKey 对不上时按名称回落', async () => {
    apiMock.mockReset();
    apiMock.mockImplementation(async () => [
      { agentKey: 'other', agentName: 'Cursor', installedDir: '/tmp/a', items: [{ name: 'alpha' }] },
    ]);
    const src = agentCollectSource('cursor', 'Cursor');
    await expect(src.preview('default', 'alpha')).resolves.toMatchObject({ name: 'alpha' });
  });

  it('projectCollectSource：项目来源落真实副本', async () => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/projects/3/collect/preview')) return { items: [{ name: 'alpha' }] };
      if (path === '/projects/3/collect') return { collected: [], skipped: [] };
      if (path === '/projects/3/takeover') return { taken: true };
      throw new Error(`unmocked: ${path}`);
    });
    const src = projectCollectSource(3);
    expect(src.takeoverKind).toBe('copy');
    await expect(src.preview('default', 'alpha')).resolves.toMatchObject({ name: 'alpha' });
    await expect(src.preview('default', 'ghost')).resolves.toBeNull();
    await expect(src.collect('default', 'alpha')).resolves.toEqual({ collected: [], skipped: [] });
    await expect(src.takeover('default', 'alpha')).resolves.toEqual({ ok: true });
  });
});
