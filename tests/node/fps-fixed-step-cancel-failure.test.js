'use strict';
// A hostile RAF host must not strand the real Game behind research wrappers
// when cancellation itself throws during a stop or destruction.
const test=require('node:test');
const assert=require('node:assert/strict');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');

function scene(inherited=false){
  const input={};
  const proto={start(){return 'production-start'},destroy(){return 'destroyed'},
    setPaused(v){this.paused=v}};
  const game=Object.create(inherited?proto:Object.prototype);
  if(!inherited)Object.assign(game,proto);
  Object.assign(game,{input,paused:false,raf:null,sfx:{startMusic(){}},
    update(){},w:800,h:600});
  const original={start:game.start,destroy:game.destroy,setPaused:game.setPaused};
  const own={start:Object.hasOwn(game,'start'),destroy:Object.hasOwn(game,'destroy'),
    setPaused:Object.hasOwn(game,'setPaused')};
  const timeline={input,reset(){},consumeThrough(){}};
  const owner=new FixedStepRafOwner(game,timeline,{timeline,startMs:1000},{
    now:()=>1000,request:()=>19,cancel:()=>{throw Error('RAF cancel unavailable')},
    render:()=>{}
  });
  return {game,owner,original,own};
}
for(const inherited of [false,true]){
  test('failed RAF cancellation still releases '+(inherited?'inherited':'own')+' lifecycle owners',()=>{
    const {game,owner,original,own}=scene(inherited);
    owner.start();
    assert.notEqual(game.start,original.start);
    assert.throws(()=>owner.stop(),/RAF cancel unavailable/);
    assert.equal(owner.started,false);
    assert.equal(owner.raf,null);
    assert.equal(owner.lagMs,0);
    for(const name of ['start','destroy','setPaused']){
      assert.equal(game[name],original[name],name+' original restored');
      assert.equal(Object.hasOwn(game,name),own[name],name+' ownership restored');
    }
    assert.equal(game.start(),'production-start');
    assert.doesNotThrow(()=>owner.stop(),'second stop is idempotent');
  });
}
test('destroy path invokes core destruction even if cancel throws',()=>{
  const {game,owner}=scene();
  let destroyed=0;
  const coreDestroy=game.destroy;
  game.destroy=function(...args){destroyed++;return coreDestroy.apply(this,args)};
  // Constructor snapshots lifecycle owners, so create a fresh owner after
  // instrumentation rather than mutating a live owner under test.
  const input=game.input;
  const timeline={input,reset(){},consumeThrough(){}};
  const instrumented=new FixedStepRafOwner(game,timeline,{timeline,startMs:1000},{
    now:()=>1000,request:()=>19,cancel:()=>{throw Error('RAF cancel unavailable')},
    render:()=>{}
  });
  instrumented.start();
  assert.throws(()=>game.destroy(),/RAF cancel unavailable/);
  assert.equal(destroyed,1,'actual core Game.destroy must still run');
  assert.equal(instrumented.started,false);
  assert.equal(game.start(),'production-start');
});
