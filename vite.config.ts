import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoBase = '/fluffy-spork/';
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === 'true' ? repoBase : './',
  build: {
    sourcemap: true
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@render': resolve(__dirname, 'src/render'),
      '@sim': resolve(__dirname, 'src/sim'),
      '@tools': resolve(__dirname, 'src/tools'),
      '@ui': resolve(__dirname, 'src/ui')
    }
  },
  define: {
    __BUILD_MODE__: JSON.stringify(mode)
  },
  test: {
    environment: 'jsdom'
  }
}));
