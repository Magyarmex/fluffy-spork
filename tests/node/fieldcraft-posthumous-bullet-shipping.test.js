'use strict';
/* Exact materialized core projectile update + shipping Fieldcraft owner. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const menu=fs.readFileSync(path.join(root,'nova-updates/menu-slot-compat-v1.7.8.js'),'utf8');
const marker='    updateBullets(dt) {',at=html.indexOf(marker);
assert.ok(at>=0,'materialized core projectile method exists');
let end=at+marker.length,depth=1;
while(depth&&end<html.length){if(html[end]==='{')depth++;else if(html[end]==='}')depth--;end++;}
assert.equal(depth,0);
const classes={CLASSES:{scout:{size:14,name:'Scout'},marksman:{size:14,name:'Marksman'}},
 lineageForClass:id=>id==='marksman'?'sniper':null};
const core=new Function('types_1','classes_1','M',
 'return function(dt){'+html.slice(at+marker.length,end-1)+'}')(
 {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},{CLASSES:classes.CLASSES},2250);
const start=menu.indexOf('/* NOVA FIELDCRAFT DEATH INSIGHT');
const stop=menu.indexOf('/* Short-screen evolution access',start);
assert.ok(start>=0&&stop>start);
const patch=menu.slice(start,stop);
function boot(){
 class Game{
  constructor(){
   this.status='playing';this.time=1;this.tmp=[];this.bullets=[];
   this.tanks=[];this.tankById=new Map();this.cam={shake:0};
   this.hash={query:(_x,_y,_r,out)=>{out.length=0;out.push(...this.tanks);}};
  }
  getTank(id){return this.tankById.get(id)||null;}
  unregisterTank(t){this.tankById.delete(t.id);this.tanks=this.tanks.filter(x=>x!==t);}
  initBulletIntegrity(){}
  resolveBulletCollisions(){}
  addParticles(){}
  damageTank(v,d,sourceId){
   if(!v.alive)return;
   v.hp-=d;
   if(v.hp<=0)this.killTank(v,this.getTank(sourceId));
  }
  killTank(v){v.alive=false;this.status='dead';}
  redeploy(){this.status='playing';}
  update(){}
 }
 Game.prototype.updateBullets=core;
 const mods={'game/engine':m=>{m.exports.Game=Game;}};
 const window={__novaModules:mods};
 vm.runInNewContext(patch,{window,document:{querySelectorAll:()=>[]},
  MutationObserver:function(){},setTimeout:()=>0,clearTimeout(){},
  console:{error(){}},Map,Set,Number,Math});
 const module={exports:{}};
 mods['game/engine'](module,module.exports,spec=>{
  assert.equal(spec,'./classes');return classes;});
 return module.exports.Game;
}
for(const fps of [30,60,120,240]){
 test('materialized bullet preserves departed rival Fieldcraft at '+fps+' Hz',()=>{
  const Game=boot(),g=new Game();
  const player={kind:'tank',id:1,isPlayer:true,alive:true,cls:'scout',
   x:0,y:0,hp:100};
  const shooter={kind:'tank',id:2,isPlayer:false,alive:false,cls:'marksman',
   x:-300,y:0,hp:0};
  g.tanks=[player,shooter];g.tankById.set(shooter.id,shooter);
  g.unregisterTank(shooter);
  assert.equal(g.getTank(shooter.id),null);
  g.bullets=[{kind:'bullet',id:3,ownerId:shooter.id,
   x:-2400/fps,y:0,vx:2400,vy:0,r:5,dmg:200,ttl:1,
   pen:0,hits:0,dead:false,beam:false,shell:false,splash:false}];
  g.updateBullets(1/fps);
  assert.equal(player.alive,false,'actual core bullet must kill');
  assert.equal(g.status,'dead');
  assert.ok(g.__novaDeathInsight,'Fieldcraft remembers departed owner class');
  assert.equal(g.__novaDeathInsight.name,'Marksman');
  assert.match(g.__novaDeathInsight.lesson,/sightline/);
  assert.equal(g.__novaFieldcraftActiveSource,undefined);
  assert.equal(g.getTank(shooter.id),null,'no shooter resurrection');
  assert.equal(g.bullets.length,0,'projectile lifecycle unchanged');
 });
}
test('ownerless physical projectile cannot invent a departed rival',()=>{
 const Game=boot(),g=new Game(),p={kind:'tank',id:1,isPlayer:true,
  alive:true,cls:'scout',x:0,y:0,hp:10};
 g.tanks=[p];
 g.bullets=[{kind:'bullet',id:3,ownerId:-1,x:-40,y:0,
  vx:2400,vy:0,r:5,dmg:20,ttl:1,pen:0,hits:0,
  dead:false,beam:false,shell:false,splash:false}];
 g.updateBullets(1/60);
 assert.equal(p.alive,false);
 assert.equal(g.__novaDeathInsight,null);
});
