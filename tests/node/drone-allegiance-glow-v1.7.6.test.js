const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadLayer(){
  const draws=[];
  let baseRenders=0;
  const ctx={
    save(){},restore(){},setTransform(){},translate(){},scale(){},
    drawImage(sprite,x,y,w,h){draws.push({color:sprite.color,x,y,w,h,alpha:this.globalAlpha});},
    globalCompositeOperation:'source-over',globalAlpha:1,
  };
  const modules={
    'game/render':function(module){
      module.exports={
        render(){baseRenders++;},
        glowSprite(color){return {color};},
      };
    },
  };
  const context={window:{__novaModules:modules},console};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/drone-allegiance-glow-v1.7.6.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'drone-allegiance-glow-v1.7.6.js'});
  const m={exports:{}};
  modules['game/render'](m,m.exports,()=>({}));
  return {context,render:m.exports,ctx,draws,getBaseRenders:()=>baseRenders};
}

function game(ctx,owners,drones,player={id:1,alive:true}){
  return {
    ctx,dpr:1,cam:{x:0,y:0,zoom:1,shake:0},player,drones,
    tankById:new Map(owners.map(o=>[o.id,o])),
  };
}

test('IFF Halo publishes a reinforced but still secondary visual-only release',()=>{
  const {context}=loadLayer();
  const r=context.window.__NOVA_DRONE_IFF_RELEASE__;
  const t=context.window.__NOVA_DRONE_IFF_TEST__;
  assert.equal(r.version,'1.7.6');
  assert.equal(r.codename,'IFF Halo');
  assert.ok(t.alpha>=0.16&&t.alpha<=0.2,'outer halo should be visibly reinforced but remain background-level');
  assert.ok(t.coreAlpha>t.alpha&&t.coreAlpha<0.4,'core-light should carry the fast IFF read without becoming an outline');
});

test('owned drones draw two blue passes while hostile drones draw two red passes',()=>{
  const h=loadLayer();
  const owners=[{id:1,alive:true},{id:2,alive:true}];
  const drones=[
    {ownerId:1,x:-20,y:0,hp:10,role:'escort'},
    {ownerId:2,x:20,y:0,hp:10,role:'hunter'},
  ];
  h.render.render(game(h.ctx,owners,drones),200,120);
  assert.equal(h.getBaseRenders(),1,'base renderer must still execute exactly once');
  assert.deepEqual(h.draws.map(d=>d.color),['#4da8ff','#4da8ff','#ff4d62','#ff4d62']);
  assert.deepEqual(h.draws.map(d=>d.alpha),[0.18,0.30,0.18,0.30]);
  assert.ok(h.draws[0].w>h.draws[1].w,'outer pass should remain broader than the core-light');
});

test('same-team drones are friendly and different-team drones are hostile',()=>{
  const h=loadLayer();
  const player={id:1,alive:true,teamId:'A'};
  const owners=[player,{id:2,alive:true,teamId:'A'},{id:3,alive:true,teamId:'B'}];
  const drones=[
    {ownerId:2,x:-15,y:0,hp:10,role:'escort'},
    {ownerId:3,x:15,y:0,hp:10,role:'escort'},
  ];
  h.render.render(game(h.ctx,owners,drones,player),200,120);
  assert.deepEqual(h.draws.map(d=>d.color),['#4da8ff','#4da8ff','#ff4d62','#ff4d62']);
});

test('non-hostile relation hooks stay neutral instead of being painted red',()=>{
  const h=loadLayer();
  const player={id:1,alive:true};
  const owners=[player,{id:2,alive:true}];
  const g=game(h.ctx,owners,[{ownerId:2,x:0,y:0,hp:10,role:'escort'}],player);
  g.areHostile=()=>false;
  h.render.render(g,200,120);
  assert.equal(h.draws.length,0);
});

test('off-screen drones are culled before both IFF passes',()=>{
  const h=loadLayer();
  const owners=[{id:1,alive:true},{id:2,alive:true}];
  const drones=[
    {ownerId:1,x:0,y:0,hp:10,role:'escort'},
    {ownerId:2,x:5000,y:5000,hp:10,role:'hunter'},
  ];
  h.render.render(game(h.ctx,owners,drones),200,120);
  assert.equal(h.draws.length,2);
  assert.ok(h.draws.every(d=>d.color==='#4da8ff'));
});
