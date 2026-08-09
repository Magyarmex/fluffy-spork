const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadReliability(){
  function Game(){
    this.w=360;this.h=640;this.zoom=.56;this.__novaBaseZoom=.56;
    this.cam={x:0,y:0,zoom:.56,shake:0};
    this.time=10;this.status='playing';this.tanks=[];this.drones=[];
    this.input={mouseActive:false,mouseX:180,mouseY:320};
    this.canvas={getBoundingClientRect(){return {left:0,top:0};}};
    this.player=null;this.lastProjectionZoom=null;this.lastWorldX=null;
  }
  Game.prototype.resize=function(){this.zoom=.56;};
  Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
  Game.prototype.update=function(dt){
    this.lastProjectionZoom=this.zoom;
    if(this.input.mouseActive){
      const rect=this.canvas.getBoundingClientRect();
      this.lastWorldX=this.cam.x+(this.input.mouseX-rect.left-this.w/2)/this.zoom;
    }
    const pl=this.player;
    if(pl){
      const k=1-Math.exp(-7.2*dt);
      this.cam.x+=((pl.x+(pl.vx||0)*.16)-this.cam.x)*k;
      this.cam.y+=((pl.y+(pl.vy||0)*.16)-this.cam.y)*k;
    }
    this.cam.zoom+=(this.zoom-this.cam.zoom)*(1-Math.exp(-4*dt));
  };

  const modules={'game/engine':function(module){module.exports={Game};}};
  const context={window:{__novaModules:modules},console,Math,Number};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/reliability-v1.8.1.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'reliability-v1.8.1.js'});
  const module={exports:{}};
  modules['game/engine'](module,module.exports,()=>{throw new Error('unexpected require');});
  return {context,Game:module.exports.Game,src};
}

function tank(id,cls,extra={}){
  return Object.assign({id,cls,kind:'tank',x:0,y:0,vx:0,vy:0,hp:100,maxHp:100,alive:true,isPlayer:false},extra);
}

test('Integrity Pass publishes v1.8.1 as presentation-only reliability work',()=>{
  const {context,src}=loadReliability();
  assert.equal(context.window.__NOVA_RELIABILITY_RELEASE__.version,'1.8.1');
  assert.equal(context.window.__NOVA_RELIABILITY_RELEASE__.codename,'Integrity Pass');
  assert.equal(/damageTank\s*=|dmgMult\s*=|weaponRange\s*=|bulletSpeed\s*=/.test(src),false,'camera reliability must not smuggle in combat buffs');
});

test('Controller command nodes outside useful view request a wider tactical frame',()=>{
  const {context}=loadReliability();
  const pl=tank(1,'carrier',{isPlayer:true,__novaSwarm:{active:true,wasActive:true,nodeX:650,nodeY:0,power:1,target:null,targetId:-1}});
  const g={w:360,h:640,time:10,__novaTacticalCameraActive:false,drones:[],tanks:[pl],player:pl,getTank(id){return this.tanks.find(t=>t.id===id)||null;}};
  const frame=context.window.__NOVA_RELIABILITY_TEST__.frameFor(g,pl,.56);
  assert.equal(frame.active,true);
  assert.equal(frame.kind,'command');
  assert.ok(frame.zoom<.56,`expected zoom-out, got ${frame.zoom}`);
  assert.equal(frame.x,325);
});

test('Sniper remote contact takes framing priority, then falls back to the Forward Observer',()=>{
  const {context}=loadReliability();
  const pl=tank(1,'marksman',{isPlayer:true,__novaSpotterContactId:2,__novaSpotterContactUntil:20,__novaSpotterDroneId:9});
  const target=tank(2,'guard',{x:980,y:80});
  const spot={id:9,ownerId:1,__novaSpotter:true,x:620,y:-120,hp:30,alive:true};
  const g={w:420,h:700,time:10,__novaTacticalCameraActive:false,drones:[spot],tanks:[pl,target],player:pl,getTank(id){return this.tanks.find(t=>t.id===id)||null;}};
  let focus=context.window.__NOVA_RELIABILITY_TEST__.tacticalFocus(g,pl);
  assert.equal(focus.kind,'contact');assert.equal(focus.x,980);
  pl.__novaSpotterContactUntil=9;
  focus=context.window.__NOVA_RELIABILITY_TEST__.tacticalFocus(g,pl);
  assert.equal(focus.kind,'spotter');assert.equal(focus.x,620);
});

test('desktop pointer projection uses the zoom actually rendered and restores native zoom after simulation',()=>{
  const {Game}=loadReliability();
  const g=new Game(),pl=tank(1,'marksman',{isPlayer:true});
  g.player=pl;g.tanks=[pl];g.input.mouseActive=true;g.input.mouseX=300;
  g.__novaBaseZoom=.56;g.zoom=.56;g.cam.zoom=.40;
  const expected=120/.40;
  g.update(.016);
  assert.equal(g.lastProjectionZoom,.40,'base update should see rendered tactical zoom');
  assert.ok(Math.abs(g.lastWorldX-expected)<1e-9,`pointer ray drifted: ${g.lastWorldX} vs ${expected}`);
  assert.equal(g.zoom,.56,'native device/class zoom must be restored immediately');
});

test('invalid tactical state heals locally instead of contaminating the run',()=>{
  const {context}=loadReliability();
  const pl=tank(1,'carrier',{isPlayer:true,__novaSwarm:{active:true,wasActive:true,nodeX:NaN,nodeY:Infinity,power:NaN,target:{kind:'tank',alive:false,hp:0},targetId:4}});
  const g={cam:{x:NaN,y:Infinity,zoom:NaN,shake:0},zoom:.56,__novaBaseZoom:.56,time:10,drones:[],tanks:[pl],player:pl,getTank(){return null;}};
  context.window.__NOVA_RELIABILITY_TEST__.repairTacticalState(g,pl);
  assert.equal(g.cam.x,0);assert.equal(g.cam.y,0);assert.equal(g.cam.zoom,.56);
  assert.equal(pl.__novaSwarm.nodeX,0);assert.equal(pl.__novaSwarm.nodeY,0);
  assert.equal(pl.__novaSwarm.active,false);assert.equal(pl.__novaSwarm.target,null);assert.equal(pl.__novaSwarm.targetId,-1);
  assert.equal(pl.__novaSwarm.power,0);
});

test('dead or expired sniper contacts are cleared before camera logic can chase stale coordinates',()=>{
  const {context}=loadReliability();
  const pl=tank(1,'marksman',{isPlayer:true,__novaSpotterContactId:2,__novaSpotterContactUntil:20,__novaSpotterDroneId:-1});
  const dead=tank(2,'guard',{x:900,alive:false,hp:0});
  const g={cam:{x:0,y:0,zoom:.56,shake:0},zoom:.56,__novaBaseZoom:.56,time:10,drones:[],tanks:[pl,dead],player:pl,getTank(id){return this.tanks.find(t=>t.id===id)||null;}};
  context.window.__NOVA_RELIABILITY_TEST__.repairTacticalState(g,pl);
  assert.equal(pl.__novaSpotterContactId,-1);assert.equal(pl.__novaSpotterContactUntil,0);
});
