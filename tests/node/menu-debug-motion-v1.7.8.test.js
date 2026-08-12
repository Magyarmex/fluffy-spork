const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadLayer(){
  const listeners = {};
  const document = { readyState:'loading', addEventListener(type, fn){ listeners[type]=fn; }, getElementById(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];} };
  const window = { addEventListener(){}, innerWidth:390, innerHeight:844, devicePixelRatio:3 };
  const navigator = { onLine:true, maxTouchPoints:5, userAgent:'test-agent', serviceWorker:{controller:{}} };
  const context = { window, document, navigator, console, MutationObserver:function(){}, requestAnimationFrame(){}, setTimeout(){}, clearInterval(){}, setInterval(){return 1;} };
  const src = fs.readFileSync(path.join(__dirname, '../../nova-updates/menu-debug-motion-v1.7.8.js'), 'utf8');
  vm.runInNewContext(src, context, { filename:'menu-debug-motion-v1.7.8.js' });
  return { context, src };
}

test('Signal Flow publishes the v1.7.8 menu contract', () => {
  const { context } = loadLayer(); const r=context.window.__NOVA_MENU_EXPERIENCE_RELEASE__; const t=context.window.__NOVA_MENU_TEST__;
  assert.equal(r.version,'1.7.8'); assert.equal(r.codename,'Signal Flow'); assert.deepEqual(Array.from(t.exclusiveTargets),['blackglass','controls','debug','updates']); assert.ok(t.tips.length>=8); assert.equal(t.nextOpen('debug','debug'),null); assert.equal(t.nextOpen('controls','updates'),'updates');
});

test('debug snapshot is read-only and exposes updater/device state', () => {
  const { context }=loadLayer(); context.window.__NOVA_UPDATE_STATUS={ok:true,fingerprint:'abc123'}; const s=context.window.NOVAMenuExperience.debugSnapshot();
  assert.equal(s.UPDATER,'CURRENT'); assert.equal(s.FINGERPRINT,'abc123'); assert.equal(s['SERVICE WORKER'],'controlled'); assert.match(s.DISPLAY,/390×844/);
});

test('Field Briefing is replaced by Tips and reduced-motion is honored', () => {
  const { src }=loadLayer(); assert.match(src,/k\.textContent='TIPS'/); assert.match(src,/prefers-reduced-motion:reduce/); assert.match(src,/INITIALIZING CHASSIS/);
});

test('obsolete v1.7.4 auto-update badge is neither retained nor deployed', () => {
  const root=path.join(__dirname,'../..');
  assert.equal(fs.existsSync(path.join(root,'nova-updates/auto-update-test-v1.7.4.js')),false);
  assert.equal(fs.existsSync(path.join(root,'nova-updates/menu-debug-motion-v1.7.8.js')),true,'Signal Flow remains as Mission 26 parity evidence');
  const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
  assert.doesNotMatch(deploy,/auto-update-test-v1\.7\.4|menu-debug-motion-v1\.7\.8|nova-updates\//);
  assert.match(deploy,/path: dist/);
});
