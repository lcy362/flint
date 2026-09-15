import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * 单元测试运行在临时沙箱里：把 SKILLS_HUB_CONFIG 指到一个临时目录，
 * 这样 logger 的落盘目录（<config 所在目录>/logs）与 ConfigStore 的默认路径
 * 都不会碰到用户真实的 ~/.skills-hub —— 测试绝不写入本机真实目录。
 */
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'flint-test-'));
const sandboxConfig = path.join(sandbox, 'config.json');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { SKILLS_HUB_CONFIG: sandboxConfig },
    // 通过用例的 console 输出不打印，避免日志淹没有效信息；失败用例仍完整输出
    silent: 'passed-only',
  },
});
