'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
test('controlled held-three browser gate reserves native RAF alignment margin without entering stall quarantine',()=>{
 const source=fs.readFileSync(path.join(root,'tests/browser/fixed60-real-game-owner-touch-research.cjs'),'utf8');
 const gate=200/3,step=1000/60;
 assert.ok(gate>=3*step+step*.9,'three updates need a real browser-frame alignment margin');
 assert.ok(gate<100,'controlled gap must not itself trigger the >100ms stall quarantine');
 assert.match(source,/controlledGate&&activeBurst\?\[200\/3,50\/3,50\/3,50\/3\]/);
 assert.match(source,/f\.steps===3&&f\.budget===3&&f\.rawGapMs<=100\+1e-7&&/);
 assert.match(source,/f\.playerProjectileBirths>0/,'gate still requires a real player projectile');
});
