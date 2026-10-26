'use strict';
// Research-only first-event oracle; known-red shipping tests remain untouched.
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('two hostile projectiles arbitrate body, wall, intercept and TTL across frame partitions',()=>{
 const script=path.resolve(__dirname,'../research/chronology-two-projectile-first-event.js');
 const result=JSON.parse(execFileSync(process.execPath,[script],{encoding:'utf8',timeout:20000}));
 assert.equal(result.deterministic,5);
 assert.equal(result.worlds,20000);
 assert.equal(result.comparisons,120000);
 assert.equal(result.events,39254);
 assert.equal(result.disagreements,0);
});
