import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoBase = '/fluffy-spork/';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fromSrc = (path: string) => resolve(__dirname, 'src', path);

function novaApplicationShell(): Plugin {
  return {
    name: 'nova-application-shell',
    enforce: 'pre',
    transformIndexHtml(html) {
      // Mission 03 deliberately leaves the materialized gameplay runtime and
      // ordered patch scripts in the historical page. Vite now owns only the
      // application boot seam; Mission 04 will contain the remaining legacy
      // access behind src/legacy/ instead of pretending it disappeared here.
      const withoutLegacyPwaBoot = html
        .replace(/\s*<script\s+defer\s+src=["']\.\/pwa-register\.js["']><\/script>/, '')
        .replace(/\s*<script>\s*window\.__bootModule\(['"]main['"]\);\s*<\/script>/, '');

      return {
        html: withoutLegacyPwaBoot,
        tags: [
          {
            tag: 'script',
            attrs: { type: 'module', src: '/src/main.ts' },
            injectTo: 'body',
          },
        ],
      };
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const isProdBuild = command === 'build' || mode === 'production';

  return {
    plugins: [novaApplicationShell(), react()],
    base: isProdBuild || process.env.GITHUB_PAGES === 'true' ? repoBase : '/',
    build: {
      sourcemap: true,
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
