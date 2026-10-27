'use strict';
// The first real Battlefield announcement must not contain a C0 control byte:
// U+0014 was shipped as a separator and can render as a box or disappear.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/battlefield-v1.6.0.js'),'utf8');
test('shipping Battlefield module contains no invisible C0 control characters',()=>{
 assert.doesNotMatch(source,/[\x00-\x08\x0b\x0c\x0e-\x1f]/,
  'nonprinting characters in the module may silently damage player-facing text');
});
test('first Battlefield toast uses a visible separator between map and instruction',()=>{
 assert.match(source,/__novaBattlefield\.name\+' · COVER CHANGES THE FIGHT'/);
 assert.match(source,/this\.toast\('¦ BATTLEFIELD/);
});
test('the corrected Battlefield announcement is loaded in the actual shipping composition',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/battlefield-v1.6.0.js'));
});
