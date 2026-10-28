import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string; author: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_AUTHOR__: JSON.stringify(pkg.author),
  },
  base: './',
  optimizeDeps: {
    // OpenSCAD WASM 由 worker 直接加载，避免预构建改写 wasm 资源路径
    exclude: ['@lofcz/openscad-wasm'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 12000,
  },
  test: {
    environment: 'node',
  },
});
