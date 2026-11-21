'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {projectileCandidate}=require('../research/battle-sense-projectile-candidate.cjs');

function world(){
 const shooter={id:1,x:0,y:0};
 const victim={id:2,cls:'Scout',x:80,y:35,vx:0,vy:0};
 const game={bullets:[{ownerId:1,x:0,y:0,vx:200,vy:0,ttl:1,r:2}],
   firstTerrainHit(){return null;}};
 return {shooter,victim,game};
}

test('research: conservative projectile miss does not certify a momentarily stationary steerable tank',()=>{
 const {game,shooter,victim}=world();
 const baseline=projectileCandidate(game,shooter,victim,0,{terrain:false});
 assert.equal(baseline.possible,false);
 assert.equal(baseline.known,true,'historical stationary oracle assumption');
 const conservative=projectileCandidate(game,shooter,victim,0,{terrain:false,conservativeMotion:true});
 assert.equal(conservative.possible,false);
 assert.equal(conservative.known,false,'the victim can accelerate into the lane after firing');
 assert.equal(conservative.checked,1);
 assert.equal(conservative.futureMotionUnknown,true,
  'research census must attribute this uncertainty to possible future acceleration');
});

test('research: conservative mode retains a clear physical hit candidate',()=>{
 const {game,shooter,victim}=world();
 victim.y=0;
 const result=projectileCandidate(game,shooter,victim,0,{terrain:false,conservativeMotion:true});
 assert.equal(result.known,true);
 assert.equal(result.possible,true);
 assert.equal(result.futureMotionUnknown,undefined,
  'a positive physical lane must not be counted as an unknown miss');
});

test('research: conservative mode cannot certify a cover-blocked miss as future-safe',()=>{
 const {game,shooter,victim}=world();
 victim.y=0;
 game.firstTerrainHit=()=>({solid:{destructible:false}});
 const result=projectileCandidate(game,shooter,victim,0,{conservativeMotion:true});
 assert.equal(result.possible,false);
 assert.equal(result.known,false);
 assert.equal(result.futureMotionUnknown,false,
  'a blocked lane is unknown for cover, not a stationary geometric miss');
});
