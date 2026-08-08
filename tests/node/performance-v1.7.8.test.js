const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadLayer(){
  class SHash{
    constructor(){this.cell=180;this.map=new Map();}
    clear(){this.map.clear();}
    insert(e){const cx=Math.floor(e.x/this.cell)+2000,cy=Math.floor(e.y/this.cell)+2000,k=cx*10000+cy;let a=this.map.get(k);if(!a){a=[];this.map.set(k,a);}a.push(e);}
    query(x,y,r,out){out.length=0;const minx=Math.floor((x-r)/this.cell)+2000,maxx=Math.floor((x+r)/this.cell)+2000,miny=Math.floor((y-r)/this.cell)+2000,maxy=Math.floor((y+r)/this.cell)+2000;for(let cx=minx;cx<=maxx;cx++)for(let cy=miny;cy<=maxy;cy++){const a=this.map.get(cx*10000+cy);if(a)for(const e of a)out.push(e);}}
  }
  class Input{
    constructor(){this.move={active:false,ox:0,oy:0,dx:0,dy:0};this.aim={active:false,ox:0,oy:0,dx:0,dy:0};this.keyboard={up:false,down:false,left:false,right:false};this.onStickChange=null;this.canvas=null;}
    moveVec(){return{x:0,y:0};}
    aimVec(){return null;}
    stickState(kind){return kind==='move'?this.move:this.aim;}
    emit(kind){if(this.onStickChange)this.onStickChange(kind,this.stickState(kind));}
    attach(canvas){this.canvas=canvas;}
    detach(){this.canvas=null;}
  }
  class Game{
    constructor(){this.hash=new SHash();this.shapes=[];this.nextId=1;this.spawnShape('a',0,0);this.spawnShape('b',100,0);}
    spawnShape(type,x=0,y=0){this.shapes.push({id:this.nextId++,kind:'shape',type,x,y,hp:10});}
    killShape(s){const i=this.shapes.indexOf(s);if(i>=0)this.shapes.splice(i,1);}
    getShape(id){return this.shapes.find(s=>s.id===id)||null;}
    nearestShape(x,y,max){let best=null,bd=max*max;for(const s of this.shapes){const dx=x-s.x,dy=y-s.y,q=dx*dx+dy*dy;if(q<bd){bd=q;best=s;}}return best;}
    redeploy(){this.shapes=[];this.spawnShape('c',20,20);}
  }
  const modules={
    'game/input':(module)=>{module.exports={Input};},
    'game/engine':(module)=>{module.exports={Game};},
  };
  const context={window:{__novaModules:modules},console,Math,Map,document:undefined,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},ResizeObserver:undefined};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/performance-v1.7.8.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'performance-v1.7.8.js'});
  const cache={};
  function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,()=>({}));return m.exports;}
  return {context,Game:load('game/engine').Game,Input:load('game/input').Input};
}

test('Zero Churn publishes v1.7.8',()=>{
  const {context}=loadLayer();
  assert.equal(context.window.__NOVA_PERFORMANCE_2_RELEASE__.version,'1.7.8');
  assert.equal(context.window.__NOVA_PERFORMANCE_2_RELEASE__.codename,'Zero Churn');
});

test('spatial hash buckets survive clear/rebuild cycles instead of reallocating',()=>{
  const {Game}=loadLayer(),g=new Game(),h=g.hash;
  const a={id:9,kind:'shape',x:10,y:10,hp:1},b={id:10,kind:'tank',x:25,y:20};
  h.insert(a);h.insert(b);
  const key=(Math.floor(a.x/h.cell)+2000)*10000+(Math.floor(a.y/h.cell)+2000),bucket=h.map.get(key),created=h.__novaBucketCreates;
  assert.ok(bucket);assert.equal(bucket.length,2);
  h.clear();assert.equal(bucket.length,0);assert.equal(h.map.get(key),bucket,'bucket identity must remain stable');
  h.insert(a);assert.equal(h.map.get(key),bucket);assert.equal(h.__novaBucketCreates,created,'same cell must not allocate another bucket');
});

test('shape id map stays synchronized through spawn, kill and redeploy',()=>{
  const {Game}=loadLayer(),g=new Game();
  assert.equal(g.getShape(1),g.shapes[0]);
  g.spawnShape('x',40,40);const spawned=g.shapes[g.shapes.length-1];assert.equal(g.getShape(spawned.id),spawned);
  g.killShape(spawned);assert.equal(g.getShape(spawned.id),null);
  const oldId=g.shapes[0].id;g.redeploy();assert.equal(g.getShape(oldId),null);assert.equal(g.getShape(g.shapes[0].id),g.shapes[0]);
});

test('nearestShape uses the exact spatial hash result after the hash is ready',()=>{
  const {Game}=loadLayer(),g=new Game();
  g.shapes=[];g.shapeById.clear();g.spawnShape('far',150,0);g.spawnShape('near',35,0);
  g.hash.clear();for(const s of g.shapes)g.hash.insert(s);
  assert.equal(g.nearestShape(0,0,200).type,'near');
  assert.equal(g.nearestShape(0,0,20),null);
});

test('movement and aim vectors reuse object identity without changing values',()=>{
  const {Input}=loadLayer(),i=new Input();
  i.move.active=true;i.move.dx=32;i.move.dy=0;
  const m1=i.moveVec(),m2=i.moveVec();assert.equal(m1,m2);assert.equal(m1.x,1);assert.equal(m1.y,0);
  i.aim.active=true;i.aim.dx=0;i.aim.dy=20;
  const a1=i.aimVec(m1),a2=i.aimVec(m1);assert.equal(a1,a2);assert.equal(a1.x,0);assert.equal(a1.y,1);
});

test('continuous pointer movement no longer emits React updates while active',()=>{
  const {Input}=loadLayer(),i=new Input();let calls=0;i.onStickChange=()=>calls++;
  i.move.active=true;i.emit('move');assert.equal(calls,1,'activation must mount the stick layer');
  for(let n=0;n<40;n++){i.move.dx=n;i.emit('move');}
  assert.equal(calls,1,'position changes are painted directly, not sent through React state');
  i.move.active=false;i.emit('move');assert.equal(calls,2,'deactivation must unmount the stick layer');
});
