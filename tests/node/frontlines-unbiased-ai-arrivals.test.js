'use strict';
// A/B telemetry: all actual hostile AI arrivals, independent of ecology mode.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function scene(mode='none'){
 class Game{drawMinimap(){return 'base';}moveTank(t,vx,vy,dt){t.x+=vx*dt;t.y+=vy*dt;}}
 const window={__novaModules:{'game/engine':function(m){m.exports={Game};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates',name),'utf8'),ctx,{filename:name});
 // Load the composed engine module: this installs the observational moveTank
 // witness exactly as the production module registry does.
 const engineModule={exports:{}};
 window.__novaModules['game/engine'](engineModule,{},()=>({}));
 assert.equal(engineModule.exports.Game,Game);
 const LF=window.__NOVA_LIVING_FRONT_INTERNAL__,g=new Game();
 const p={id:1,x:-560,y:-560,hp:100,team:1,alive:true};
 const e={id:2,x:-1150,y:-550,hp:100,team:2,alive:true,ai:{__lfEcoMode:mode,__lfEcoKey:'BLOOM:5',__lfEcoWeight:.2}};
 const st={directorEnabled:true,signal:{type:'BLOOM',sector:5,started:100,until:105},
  bloomMemory:{sector:5,announcedAt:100,until:124,initialValue:500},
  sectors:Array.from({length:16},(_,i)=>Object.assign(LF.makeSector(i),{value:i===5?500:0})),
  stats:{playerNeutralXP:0,starsIntercepted:0,starsExpired:0,starsSpawned:0,hexSamples:0},
  age:101,ceiling:.3,planMsEma:0,planMsPeak:0,defs:{},cooldowns:{bloom:10,migration:10,star:10},
  lastSignalAt:100,lastMeaningfulAt:100,migrationHeat:0};
 Object.assign(g,{__lfState:st,status:'playing',time:100,player:p,tanks:[p,e],shapes:[],w:800,h:600,cam:{zoom:1},
  tankSpeed:()=>350,areHostile:(a,b)=>a.team!==b.team,hasLineOfSight:()=>true});
 return {g,st,p,e,LF};
}
function sample(s,x,y,dt=.22,throughMovement=true){
 s.g.time+=dt;
 if(throughMovement)s.g.moveTank(s.e,(x-s.e.x)/dt,(y-s.e.y)/dt,dt);
 else{s.e.x=x;s.e.y=y;}
 s.LF.frontlineTick(s.g,s.st,false);
}
test('identical physical arrivals count identically with memory ON, local or OFF',()=>{
 const totals=[];
 for(const mode of ['memory','local','none']){
  const s=scene(mode);s.LF.frontlineTick(s.g,s.st,false);
  sample(s,-1110,-550);sample(s,-1080,-550);sample(s,-1050,-550);
  const f=s.st.frontlineTelemetry;
  assert.equal(f.counts.aiPhysicalApproaches,1,mode);
  assert.equal(f.counts.aiPhysicalArrivals,1,mode);
  sample(s,-1100,-550);sample(s,-1050,-550);
  assert.equal(f.counts.aiPhysicalArrivals,1,'re-entry must not double count');
  totals.push(f.counts.aiPhysicalArrivals);
 }
 assert.deepEqual(totals,[1,1,1]);
});
test('bot already inside at first observation is not a physical arrival',()=>{
 const s=scene();s.e.x=-1050;s.LF.frontlineTick(s.g,s.st,false);
 sample(s,-1040,-550);
 assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalArrivals,0);
});
test('teleport-like jump across a sector boundary is not measured as travel',()=>{
 const s=scene();s.e.x=-1500;s.LF.frontlineTick(s.g,s.st,false);
 sample(s,-1050,-550);
 assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalArrivals,0);
});
test('allies and spawn shields never count as hostile arrivals',()=>{
 for(const kind of ['ally','shield']){
  const s=scene();if(kind==='ally')s.e.team=1;else s.e.spawnShieldT=1;
  s.LF.frontlineTick(s.g,s.st,false);sample(s,-1110,-550);sample(s,-1050,-550);
  assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalArrivals,0,kind);
 }
});
test('reused id with new tank instance cannot inherit an old arrival trajectory',()=>{
 const s=scene();s.LF.frontlineTick(s.g,s.st,false);
 s.e={id:2,x:-1050,y:-550,hp:100,team:2,alive:true,ai:{__lfEcoMode:'none'}};
 s.g.tanks[1]=s.e;s.LF.frontlineTick(s.g,s.st,false);
 assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalArrivals,0);
});
test('physical arrival diagnostics reveal no hidden enemy coordinates',()=>{
 const s=scene();s.LF.frontlineTick(s.g,s.st,false);
 sample(s,-1110,-550);sample(s,-1080,-550);sample(s,-1050,-550);
 const f=s.st.frontlineTelemetry;
 assert.equal(f.counts.aiPhysicalArrivals,1);
 assert.ok(!JSON.stringify(f.events).includes('"x"'));
 assert.ok(!JSON.stringify(f.events).includes('"y"'));
 const snap=s.LF.snapshot(s.g);
 assert.equal(snap.frontline.counts.aiPhysicalArrivals,1);
 assert.ok(!JSON.stringify(snap.frontline).includes('"x"'));
});

test('a bot cannot inflate approach telemetry by resetting its sampled path',()=>{
 const s=scene('none');s.e.x=-1500;s.LF.frontlineTick(s.g,s.st,false);
 sample(s,-1450,-550);sample(s,-1380,-550);
 assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalApproaches,1);
 sample(s,-2000,-550); // implausible discontinuity: new baseline, not a new bot
 sample(s,-1930,-550);sample(s,-1850,-550);
 assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalApproaches,1,
  'same bot must not count another approach during one public BLOOM');
});

test('short unobserved teleport over sector edge never counts as physical arrival',()=>{
 const s=scene();s.e.x=-1200;s.LF.frontlineTick(s.g,s.st,false);
 sample(s,-1150,-550);sample(s,-1135,-550);
 const beforeApproaches=s.st.frontlineTelemetry.counts.aiPhysicalApproaches;
 sample(s,-1110,-550,.22,false); // only 25 units: old speed heuristic accepts this jump
 assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalArrivals,0);
 assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalApproaches,beforeApproaches);
});
test('interleaved short relocation invalidates a partially witnessed path',()=>{
 const s=scene();s.e.x=-1200;s.LF.frontlineTick(s.g,s.st,false);
 s.g.time+=.22;s.g.moveTank(s.e,35/.22,0,.22);
 s.e.x=-1118; // invisible relocation after a legitimate move
 s.g.moveTank(s.e,10/.22,0,.22);
 s.LF.frontlineTick(s.g,s.st,false);
 assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalArrivals,0);
});
test('legitimate engine movement still certifies one arrival',()=>{
 const s=scene();s.e.x=-1200;s.LF.frontlineTick(s.g,s.st,false);
 sample(s,-1160,-550);sample(s,-1130,-550);sample(s,-1110,-550);
 assert.equal(s.st.frontlineTelemetry.counts.aiPhysicalArrivals,1);
});

test('disabling Director closes the opportunity and drops retained movement references',()=>{
 const s=scene();s.LF.frontlineTick(s.g,s.st,false);
 sample(s,-1110,-550);
 const f=s.st.frontlineTelemetry;
 assert.ok(f.aiPhysicalLast['2']);
 s.st.directorEnabled=false;
 s.LF.frontlineTick(s.g,s.st,false);
 assert.equal(f.closed,true);
 assert.equal(f.counts.resolved,1);
 assert.deepEqual(Object.keys(f.aiPhysicalLast),[]);
 assert.deepEqual(Object.keys(f.aiPhysicalMotion),[]);
 s.LF.frontlineTick(s.g,s.st,false);
 assert.equal(f.counts.resolved,1,'closing a disabled opportunity is idempotent');
});
