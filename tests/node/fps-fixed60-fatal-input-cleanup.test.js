'use strict';
// Research-only: fatal RAF failures must never strand production DOM input.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createFixedStepBrowserPilot:sourcePilot}=
  require('../research/fixed-step-raf-owner.cjs');

function target(){
 const listeners=new Map();
 return {
  listeners,
  addEventListener(type,fn){const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a)},
  removeEventListener(type,fn){const a=listeners.get(type)||[];listeners.set(type,a.filter(x=>x!==fn))},
  count(){return [...listeners.values()].reduce((n,a)=>n+a.length,0)}
 };
}
function run(createPilot,mode){
 const canvas=target(),win=target(),doc=target();
 doc.hidden=false;
 const input={
  canvas,attached:true,attachCount:0,detachCount:0,
  attach(c){this.canvas=c;this.attached=true;this.attachCount++},
  detach(){this.canvas=null;this.attached=false;this.detachCount++},
  pd(){},pm(){},pu(){},kd(){},ku(){},releaseAll(){}
 };
 const game={input,canvas,raf:null,paused:false,sfx:{startMusic(){}},
  start(){},setPaused(){},destroy(){},update(){if(mode==='update')throw Error('update failure')},
  w:100,h:100};
 const original={start:game.start,destroy:game.destroy,setPaused:game.setPaused};
 let now=1000,next=0,callback=null;
 const pilot=createPilot(game,{window:win,document:doc,canvas,
  clock:{now:()=>now},request:fn=>(callback=fn,++next),
  cancel(){if(mode==='cancel')throw Error('cancel failure')},
  render(){if(mode!=='update')throw Error('render failure')}
 });
 assert.equal(input.attached,false);
 assert.ok(win.count()>0 && canvas.count()>0);
 pilot.start();
 now=1034;
 let primary;
 try{callback(now)}catch(error){primary=error}
 assert.ok(primary,'fatal callback must surface its original failure');
 assert.equal(primary.message,mode==='update'?'update failure':'render failure');
 if(mode==='cancel')assert.equal(primary.cleanupError?.message,'cancel failure');
 assert.equal(pilot.owner.started,false);
 assert.equal(pilot.capture.active,false);
 assert.equal(input.attached,true);
 assert.equal(input.canvas,canvas);
 assert.equal(input.attachCount,1);
 assert.equal(win.count()+doc.count()+canvas.count(),0);
 assert.equal(game.start,original.start);
 assert.equal(game.destroy,original.destroy);
 assert.equal(game.setPaused,original.setPaused);
 pilot.stop(); // idempotent after fatal cleanup
 assert.equal(input.attachCount,1);
}
test('fatal update/render/cancel release DOM input in source and browser bundle',()=>{
 const bundle=fs.readFileSync(path.resolve(__dirname,
  '../../nova-updates/fixed60-research-browser.js'),'utf8');
 const win={};vm.runInNewContext(bundle,{window:win},{timeout:1000});
 const browserPilot=win.__novaFixed60Research.createFixedStepBrowserPilot;
 for(const pilot of [sourcePilot,browserPilot])
  for(const mode of ['update','render','cancel'])run(pilot,mode);
});
