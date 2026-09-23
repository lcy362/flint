/**
 * 服务端 i18n（中英双语，英文为默认）。
 *
 * 设计：用 AsyncLocalStorage 携带「本次请求的语言」，由 HTTP 入口中间件统一注入；
 * core 层无需改动函数签名即可通过 `t()` 取到当前语言的文案。
 * 非 HTTP 上下文（如 smoke、后台任务触发的同步）回落为英文，保证日志与环境输出始终是英文。
 *
 * 只有「返回给用户的文案」走 i18n；日志消息一律是纯英文字面量，绝不本地化。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { en, type MsgKey } from './en.js';
import { zh } from './zh.js';

export type Locale = 'en' | 'zh';

export type MsgParams = Record<string, string | number>;

const DICTS: Record<Locale, Record<string, string>> = { en, zh };

const storage = new AsyncLocalStorage<Locale>();

/** 在指定语言上下文中执行（HTTP 入口注入用） */
export function withLocale<T>(locale: Locale, fn: () => T): T {
  return storage.run(locale, fn);
}

/** 解析 Accept-Language 头；不识别时回落英文 */
export function resolveLocale(header: unknown): Locale {
  const raw = typeof header === 'string' ? header.toLowerCase() : '';
  if (!raw) return 'en';
  const parts = raw
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      let q = 1;
      for (const kv of params) {
        const [k, v] = kv.split('=');
        if (k?.trim() === 'q') q = Number(v) || 0;
      }
      return { tag: tag.trim(), q };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of parts) {
    if (tag.startsWith('zh')) return 'zh';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

/** 当前请求的语言；无请求上下文时为英文 */
export function currentLocale(): Locale {
  return storage.getStore() ?? 'en';
}

function interpolate(raw: string, params?: MsgParams): string {
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** 按指定语言取文案；缺失键回落英文 */
export function translate(locale: Locale, key: string, params?: MsgParams): string {
  const raw = DICTS[locale]?.[key] ?? en[key as MsgKey] ?? key;
  return interpolate(raw, params);
}

/** 取当前语言下的用户可见文案（日志禁用本函数，日志用英文字面量） */
export function t(key: MsgKey, params?: MsgParams): string {
  return translate(currentLocale(), key, params);
}
