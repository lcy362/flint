import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, assertApiPath } from '../src/api/types';
import { pickDirectory, pickFile } from '../src/api/picker';
import { log } from '../src/log/logger';
import { emitReload, getStoredTheme, storeTheme, subscribe } from '../src/state/store';
import { getViewMode, setViewMode, useViewMode } from '../src/state/viewMode';
import { useCollapsed } from '../src/state/collapse';
import { useAsync } from '../src/state/useAsync';
import {
  DEFAULT_TAB,
  getRoute,
  navigate,
  navigateWith,
  parseHash,
  toHash,
  useQueryFlag,
  useQueryList,
  useQueryParam,
  useQueryValue,
  useRoute,
} from '../src/state/router';
import { I18nProvider, getLang, joinList, rich, translate, useI18n } from '../src/i18n';
import type { ReactNode } from 'react';

/** 包一层 i18n Provider，供依赖文案的组件 / hook 使用 */
function wrap({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

/* ---------------- 站内请求 ---------------- */

describe('assertApiPath（防请求伪造）', () => {
  it('放行正常站内路径，拦截可疑路径', () => {
    expect(assertApiPath('/state')).toBe('/state');
    expect(assertApiPath('/skills/a%40b/content?x=1')).toBe('/skills/a%40b/content?x=1');
    for (const bad of ['state', '/a b', '/a\\b', 'https://evil.com', '/a<b', '/a\tb']) {
      expect(() => assertApiPath(bad)).toThrow(/Blocked malformed API path/);
    }
  });
});

describe('api()', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('成功时带上语言头并解析 JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) });
    await expect(api<{ ok: number }>('/state')).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/state');
    expect((init.headers as Record<string, string>)['Accept-Language']).toBe(getLang());
  });

  it('非 2xx 时抛出服务端 error 文案', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'boom' }) });
    await expect(api('/state')).rejects.toThrow('boom');
  });

  it('非 2xx 且响应不是 JSON 时回落到 HTTP 状态码', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    await expect(api('/state')).rejects.toThrow('HTTP 502');
  });

  it('网络异常时原样抛出', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(api('/state', { method: 'POST' })).rejects.toThrow('offline');
  });
});

describe('原生选择器封装', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('返回路径；取消（path=null）时归一化为 null', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ path: '/tmp/a' }) });
    await expect(pickDirectory()).resolves.toBe('/tmp/a');

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(pickFile()).resolves.toBeNull();
  });
});

/* ---------------- 日志 ---------------- */

describe('前端日志', () => {
  let home: string;

  beforeEach(() => {
    log.clear();
    home = process.env.HOME ?? '';
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('按级别写 console 并进入缓冲', () => {
    log.debug('m', 'd');
    log.info('m', 'i');
    log.warn('m', 'w');
    log.error('m', 'e');
    expect(console.debug).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
    expect(log.tail()).toHaveLength(4);
    expect(log.tail(2)).toHaveLength(2);
  });

  it('元数据里的用户目录被压成 ~，并写进 localStorage', () => {
    log.info('m', 'msg', { path: `${home}/x/skills`, n: 1 });
    const line = log.tail(1)[0];
    expect(line).toContain('~/x/skills');
    expect(line).toContain('"n":1');
    expect(localStorage.getItem('flint.log.v1')).toContain('~/x/skills');
  });

  it('clear 清空缓冲与持久化', () => {
    log.info('m', 'x');
    log.clear();
    expect(log.tail()).toEqual([]);
    expect(localStorage.getItem('flint.log.v1')).toBeNull();
  });

  it('超过环形上限时丢弃最早的条目', () => {
    for (let i = 0; i < 520; i++) log.info('m', `msg-${i}`);
    const all = log.tail(1000);
    expect(all).toHaveLength(500);
    expect(all[0]).toContain('msg-20');
  });
});

/* ---------------- 全局状态 ---------------- */

describe('全局 bus 与主题', () => {
  it('subscribe / emitReload 能通知与退订', () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    emitReload();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    emitReload();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('主题读写', () => {
    localStorage.removeItem('lsh-theme');
    expect(getStoredTheme()).toBe('light');
    storeTheme('dark');
    expect(getStoredTheme()).toBe('dark');
  });
});

describe('展示形态（viewMode）', () => {
  it('默认卡片；切换后广播并持久化', () => {
    const fn = vi.fn();
    setViewMode('card');
    expect(getViewMode()).toBe('card');
    const { result, unmount } = renderHook(() => useViewMode());
    expect(result.current[0]).toBe('card');
    act(() => result.current[1]('list'));
    expect(getViewMode()).toBe('list');
    expect(localStorage.getItem('lsh-view-mode')).toBe('list');
    // 重复设置同值不广播
    setViewMode('list');
    setViewMode('card');
    expect(getViewMode()).toBe('card');
    unmount();
    fn();
  });

  it('hook 跟随全局切换更新', () => {
    const { result } = renderHook(() => useViewMode());
    act(() => setViewMode('list'));
    expect(result.current[0]).toBe('list');
    act(() => setViewMode('card'));
    expect(result.current[0]).toBe('card');
  });
});

describe('折叠状态', () => {
  it('带 storageKey 时持久化，不带时仅内存', () => {
    localStorage.removeItem('k1');
    const { result, rerender } = renderHook(() => useCollapsed('k1'));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('k1')).toBe('1');
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('k1')).toBeNull();

    const plain = renderHook(() => useCollapsed(undefined, true));
    expect(plain.result.current[0]).toBe(true);
    act(() => plain.result.current[1]());
    expect(plain.result.current[0]).toBe(false);
    rerender();
  });

  it('已存过折叠标记时初始即折叠', () => {
    localStorage.setItem('k2', '1');
    const { result } = renderHook(() => useCollapsed('k2'));
    expect(result.current[0]).toBe(true);
    localStorage.removeItem('k2');
  });
});

describe('useAsync', () => {
  it('拿到数据、错误与 reload 能力', async () => {
    let mode: 'ok' | 'fail' = 'ok';
    const fn = vi.fn(() => (mode === 'ok' ? Promise.resolve('data') : Promise.reject(new Error('boom'))));
    const { result } = renderHook(() => useAsync(fn));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('data');
    expect(result.current.error).toBeNull();

    mode = 'fail';
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.data).toBeNull();
  });

  it('非 Error 抛出物也能转成文案', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject('plain')));
    await waitFor(() => expect(result.current.error).toBe('plain'));
  });

  it('全局 reload 总线会触发重新取数', async () => {
    const fn = vi.fn(() => Promise.resolve(1));
    renderHook(() => useAsync(fn));
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    act(() => emitReload());
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });
});

/* ---------------- 路由 ---------------- */

describe('路由解析与序列化', () => {
  it('parseHash 覆盖默认页 / 详情 / 查询 / 非法输入 / 需要解码的段', () => {
    expect(parseHash('').tab).toBe(DEFAULT_TAB);
    expect(parseHash('#/').tab).toBe(DEFAULT_TAB);
    expect(parseHash('#/nope')).toMatchObject({ tab: DEFAULT_TAB, sub: null });
    expect(parseHash('#/agents?q=x').tab).toBe('agents');
    const detail = parseHash('#/agents/claude_code?q=a%2Cb');
    expect(detail.sub).toBe('claude_code');
    expect(detail.query.get('q')).toBe('a,b');
    // 多段（技能 id 里带有 /）：拼回一个 sub
    expect(parseHash('#/library/a/b').sub).toBe('a/b');
    // 非法百分号编码不抛错，原样保留
    expect(parseHash('#/agents/%E0%A4%A').sub).toBe('%E0%A4%A');
  });

  it('toHash 与 parseHash 往返', () => {
    expect(toHash({ tab: 'library', sub: null, query: new URLSearchParams() })).toBe('#/library');
    const route = { tab: 'projects' as const, sub: 'a b', query: new URLSearchParams({ q: '1' }) };
    const hash = toHash(route);
    expect(hash).toBe('#/projects/a%20b?q=1');
    expect(parseHash(hash)).toMatchObject({ tab: 'projects', sub: 'a b' });
  });

  it('navigate / navigateWith 更新当前路由与地址栏', async () => {
    navigate({ tab: 'agents', sub: null, query: new URLSearchParams() });
    expect(getRoute().tab).toBe('agents');
    await waitFor(() => expect(window.location.hash).toBe('#/agents'));

    navigateWith({ sub: 'cursor' });
    expect(getRoute().sub).toBe('cursor');
    await waitFor(() => expect(window.location.hash).toBe('#/agents/cursor'));

    // replace 走 replaceState（不触发 hashchange，需手动广播）
    navigateWith({ query: new URLSearchParams({ q: 'k' }) }, { replace: true });
    expect(getRoute().query.get('q')).toBe('k');

    // 目标 hash 与当前一致时只广播、不改历史
    navigate(getRoute());
    expect(getRoute().tab).toBe('agents');
  });

  it('useRoute 规范化地址并订阅变化', async () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current.tab).toBe('agents');
    act(() => navigate({ tab: 'presets', sub: null, query: new URLSearchParams() }));
    await waitFor(() => expect(result.current.tab).toBe('presets'));
  });
});

describe('路由 query 读写 hooks', () => {
  beforeEach(() => {
    navigate({ tab: 'library', sub: null, query: new URLSearchParams() });
  });

  it('useQueryParam 设置与移除', () => {
    const { result } = renderHook(() => useQueryParam('q'));
    expect(result.current[0]).toBe('');
    act(() => result.current[1]('hello'));
    expect(getRoute().query.get('q')).toBe('hello');
    act(() => result.current[1](''));
    expect(getRoute().query.get('q')).toBeNull();
  });

  it('useQueryFlag 以 1 表示真', () => {
    const { result } = renderHook(() => useQueryFlag('installed'));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(getRoute().query.get('installed')).toBe('1');
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(getRoute().query.get('installed')).toBeNull();
  });

  it('useQueryValue 空值回落 undefined', () => {
    const { result } = renderHook(() => useQueryValue('src'));
    expect(result.current[0]).toBeUndefined();
    act(() => result.current[1]('own'));
    expect(result.current[0]).toBe('own');
    act(() => result.current[1](undefined));
    expect(result.current[0]).toBeUndefined();
  });

  it('useQueryList 逗号分隔，空列表移除参数并回落默认值', () => {
    const { result } = renderHook(() => useQueryList('tag', ['fallback']));
    expect(result.current[0]).toEqual(['fallback']);
    act(() => result.current[1](['a', 'b']));
    expect(getRoute().query.get('tag')).toBe('a,b');
    act(() => result.current[1]([]));
    expect(getRoute().query.get('tag')).toBeNull();
    expect(result.current[0]).toEqual(['fallback']);
  });
});

/* ---------------- 文案 ---------------- */

describe('i18n', () => {
  it('translate 缺键回落英文再回落键名，支持插值', () => {
    expect(translate('en', 'nav.library')).toBe('Library');
    expect(translate('zh', 'nav.library')).toBe('技能库');
    expect(translate('en', 'library.subtitle', { n: 3 })).toContain('3');
    expect(translate('en', 'definitely.not.a.key')).toBe('definitely.not.a.key');
  });

  it('rich 把 **强调** 渲染成 strong', () => {
    const nodes = rich('a **b** c');
    expect(nodes).toHaveLength(3);
    const { container } = render(<div>{rich('a **b** c')}</div>);
    expect(container.querySelector('strong')?.textContent).toBe('b');
  });

  it('joinList 中文用顿号、英文用逗号', () => {
    expect(joinList([])).toBe('');
    render(
      <I18nProvider>
        <span data-testid="joined">{joinList(['a', 'b'])}</span>
      </I18nProvider>,
    );
    // 默认英文
    expect(screen.getByTestId('joined').textContent).toBe('a, b');
  });

  it('Provider 提供 t 并同步 <html lang>', async () => {
    function Probe() {
      const { t, lang } = useI18n();
      return <span data-testid="probe">{`${lang}:${t('nav.settings')}`}</span>;
    }
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
      { wrapper: undefined },
    );
    expect(screen.getByTestId('probe').textContent).toBe('en:Settings');
    expect(document.documentElement.lang).toBe('en');
  });

  it('切换语言会更新文案、持久化并广播 reload', async () => {
    const reload = vi.fn();
    const off = subscribe(reload);
    function Probe() {
      const { t, setLang, lang } = useI18n();
      return (
        <button type="button" onClick={() => setLang('zh')}>
          {`${lang}:${t('nav.settings')}`}
        </button>
      );
    }
    render(<I18nProvider><Probe /></I18nProvider>);
    const btn = screen.getByRole('button');
    act(() => btn.click());
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('zh:设置'));
    expect(localStorage.getItem('lsh-lang')).toBe('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(reload).toHaveBeenCalled();
    // 复原，避免影响其他用例
    localStorage.removeItem('lsh-lang');
    off();
  });

  afterEach(() => {
    localStorage.removeItem('lsh-lang');
  });
});
