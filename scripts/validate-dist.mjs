import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../dist/', import.meta.url);
const required = ['index.html', 'manifest.webmanifest', 'nova-icon.svg', 'sw.js'];

function fail(message) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const escaped = String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.error(`::error title=Production artifact validation::${escaped}`);
  }
  throw new Error(message);
}

for (const file of required) {
  const path = new URL(file, root);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size === 0) fail(`Missing production artifact: ${file}`);
}

const html = await readFile(new URL('index.html', root), 'utf8');
for (const forbidden of ['nova-updates/', 'nova-gz/', '__novaModules', '__bootModule']) {
  if (html.includes(forbidden)) fail(`Legacy production dependency survived build: ${forbidden}`);
}
if (!html.includes('manifest.webmanifest')) fail('Production shell is missing manifest linkage');
if (!html.includes('assets/')) fail('Production shell is not linked to bundled canonical assets');

const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
if (manifest.name !== 'NOVA TANKS' || manifest.start_url !== './' || manifest.scope !== './') {
  fail('PWA manifest contract changed during canonical cutover');
}

const worker = await readFile(new URL('sw.js', root), 'utf8');
if (!worker.includes('NOVA_SYNC_LATEST') || !worker.includes('BUILD_PREFIX')) {
  fail('Atomic offline-update worker was not preserved');
}

const assetsDir = new URL('assets/', root);
const assets = await readdir(assetsDir);
if (!assets.some((file) => file.endsWith('.js'))) fail('No canonical JavaScript bundle emitted');

const indexBytes = (await stat(new URL('index.html', root))).size;
if (indexBytes > 32 * 1024) fail(`Canonical shell regressed above 32 KiB: ${indexBytes} bytes`);

let totalBytes = 0;
for (const file of assets) totalBytes += (await stat(join(assetsDir.pathname, file))).size;
console.log(JSON.stringify({ ok: true, indexBytes, assetCount: assets.length, assetBytes: totalBytes }));
