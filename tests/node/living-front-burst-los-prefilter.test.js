'use strict';
// Living Front explosions must spend terrain LoS rays only on shapes that
// can receive a meaningful physical impulse. Hash buckets are approximate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const defs = {circle:{speed:60},triangle:{speed:90},square:{speed:40},
  pentagon:{speed:30},hexagon:{speed:20}};

function boot(math=Math) {
  const window = {__novaModules:{}};
  const context = {window,Math:math,Map,Set,Number,Object,Array,Date,JSON,
    performance:{now:()=>0},console:{info(){},error(){},warn(){}}};
  for (const name of ['living-front-core-v1.12.0.js',
    'living-front-instincts-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),
      context,{filename:name});
  return window.__NOVA_LIVING_FRONT_INTERNAL__;
}
function run(LF, input, radius=100, power=.6, visible=()=>true) {
  const shapes=input.map(s=>({...s,vx:0,vy:0}));
  const st={queryScratch:[],queryScratch2:[],defs,
    stats:{burstHerds:0,nearFireHerds:0}};
  const rays=[];
  const g={__lfState:st,hash:{query(_x,_y,_r,out){
    // Simulate Zero Churn: the cell broadphase includes all nearby buckets.
    out.push(...shapes);
  }},hasLineOfSight(_ax,_ay,x,y){rays.push([x,y]);return visible(x,y);}};
  LF.disturbBurst(g,0,0,radius,power);
  return {shapes,rays,stats:st.stats};
}
function shape(id,type,x,y,hp=30) {
  return {id,kind:'shape',type,x,y,hp,r:12};
}

test('100 shapes in an irrelevant spatial bucket cost zero terrain rays',()=>{
  const LF=boot(),near=shape(1,'circle',25,0);
  const far=Array.from({length:100},(_,i)=>shape(i+2,'circle',180+i,0));
  const result=run(LF,[...far,near]);
  assert.equal(result.rays.length,1);
  assert.deepEqual(result.rays[0],[25,0]);
  assert.ok(result.shapes.at(-1).vx>0);
  assert.ok(result.shapes.slice(0,-1).every(s=>s.vx===0&&s.vy===0));
});

test('distant spatial-bucket candidates skip even the square-root calculation',()=>{
  let hypotCalls=0;
  const trackedMath=Object.create(Math);
  trackedMath.hypot=(...values)=>{hypotCalls++;return Math.hypot(...values);};
  const LF=boot(trackedMath);
  const far=Array.from({length:100},(_,i)=>shape(i+1,'circle',200+i,0));
  const result=run(LF,far,100,.6);
  assert.equal(result.rays.length,0);
  assert.equal(hypotCalls,0,'irrelevant distant candidates must not pay Math.hypot');
  assert.ok(result.shapes.every(s=>s.vx===0&&s.vy===0));
});

test('weak edge-of-burst impulse never triggers a terrain ray',()=>{
  const LF=boot();
  const result=run(LF,[shape(1,'triangle',95,0),shape(2,'circle',99,0)],100,.6);
  assert.equal(result.rays.length,0);
  assert.ok(result.shapes.every(s=>s.vx===0&&s.vy===0));
});

test('nearby shape behind cover still receives no burst herding',()=>{
  const LF=boot(),result=run(LF,[shape(1,'circle',25,0)],100,.6,()=>false);
  assert.equal(result.rays.length,1);
  assert.equal(result.shapes[0].vx,0);
  assert.equal(result.stats.burstHerds,0);
});

test('invalid or zero-effective impulse is skipped before visibility work',()=>{
  const LF=boot();
  const negative=run(LF,[shape(1,'circle',25,0)],100,-.3);
  assert.equal(negative.rays.length,0);
  assert.equal(negative.stats.burstHerds,0);
  const zeroDistance=run(LF,[shape(2,'circle',0,0)],100,.6);
  assert.equal(zeroDistance.rays.length,1);
  assert.equal(zeroDistance.stats.burstHerds,0);
});

test('seeded explosion herding matches independent force reference',()=>{
  const LF=boot();
  let seed=0x3672026;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const resistance={circle:1,triangle:.68,square:.30,pentagon:.12,hexagon:0};
  for(let world=0;world<600;world++){
    const radius=20+rand()*300,power=[0,.2,.6,1.2,-.3][world%5];
    const input=Array.from({length:35},(_,i)=>{
      const type=['circle','triangle','square','pentagon','hexagon'][i%5];
      return shape(i,type,(rand()-.5)*650,(rand()-.5)*650);
    });
    const visible=(x,y)=>Math.sin(x*.034+y*.019)>.1;
    const result=run(LF,input,radius,power,visible);
    let expectedRays=0,expectedHerds=0;
    for(let i=0;i<input.length;i++){
      const s=input[i],got=result.shapes[i];
      const dist=Math.hypot(s.x,s.y);
      const impulse=Math.max(0,Math.min(1,1-dist/Math.max(1,radius)))*(power||.6);
      let vx=0,vy=0;
      if(impulse>.05){
        expectedRays++;
        if(visible(s.x,s.y)&&dist>=1e-5&&resistance[s.type]>0){
          const speed=Math.max(6,defs[s.type].speed);
          vx=s.x/dist*speed*impulse*resistance[s.type];
          vy=s.y/dist*speed*impulse*resistance[s.type];
          expectedHerds++;
        }
      }
      assert.ok(Math.abs(got.vx-vx)<1e-9,'vx changed in world '+world+' shape '+i);
      assert.ok(Math.abs(got.vy-vy)<1e-9,'vy changed in world '+world+' shape '+i);
    }
    assert.equal(result.rays.length,expectedRays,'LoS rays at world '+world);
    assert.equal(result.stats.burstHerds,expectedHerds,'herding at world '+world);
  }
});

test('the optimized instincts are loaded by the shipping materializer',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
