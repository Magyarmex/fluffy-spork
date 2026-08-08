const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function load(){
  const CLASSES={guard:{size:16}};
  function Game(){this.tanks=[];this.__v172BlastContext=null;}
  Game.prototype.splashAt=function(x,y,r,frac,owner,knock,color,dmg){for(const t of this.tanks)this.damageTank(t,dmg||100,owner,0,0);};
  Game.prototype.damageTank=function(t,dmg){t.hp-=dmg;return dmg;};
  Game.prototype.firstTerrainHit=function(){return null;};
  const modules={
    'game/classes':function(module){module.exports={CLASSES};},
    'game/engine':function(module){module.exports={Game};}
  };
  const context={window:{__novaModules:modules},console,Math};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/blast-cover-hardening-v1.7.2.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'blast-cover-hardening-v1.7.2.js'});
  const cache={};
  function req(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,s=>{if(s==='./classes')return req('game/classes');throw new Error(s);});return m.exports;}
  return {Game:req('game/engine').Game,context};
}
function tank(){return {id:1,cls:'guard',x:100,y:0,hp:100,alive:true};}

test('blast cover hardening registers',()=>{const {context}=load();assert.equal(context.window.__NOVA_BLAST_HARDENING__.version,'1.7.2');});

test('wall-surface blast cannot leak through fully blocked hull',()=>{
  const {Game}=load(),g=new Game(),t=tank();g.tanks=[t];
  g.firstTerrainHit=()=>({solid:{id:-1},hit:{t:.01}});
  g.splashAt(0,0,120,.5,2,0,'#fff',60);
  assert.equal(t.hp,100);
});

test('open blast path preserves full damage',()=>{
  const {Game}=load(),g=new Game(),t=tank();g.tanks=[t];g.firstTerrainHit=()=>null;
  g.splashAt(0,0,120,.5,2,0,'#fff',60);
  assert.equal(t.hp,40);
});

test('edge exposure can produce partial rather than binary blast damage',()=>{
  const {Game}=load(),g=new Game(),t=tank();g.tanks=[t];
  g.firstTerrainHit=(sx,sy,tx,ty)=> Math.abs(ty)<2 ? ({solid:{id:-1},hit:{t:.4}}) : null;
  g.splashAt(0,0,120,.5,2,0,'#fff',100);
  assert.ok(t.hp>50&&t.hp<100,`expected weighted partial exposure, hp=${t.hp}`);
});
