'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/fixed60-optin-boot.js'),'utf8');
function boot(query,{missingApi=false,failStart=false}={}){
 const calls=[],writes=[],pending=new Map();let raf=0;
 class Game{
  constructor(){this.raf=0;this.canvas={};this.input={};this.sfx={};}
  start(){calls.push('production-start');this.raf=++raf}
 }
 const original=Game.prototype.start;
 const mods={'game/engine':(module)=>{module.exports.Game=Game}};
 const win={
  location:{search:query},document:{readyState:'loading',write:html=>writes.push(html)},performance:{now:()=>1000,timeOrigin:1793560000000},
  requestAnimationFrame:fn=>{pending.set(++raf,fn);return raf},
  cancelAnimationFrame:id=>{calls.push('cancel');pending.delete(id)},
  console:{error:()=>calls.push('cleanup-error')},
  __novaModules:mods
 };
 if(!missingApi)win.__novaFixed60Research={
  createFixedStepBrowserPilot:(game,options)=>{
   calls.push('create-pilot');
   assert.equal(options.maxSteps,4);
   assert.equal(options.canvas,game.canvas);
   assert.equal(options.window,win);
   assert.equal(options.document,win.document);
   return {start(){calls.push('pilot-start');if(failStart)throw Error('pilot start failed')},
    stop(){calls.push('pilot-stop')}};
  }
 };
 const sandbox={window:win,URLSearchParams};
 vm.runInNewContext(source,sandbox,{timeout:1000});
 const module={exports:{}};
 mods['game/engine'](module,module.exports,id=>{
  assert.equal(id,'game/render');return {render:()=>calls.push('render')};
 });
 // Pilot Console is later in the real overlay order. It wraps the installed
 // delegate, not vice versa, and must observe exactly one start.
 const old=Game.prototype.start;
 Game.prototype.start=function(){calls.push('settings-start');return old.apply(this,arguments)};
 return {Game,original,calls,writes,win,pending};
}
test('OFF and invalid query preserve canonical Game.start exactly',()=>{
 for(const query of ['', '?nova_fixed60=off','?nova_fixed60=PILOT','?nova_fixed60=pilotish']){
  const h=boot(query,{missingApi:true}),g=new h.Game();
  g.start();
  assert.deepEqual(h.calls,['settings-start','production-start']);
  assert.equal(g.__novaFixed60Pilot,undefined);
 }
});
test('explicit pilot owns start and leaves production RAF unstarted',()=>{
 const h=boot('?nova_fixed60=pilot'),g=new h.Game();
 g.start();
 assert.deepEqual(h.calls,['settings-start','create-pilot','pilot-start']);
 assert.equal(g.raf,0);
 assert.ok(g.__novaFixed60Pilot);
 assert.throws(()=>g.start(),/already attached/);
});
test('pilot startup failure releases capture and preserves original error',()=>{
 const h=boot('?nova_fixed60=pilot',{failStart:true}),g=new h.Game();
 assert.throws(()=>g.start(),/pilot start failed/);
 assert.deepEqual(h.calls,['settings-start','create-pilot','pilot-start','pilot-stop']);
 assert.equal(g.__novaFixed60Pilot,undefined);
 assert.equal(g.raf,0);
});
test('missing requested research bundle fails closed, never silently runs 30Hz',()=>{
 const h=boot('?nova_fixed60=pilot',{missingApi:true}),g=new h.Game();
 assert.throws(()=>g.start(),/bundle is missing/);
 assert.deepEqual(h.calls,['settings-start'],'must not fall back to production RAF');
});
test('requested pilot cannot attach after production RAF starts',()=>{
 const h=boot('?nova_fixed60=pilot'),g=new h.Game();
 h.original.call(g);
 assert.throws(()=>g.start(),/production RAF already owns/);
 assert.deepEqual(h.calls,['production-start','settings-start']);
});
test('materializer installs only the pilot loader before Pilot Console',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
 const loader=workflow.indexOf("'./nova-updates/fixed60-optin-boot.js'");
 const settings=workflow.indexOf("'./nova-updates/settings-v1.7.7.js'");
 assert.ok(loader>=0&&settings>loader,'pilot guard precedes Pilot Console');
 assert.equal(workflow.includes("'./nova-updates/fixed60-research-browser.js'"),false,
  'pilot bundle must not be an unconditional HTML script');
 assert.ok(workflow.includes("'nova-updates/fixed60-research-browser.js'"),
  'optional research bytes must still invalidate the runtime fingerprint');
});
test('pilot loads optional bundle only on explicit query and installs guard first',()=>{
 const ordinary=boot('',{missingApi:true});
 assert.deepEqual(ordinary.writes,[]);
 const pilot=boot('?nova_fixed60=pilot',{missingApi:true});
 assert.equal(pilot.writes.length,1);
 assert.match(pilot.writes[0],/fixed60-research-browser\.js/);
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(sw,/discoverCriticalAssets/);
 assert.equal(sw.includes("'./nova-updates/fixed60-research-browser.js'"),false,
  'default PWA staging must not depend on experimental bundle');
});
