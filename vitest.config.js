import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.js'],
      css: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
        exclude: [
          'node_modules/',
          'src/tests/',
          '*.config.js',
          'dist/',
          'build/',
          'tests/',
        ],
      },
      include: ['src/**/*.{test,spec}.{js,jsx}'],
      exclude: ['node_modules', 'dist', 'build', 'tests'],
    },
  })
);
