'use strict';
// Source-executed regression for a delayed evolution UI action crossing Game lifetimes.
// A destroyed Game must not click MINIMIZE in a newly mounted match.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../nova-updates/stability-v1.4.0.js'),'utf8');
const start=source.indexOf('  function collapseUpgradeTraySoon(owner) {');
const end=source.indexOf("\n\n  wrapModule('game/audio'",start);
assert.ok(start>=0&&end>start,'canonical evolution collapse owner exists');
const definition=source.slice(start,end);
assert.match(source,/function evolutionGrace\(g\)[\s\S]*?collapseUpgradeTraySoon\(g\);/);
assert.match(source,/if\(this\.__novaCapGraceOwner===this\.player[\s\S]*?collapseUpgradeTraySoon\(this\);/);
function harness(){
 let queued=[],clicks=0,queries=0;
 const document={querySelectorAll(){queries++;return [{textContent:'MINIMIZE',click(){clicks++;}}];}};
 const setTimeout=(fn,ms)=>{assert.equal(ms,40);queued.push(fn);};
 const collapse=new Function('document','setTimeout',definition+'\nreturn collapseUpgradeTraySoon;')(document,setTimeout);
 return {collapse,flush(){for(const fn of queued.splice(0))fn();},get clicks(){return clicks;},get queries(){return queries;}};
}
test('destroyed evolution owner cannot minimize a later match upgrade tray',()=>{
 const h=harness(),oldGame={__novaDestroyed:false};
 h.collapse(oldGame);
 oldGame.__novaDestroyed=true;
 h.flush();
 assert.equal(h.queries,0,'stale callback must not inspect new UI');
 assert.equal(h.clicks,0,'stale callback must not click new UI');
});
test('living evolution owner still minimizes its own upgrade tray',()=>{
 const h=harness(),game={__novaDestroyed:false};
 h.collapse(game);h.flush();
 assert.equal(h.queries,1);
 assert.equal(h.clicks,1);
});
test('missing owner fails closed instead of manipulating global UI',()=>{
 const h=harness();
 h.collapse();h.flush();
 assert.equal(h.queries,0);
 assert.equal(h.clicks,0);
});
test('stale and live evolution timers cannot cross-control the replacement UI',()=>{
 const h=harness(),oldGame={__novaDestroyed:false},newGame={__novaDestroyed:false};
 h.collapse(oldGame);
 oldGame.__novaDestroyed=true;
 h.collapse(newGame);
 h.flush();
 assert.equal(h.queries,1,'only the replacement owner may inspect the UI');
 assert.equal(h.clicks,1,'only the replacement owner may minimize its own tray');
});
