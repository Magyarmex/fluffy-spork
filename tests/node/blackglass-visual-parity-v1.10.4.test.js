const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(){
  const head={appendChild(){}};
  const document={
    readyState:'complete',head,
    getElementById(){return null;},
    querySelector(){return null;},
    createElement(){return {style:{},setAttribute(){},addEventListener(){}};},
    addEventListener(){}
  };
  function MutationObserver(){this.observe=function(){};}
  const classes={CLASSES:{scout:{id:'scout',name:'Scout',barrels:[{off:0,len:26,w:7,x:0,y:0}],fireMode:'single',bullet:{dmg:12,speed:440,r:5,pen:1,reload:.5},size:14,color:'#7dd3fc'}}};
  const window={__novaMakeRequire(){return function(){return classes;};},devicePixelRatio:1};
  const context={window,document,MutationObserver,requestAnimationFrame(){return 0;},console,Math};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/showroom-fit-v1.7.3.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'showroom-fit-v1.7.3.js'});
  return {api:window.__NOVA_BLACKGLASS_VISUAL_PARITY__,release:window.__NOVA_SHOWROOM_RELEASE__,src};
}

test('Blackglass publishes the current Mirror release and parity helpers',()=>{
  const {api,release}=load();
  assert.equal(api.version,'1.10.6');
  assert.equal(release.version,'1.10.6');
  assert.equal(release.codename,'Blackglass Mirror');
  assert.equal(typeof api.visualMuzzleLocal,'function');
});

test('logical gameplay muzzle retains len + 8 and rotated lateral-offset math',()=>{
  const {api}=load();
  const br={len:26,x:6};
  const straight=api.muzzleLocal(br,0,1);
  assert.equal(straight.x,34);
  assert.equal(straight.y,6);
  const up=api.muzzleLocal(br,Math.PI/2,1);
  assert.ok(Math.abs(up.x+6)<1e-9);
  assert.ok(Math.abs(up.y-34)<1e-9);
});

test('visual muzzle is exactly the visible barrel tip after renderer translate then rotate',()=>{
  const {api}=load();
  const br={len:26,x:6,y:-2};
  const straight=api.visualMuzzleLocal(br,0,1);
  assert.equal(straight.x,32);
  assert.equal(straight.y,-2);
  const up=api.visualMuzzleLocal(br,Math.PI/2,1);
  assert.ok(Math.abs(up.x-6)<1e-9);
  assert.ok(Math.abs(up.y-24)<1e-9);
  const scaled=api.visualMuzzleLocal(br,0,2);
  assert.equal(scaled.x,64);
  assert.equal(scaled.y,-4);
});

test('Twin and Minigun cycle their real barrel list instead of firing from a generic center muzzle',()=>{
  const {api}=load();
  const twin={fireMode:'twin',barrels:[{off:-.05},{off:.05}],bullet:{}};
  assert.deepEqual(JSON.parse(JSON.stringify(api.shotPlan(twin,0))),[{barrel:0,off:-.05,dmgMul:1,rMul:1}]);
  assert.deepEqual(JSON.parse(JSON.stringify(api.shotPlan(twin,1))),[{barrel:1,off:.05,dmgMul:1,rMul:1}]);
  assert.equal(api.shotPlan(twin,2)[0].barrel,0);
  const rotary={fireMode:'minigun',barrels:[{off:-.1},{off:0},{off:.1}],bullet:{}};
  assert.equal(api.shotPlan(rotary,0)[0].barrel,0);
  assert.equal(api.shotPlan(rotary,1)[0].barrel,1);
  assert.equal(api.shotPlan(rotary,2)[0].barrel,2);
  assert.equal(api.shotPlan(rotary,3)[0].barrel,0);
});

test('Shotgun preview consumes each class configured pellet count and spread',()=>{
  const {api}=load();
  const breachlord={fireMode:'shotgun',barrels:[{off:0}],bullet:{pellets:9,spread:.34}};
  const plan=api.shotPlan(breachlord,12);
  assert.equal(plan.length,9);
  assert.ok(Math.abs(plan[0].off+.17)<1e-12);
  assert.ok(Math.abs(plan[8].off-.17)<1e-12);
  assert.equal(plan[4].off,0);
});

test('multi-barrel beams fire from every canonical muzzle with gameplay damage split',()=>{
  const {api}=load();
  const prism={fireMode:'beam',barrels:[{off:0,x:-6},{off:0,x:6}],bullet:{dmg:44,r:5.5}};
  const plan=api.shotPlan(prism,0);
  assert.equal(plan.length,2);
  assert.equal(plan[0].barrel,0);
  assert.equal(plan[1].barrel,1);
  assert.equal(plan[0].dmgMul,.72);
  assert.equal(plan[1].dmgMul,.72);
});

test('projectile profile follows real bullet radius, damage scaling and special shell metadata',()=>{
  const {api}=load();
  const shell={fireMode:'shell',bullet:{dmg:22,speed:385,r:8.4,pen:1,ttl:1.15,cluster:10,splash:58,knock:120}};
  const p=api.projectileProfile(shell,1,1);
  assert.equal(p.mode,'shell');
  assert.equal(p.cluster,10);
  assert.equal(p.splash,58);
  assert.equal(p.knock,120);
  assert.equal(p.speed,385);
  assert.ok(p.radius>8.4,'damage-scaled rounds should be physically larger just like gameplay');
  const beam=api.projectileProfile({fireMode:'beam',bullet:{dmg:70,r:6.8,pen:18,speed:3100}},1,1);
  assert.equal(beam.pen,18);
  assert.equal(beam.speed,3100);
  assert.ok(beam.radius>6.8);
});

test('rendered shots attach to physical tube tips while projectile spread remains independent',()=>{
  const {src}=load();
  assert.match(src,/var muzzleA=aim\+\(br\.off\|\|0\),m=visualMuzzleLocal\(br,muzzleA,S\),origin=/);
  assert.match(src,/drawMuzzleFlash\(x,origin\.x,origin\.y,muzzleA,/);
  assert.match(src,/drawProjectile\(x,c,projectileProfile\(c,sp\.dmgMul,sp\.rMul\),origin,a,/);
  assert.doesNotMatch(src,/visualMuzzleLocal\(br,a,S\)/);
});

test('beam trail cannot extend behind its physical muzzle before the round has travelled that distance',()=>{
  const {src}=load();
  assert.match(src,/var len=Math\.min\(dist,clamp\(profile\.speed\*\.075,80,235\)\)/);
});

test('legacy approximation is visually suppressed and the parity canvas owns steering',()=>{
  const {src}=load();
  assert.match(src,/\.nvs-canvaswrap>\.nvs-canvas\{opacity:0!important;pointer-events:none!important;\}/);
  assert.match(src,/className='nvs-parity-canvas'/);
  assert.match(src,/touch-action:none/);
  assert.match(src,/drawBarrels\(x,c,aim,S\);drawBody\(x,c,aim,S,t\)/);
});
