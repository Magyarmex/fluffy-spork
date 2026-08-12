import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const repoBase = '/fluffy-spork/';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fromSrc = (path: string) => resolve(__dirname, 'src', path);

function canonicalPwaAssets(): Plugin {
  const assets = ['manifest.webmanifest', 'nova-icon.svg', 'sw.js'] as const;
  return {
    name: 'nova-canonical-pwa-assets',
    apply: 'build',
    generateBundle() {
      for (const fileName of assets) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(resolve(__dirname, fileName)),
        });
      }
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const isProdBuild = command === 'build' || mode === 'production';

  return {
    plugins: [react(), canonicalPwaAssets()],
    base: isProdBuild || process.env.GITHUB_PAGES === 'true' ? repoBase : '/',
    build: {
      sourcemap: true,
      target: 'es2022',
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
        '@legacy': fromSrc('legacy'),
      },
    },
    define: {
      __BUILD_MODE__: JSON.stringify(mode),
    },
  };
});
