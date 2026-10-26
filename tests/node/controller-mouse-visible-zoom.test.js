'use strict';
// Actual Controller mouse command function must use the zoom currently
// rendered to the player, not the target zoom awaiting camera easing.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
const a=source.indexOf('    function updatePlayerCommand(');
const b=source.indexOf('    function updateAICommand(',a);
assert.ok(a>=0&&b>a,'real Controller mouse command implementation exists');
const command=new Function('clamp','maxCommandRange','clampNode',
  'return ('+source.slice(a,b).trim()+')')(
    (x,lo,hi)=>Math.max(lo,Math.min(hi,x)),()=>1000,
    (_owner,x,y)=>({x,y}));
function run(renderZoom,targetZoom){
  const owner={id:1,x:0,y:0,angle:0};
  const state={angle:0,wasActive:false,lastCommandCue:100,strikeAt:0};
  const g={time:1,w:800,h:600,zoom:targetZoom,
    cam:{x:70,y:0,zoom:renderZoom},sfx:{},
    canvas:{getBoundingClientRect:()=>({left:0,top:0})},
    input:{mouseActive:true,firing:true,aim:{active:false},
      mouseX:400,mouseY:350}};
  command(g,owner,state,{droneLeash:1000},1/60);
  return state;
}
for(const hz of [30,60,120,240]){
  test('Controller command node uses rendered zoom, not target zoom at '+hz+' FPS',()=>{
    const state=run(1,.5);
    assert.equal(state.active,true);
    assert.ok(Math.abs(state.nodeX-70)<1e-10);
    assert.ok(Math.abs(state.nodeY-50)<1e-10);
    assert.ok(Math.abs(state.angle-Math.atan2(50,70))<1e-10);
  });
}
test('equal zoom keeps ordinary command projection',()=>{
  const state=run(.5,.5);
  assert.equal(state.nodeX,70);
  assert.equal(state.nodeY,100);
});
test('missing rendered zoom falls back safely to target zoom',()=>{
  const state=run(undefined,.5);
  assert.equal(state.nodeX,70);
  assert.equal(state.nodeY,100);
});
