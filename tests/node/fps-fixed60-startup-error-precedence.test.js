'use strict';
// Research-only startup exception precedence: never hide the initiating
// music/RAF failure behind a secondary input cleanup exception.
const test=require('node:test');
const assert=require('node:assert/strict');
const {FixedStepRafOwner,createFixedStepBrowserPilot}=
  require('../research/fixed-step-raf-owner.cjs');

function emitter(){
  const listeners=new Map();
  return {
    addEventListener(type,fn){
      if(!listeners.has(type))listeners.set(type,new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
    count(){return [...listeners.values()].reduce((n,set)=>n+set.size,0)}
  };
}

test('startup music error remains primary if input reset also fails',()=>{
  const input={};
  const game={input,raf:null,sfx:{startMusic(){throw Error('music startup failed')}},
    update(){},start(){},destroy(){},setPaused(){}};
  const originals={start:game.start,destroy:game.destroy,setPaused:game.setPaused};
  let resets=0;
  const timeline={input,reset(){if(++resets===2)throw Error('reset failed')},
    consumeThrough(){}};
  const owner=new FixedStepRafOwner(game,timeline,{timeline,startMs:1000},{
    now:()=>1000,request:()=>7,cancel(){},render(){}});
  let caught;
  try{owner.start()}catch(error){caught=error}
  assert.match(caught?.message||'',/music startup failed/);
  assert.match(caught.cleanupError?.message||'',/reset failed/);
  assert.equal(owner.started,false);
  for(const name of Object.keys(originals))assert.equal(game[name],originals[name]);
});

test('browser pilot startup error remains primary if capture cleanup fails',()=>{
  const win=emitter(),doc=emitter(),canvas=emitter();
  const input={canvas,keyboard:{},move:{},aim:{},stickId:{move:-1,aim:-1},
    firing:false,abilityQueued:false,autofire:false,
    kd(){},ku(){},pd(){},pm(){},pu(){},
    attach(c){this.canvas=c;win.addEventListener('keydown',this.kd)},
    detach(){win.removeEventListener('keydown',this.kd);this.canvas=null}};
  input.attach(canvas);
  const game={input,raf:null,paused:false,sfx:{startMusic(){}},
    start(){},destroy(){},setPaused(){},update(){},w:320,h:568};
  const originals={start:game.start,destroy:game.destroy,setPaused:game.setPaused};
  const pilot=createFixedStepBrowserPilot(game,{window:win,document:doc,canvas,
    clock:{now:()=>1000,timeOrigin:1793560000000},
    request(){throw Error('RAF startup failed')},cancel(){},render(){}});
  const originalDetach=pilot.capture.detach.bind(pilot.capture);
  pilot.capture.detach=()=>{
    originalDetach();
    throw Error('capture teardown failed');
  };
  let caught;
  try{pilot.start()}catch(error){caught=error}
  assert.match(caught?.message||'',/RAF startup failed/);
  assert.match(caught.cleanupError?.message||'',/capture teardown failed/);
  assert.equal(pilot.owner.started,false);
  assert.equal(pilot.capture.active,false);
  assert.equal(input.canvas,canvas);
  assert.equal(win.count(),1,'production listener restored');
  assert.equal(doc.count(),0);
  assert.equal(canvas.count(),0);
  for(const name of Object.keys(originals))assert.equal(game[name],originals[name]);
});

test('initial input reset failure never leaves RAF owner marked running',()=>{
  const input={};
  const game={input,raf:null,sfx:{startMusic(){}},update(){},
    start(){},destroy(){},setPaused(){}};
  const originals={start:game.start,destroy:game.destroy,setPaused:game.setPaused};
  const timeline={input,reset(){throw Error('initial reset failed')},
    consumeThrough(){}};
  let requests=0;
  const owner=new FixedStepRafOwner(game,timeline,{timeline,startMs:1000},{
    now:()=>1000,request(){requests++;return 7},cancel(){},render(){}});
  let caught;
  try{owner.start()}catch(error){caught=error}
  assert.match(caught?.message||'',/initial reset failed/);
  assert.match(caught.cleanupError?.message||'',/initial reset failed/);
  assert.equal(owner.started,false);
  assert.equal(requests,0,'no RAF scheduled after failed initial input reset');
  for(const name of Object.keys(originals))assert.equal(game[name],originals[name]);
});

test('initial queued input replay failure cannot strand the RAF owner',()=>{
  const input={};
  const game={input,raf:null,sfx:{startMusic(){}},update(){},
    start(){},destroy(){},setPaused(){}};
  let resets=0;
  const timeline={input,reset(){resets++},
    consumeThrough(){throw Error('initial replay failed')}};
  const owner=new FixedStepRafOwner(game,timeline,{timeline,startMs:1000},{
    now:()=>1000,request:()=>7,cancel(){},render(){}});
  let caught;
  try{owner.start()}catch(error){caught=error}
  assert.match(caught?.message||'',/initial replay failed/);
  assert.equal(owner.started,false);
  assert.equal(resets,2,'cleanup reset follows failed replay');
  assert.doesNotThrow(()=>owner.stop());
});
