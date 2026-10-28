'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {patchStarMinimap,BEFORE,AFTER}=require('../../scripts/patch-star-minimap.cjs');
const root=path.resolve(__dirname,'../..');

function shippingMethod(){
  const original=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const patched=patchStarMinimap(original);
  const marker='    drawMinimap() {';
  const start=patched.indexOf(marker);
  const end=patched.indexOf('\n    }\n}\nexports.Game = Game;',start);
  assert.ok(start>=0&&end>start,'canonical shipping Game.drawMinimap must be found');
  const body=patched.slice(start+marker.length,end);
  const context={
    window:{__NOVA_FAIR_ENGAGEMENT__:{
      inGameplayViewport(g,p,s){
        const z=g.cam.zoom>0?g.cam.zoom:1;
        return s.hp>0&&Math.abs(s.x-p.x)<=g.w/(2*z)&&
          Math.abs(s.y-p.y)<=g.h/(2*z);
      }
    }},
    M:2250,
    types_1:{SHAPE_DEFS:{
      star:{color:'#ffe066'},circle:{color:'#55ddff'},triangle:{color:'#77cc77'}
    }},
    POWER_COLORS:{heal:'#00ff00'}
  };
  vm.runInNewContext('class MapOwner { drawMinimap() {'+body+'\n} } this.MapOwner=MapOwner;',context);
  return context;
}
function scene(){
  const env=shippingMethod();
  const g=new env.MapOwner();
  const draws=[];
  const ctx={
    fillStyle:'',globalAlpha:1,lineWidth:1,strokeStyle:'',
    clearRect(){},strokeRect(){},
    fillRect(x,y,w,h){draws.push({x,y,w,h,color:this.fillStyle,alpha:this.globalAlpha});}
  };
  const player={id:1,x:0,y:0,alive:true,color:'#7df3ff',isPlayer:true};
  const star={id:77,type:'star',x:600,y:0,hp:100};
  const circle={id:78,type:'circle',x:1400,y:0,hp:100};
  Object.assign(g,{mmCtx:ctx,player,tanks:[player],shapes:[star,circle],
    powerups:[],w:800,h:600,cam:{zoom:1,x:0,y:0},hasLineOfSight:()=>true});
  const draw=()=>{draws.length=0;g.drawMinimap();return draws.filter(d=>d.w===2&&d.h===2);};
  return{env,g,player,star,circle,draw};
}
test('materializer patches the exact canonical owner once and fails closed on drift',()=>{
  const original=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const patched=patchStarMinimap(original);
  assert.ok(patched.includes(AFTER));
  assert.ok(!patched.includes(BEFORE));
  assert.equal(patchStarMinimap(patched),patched,'patch must be idempotent on materialized main');
  assert.throws(()=>patchStarMinimap('<html>wrong owner</html>'),/drifted/);
  assert.throws(()=>patchStarMinimap(patched.replace(AFTER,'wrong shape loop')),/drifted/);
});
test('off-screen Rogue Star is absent but all ordinary resource dots remain',()=>{
  const s=scene(),shapes=s.draw();
  assert.equal(shapes.some(d=>d.color==='#ffe066'),false);
  assert.equal(shapes.filter(d=>d.color==='#55ddff').length,1);
});
test('visible Rogue Star remains discoverable on the minimap',()=>{
  const s=scene();s.star.x=100;
  const shapes=s.draw();
  assert.equal(shapes.filter(d=>d.color==='#ffe066').length,1);
  assert.equal(shapes.filter(d=>d.color==='#55ddff').length,1);
});
test('cover prevents Star live-position disclosure, not ordinary farming dots',()=>{
  const s=scene();s.star.x=100;s.g.hasLineOfSight=()=>false;
  const shapes=s.draw();
  assert.equal(shapes.some(d=>d.color==='#ffe066'),false);
  assert.equal(shapes.filter(d=>d.color==='#55ddff').length,1);
});
test('viewport zoom and portrait-width changes follow the player sight contract',()=>{
  const s=scene();s.star.x=300;
  assert.equal(s.draw().some(d=>d.color==='#ffe066'),true);
  s.g.cam.zoom=2;
  assert.equal(s.draw().some(d=>d.color==='#ffe066'),false);
  s.g.w=1600;
  assert.equal(s.draw().some(d=>d.color==='#ffe066'),true);
});
test('camera offset cannot leak a Star outside the actually rendered screen',()=>{
  const s=scene();s.star.x=100;s.star.y=0;
  assert.equal(s.draw().some(d=>d.color==='#ffe066'),true);
  s.g.cam.x=2000;
  assert.equal(s.draw().some(d=>d.color==='#ffe066'),false,
    'Long Glass camera shift must not reveal off-screen live Star coordinates');
  s.g.cam.x=0;
  assert.equal(s.draw().some(d=>d.color==='#ffe066'),true);
});
test('missing camera geometry fails closed rather than guessing player visibility',()=>{
  const s=scene();s.star.x=100;
  delete s.g.cam.x;
  assert.equal(s.draw().some(d=>d.color==='#ffe066'),false);
  assert.equal(s.draw().some(d=>d.color==='#55ddff'),true);
});
test('missing Fair Engagement fails closed for Star only; dead pilot cannot radar',()=>{
  const s=scene();s.star.x=100;
  s.env.window.__NOVA_FAIR_ENGAGEMENT__=null;
  assert.equal(s.draw().some(d=>d.color==='#ffe066'),false);
  assert.equal(s.draw().some(d=>d.color==='#55ddff'),true);
  s.env.window.__NOVA_FAIR_ENGAGEMENT__={inGameplayViewport:()=>true};
  s.player.alive=false;
  assert.equal(s.draw().some(d=>d.color==='#ffe066'),false);
});
