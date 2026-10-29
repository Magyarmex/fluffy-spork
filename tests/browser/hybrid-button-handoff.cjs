'use strict';
// Real Chromium regression for hybrid touch + physical mouse/keyboard handoff.
// Uses trusted CDP touch contacts and Playwright's real mouse/keyboard input
// against the shipping document-level capture bridges, not mocked handlers.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 }, hasTouch: true, isMobile: false
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.stack || e)));
  try {
    await page.goto('http://127.0.0.1:8765/', {
      waitUntil: 'domcontentloaded', timeout: 45000
    });
    await page.getByRole('button', { name: /DEPLOY/i }).first()
      .waitFor({ state: 'visible', timeout: 45000 });
    await page.waitForFunction(() =>
      window.__NOVA_COMMAND_WEAVE_BUTTON_TEST__ &&
      window.__NOVA_MULTITOUCH_ULTIMATE_TEST__, null, { timeout: 15000 });
    await page.evaluate(() => {
      window.__novaHybridClickLog = { ordinary: [], ultimate: [] };
      function make(id, x) {
        const holder = document.createElement('div');
        holder.style.cssText = 'position:fixed;top:100px;left:' + x +
          'px;z-index:2147483000;width:90px;height:90px';
        if (id === 'ultimate') holder.className = 'bottom-6 right-4';
        const button = document.createElement('button');
        button.id = 'nova-hybrid-' + id;
        button.setAttribute('data-ui', '1');
        button.textContent = id;
        if (id === 'ultimate') button.className = 'h-[68px] w-[68px]';
        button.style.cssText = 'display:block;width:78px;height:78px;' +
          'background:#123;color:white;touch-action:none';
        button.addEventListener('click', e => {
          window.__novaHybridClickLog[id].push({
            trusted: e.isTrusted, detail: e.detail,
            pointerType: e.pointerType || null,
            touchCapability: e.sourceCapabilities?.firesTouchEvents ?? null
          });
        });
        holder.appendChild(button);
        document.body.appendChild(holder);
      }
      make('ordinary', 100);
      make('ultimate', 300);
    });
    const cdp = await context.newCDPSession(page);
    async function testButton(id) {
      const button = page.locator('#nova-hybrid-' + id);
      const box = await button.boundingBox();
      assert.ok(box && box.width > 50 && box.height > 50, id + ': visible');
      const p = { x: box.x + box.width / 2, y: box.y + box.height / 2,
        id: id === 'ordinary' ? 21 : 22, radiusX: 1, radiusY: 1, force: 1 };
      const count = () => page.evaluate(id =>
        window.__novaHybridClickLog[id].length, id);
      const start = () => cdp.send('Input.dispatchTouchEvent',
        { type: 'touchStart', touchPoints: [p] });
      const end = () => cdp.send('Input.dispatchTouchEvent',
        { type: 'touchEnd', touchPoints: [] });

      const n0 = await count();
      await start();
      assert.equal(await count(), n0 + 1,
        id + ': trusted touch pointerdown triggers one immediate button click');
      await page.mouse.click(p.x, p.y);
      assert.equal(await count(), n0 + 2,
        id + ': independent physical mouse click is not swallowed');
      await end();
      const afterMouse = await count();
      assert.equal(afterMouse, n0 + 2,
        id + ': touch release does not cause duplicate activation');

      await button.focus();
      const n1 = await count();
      await start();
      assert.equal(await count(), n1 + 1,
        id + ': second touch activates once');
      await page.keyboard.press('Enter');
      assert.equal(await count(), n1 + 2,
        id + ': independent keyboard click is not swallowed');
      await end();
      assert.equal(await count(), n1 + 2,
        id + ': delayed touch click remains suppressed');
      const log = await page.evaluate(id =>
        window.__novaHybridClickLog[id], id);
      assert.equal(log.filter(x => x.trusted).length, 2,
        id + ': physical mouse and keyboard clicks are browser-trusted');
      return log;
    }
    const ordinary = await testButton('ordinary');
    const ultimate = await testButton('ultimate');
    assert.deepEqual(errors, [], 'no uncaught browser exceptions');
    console.log('NOVA_HYBRID_BUTTON_HANDOFF ' +
      JSON.stringify({ ordinary, ultimate, errors }));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
