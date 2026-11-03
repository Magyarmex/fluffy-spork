'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const root=path.resolve(__dirname,'../..');
function rawShell(){
 const b=fs.readdirSync(path.join(root,'nova-gz')).filter(x=>x.endsWith('.b64')).sort()
  .map(x=>fs.readFileSync(path.join(root,'nova-gz',x),'utf8')).join('').replace(/\s+/g,'');
 return zlib.gunzipSync(Buffer.from(b,'base64')).toString('utf8');
}
function methods(html){
 const start=html.indexOf('    start() {'),destroy=html.indexOf('    destroy() {',start);
 const resize=html.indexOf('    resize() {',destroy);
 assert.ok(start>=0&&destroy>start&&resize>destroy,'canonical owner methods present');
 return html.slice(start,resize);
}
function fixture(html,trigger){
 let now=0,callback=null,nextId=0;
 const canceled=[],events=[];
 const owner=methods(html);
 const start=owner.slice(owner.indexOf('    start() {')+'    start() {'.length,owner.indexOf('    destroy() {'));
 // Extract destroy body only, not any intervening method.
 const destroyBody=owner.slice(owner.indexOf('    destroy() {')+'    destroy() {'.length);
 const close=destroyBody.indexOf('\n    }');
 assert.ok(close>0);
 const make=new Function('performance','requestAnimationFrame','cancelAnimationFrame','render_1','window','document',
  'return {start(){'+start.slice(0,start.lastIndexOf('\n    }'))+'\n},destroy(){'+destroyBody.slice(0,close)+'\n}};');
 const raf=fn=>{callback=fn;return ++nextId;};
 const game=make({now:()=>now},raf,id=>canceled.push(id),
  {render:g=>{events.push('render');if(trigger==='render')g.destroy();}},
  {removeEventListener:()=>events.push('window-detach')},
  {removeEventListener:()=>events.push('document-detach')});
 Object.assign(game,{last:0,paused:false,w:800,h:600,mmTimer:0,
  sfx:{startMusic(){},dispose(){events.push('audio-dispose');}},
  input:{detach(){events.push('input-detach');}},
  update(dt){events.push('update');if(trigger==='first-update'||
    (trigger==='second-update'&&events.filter(x=>x==='update').length===2))this.destroy();},
  drawMinimap(){events.push('minimap');if(trigger==='minimap')this.destroy();}});
 game.start();
 now=70;callback(now);
 return {game,events,canceled,callback};
}
test('materializer lifecycle guards are unique and idempotent on raw and shipping paths',()=>{
 const raw=patchRafStepCap(rawShell()),shipping=patchRafStepCap(
  fs.readFileSync(path.join(root,'index.html'),'utf8'));
 assert.equal(patchRafStepCap(raw),raw);
 assert.equal(patchRafStepCap(shipping),shipping);
 for(const html of [raw,shipping]){
  assert.equal((methods(html).match(/if \(this\.__novaDestroyed\) return;/g)||[]).length,6);
  assert.equal((methods(html).match(/this\.__novaDestroyed = true;/g)||[]).length,1);
 }
});
test('production RAF stops after destruction in first update, second update, or render',()=>{
 const html=patchRafStepCap(rawShell());
 for(const trigger of ['first-update','second-update','render','minimap']){
  const {game,events,canceled,callback}=fixture(html,trigger);
  assert.equal(game.__novaDestroyed,true,trigger);
  assert.equal(events.filter(x=>x==='render').length,trigger==='render'||trigger==='minimap'?1:0,trigger);
  assert.equal(events.filter(x=>x==='minimap').length,trigger==='minimap'?1:0,trigger);
  assert.equal(events.filter(x=>x==='update').length,trigger==='first-update'?1:
   trigger==='second-update'||trigger==='render'||trigger==='minimap'?2:1,trigger);
  assert.equal(canceled.length,1,'scheduled future RAF cancelled');
  for(const type of ['input-detach','audio-dispose','window-detach','document-detach'])
   assert.equal(events.filter(x=>x===type).length,1,type);
  game.destroy();
  assert.equal(canceled.length,1,'teardown is idempotent');
  const count=events.length;callback(100);
  assert.equal(events.length,count,'stale queued callback must do nothing');
 }
});
test('normal production RAF remains active and draws minimap',()=>{
 const {game,events}=fixture(patchRafStepCap(rawShell()),'none');
 assert.equal(game.__novaDestroyed,undefined);
 assert.ok(events.includes('update'));
 assert.ok(events.includes('render'));
 assert.ok(events.includes('minimap'));
});

test('synchronous game-over teardown exits actual Game.update before AI and physics',()=>{
 const html=patchRafStepCap(rawShell());
 const start=html.indexOf('    update(dt) {');
 assert.ok(start>0,'canonical Game.update owner present');
 const open=html.indexOf('{',start),close=html.indexOf('\n    }',open);
 assert.ok(close>open);
 const update=new Function('classes_1','storage_1',
  'return function update(dt){'+html.slice(open+1,close)+'\n};')(
   {CLASSES:{scout:{name:'Scout'}}},{lsSet(){}});
 let fired=0;
 const game={time:5,status:'dying',gameOverSent:false,dyingAt:0,
  player:{score:10,kills:0,level:1,cls:'scout'},best:100,
  cb:{event(){fired++;game.__novaDestroyed=true;}}};
 Object.defineProperty(game,'tanks',{get(){throw Error('AI continued after teardown');}});
 update.call(game,1/30);
 assert.equal(fired,1);
 assert.equal(game.status,'dead');
 assert.equal(game.__novaDestroyed,true);
});
