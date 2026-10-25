'use strict';
// Regression: zero radians is an intentional east-facing Controller command.
// A falsy fallback to the hull bearing silently rotates wall/wing formations.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(path.join(root, 'nova-updates/controller-v1.3.0.js'), 'utf8');
const shipping = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = controller.indexOf('function formationPoint(');
const end = controller.indexOf('function steerDrone(', start);
assert.ok(start >= 0 && end > start, 'canonical Controller formation implementation exists');
const formationPoint = new Function('TAU', 'return (' + controller.slice(start, end).trim() + ')')(Math.PI * 2);
function point(formation, angle, ownerAngle = Math.PI / 2, index = 0) {
  const owner = {cls: 'carrier', x: 0, y: 0, angle: ownerAngle, bulwarkT: 0};
  const squad = [{id:1},{id:2},{id:3}];
  return formationPoint({time: 1}, owner, squad[index], squad, null,
    {nodeX: 100, nodeY: 200, angle},
    {formation, formationRadius: 80});
}
function close(a,b,msg){assert.ok(Math.abs(a-b)<1e-8,msg+': expected '+b+', got '+a);}
for(const hz of [30,60,120,240]){
  test('Controller east command aligns wall across hull heading at '+hz+'Hz',()=>{
    const p=point('wall',0,Math.PI/2,0);
    close(p.x,97.5,'wall x');close(p.y,165,'wall y');
  });
  test('Controller east command aligns wing across hull heading at '+hz+'Hz',()=>{
    const p=point('wing',0,Math.PI/2,0);
    close(p.x,80,'wing x');close(p.y,167,'wing y');
  });
  test('Controller east command aligns default formation at '+hz+'Hz',()=>{
    const p=point('line',0,Math.PI/2,0);
    close(p.x,81,'default x');close(p.y,164,'default y');
  });
}
test('nonzero command bearing still overrides hull heading',()=>{
  const p=point('wall',Math.PI/2,0,0);
  close(p.x,135,'wall north x');close(p.y,197.5,'wall north y');
});
test('missing or invalid command bearing falls back to hull bearing',()=>{
  for(const angle of [undefined,Number.NaN,Infinity]){
    const p=point('wall',angle,Math.PI/2,0);
    close(p.x,135,'fallback x');close(p.y,197.5,'fallback y');
  }
});
test('formation computation never changes command state or hull heading',()=>{
  const owner={cls:'carrier',x:0,y:0,angle:Math.PI/2,bulwarkT:0};
  const state={nodeX:100,nodeY:200,angle:0};
  const squad=[{id:1},{id:2},{id:3}];
  formationPoint({time:1},owner,squad[0],squad,null,state,
    {formation:'wall',formationRadius:80});
  assert.equal(owner.angle,Math.PI/2);assert.equal(state.angle,0);
});
test('shipping game includes canonical Controller before Live Vector and Fair Engagement',()=>{
  const a=shipping.indexOf('nova-updates/controller-v1.3.0.js');
  const b=shipping.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
  const c=shipping.indexOf('nova-updates/fair-engagement-v1.11.2.js');
  assert.ok(a>=0&&b>a&&c>b);
});

/* Integration: call the actual Controller steering closure from its module
 * wrapper, not a reimplementation of the formation formula. */
const vm = require('node:vm');
const anchor = '    function simulateLegacyDrone(';
assert.equal(controller.split(anchor).length, 2, 'unique live Controller simulation anchor');
const instrumented = controller.replace(anchor,
  '    window.__testControllerFormationMotion = simulateControllerDrone;\\n' + anchor)
  .replace('\\n    function simulateLegacyDrone(', '\n    function simulateLegacyDrone(');
class Game { updateDrones(){} update(){} }
const modules = {'game/engine':m=>{m.exports.Game=Game;}};
const win = {__novaModules:modules};
vm.runInNewContext(instrumented, {window:win,document:{addEventListener(){}},
  console:{info(){},warn(){},error(){}},Math,Number,Map,Set,Date,Object,Array,WeakMap,
  performance:{now:()=>0}});
const m={exports:{}};
modules['game/engine'](m,m.exports,()=>({CLASSES:{warden:{droneLeash:650},
  citadel:{droneLeash:650},valkyrie:{droneLeash:650}},ABILITIES:{}}));
assert.equal(typeof win.__testControllerFormationMotion,'function');
function motion(cls,formation,dt){
  const owner={id:1,cls,x:0,y:0,angle:Math.PI/2,swarmT:0,bulwarkT:0};
  const squad=[{x:100,y:200,hp:100,speed:200,__novaPhase:'form',
    __novaVX:0,__novaVY:0}, {x:100,y:200}, {x:100,y:200}];
  const d=squad[0],state={active:true,nodeX:100,nodeY:200,angle:0,power:1};
  win.__testControllerFormationMotion({time:1},owner,d,squad,null,state,
    {formation,formationRadius:68,response:7,recover:.7},dt,false);
  return d;
}
for(const hz of [30,60,120,240]){
  for(const [cls,formation] of [['warden','wall'],['citadel','wall'],['valkyrie','wing']]){
    test('real Controller '+cls+' steers left/down toward east-command formation at '+hz+'Hz',()=>{
      const d=motion(cls,formation,1/hz);
      assert.ok(d.x<100,'command east must not redirect drone toward hull north');
      assert.ok(d.y<200,'left formation slot must be south of east command node');
    });
  }
}
