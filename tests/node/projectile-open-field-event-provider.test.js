'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { observeProjectilePairs } = require('../research/projectile-pair-chronology-observer.cjs');
const { makeOpenFieldProvider } = require('../research/projectile-open-field-event-provider.cjs');
const shot = (ownerId,x,vx,y=0) => ({
  kind:'bullet',dead:false,shell:false,beam:false,pen:0,hits:0,
  ttl:.1,r:3,ownerId,x,y,vx,vy:0
});
const fixture = bullets => ({bullets,tanks:[],shapes:[],drones:[],terrain:[]});
test('derived competing events select the unique earliest of three contacts', () => {
  const game=fixture([shot(1,-20,6000),shot(2,0,0),shot(3,25,-6000)]);
  const dt=1/240, provider=makeOpenFieldProvider(game,dt);
  assert.equal(typeof provider,'function');
  const r=observeProjectilePairs(game,dt,provider);
  assert.equal(r.incomplete,false);
  assert.equal(r.certified.length,1);
  assert.deepEqual([r.certified[0].i,r.certified[0].j],[0,1]);
  assert.ok(Math.abs(r.certified[0].time-(20-7.5)/6000)<1e-12);
});
test('derived competing events abstain for simultaneous independent contacts', () => {
  const game=fixture([shot(1,-20,1000),shot(2,20,-1000),
    shot(3,-20,1000,100),shot(4,20,-1000,100)]);
  const dt=.05,r=observeProjectilePairs(game,dt,makeOpenFieldProvider(game,dt));
  assert.equal(r.certified.length,0);
  assert.equal(r.reason,'simultaneous-contact');
});
test('earlier third-projectile contact vetoes later pair', () => {
  const game=fixture([shot(1,-20,6000),shot(2,0,0),shot(3,25,-6000)]);
  const dt=1/240, provider=makeOpenFieldProvider(game,dt);
  const context=provider(game.bullets[1],game.bullets[2],1,2,dt);
  assert.ok(context.aOtherProjectile < (25-7.5)/6000);
  const r=observeProjectilePairs(game,dt,provider);
  assert.deepEqual([r.certified[0].i,r.certified[0].j],[0,1]);
});
test('nonempty or unverified battlefield cannot claim open-field context', () => {
  const game=fixture([shot(1,-20,1000),shot(2,20,-1000)]);
  game.tanks.push({id:5,x:0,y:0});
  assert.equal(makeOpenFieldProvider(game,.05),null);
  delete game.tanks;
  assert.equal(makeOpenFieldProvider(game,.05),null);
});
test('changed or mismatched projectile snapshot is rejected', () => {
  const game=fixture([shot(1,-20,1000),shot(2,20,-1000)]);
  const provider=makeOpenFieldProvider(game,.05);
  const changed={...game.bullets[0],x:-19};
  assert.equal(provider(changed,game.bullets[1],0,1,.05),null);
  assert.equal(provider(game.bullets[0],game.bullets[1],0,1,.04),null);
});
test('unsupported projectile cannot become a false certified interception', () => {
  const game=fixture([shot(1,-20,1000),shot(2,20,-1000)]);
  game.bullets[1].shell=true;
  const dt=.05,provider=makeOpenFieldProvider(game,dt);
  const r=observeProjectilePairs(game,dt,provider);
  assert.equal(r.certified.length,0);
  assert.equal(r.incomplete,true);
});

test('shared-shot simultaneous earliest contacts veto unrelated later certificate', () => {
  const game=fixture([shot(1,0,0),shot(2,0,0),shot(3,0,0),
    shot(4,-20,1000,100),shot(5,20,-1000,100)]);
  const dt=.05;
  const provider=makeOpenFieldProvider(game,dt);
  assert.equal(provider,null);
  const r=observeProjectilePairs(game,dt,provider);
  assert.equal(r.incomplete,true);
  assert.equal(r.certified.length,0);
});

test('third earliest tied pair sharing a shot also vetoes the frame', () => {
  const game=fixture([shot(1,0,0,0),shot(2,0,0,0),
    shot(3,0,0,100),shot(4,0,0,100),shot(5,0,0,100),
    shot(6,-20,1000,200),shot(7,20,-1000,200)]);
  const dt=.05;
  assert.equal(makeOpenFieldProvider(game,dt),null);
  const r=observeProjectilePairs(game,dt,makeOpenFieldProvider(game,dt));
  assert.equal(r.certified.length,0);
  assert.equal(r.incomplete,true);
});

test('sparse projectile arrays cannot be mistaken for complete context', () => {
  const bullets=[shot(1,-20,1000),shot(2,0,0),shot(3,20,-1000)];
  delete bullets[1];
  assert.equal(makeOpenFieldProvider(fixture(bullets),.05),null);
});

test('hidden player, materialized cover or pickups revoke empty-field certificate', () => {
  const game=fixture([shot(1,-20,1000),shot(2,20,-1000)]);
  game.player={id:1,x:0,y:0};
  assert.equal(makeOpenFieldProvider(game,.05),null);
  delete game.player;
  game.__novaTerrain=[{solid:true}];
  assert.equal(makeOpenFieldProvider(game,.05),null);
  delete game.__novaTerrain;
  game.powerups=[{x:0,y:0}];
  assert.equal(makeOpenFieldProvider(game,.05),null);
});
