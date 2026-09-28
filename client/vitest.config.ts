import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * 前端单测：jsdom 环境 + React Testing Library。
 * 覆盖率产出 client/coverage/lcov.info，路径写进 sonar-project.properties。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.tsx'],
    // jsdom 没有的浏览器 API（matchMedia / ResizeObserver 等）在 setup 里补
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      // 与 sonar-project.properties 的 sonar.coverage.exclusions 保持一致
      exclude: ['src/main.tsx'],
    },
  },
});
