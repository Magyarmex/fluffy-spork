'use strict';
// Issue #541: production Living Front telemetry must preserve tactical milestones
// through dense legitimate neutral-orb harvests without altering XP authority.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(){
 class Game{
  drawMinimap(){return 'base';}
  update(dt){this.time+=dt;return 'base-update';}
  gainXP(t,amount){t.xp=(t.xp||0)+amount;}
  updateOrbs(){if(!this.orbs.length)return;const o=this.orbs[0];this.gainXP(this.player,o.xp);this.orbs.splice(0,1);}
  damageTank(t,amount){t.hp-=amount;if(t.hp<=0){t.alive=false;this.status='dead';}}
  redeploy(){return 'redeployed';}
 }
 const window={__novaModules:{'game/engine':m=>{m.exports={Game};}},
  __NOVA_FAIR_ENGAGEMENT_TEST__:{inGameplayViewport:(g,p,t)=>
   Math.abs(p.x-t.x)<=(g.w||800)/2&&Math.abs(p.y-t.y)<=(g.h||600)/2}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const m={exports:{}};window.__novaModules['game/engine'](m,m.exports,()=>({SHAPE_DEFS:{}}));
 const g=new m.exports.Game(),LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
 const p={id:1,isPlayer:true,x:-560,y:-560,hp:100,alive:true,xp:0};
 const e={id:2,x:-520,y:-540,hp:100,alive:true,ai:{}};
 const st={directorEnabled:true,signal:{type:'BLOOM',sector:5,started:100,until:105},
  bloomMemory:{sector:5,announcedAt:100,until:124,initialValue:500},
  sectors:Array.from({length:16},(_,i)=>Object.assign(LF.makeSector(i),{value:i===5?500:0})),
  stats:{playerNeutralXP:0,starsIntercepted:0,starsExpired:0,starsSpawned:0,hexSamples:0},
  age:101,ceiling:.3,planMsEma:0,planMsPeak:0,defs:{},cooldowns:{bloom:10,migration:10,star:10},
  lastSignalAt:100,lastMeaningfulAt:100,migrationHeat:0};
 Object.assign(g,{__lfState:st,status:'playing',time:101,player:p,tanks:[p,e],shapes:[],bullets:[],orbs:[],
  w:800,h:600,cam:{zoom:1},hasLineOfSight:()=>true,areHostile:(a,b)=>a.id!==b.id});
 return {g,st,p,LF};
}
function pickup(s,amount=1,dt=0){
 s.g.time+=dt;
 s.g.orbs.push({x:s.p.x,y:s.p.y,xp:amount,__lfNeutral:true});
 s.g.updateOrbs(.01);
}
function harvestEvents(s){return s.st.frontlineTelemetry.events.filter(e=>e.kind==='neutral-harvest');}
test('70 real neutral-orb collections preserve announced, entry and contest in COPY ECOLOGY',()=>{
 const s=scene();s.LF.frontlineTick(s.g,s.st,true);
 for(let i=0;i<70;i++)pickup(s,1,.004);
 const f=s.st.frontlineTelemetry,ev=f.events;
 assert.deepEqual(Array.from(ev,e=>e.kind),['announced','player-entry','observed-contest','neutral-harvest']);
 assert.equal(ev[3].xp,70);
 assert.equal(ev[3].count,70);
 assert.equal(f.counts.neutralXP,70);
 assert.equal(s.p.xp,70,'real XP owner remains unchanged');
 const snap=s.LF.snapshot(s.g);
 assert.deepEqual(Array.from(snap.frontline.events,e=>e.kind),Array.from(ev,e=>e.kind));
 assert.equal(snap.frontline.events[3].count,70);
 assert.ok(!JSON.stringify(snap.frontline).includes('"x"'),'no private coordinates in public telemetry');
});
test('coalescing never crosses live-to-memory phase boundary',()=>{
 const s=scene();s.LF.frontlineTick(s.g,s.st,false);
 s.g.time=104.99;pickup(s,2);
 s.g.time=105.01;s.st.signal=null;pickup(s,3);
 assert.deepEqual(Array.from(harvestEvents(s),e=>e.mode),['live','memory']);
 assert.deepEqual(Array.from(harvestEvents(s),e=>e.xp),[2,3]);
 assert.equal(s.st.frontlineTelemetry.counts.neutralXP,5);
});
test('coalescing uses bounded total group span, not an indefinitely renewed gap',()=>{
 const s=scene();s.LF.frontlineTick(s.g,s.st,false);
 pickup(s,.25);
 pickup(s,.25,.49);
 pickup(s,.25,.03);
 assert.deepEqual(Array.from(harvestEvents(s),e=>e.count),[2,1]);
 assert.deepEqual(Array.from(harvestEvents(s),e=>e.xp),[.5,.25]);
 assert.equal(s.st.frontlineTelemetry.counts.neutralXP,.75);
});
test('entry, exit, contest and death interrupt aggregation rather than disappearing',()=>{
 const s=scene();s.LF.frontlineTick(s.g,s.st,false);
 pickup(s,1);
 s.p.x=-1500;s.p.y=-1500;s.LF.frontlineTick(s.g,s.st,false);
 s.p.x=-560;s.p.y=-560;s.LF.frontlineTick(s.g,s.st,true);
 pickup(s,2);
 s.g.damageTank(s.p,200);
 const kinds=Array.from(s.st.frontlineTelemetry.events,e=>e.kind);
 assert.deepEqual(kinds,['announced','player-entry','neutral-harvest','player-exit',
  'player-approach','player-entry','observed-contest','neutral-harvest','pilot-death-censor','player-death']);
 assert.deepEqual(Array.from(harvestEvents(s),e=>e.xp),[1,2]);
});
test('separate public opportunities and unrelated sectors cannot share a harvest group',()=>{
 const s=scene();s.LF.frontlineTick(s.g,s.st,false);pickup(s,1);
 s.g.time=110;s.st.signal={type:'BLOOM',sector:5,started:110,until:115};
 s.st.bloomMemory={sector:5,announcedAt:110,until:134,initialValue:500};
 s.LF.frontlineTick(s.g,s.st,false);pickup(s,2);
 const events=s.st.frontlineTelemetry.events;
 assert.equal(events.filter(e=>e.kind==='announced').length,2);
 assert.equal(harvestEvents(s).length,2);
 assert.equal(s.st.frontlineTelemetry.counts.neutralXP,3);
});
test('48-event cap survives interleaved events and malformed/foreign pickups are ignored',()=>{
 const s=scene();s.LF.frontlineTick(s.g,s.st,false);
 for(let i=0;i<70;i++){
  s.p.x=i%2?-1500:-560;s.p.y=s.p.x;s.g.time+=.01;
  s.LF.frontlineTick(s.g,s.st,false);
 }
 assert.ok(s.st.frontlineTelemetry.events.length<=48);
 s.p.x=-560;s.p.y=-560;
 assert.equal(s.LF.recordFrontlineNeutralXP(s.g,s.st,s.p,10,{x:900,y:900}),false);
 assert.equal(s.LF.recordFrontlineNeutralXP(s.g,s.st,s.g.tanks[1],10,{x:s.p.x,y:s.p.y}),false);
 assert.equal(s.st.frontlineTelemetry.counts.neutralXP,0);
});
