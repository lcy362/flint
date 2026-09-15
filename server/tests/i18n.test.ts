import { describe, expect, it } from 'vitest';
import { currentLocale, resolveLocale, t, translate, withLocale } from '../src/i18n/index.js';

describe('resolveLocale', () => {
  it('没有 Accept-Language 时回落英文', () => {
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(123)).toBe('en');
  });

  it('识别中文（zh-CN 等变体）', () => {
    expect(resolveLocale('zh-CN,zh;q=0.9,en;q=0.8')).toBe('zh');
    expect(resolveLocale('zh-Hant-TW')).toBe('zh');
  });

  it('识别英文', () => {
    expect(resolveLocale('en-US,en;q=0.9')).toBe('en');
  });

  it('按 q 值排序，取权重最高的可识别语言', () => {
    expect(resolveLocale('en;q=0.5,zh;q=0.9')).toBe('zh');
    expect(resolveLocale('zh;q=0.2,en;q=0.9')).toBe('en');
  });

  it('完全不支持的语言回落英文', () => {
    expect(resolveLocale('fr-FR,de;q=0.8')).toBe('en');
  });
});

describe('translate / t', () => {
  it('translated 按指定语言返回文案并完成插值', () => {
    expect(translate('en', 'sync.unknownAgent', { agent: 'foo' })).toBe('Unknown agent: foo');
    expect(translate('zh', 'sync.unknownAgent', { agent: 'foo' })).toBe('未知 agent: foo');
  });

  it('未提供的插值参数保持原样', () => {
    expect(translate('en', 'preset.notFound')).toBe('Preset not found: {name}');
  });

  it('键不存在时回落键名本身（不抛错）', () => {
    expect(translate('zh', 'not.a.real.key')).toBe('not.a.real.key');
  });

  it('无请求上下文时 t() 使用英文', () => {
    expect(currentLocale()).toBe('en');
    expect(t('preset.notFound', { name: 'p' })).toBe('Preset not found: p');
  });

  it('withLocale 在上下文内切换语言', () => {
    const zh = withLocale('zh', () => t('preset.notFound', { name: 'p' }));
    expect(zh).toBe('preset 不存在: p');
    // 退出上下文后恢复默认英文
    expect(t('preset.notFound', { name: 'p' })).toBe('Preset not found: p');
  });

  it('中英词表键集合一致（zh 用 Record<MsgKey, string> 约束）', () => {
    for (const key of ['sync.unknownAgent', 'diag.syncOk', 'api.repoExists'] as const) {
      expect(translate('zh', key)).not.toBe(key);
      expect(translate('en', key)).not.toBe(key);
    }
  });
});
