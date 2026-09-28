import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import Settings from '../src/views/Settings';
import Health from '../src/views/Health';
import { ToastProvider } from '../src/components/ui/Toast';
import { I18nProvider } from '../src/i18n';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api/types', () => ({
  api: apiMock,
  // 真实实现只做路径校验，测试里不关心
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('Settings 视图', () => {
  const customs = [{ key: 'my-agent', name: 'My Agent', globalDir: '/g/skills', projectDir: 'proj', recursive: true }];
  const logs = { path: '/tmp/app.log', size: 42, lines: ['line-1', 'line-2'], version: '0.1.0' };

  function setup(overrides: Record<string, Handler> = {}) {
    installRoutes({
      '/settings': () => ({ defaultSync: 'symlink' }),
      '/agents/custom': () => customs,
      '/logs': () => logs,
      'PUT /settings': () => ({ defaultSync: 'copy' }),
      'DELETE /agents/custom/my-agent': () => [],
      ...overrides,
    });
    return render(wrap(<Settings />));
  }

  it('渲染语言、同步策略、自定义 Agent 与日志四块', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('My Agent')).toBeTruthy());
    expect(screen.getByText('/g/skills · proj')).toBeTruthy();
    expect(screen.getByText('Recursive scan')).toBeTruthy();
    expect(screen.getByText(/\/tmp\/app\.log/)).toBeTruthy();
    expect(screen.getByText(/line-1/)).toBeTruthy();
    // 语言下拉与默认同步策略
    expect(screen.getByLabelText(/Interface language/)).toBeTruthy();
    expect(screen.getByLabelText(/Default install mode/)).toBeTruthy();
  });

  it('切换语言会写入 <html lang> 并广播', async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText(/Interface language/)).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(/Interface language/), 'zh');
    await waitFor(() => expect(document.documentElement.lang).toBe('zh-CN'));
    expect(localStorage.getItem('lsh-lang')).toBe('zh');
    // 切回英文（此时界面标签已变成中文，按控件顺序定位）
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'en');
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
  });

  it('切换默认安装方式会 PUT 保存并提示', async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText(/Default install mode/)).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(/Default install mode/), 'copy');
    await waitFor(() => expect(screen.getByText('Settings saved')).toBeTruthy());
    const put = apiMock.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(put?.[0]).toBe('/settings');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({ defaultSync: 'copy' });
  });

  it('保存失败时展示错误提示', async () => {
    setup({ 'PUT /settings': () => { throw new Error('nope'); } });
    await waitFor(() => expect(screen.getByLabelText(/Default install mode/)).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(/Default install mode/), 'copy');
    await waitFor(() => expect(screen.getByText('nope')).toBeTruthy());
  });

  it('删除自定义 Agent', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('My Agent')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('Deleted')).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith('/agents/custom/my-agent', { method: 'DELETE' });
  });

  it('删除失败时提示错误', async () => {
    setup({ 'DELETE /agents/custom/my-agent': () => { throw new Error('busy'); } });
    await waitFor(() => expect(screen.getByText('My Agent')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('busy')).toBeTruthy());
  });

  it('下载日志：成功与失败两条路径', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    }));
    fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['x']) });
    setup();
    await waitFor(() => expect(screen.getByText(/line-1/)).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Download logs' }));
    await waitFor(() => expect(screen.getByText('Logs downloaded')).toBeTruthy());

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await userEvent.click(screen.getByRole('button', { name: 'Download logs' }));
    await waitFor(() => expect(screen.getByText('HTTP 500')).toBeTruthy());
  });

  it('复制诊断信息：成功与失败两条路径', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();
    await waitFor(() => expect(screen.getByText(/line-1/)).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }));
    await waitFor(() => expect(screen.getByText(/Copied; paste it/)).toBeTruthy());
    expect(writeText.mock.calls[0][0]).toContain('# flint diagnostics');
    expect(writeText.mock.calls[0][0]).toContain('line-1');

    writeText.mockRejectedValueOnce(new Error('denied'));
    await userEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }));
    await waitFor(() => expect(screen.getByText('denied')).toBeTruthy());
  });

  it('刷新按钮会重新拉取三份数据', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('My Agent')).toBeTruthy());
    const before = apiMock.mock.calls.length;
    await userEvent.click(screen.getAllByRole('button', { name: 'Refresh' })[0]);
    await waitFor(() => expect(apiMock.mock.calls.length).toBeGreaterThan(before));
  });

  it('点击添加自定义 Agent 打开弹窗', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('My Agent')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Add custom agent')).toBeTruthy();
  });

  it('没有自定义 Agent 时展示空状态', async () => {
    setup({ '/agents/custom': () => [] });
    await waitFor(() => expect(screen.getByText('No custom agent')).toBeTruthy());
  });
});

describe('Health 视图', () => {
  const diagnose = {
    config: '/tmp/config.json',
    summary: {
      sync: { total: 2, ok: 1, warn: 1, error: 0 },
      somethingElse: { total: 1, ok: 1, warn: 0, error: 0 },
    },
    groups: {
      sync: [
        {
          key: 'sync:cursor',
          status: 'warn',
          message: '缺 2 个技能',
          detail: { agent: 'cursor', missing: ['a', 'b'], extra: ['c'], brokenLink: ['d'] },
        },
        { key: 'broken:alpha', status: 'error', message: '软链失效', detail: 'inline-detail' },
      ],
      project: [{ key: 'project:/tmp/p', status: 'warn', message: '项目缺副本' }],
      repo: [{ key: 'repo:default', status: 'error', message: '仓库缺索引' }],
      config: [{ key: 'config:x', status: 'ok', message: '一切正常' }],
      emptyDim: [],
    },
    items: [],
  };

  function setup(fixHandler: Handler = () => ({ key: 'sync:cursor', applied: true, message: 'done' })) {
    installRoutes({
      '/diagnose': () => diagnose,
      'POST /fix': fixHandler,
    });
    return render(wrap(<Health />));
  }

  it('渲染各维度摘要、分组、状态徽标与详情', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('缺 2 个技能')).toBeTruthy());
    // 已知维度键走映射文案，未知键回落键名本身
    expect(screen.getAllByText('Sync').length).toBeGreaterThan(0);
    expect(screen.getByText('somethingElse')).toBeTruthy();
    // OK / WARN / ERROR 状态文案
    expect(screen.getAllByText('OK').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Warning').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
    // 标量 detail 直接展示；结构化 detail 不展示
    expect(screen.getByText('inline-detail')).toBeTruthy();
    // 空分组给出说明
    expect(screen.getByText('Nothing to report')).toBeTruthy();
    // 状态正常的分组项没有「修复」按钮
    expect(screen.getAllByRole('button', { name: 'Fix' })).toHaveLength(4);
  });

  it('没有任何分组时展示「一切正常」', async () => {
    installRoutes({
      '/diagnose': () => ({ config: '/c', summary: {}, groups: {}, items: [] }),
    });
    render(wrap(<Health />));
    await waitFor(() => expect(screen.getByText('All good')).toBeTruthy());
  });

  it('sync 项：确认后执行修复并刷新', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('缺 2 个技能')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Fix' })[0]);
    // 确认弹窗逐条列出将要执行的操作
    expect(screen.getByText(/Fill in the 2 missing skills/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await waitFor(() => expect(screen.getByText(/done/)).toBeTruthy());
    const post = apiMock.mock.calls.find((c) => c[1]?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ key: 'sync:cursor' });
  });

  it('固定分支：broken / project / repo 三类诊断项各自生成修复清单', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('软链失效')).toBeTruthy());
    for (const name of ['软链失效', '项目缺副本', '仓库缺索引']) {
      const row = screen.getByText(name).closest('.diag-row')!;
      const btn = row.querySelector('button')!;
      await userEvent.click(btn);
      expect(screen.getByText('Confirm and run')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByText('Confirm and run')).toBeNull());
    }
  });

  it('修复失败：applied=false 时给出失败提示', async () => {
    setup(() => ({ key: 'sync:cursor', applied: false, message: 'nothing to do' }));
    await waitFor(() => expect(screen.getByText('缺 2 个技能')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Fix' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await waitFor(() => expect(screen.getByText(/nothing to do/)).toBeTruthy());
  });

  it('修复抛错时提示', async () => {
    setup(() => { throw new Error('fix boom'); });
    await waitFor(() => expect(screen.getByText('缺 2 个技能')).toBeTruthy());
    await userEvent.click(screen.getAllByRole('button', { name: 'Fix' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await waitFor(() => expect(screen.getByText('fix boom')).toBeTruthy());
  });

  it('重新诊断按钮触发重新取数', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('缺 2 个技能')).toBeTruthy());
    const before = apiMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Re-run diagnostics' }));
    await waitFor(() => expect(apiMock.mock.calls.length).toBeGreaterThan(before));
  });
});
