import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider, useI18n } from '../src/i18n';

// jsdom 缺少的浏览器 API：组件里用到时给个最小实现
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom 没有实现滚动，路由跳转时会调用
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

// jsdom 未实现 window.confirm（返回 undefined，等价于用户点了「取消」）：默认放行，
// 否则「删除 / 分发」这类先确认的操作在用例里会静默什么都不做。
// 需要断言「取消」分支的用例自己 spy 成 false（restoreMocks 会在用例结束后恢复这里）。
window.confirm = (() => true) as typeof window.confirm;

// 界面语言取自 localStorage，且 i18n 在模块加载时就读走：这里在测试文件 import 之前钉死英文，
// 否则前一个用例切到中文后，后续文件的断言会跟着漂移
try {
  localStorage.setItem('lsh-lang', 'en');
} catch {
  /* 存储不可用时忽略 */
}

/** 把界面语言复位（i18n 的语言是模块级状态，用例之间会互相影响） */
function LangReset() {
  useI18n().setLang('en');
  return null;
}

beforeEach(() => {
  try {
    localStorage.setItem('lsh-lang', 'en');
  } catch {
    /* 存储不可用时忽略 */
  }
  const { unmount } = render(
    <I18nProvider>
      <LangReset />
    </I18nProvider>,
  );
  unmount();
});

afterEach(() => cleanup());
