'use strict';
// Exact 49-overlay Game: Predator Doctrine may predict a visible incoming
// round, but must not dodge one whose current position is outside the
// observer's actual gameplay viewport. This preserves fair reaction timing.
const test=require('node:test');
const assert=require('node:assert/strict');
// The reusable boot fixture also contains a standalone causal test. Its explicit
// opt-out prevents importing that unrelated test into this worker process.
const previousAudioPilot=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previousAudioPilot===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previousAudioPilot;

test('composed Predator threat perception respects mobile viewport and terrain cover',()=>{
  for(const seed of [1517800,1517802]){
    withSeed(seed,()=>{
      const g=bootGame();
      const oldLos=g.hasLineOfSight;
      try{
        const t=g.player,w=g.__testWindow;
        const threat=w.__NOVA_PREDATOR_TEST__.threatVector;
        const fair=w.__NOVA_FAIR_ENGAGEMENT__;
        const classes=w.__novaMakeRequire('')('game/classes').CLASSES;
        assert.equal(typeof threat,'function');
        assert.equal(typeof fair.inGameplayWorldPoint,'function');
        g.cam.zoom=1;
        g.hasLineOfSight=()=>true;
        g.bullets=[{id:999999,ownerId:999998,kind:'bullet',
          x:t.x+240,y:t.y,vx:-600,vy:0,ttl:1,dead:false}];
        g.w=280;g.h=568;
        assert.equal(fair.inGameplayWorldPoint(g,t,t.x+240,t.y),false);
        assert.equal(threat(g,classes,t,{}).risk,0,
          'offscreen approaching round must not trigger an omniscient dodge');
        g.w=800;
        assert.equal(fair.inGameplayWorldPoint(g,t,t.x+240,t.y),true);
        assert.ok(threat(g,classes,t,{}).risk>.3,
          'visible approaching round retains predictive dodge');
        g.hasLineOfSight=()=>false;
        assert.equal(threat(g,classes,t,{}).risk,0,
          'terrain-hidden round must not trigger a dodge');
        g.hasLineOfSight=()=>true;
        g.bullets[0].ttl=0;
        assert.equal(threat(g,classes,t,{}).risk,0,
          'expired ordinary round must remain harmless');
      }finally{g.hasLineOfSight=oldLos;g.destroy();}
    });
  }
});
