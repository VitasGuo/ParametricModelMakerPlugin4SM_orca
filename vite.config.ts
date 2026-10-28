import { defineConfig } from 'vitest/config';

export default defineConfig({
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
