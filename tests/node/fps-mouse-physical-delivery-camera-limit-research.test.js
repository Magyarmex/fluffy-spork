'use strict';
// #641 RESEARCH-ONLY negative control: DOM-time camera projection is not
// necessarily physical-event-time camera projection when delivery is delayed.
// This does NOT install an input feature or change the playable game.
const test=require('node:test');
const assert=require('node:assert/strict');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');

function scenario(delayed) {
  let now=1000,cameraX=0;
  const events=[];
  const timeline={sampled:-Infinity,last:-Infinity,
    push(at,kind,data){this.last=at;events.push({at,kind,data});return true;}};
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now},{
    captureMouseWorld:e=>({x:cameraX+e.clientX,y:e.clientY})
  });
  const event=(type,timeStamp,buttons)=>({
    type,timeStamp,pointerType:'mouse',pointerId:1,button:0,buttons,
    clientX:200,clientY:40,target:{closest:()=>null}
  });
  now=1100;
  assert.equal(bridge.capture(event('pointerdown',1100,1)),true);
  // The physical pointerup occurs at t=1130 while the camera is still x=0.
  // In the delayed arm the browser dispatches that event at t=1200,
  // after the camera has moved 100 world units.
  now=delayed?1200:1130;
  cameraX=delayed?100:0;
  assert.equal(bridge.capture(event('pointerup',1130,0)),true);
  assert.equal(bridge.mouseProjectionFailures,0);
  assert.equal(events.length,2);
  const up=events[1];
  assert.equal(up.kind,'pointerup');
  assert.equal(up.data.__novaTimestampTrusted,true);
  assert.equal(up.data.__novaPhysicalTimestampExact,true);
  assert.ok(Math.abs(up.data.__novaOriginalAt-.13)<1e-9);
  assert.ok(Math.abs(up.at-.13)<1e-9);
  return {projectedX:up.data.__novaCaptureWorld.x,
    physicalReleaseSec:up.data.__novaOriginalAt,
    deliveryMs:now,projectionFailures:bridge.mouseProjectionFailures};
}

test('a physically old mouse release can be projected using a newer delivery-time camera',()=>{
  const immediate=scenario(false),delayed=scenario(true);
  assert.equal(immediate.projectedX,200);
  assert.equal(delayed.projectedX,300);
  assert.equal(delayed.projectedX-immediate.projectedX,100,
    'delivery-time capture cannot certify physical-time world bearing');
  assert.equal(delayed.physicalReleaseSec,immediate.physicalReleaseSec,
    'trusted event chronology alone does not reconstruct old camera geometry');
  console.log('MOUSE_DELIVERY_CAMERA_LIMIT_RESEARCH '+JSON.stringify({
    immediate,delayed,physicalWorldTargetX:200,
    caveat:'controlled synthetic camera transition, not measured browser dispatch lag'
  }));
});

test('Controller rendered-camera easing can differ from a raw cam DOM-time projection',()=>{
  process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
  const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
  const g=bootGame();
  try{
    const i=g.input;
    g.status='playing';g.paused=false;
    Object.assign(g.cam,{x:0,y:0,zoom:1});
    Object.assign(g.player,{x:300,y:0,vx:0,vy:0,alive:true});
    g.zoom=1.5;
    g.__novaTacticalCamera=null;
    i.mouseX=600;i.mouseY=300;i.mouseActive=true;
    const rect=i.canvas.getBoundingClientRect();
    const rawX=g.cam.x+(i.mouseX-rect.left-g.w*.5)/g.cam.zoom;
    g.__novaMouseAimFrameDt=1/30;
    g.__novaMouseCenterAimPending=true;
    g.lerpAngle(0,0,.5);
    const rendered=g.__novaMouseAimCamera;
    assert.ok(rendered&&Number.isFinite(rendered.x)&&Number.isFinite(rendered.zoom),
      'actual Controller overlay must publish its rendered mouse camera');
    const renderedX=rendered.x+(i.mouseX-rect.left-g.w*.5)/rendered.zoom;
    assert.ok(Math.abs(renderedX-rawX)>1,
      'raw cam capture is not certified to match eased rendered camera');
    assert.ok(rendered.zoom>g.cam.zoom && rendered.zoom<g.zoom,
      'rendered zoom should ease between current and target zoom');
    console.log('MOUSE_RENDERED_CAMERA_PROJECTION_LIMIT_RESEARCH '+JSON.stringify({
      rawX,renderedX,rawZoom:g.cam.zoom,renderedZoom:rendered.zoom,
      caveat:'constructed camera easing; no actual browser pixel/input-to-photon validation'
    }));
  }finally{g.destroy();}
});
