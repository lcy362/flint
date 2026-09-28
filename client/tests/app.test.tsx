import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppWithToasts } from '../src/App';
import { I18nProvider } from '../src/i18n';
import { getRoute, navigate } from '../src/state/router';
import type { StateView } from '../src/api/types';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api/types', () => ({
  api: apiMock,
  assertApiPath: (p: string) => p,
}));

const STATE: StateView = {
  activeAgents: [],
  skills: [],
  presets: [],
  repos: [],
  sources: [],
  customAgents: [],
  settings: { defaultSync: 'symlink' },
  home: '/tmp',
} as StateView;

beforeEach(() => {
  localStorage.clear();
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string) => {
    const clean = path.split('?')[0];
    if (clean === '/state') return STATE;
    if (clean === '/agents') return [];
    if (clean === '/presets') return [];
    if (clean === '/projects') return [];
    if (clean === '/diagnose') return { config: '/tmp/c.json', summary: {}, groups: {}, items: [] };
    if (clean === '/settings') return { defaultSync: 'symlink' };
    if (clean === '/agents/custom') return [];
    if (clean === '/logs') return { path: '/tmp/app.log', size: 0, lines: [], version: '0.1.0' };
    throw new Error(`unmocked api call: ${clean}`);
  });
  navigate({ tab: 'library', sub: null, query: new URLSearchParams() });
});

describe('App 外壳', () => {
  it('渲染侧边导航、标题栏与当前页面', async () => {
    render(<I18nProvider><AppWithToasts /></I18nProvider>);
    await waitFor(() => expect(screen.getAllByText('Library').length).toBeGreaterThan(0));
    expect(screen.getByText('Presets')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('点击导航切换一级页面并清空二级详情', async () => {
    render(<I18nProvider><AppWithToasts /></I18nProvider>);
    await waitFor(() => expect(screen.getAllByText('Library').length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: /Agents/ }));
    await waitFor(() => expect(getRoute().tab).toBe('agents'));
    expect(getRoute().sub).toBeNull();
  });

  it('主题切换写入 <html data-theme> 并持久化', async () => {
    render(<I18nProvider><AppWithToasts /></I18nProvider>);
    await waitFor(() => expect(screen.getAllByText('Library').length).toBeGreaterThan(0));
    expect(document.documentElement.dataset.theme).toBe('light');
    await userEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(localStorage.getItem('lsh-theme')).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });

  it('刷新按钮触发全局重新取数', async () => {
    render(<I18nProvider><AppWithToasts /></I18nProvider>);
    await waitFor(() => expect(screen.getAllByText('Library').length).toBeGreaterThan(0));
    const before = apiMock.mock.calls.length;
    await userEvent.click(screen.getByTitle('Refresh'));
    await waitFor(() => expect(apiMock.mock.calls.length).toBeGreaterThan(before));
  });

  it('标题栏的语言按钮切换界面语言', async () => {
    render(<I18nProvider><AppWithToasts /></I18nProvider>);
    await waitFor(() => expect(screen.getAllByText('Library').length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Chinese' }));
    await waitFor(() => expect(screen.getAllByText('技能库').length).toBeGreaterThan(0));
  });

  it('各一级页面都能渲染', async () => {
    render(<I18nProvider><AppWithToasts /></I18nProvider>);
    await waitFor(() => expect(screen.getAllByText('Library').length).toBeGreaterThan(0));
    for (const [label, heading] of [
      ['Agents', 'Agents'],
      ['Presets', 'Presets'],
      ['Projects', 'Projects'],
      ['Health', 'Health'],
      ['Settings', 'Settings'],
    ] as const) {
      await userEvent.click(screen.getAllByRole('button', { name: new RegExp(label) })[0]);
      await waitFor(() => expect(screen.getAllByText(heading).length).toBeGreaterThan(0));
    }
  });
});
