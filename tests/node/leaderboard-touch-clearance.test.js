'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const css=fs.readFileSync(path.join(root,'.github/nova-tailwind.css'),'utf8');
const shell=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('read-only leaderboard is pointer-transparent without disabling the TopBar toggle',()=>{
  assert.match(shell,/className: "anim-pop panel absolute right-2 top-\[82px\] z-30 w-44 px-2 py-1\.5"/,
    'the CSS rule must still match the actual leaderboard owner');
  assert.match(css,/#root \.anim-pop\.panel\.absolute\.right-2\[class~="top-\[82px\]"\]\.z-30\.w-44\s*\{\s*pointer-events:\s*none;/,
    'read-only leaderboard should not capture touch events');
  assert.match(shell,/"aria-label": "Leaderboard"/,
    'the separate TopBar toggle must remain available');
  const lb=shell.indexOf('"LEADERBOARD"');
  const next=shell.indexOf('React.createElement(KillFeed',lb);
  assert.ok(lb>0&&next>lb,'find the leaderboard subtree');
  assert.doesNotMatch(shell.slice(lb,next),/React\.createElement\("button"/,
    'do not make an interactive leaderboard pointer-transparent');
});
