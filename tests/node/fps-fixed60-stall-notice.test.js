'use strict';
// Research-only: involuntary foreground touch cancellation must be legible,
// without restoring stale firing or generating notices for unrelated stalls.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function fixture({visible=true}={}){
  let now=1000;const notices=[];
  const input={touchSeen:true,stickId:{move:-1,aim:-1},
    move:{active:false},aim:{active:false},firing:false,
    __novaBlurReset(){this.stickId.move=-1;this.stickId.aim=-1;
      this.move.active=false;this.aim.active=false;this.firing=false;},
    pd(e){const stick=e.pointerId===8?'aim':'move';this.stickId[stick]=e.pointerId;this[stick].active=true;if(stick==='aim')this.firing=true;},
    pm(){},pu(){this.__novaBlurReset()},kd(){},ku(){}};
  const game={input,raf:null,paused:false,sfx:{startMusic(){}},
    start(){},destroy(){},setPaused(v){this.paused=v},
    update(){},toast(...args){notices.push(args)}};
  const timeline=new ChronologicalInput(input);
  const bridge={timeline,startMs:1000};
  const owner=new FixedStepRafOwner(game,timeline,bridge,{
    now:()=>now,request:()=>1,cancel:()=>{},render:()=>{},
    isVisible:()=>visible});
  return {input,game,timeline,owner,notices,
    frame(ms){now=ms;owner.frame(ms)},
    down(ms,id=7){timeline.push((ms-1000)/1000,'pointerdown',{
      pointerId:id,pointerType:'touch',clientX:100,clientY:100,button:0,buttons:1})},
    up(ms,id=7){timeline.push((ms-1000)/1000,'pointerup',{
      pointerId:id,pointerType:'touch',clientX:100,clientY:100,button:0,buttons:0})}};
}
test('only a genuine held touch reset produces one short warning',()=>{
  const s=fixture();s.owner.start();
  try{
    s.frame(1120);assert.equal(s.notices.length,0,'idle stall is silent');
    s.down(1125);s.frame(1140);
    assert.equal(s.input.move.active,true);
    s.frame(1260);
    assert.deepEqual(s.notices,[['Touch controls reset — touch again','warn']]);
    assert.equal(s.input.firing,false);
    assert.equal(s.input.stickId.move,-1);
    s.up(1265);s.frame(1280);
    assert.equal(s.notices.length,1,'late release cannot generate another warning');
    s.down(1290);s.frame(1300);
    s.frame(1420);
    assert.equal(s.notices.length,1,'8-second notice throttle survives repeated stalls');
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});
test('normal jitter, hidden document, and pause do not display a reset warning',()=>{
  const s=fixture({visible:false});s.owner.start();
  try{
    s.down(1005);s.frame(1017);s.frame(1097);
    assert.equal(s.input.move.active,true,'80ms jitter retains ownership');
    s.frame(1217);assert.equal(s.notices.length,0,'hidden document stays silent');
    assert.equal(s.input.firing,false);
    s.game.setPaused(true);
    s.frame(1337);assert.equal(s.notices.length,0);
  }finally{s.owner.stop()}
});
test('mouse-only input does not create a touch reset warning',()=>{
  const s=fixture();s.input.touchSeen=false;s.owner.start();
  try{
    s.down(1005);s.frame(1017);s.frame(1137);
    assert.equal(s.notices.length,0);
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});

test('composed 49-overlay Game emits warning at genuine held touch stall',()=>{
  process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
  const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
  const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  let now=1000;const notices=[];g.toast=(...args)=>notices.push(args);
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,request:()=>1,cancel:()=>{},render:()=>{}
  });
  function event(type,ms,x=100,id=11){
    now=ms;
    return bridge.capture({type,timeStamp:ms,pointerId:id,pointerType:'touch',
      clientX:x,clientY:200,button:0,buttons:type==='pointerup'?0:1,
      target:{tagName:'CANVAS',closest:()=>null}});
  }
  try{
    owner.start();
    event('pointerdown',1005);now=1017;owner.frame(now);
    assert.equal(g.input.stickId.move,11);
    assert.equal(g.input.move.active,true);
    now=1137;owner.frame(now);
    assert.deepEqual(notices,[['Touch controls reset — touch again','warn']]);
    assert.equal(g.input.stickId.move,-1);
    assert.equal(g.input.firing,false);
    event('pointerup',1140);now=1154;owner.frame(now);
    assert.equal(g.input.stickId.move,-1);
    assert.equal(notices.length,1);
  }finally{owner.stop();g.destroy()}
});

test('queued intentional release before stalled RAF suppresses false reset warning',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    assert.equal(s.input.move.active,true);
    s.up(1020); // Captured before the delayed frame, not yet consumed.
    s.frame(1137);
    assert.equal(s.notices.length,0);
    assert.equal(s.input.firing,false);
    assert.equal(s.input.stickId.move,-1);
  }finally{s.owner.stop()}
});
test('queued pointer cancellation also suppresses false reset warning',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    s.timeline.push(.020,'pointercancel',{pointerId:7,pointerType:'touch'});
    s.frame(1137);
    assert.equal(s.notices.length,0);
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});

test('one queued stick release does not conceal another involuntary touch reset',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005,7);s.down(1006,8);s.frame(1017);
    assert.equal(s.input.stickId.aim,8);
    s.up(1020,7);
    s.frame(1137);
    assert.equal(s.notices.length,1,'unreleased aim still needs reacquisition');
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});

test('fresh down after queued release remains an involuntary stall reset',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    s.up(1020);s.down(1025);
    s.frame(1137);
    assert.equal(s.notices.length,1,'latest genuine down must not be hidden by earlier up');
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});

test('game-over state does not display a combat touch reset notice',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    s.game.status='dead';
    s.frame(1137);
    assert.equal(s.notices.length,0);
    assert.equal(s.input.move.active,false,'safety reset still applies');
  }finally{s.owner.stop()}
});

test('mouse pointerup sharing a touch id cannot conceal involuntary touch reset',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005,7);s.frame(1017);
    assert.equal(s.input.move.active,true);
    // Pointer IDs are only meaningful within their pointer type. A mouse
    // release with the same numeric id must not count as a touch release.
    s.timeline.push(.020,'pointerup',{pointerId:7,pointerType:'mouse'});
    s.frame(1137);
    assert.equal(s.notices.length,1,'held touch was still involuntarily reset');
    assert.equal(s.input.stickId.move,-1);
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});
test('malformed queued pointer metadata cannot crash foreground recovery',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    s.timeline.events.push({at:.020,kind:'pointerup',data:null});
    s.frame(1137);
    assert.equal(s.notices.length,1);
    assert.equal(s.input.move.active,false);
  }finally{s.owner.stop()}
});

test('composed Game warns when queued mouse release shares held touch id',()=>{
  process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
  const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
  const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  let now=1000;const notices=[];g.toast=(...args)=>notices.push(args);
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,request:()=>1,cancel:()=>{},render:()=>{}
  });
  const event=(type,ms,pointerType)=>{
    now=ms;
    return bridge.capture({type,timeStamp:ms,pointerId:11,pointerType,
      clientX:100,clientY:200,button:0,buttons:type==='pointerup'?0:1,
      target:{tagName:'CANVAS',closest:()=>null}});
  };
  try{
    owner.start();
    assert.equal(event('pointerdown',1005,'touch'),true);
    now=1017;owner.frame(now);
    assert.equal(g.input.stickId.move,11);
    assert.equal(event('pointerup',1020,'mouse'),true);
    now=1137;owner.frame(now);
    assert.deepEqual(notices,[['Touch controls reset — touch again','warn']]);
    assert.equal(g.input.stickId.move,-1);
    assert.equal(g.input.firing,false);
  }finally{owner.stop();g.destroy()}
});

test('pen-owned stick release suppresses false reset notice, unlike mouse release',()=>{
  for(const kind of ['pointerup','pointercancel']){
    const s=fixture();s.owner.start();
    try{
      s.timeline.push(.005,'pointerdown',{pointerId:7,pointerType:'pen',
        clientX:100,clientY:100,button:0,buttons:1});
      s.frame(1017);
      assert.equal(s.input.move.active,true);
      s.timeline.push(.020,kind,{pointerId:7,pointerType:'pen'});
      s.frame(1137);
      assert.equal(s.notices.length,0,'genuine pen release is intentional');
      assert.equal(s.input.move.active,false);
    }finally{s.owner.stop()}
  }
});

test('unknown non-mouse pointer type follows production stick release semantics',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    s.timeline.push(.020,'pointerup',{pointerId:7,pointerType:''});
    s.frame(1137);
    assert.equal(s.notices.length,0,'Input.pu releases any non-mouse pointer');
    assert.equal(s.input.move.active,false);
  }finally{s.owner.stop()}
});
test('missing pointer type cannot masquerade as a confirmed touch release',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    s.timeline.push(.020,'pointerup',{pointerId:7});
    s.frame(1137);
    assert.equal(s.notices.length,1,'incomplete metadata is not proof of release');
    assert.equal(s.input.move.active,false);
  }finally{s.owner.stop()}
});


test('queued blur before a delayed visible RAF suppresses the touch reset warning',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005,7);s.down(1006,8);s.frame(1017);
    assert.equal(s.input.move.active,true);
    assert.equal(s.input.aim.active,true);
    s.timeline.push(.020,'blur',{});
    s.frame(1137);
    assert.equal(s.notices.length,0,'captured lifecycle blur already explains the reset');
    assert.equal(s.input.stickId.move,-1);
    assert.equal(s.input.stickId.aim,-1);
    assert.equal(s.input.firing,false,'blur cannot leave phantom firing');
  }finally{s.owner.stop()}
});

test('exact 100ms foreground gap is not classified as a long stall',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    s.frame(1117);
    assert.equal(s.owner.droppedFrames,1,
      'bounded backlog may drop old ticks even without long-stall reset');
    assert.equal(s.input.move.active,true,
      'the 100ms boundary must not silently revoke an owned touch');
    assert.equal(s.notices.length,0);
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});


test('blur then fresh touch down is reported when the same stall discards it',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    s.timeline.push(.020,'blur',{});
    s.down(1025);
    s.frame(1137);
    assert.deepEqual(s.notices,[['Touch controls reset — touch again','warn']]);
    assert.equal(s.input.stickId.move,-1);
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});

test('blur then new touch release stays silent and cannot leave phantom fire',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005);s.frame(1017);
    s.timeline.push(.020,'blur',{});
    s.down(1025,9);
    s.up(1030,9);
    s.frame(1137);
    assert.equal(s.notices.length,0);
    assert.equal(s.input.move.active,false);
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});

test('post-blur new pointer ID still receives a reset warning',()=>{
  const s=fixture();s.owner.start();
  try{
    s.down(1005,7);s.frame(1017);
    s.timeline.push(.020,'blur',{});
    s.down(1025,9);
    s.frame(1137);
    assert.equal(s.notices.length,1,'fresh touch must not be hidden by old blur');
    assert.equal(s.input.stickId.move,-1);
  }finally{s.owner.stop()}
});


test('post-blur UI or mouse down cannot masquerade as a held touch',()=>{
  for(const data of [
    {pointerId:9,pointerType:'touch',targetIsUI:true},
    {pointerId:9,pointerType:'mouse',targetIsUI:false}
  ]){
    const s=fixture();s.owner.start();
    try{
      s.down(1005);s.frame(1017);
      s.timeline.push(.020,'blur',{});
      s.timeline.push(.025,'pointerdown',data);
      s.frame(1137);
      assert.equal(s.notices.length,0,'non-stick input must not produce a reset warning');
      assert.equal(s.input.move.active,false);
      assert.equal(s.input.firing,false);
    }finally{s.owner.stop()}
  }
});


test('queued first touch lost to foreground stall is explicitly reported',()=>{
  const s=fixture();s.owner.start();
  try{
    s.frame(1017);
    s.down(1020,7); // Captured by DOM, not yet sampled by Game.
    assert.equal(s.input.stickId.move,-1);
    s.frame(1137);
    assert.deepEqual(s.notices,[['Touch controls reset — touch again','warn']]);
    assert.equal(s.input.stickId.move,-1,'stall must not resurrect queued input');
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});

test('unowned queued UI, mouse, release, or blur is not a lost touch',()=>{
  const cases=[
    [{kind:'pointerdown',data:{pointerId:7,pointerType:'touch',targetIsUI:true}}],
    [{kind:'pointerdown',data:{pointerId:1,pointerType:'mouse'}}],
    [{kind:'pointerdown',data:{pointerId:7,pointerType:'touch'}},
     {kind:'pointerup',data:{pointerId:7,pointerType:'touch'}}],
    [{kind:'pointerdown',data:{pointerId:7,pointerType:'touch'}},
     {kind:'blur',data:{}}]
  ];
  for(const events of cases){
    const s=fixture();s.owner.start();
    try{
      s.frame(1017);
      let at=.020;
      for(const event of events){s.timeline.push(at,event.kind,event.data);at+=.005;}
      s.frame(1137);
      assert.equal(s.notices.length,0,'no held touch remains after queued edges');
      assert.equal(s.input.stickId.move,-1);
      assert.equal(s.input.firing,false);
    }finally{s.owner.stop()}
  }
});


test('composed Game warns when a first touch is queued before a stalled RAF',()=>{
  process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
  const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
  const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  let now=1000;const notices=[];g.toast=(...args)=>notices.push(args);
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,request:()=>1,cancel:()=>{},render:()=>{}
  });
  try{
    owner.start();
    now=1017;owner.frame(now);
    assert.equal(g.input.stickId.move,-1);
    now=1020;
    assert.equal(bridge.capture({type:'pointerdown',timeStamp:1020,
      pointerId:11,pointerType:'touch',clientX:100,clientY:200,
      button:0,buttons:1,target:{tagName:'CANVAS',closest:()=>null}}),true);
    assert.equal(g.input.stickId.move,-1,'input must still await its simulation tick');
    now=1137;owner.frame(now);
    assert.equal(owner.droppedFrames,1);
    assert.deepEqual(notices,[['Touch controls reset — touch again','warn']]);
    assert.equal(g.input.stickId.move,-1,'never resurrect discarded touch');
    assert.equal(g.input.firing,false);
  }finally{owner.stop();g.destroy()}
});


test('ignored third touch does not falsely claim a stick reset after intentional release',()=>{
  const s=fixture();s.game.canvas={getBoundingClientRect:()=>({left:0,width:800})};
  // Match shipping Input.pd: the left half has one owner, and a second
  // left-side press is ignored even when the aim stick is unoccupied.
  s.input.pd=function(e){
    const stick=e.clientX<360?'move':'aim';
    if(this.stickId[stick]!==-1)return;
    this.stickId[stick]=e.pointerId;this[stick].active=true;
    if(stick==='aim')this.firing=true;
  };
  s.owner.start();
  try{
    s.down(1005,7);s.frame(1017);
    assert.equal(s.input.stickId.move,7);
    s.down(1020,9); // Same left-side zone: Input would ignore this press.
    s.up(1025,7);   // Actual owner intentionally released before the stall.
    s.frame(1137);
    assert.equal(s.notices.length,0,
      'ignored touch must not be reported as a cancelled stick');
    assert.equal(s.input.stickId.move,-1);
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});


test('composed Game ignores same-side queued press before intentional owner release',()=>{
  process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
  const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
  const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  const rect=()=>({left:0,top:0,width:800,height:600});
  g.canvas.getBoundingClientRect=rect;
  g.input.canvas.getBoundingClientRect=rect;
  let now=1000;const notices=[];g.toast=(...args)=>notices.push(args);
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,request:()=>1,cancel:()=>{},render:()=>{}
  });
  const event=(type,ms,id,x=100)=>{
    now=ms;
    return bridge.capture({type,timeStamp:ms,pointerId:id,pointerType:'touch',
      clientX:x,clientY:200,button:0,buttons:type==='pointerup'?0:1,
      target:{tagName:'CANVAS',closest:()=>null}});
  };
  try{
    owner.start();
    assert.equal(event('pointerdown',1005,11),true);
    now=1017;owner.frame(now);
    assert.equal(g.input.stickId.move,11);
    assert.equal(event('pointerdown',1020,12),true);
    assert.equal(event('pointerup',1025,11),true);
    now=1137;owner.frame(now);
    assert.equal(notices.length,0,'ignored same-side touch is not a lost control');
    assert.equal(g.input.stickId.move,-1);
    assert.equal(g.input.firing,false);
  }finally{owner.stop();g.destroy()}
});
