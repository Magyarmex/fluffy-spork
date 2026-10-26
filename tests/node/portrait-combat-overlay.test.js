'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const visuals=fs.readFileSync(path.join(root,'nova-updates/visual-language-v1.10.9.js'),'utf8');
const controller=fs.readFileSync(path.join(root,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');

test('portrait combat toasts have a narrow viewport-only style owner',()=>{
  assert.match(visuals,/nova-portrait-toast-constraint/);
  assert.match(visuals,/@media\(max-width:480px\)/);
  assert.match(visuals,/\[class~="top-\[18%\]"\]/);
  assert.match(visuals,/pointer-events-none/);
  assert.match(visuals,/width:min\(94vw,360px\)/);
  assert.match(visuals,/letter-spacing:\.035em/);
});

test('Controller tutorial keeps desktop copy and uses short portrait instructions',()=>{
  assert.match(controller,/var portrait=g\.w<480/);
  assert.match(controller,/AIM = GUN \+ SWARM · DEPTH = RANGE/);
  assert.match(controller,/RELEASE = RECALL · HITS DESIGNATE/);
  assert.match(controller,/RIGHT STICK ANGLE = GUN \+ SWARM/);
  assert.match(controller,/Math\.max\(120,g\.w-24\)/);
});

test('portrait HUD preserves class identity and control affordances without changing desktop',()=>{
  assert.match(visuals,/nova-portrait-hud-identity/);
  assert.match(visuals,/@media\(max-width:440px\)/);
  assert.match(visuals,/\[class~="right-\[78px\]"\]/);
  assert.match(visuals,/button\[aria-label="Toggle autofire"\]/);
  assert.match(visuals,/Hybrid gene:/);
  assert.match(visuals,/@media\(max-width:360px\)/);
  assert.doesNotMatch(visuals,/display:none[^']*button\[aria-label="Pause"\]/);
});

test('Controller tutorial defers canvas copy until the React toast clears on all viewports',()=>{
  assert.match(controller,/__novaLiveVectorTutorialStart=\(this\.time\|\|0\)\+2\.8/);
  assert.match(controller,/now>=\(g\.player\.__novaLiveVectorTutorialStart\|\|0\)/);
  assert.doesNotMatch(controller,/g\.w>=480\|\|now>=/);
  assert.match(controller,/__novaLiveVectorTutorialUntil=\(this\.time\|\|0\)\+10\.5/);
});
