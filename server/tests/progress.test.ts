import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dirSize, fmtBytes, npxCacheRoot, parseGitProgress, watchNpxDownload } from '../src/core/progress.js';
import { tmpDir } from './helpers.js';

describe('parseGitProgress（git 进度行解析）', () => {
  it('认得标准进度行：百分比 + 字节对 + 速度', () => {
    const p = parseGitProgress('Receiving objects:  45% (1234/2345, 1.20/2.70 MiB, 3.40 MiB/s)');
    expect(p).toBeDefined();
    expect(p?.percent).toBe(45);
    expect(p?.received).toBe(Math.round(1.2 * 1024 ** 2));
    expect(p?.total).toBe(Math.round(2.7 * 1024 ** 2));
    // 速度信息并进阶段说明，前端直接展示
    expect(p?.stage).toContain('Receiving objects');
    expect(p?.stage).toContain('MiB/s');
  });

  it('单位只写在后一个数后面时两个数共用该单位', () => {
    const p = parseGitProgress('Receiving objects:  10% (1/10, 1.00/9.00 MiB)');
    expect(p?.received).toBe(1024 ** 2);
    expect(p?.total).toBe(Math.round(9 * 1024 ** 2));
  });

  it('没有字节信息时只给百分比', () => {
    const p = parseGitProgress('Receiving objects: 100% (3/3)');
    expect(p?.percent).toBe(100);
    expect(p?.received).toBeUndefined();
    expect(p?.total).toBeUndefined();
  });

  it('不认 remote: 前缀的行（那是服务端在数自己的对象，不是本方下载量）', () => {
    expect(parseGitProgress('remote: Counting objects:  33% (1/3)')).toBeUndefined();
  });

  it('普通输出行不是进度行', () => {
    expect(parseGitProgress('Cloning into \'src\'...')).toBeUndefined();
    expect(parseGitProgress('')).toBeUndefined();
  });

  it('剥掉 ANSI 颜色码后再解析', () => {
    const p = parseGitProgress('\u001b[32mReceiving objects:\u001b[m  66% (2/3)');
    expect(p?.percent).toBe(66);
  });
});

describe('fmtBytes（字节可读化）', () => {
  it('按量级选单位', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1024)).toBe('1.0 KB');
    expect(fmtBytes(1024 ** 2)).toBe('1.0 MB');
    expect(fmtBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });

  it('非法值给出占位', () => {
    expect(fmtBytes(-1)).toBe('—');
    expect(fmtBytes(Number.NaN)).toBe('—');
  });
});

describe('dirSize（目录体积）', () => {
  it('累加目录下所有文件大小', () => {
    const dir = tmpDir('flint-progress-');
    fs.writeFileSync(path.join(dir, 'a.bin'), Buffer.alloc(100));
    fs.writeFileSync(path.join(dir, 'b.bin'), Buffer.alloc(250));
    expect(dirSize(dir)).toBe(350);
  });

  it('目录不存在时返回 0（不抛）', () => {
    expect(dirSize(path.join(tmpDir('flint-progress-missing-'), 'nope'))).toBe(0);
  });
});

describe('npxCacheRoot / watchNpxDownload（npx 缓存体积监测）', () => {
  it('缓存根落在 npm 缓存目录下的 _npx', () => {
    expect(npxCacheRoot().endsWith(path.join('_npx'))).toBe(true);
  });

  it('缓存目录变大时上报已下载字节（无百分比）', async () => {
    const cache = path.join(tmpDir('flint-npm-cache-'), '_npx');
    fs.mkdirSync(cache, { recursive: true });
    const prev = process.env.npm_config_cache;
    process.env.npm_config_cache = path.dirname(cache);
    try {
      const seen: { received?: number; percent?: number }[] = [];
      const started = Date.now() - 1000;
      const stop = watchNpxDownload(started, (p) => seen.push(p), 20);
      const pkgDir = path.join(cache, 'pkg-abc');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'big.bin'), Buffer.alloc(4096));
      await new Promise((r) => setTimeout(r, 120));
      stop();
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.at(-1)?.received).toBeGreaterThanOrEqual(4096);
      // npm 在非 TTY 下不给百分比——不给就是不给，绝不伪造
      expect(seen.at(-1)?.percent).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.npm_config_cache;
      else process.env.npm_config_cache = prev;
    }
  });
});
