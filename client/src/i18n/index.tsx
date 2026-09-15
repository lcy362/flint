import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type MsgKey } from './en';
import { zh } from './zh';
import { emitReload } from '../state/store';

export type { MsgKey };

/** 支持的界面语言：英文为默认 */
export type Lang = 'en' | 'zh';

/** 语言下拉候选项 */
export const LANG_OPTIONS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
];

export type MsgParams = Record<string, string | number>;
export type TFunc = (key: MsgKey, params?: MsgParams) => string;

const STORAGE_KEY = 'lsh-lang';
const DICTS: Record<Lang, Record<string, string>> = { en, zh };

function readStored(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch {
    /* localStorage 不可用时回落默认值 */
  }
  return 'en';
}

/** 模块级当前语言：供非组件代码（如 api 请求头）同步读取 */
let current: Lang = readStored();
const listeners = new Set<(l: Lang) => void>();

/** 当前语言（非 React 上下文可用，例如 fetch 头） */
export function getLang(): Lang {
  return current;
}

/** 插值：把 `{name}` 替换为参数值 */
function interpolate(raw: string, params?: MsgParams): string {
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** 按指定语言取文案；缺失键回落英文，再回落键名本身 */
export function translate(lang: Lang, key: string, params?: MsgParams): string {
  const raw = DICTS[lang]?.[key] ?? en[key as MsgKey] ?? key;
  return interpolate(raw, params);
}

/** 把 `**加粗**` 标记渲染成 <strong>，用于需要强调的整句文案 */
export function rich(text: string): ReactNode[] {
  return text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/** 名称列表连接符：中文用「、」，英文用「, 」 */
export function joinList(items: string[]): string {
  return items.join(current === 'zh' ? '、' : ', ');
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFunc;
}

const I18nContext = createContext<I18nValue>({
  lang: 'en',
  setLang: () => {},
  t: (key, params) => translate('en', key, params),
});

/**
 * 切换语言：更新模块态 + localStorage，并广播一次全局 reload，
 * 让各视图按新的 Accept-Language 重新拉取数据（服务端返回的消息也随之切换）。
 */
function applyLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* 仅内存生效 */
  }
  listeners.forEach((fn) => fn(l));
  emitReload();
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);

  useEffect(() => {
    const fn = (l: Lang) => setLangState(l);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  // 同步 <html lang>，利于无障碍与浏览器排版
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const setLang = useCallback((l: Lang) => applyLang(l), []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 组件内取当前语言与翻译函数 */
export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
