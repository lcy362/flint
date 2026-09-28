/**
 * 把 lcov 里的 SF 路径从「包内相对」改写成「仓库根相对」。
 *
 * vitest 的 v8 reporter 一律写出相对包根的路径（如 `SF:src/App.tsx`），
 * 而 SonarQube 按项目基目录解析这些路径，只有带上包名前缀
 * （`server/src/...` / `client/src/...`）才能与 sonar.sources 对齐——
 * 对不上的报告会被当作「没有覆盖率数据」，整体覆盖率直接归零。
 *
 * 用法：node scripts/prefix-lcov.mjs <lcov 文件> <前缀，如 client/>
 */
import fs from 'node:fs';

const [file, prefix] = process.argv.slice(2);
if (!file || !prefix) {
  console.error('用法：node scripts/prefix-lcov.mjs <lcov 文件> <前缀>');
  process.exit(1);
}

const src = fs.readFileSync(file, 'utf-8');
// 只改写相对路径，绝对路径（少数平台会给出）保持原样
fs.writeFileSync(file, src.replace(/^SF:(?!\/)/gm, `SF:${prefix}`));
console.log(`[lcov] ${file} 的 SF 路径已加上前缀 ${prefix}`);
