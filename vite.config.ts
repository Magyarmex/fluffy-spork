import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoBase = '/fluffy-spork/';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fromSrc = (path: string) => resolve(__dirname, 'src', path);

export default defineConfig(({ mode, command }) => {
  // Mission 02 intentionally preserves the legacy production page. Mission 03
  // will install the canonical source-driven application entry.
  const isProdBuild = command === 'build' || mode === 'production';

  return {
    plugins: [react()],
    base: isProdBuild || process.env.GITHUB_PAGES === 'true' ? repoBase : '/',
    build: {
      sourcemap: true
    },
    resolve: {
      alias: {
        '@app': fromSrc('app'),
        '@game': fromSrc('game'),
        '@ai': fromSrc('ai'),
        '@input': fromSrc('input'),
        '@content': fromSrc('content'),
        '@rendering': fromSrc('rendering'),
        '@scenes': fromSrc('scenes'),
        '@audio': fromSrc('audio'),
        '@ui': fromSrc('ui'),
        '@persistence': fromSrc('persistence'),
        '@diagnostics': fromSrc('diagnostics'),
        '@shared': fromSrc('shared'),
        '@legacy': fromSrc('legacy')
      }
    },
    define: {
      __BUILD_MODE__: JSON.stringify(mode)
    }
  };
});
