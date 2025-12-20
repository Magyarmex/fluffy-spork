import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const repoBase = '/fluffy-spork/';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === 'true' ? repoBase : '/',
  build: {
    sourcemap: true
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@render': path.resolve(__dirname, 'src/render'),
      '@sim': path.resolve(__dirname, 'src/sim'),
      '@tools': path.resolve(__dirname, 'src/tools'),
      '@ui': path.resolve(__dirname, 'src/ui')
    }
  },
  define: {
    __BUILD_MODE__: JSON.stringify(mode)
  },
  test: {
    environment: 'jsdom'
  }
}));
