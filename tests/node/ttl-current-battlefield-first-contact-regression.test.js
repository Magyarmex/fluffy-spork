'use strict';
// Current shipping-core vs Battlefield-wrapper TTL-body acceptance. This
// protects existing partial first-contact recovery; it does NOT prove the
// complete 49-overlay game or resolve contested event chronology.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const battlefield=fs.readFileSync(path.join(root,'nova-updates/battlefield-v1.6.0.js'),'utf8');
function coreBullets(){
  const marker='    updateBullets(dt) {',start=html.indexOf(marker);
  assert.ok(start>=0,'materialized core updateBullets missing');
  let end=start+marker.length,depth=1;
  while(depth&&end<html.length){
    if(html[end]==='{')depth++;
    else if(html[end]==='}')depth--;
    end++;
  }
  assert.equal(depth,0);
  return new Function('types_1','classes_1','M',
    'return function(dt){'+html.slice(start+marker.length,end-1)+'}')(
    {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
    {CLASSES:{scout:{size:15}}},2250);
}
const core=coreBullets();
function boot(wrapped){
  class Game{
    constructor(){
      this.time=1;this.bullets=[];this.tmp=[];this.__novaTerrain=[];
      this.tanks=[];this.shapes=[];this.drones=[];
      this.cam={shake:0};this.sfx={};
      this.player={id:999,x:1000,y:1000,alive:true};
      this.hits=0;
      this.hash={query:(_x,_y,_r,out)=>{
        out.length=0;out.push(...this.tanks,...this.shapes,...this.drones);
      }};
    }
  }
  for(const method of ['spawnPlayer','spawnShape','spawnPowerup',
    'tryFire','updateDrones','update','moveTank','addParticles','splashAt',
    'initBulletIntegrity','addRing','addFlash','addImpactDebris',
    'damageShape','damageDrone','weakenBullet','clusterBurst'])
    Game.prototype[method]=function(){};
  Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
  Game.prototype.getTank=()=>null;
  Game.prototype.resolveBulletCollisions=function(){};
  Game.prototype.damageTank=function(){this.hits++;};
  Game.prototype.updateBullets=core;
  if(!wrapped)return Game;
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/audio':m=>{m.exports={Sfx:class{resume(){}}};},
    'game/ai':m=>{m.exports={updateAI(){}};},
    'game/render':m=>{m.exports={render(){}};}
  };
  const window={__novaModules:modules};
  new Function('window','console','Math','Map','Set','Date','performance',
    battlefield)(window,{info(){},warn(){},error(){}},Math,Map,Set,Date,
    {now:()=>0});
  const module={exports:{}};
  modules['game/engine'](module,module.exports,s=>s==='./classes'
    ?{CLASSES:{scout:{size:15}}}:{ARENA_HALF:2250});
  return module.exports.Game;
}
function simulate(Game,fps,scenario){
  const g=new Game();
  const tank={kind:'tank',id:2,
    x:scenario==='far'?100:scenario==='moving'?25:40,
    y:scenario==='moving'?-20:0,cls:'scout',hp:100,alive:true};
  if(scenario==='moving'){
    tank.__novaSweepMoveTime=g.time;
    tank.__novaSweepPrevX=25;tank.__novaSweepPrevY=20;
  }
  g.tanks=[tank];
  g.bullets=[{kind:'bullet',id:1,ownerId:1,x:0,y:0,
    vx:6000,vy:0,r:3,dmg:20,ttl:.005,pen:0,hits:0,
    dead:false,shell:false,beam:false}];
  for(let i=0;i<20&&g.bullets.length;i++){
    g.updateBullets(1/fps);g.time+=1/fps;
  }
  return g.hits;
}
const Core=boot(false),Battlefield=boot(true);
for(const fps of [30,60,120,240]){
  test('current Battlefield TTL stationary hull first contact '+fps+'Hz',()=>{
    assert.equal(simulate(Battlefield,fps,'static'),1);
    assert.equal(simulate(Battlefield,fps,'far'),0,
      'never damage a hull beyond physical TTL');
  });
  test('current Battlefield TTL moving hull first contact '+fps+'Hz',()=>{
    assert.equal(simulate(Battlefield,fps,'moving'),1);
  });
}
test('Battlefield cannot regress relative to materialized core on isolated TTL bodies',()=>{
  for(const scenario of ['static','moving','far'])
    for(const fps of [30,60,120,240])
      assert.ok(simulate(Battlefield,fps,scenario)>=simulate(Core,fps,scenario),
        'Battlefield regressed core: '+scenario+' at '+fps+'Hz');
});
