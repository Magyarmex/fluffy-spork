const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadLayer(){
  const draws=[],strokes=[];
  let baseRenders=0,currentPath=[];
  const ctx={
    save(){},restore(){},setTransform(){},translate(){},scale(){},
    drawImage(sprite,x,y,w,h){draws.push({color:sprite.color,x,y,w,h,alpha:this.globalAlpha});},
    beginPath(){currentPath=[];},
    arc(x,y,r,a0,a1){currentPath.push({op:'arc',x,y,r,a0,a1});},
    moveTo(x,y){currentPath.push({op:'moveTo',x,y});},
    lineTo(x,y){currentPath.push({op:'lineTo',x,y});},
    closePath(){currentPath.push({op:'closePath'});},
    stroke(){strokes.push({path:currentPath.slice(),alpha:this.globalAlpha,color:this.strokeStyle,lineWidth:this.lineWidth});},
    globalCompositeOperation:'source-over',globalAlpha:1,strokeStyle:'#000',lineWidth:1,
  };
  const modules={
    'game/render':function(module){module.exports={render(){baseRenders++;},glowSprite(color){return {color};}};},
  };
  const context={window:{__novaModules:modules},console,Math};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/drone-allegiance-glow-v1.7.6.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'drone-allegiance-glow-v1.7.6.js'});
  const m={exports:{}};modules['game/render'](m,m.exports,()=>({}));
  return {context,render:m.exports,ctx,draws,strokes,getBaseRenders:()=>baseRenders};
}
function game(ctx,owners,drones,player={id:1,alive:true}){return {ctx,dpr:1,cam:{x:0,y:0,zoom:1,shake:0},player,drones,tankById:new Map(owners.map(o=>[o.id,o]))};}
test('IFF Halo remains secondary while adding non-color allegiance encoding',()=>{const {context}=loadLayer();const r=context.window.__NOVA_DRONE_IFF_RELEASE__,t=context.window.__NOVA_DRONE_IFF_TEST__;assert.equal(r.version,'1.7.6');assert.equal(r.codename,'IFF Halo');assert.ok(t.alpha>=0.16&&t.alpha<=0.2);assert.ok(t.coreAlpha>t.alpha&&t.coreAlpha<0.4);assert.ok(t.markerAlpha>t.coreAlpha&&t.markerAlpha<0.7);assert.equal(t.markerKind(1),'friendly-ring');assert.equal(t.markerKind(-1),'hostile-diamond');assert.equal(t.markerKind(0),'none');});
test('owned drones draw two blue passes plus a ring while hostile drones draw two red passes plus a diamond',()=>{const h=loadLayer();const owners=[{id:1,alive:true},{id:2,alive:true}],drones=[{ownerId:1,x:-20,y:0,hp:10,role:'escort'},{ownerId:2,x:20,y:0,hp:10,role:'hunter'}];h.render.render(game(h.ctx,owners,drones),200,120);assert.equal(h.getBaseRenders(),1);assert.deepEqual(h.draws.map(d=>d.color),['#4da8ff','#4da8ff','#ff4d62','#ff4d62']);assert.deepEqual(h.draws.map(d=>d.alpha),[0.18,0.30,0.18,0.30]);assert.ok(h.draws[0].w>h.draws[1].w);assert.equal(h.strokes.length,2);assert.equal(h.strokes[0].color,'#4da8ff');assert.equal(h.strokes[0].path.filter(p=>p.op==='arc').length,1,'friendly marker should be circular');assert.equal(h.strokes[1].color,'#ff4d62');assert.equal(h.strokes[1].path.filter(p=>p.op==='lineTo').length,3,'hostile marker should be a diamond');assert.equal(h.strokes[1].path.at(-1).op,'closePath');});
test('shape markers are outlines only and preserve native drone body visibility',()=>{const h=loadLayer(),owners=[{id:1,alive:true},{id:2,alive:true}],drones=[{ownerId:2,x:0,y:0,hp:10,role:'escort'}];h.render.render(game(h.ctx,owners,drones),200,120);assert.equal(h.strokes.length,1);assert.ok(h.strokes[0].lineWidth<=1.5);assert.equal(typeof h.ctx.fill,'undefined','IFF marker layer must not introduce opaque fills');});
test('same-team drones are friendly and different-team drones are hostile',()=>{const h=loadLayer(),player={id:1,alive:true,teamId:'A'},owners=[player,{id:2,alive:true,teamId:'A'},{id:3,alive:true,teamId:'B'}],drones=[{ownerId:2,x:-15,y:0,hp:10,role:'escort'},{ownerId:3,x:15,y:0,hp:10,role:'escort'}];h.render.render(game(h.ctx,owners,drones,player),200,120);assert.deepEqual(h.draws.map(d=>d.color),['#4da8ff','#4da8ff','#ff4d62','#ff4d62']);assert.equal(h.strokes[0].path.some(p=>p.op==='arc'),true);assert.equal(h.strokes[1].path.some(p=>p.op==='lineTo'),true);});
test('non-hostile relation hooks stay neutral instead of being painted or marked hostile',()=>{const h=loadLayer(),player={id:1,alive:true},owners=[player,{id:2,alive:true}],g=game(h.ctx,owners,[{ownerId:2,x:0,y:0,hp:10,role:'escort'}],player);g.areHostile=()=>false;h.render.render(g,200,120);assert.equal(h.draws.length,0);assert.equal(h.strokes.length,0);});
test('off-screen drones are culled before glow and shape IFF passes',()=>{const h=loadLayer(),owners=[{id:1,alive:true},{id:2,alive:true}],drones=[{ownerId:1,x:0,y:0,hp:10,role:'escort'},{ownerId:2,x:5000,y:5000,hp:10,role:'hunter'}];h.render.render(game(h.ctx,owners,drones),200,120);assert.equal(h.draws.length,2);assert.equal(h.strokes.length,1);assert.ok(h.draws.every(d=>d.color==='#4da8ff'));});
