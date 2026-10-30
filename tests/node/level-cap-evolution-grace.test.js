'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchPerkOffer,patchLevelCapOffer}=require('../../scripts/patch-perk-offer.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const shell=zlib.gunzipSync(Buffer.from(fs.readdirSync(path.join(root,'nova-gz'))
  .filter(x=>x.endsWith('.b64')).sort().map(x=>read('nova-gz/'+x))
  .join('').replace(/\s+/g,''),'base64')).toString('utf8');
const html=patchLevelCapOffer(patchPerkOffer(shell));
const stability=read('nova-updates/stability-v1.4.0.js');
function compiledGame(){
  const start=html.indexOf('    dismissOffer(masterChoices) {',html.indexOf('class Game {'));
  const end=html.indexOf('    usePlayerAbility()',start);
  assert.ok(start>=0&&end>start,'actual patched Game.dismissOffer owner required');
  const source=html.slice(start,end);
  return new Function('types_1','return class Game {\n'+source+
    '\napplyClass() {}\napplyPerk() {}\napplyGene() {}\n}')({MAX_LEVEL:45});
}
function installStability(Game){
  const graceStart=stability.indexOf('    function evolutionGrace(g){');
  const graceEnd=stability.indexOf('    var oldTryOffer=',graceStart);
  const wrapStart=stability.indexOf("    ['applyClass','applyPerk','applyGene','dismissOffer'].forEach");
  const wrapEnd=stability.indexOf('    var prevTryFire=',wrapStart);
  assert.ok(graceStart>0&&graceEnd>graceStart&&wrapStart>0&&wrapEnd>wrapStart);
  let focusClears=0;
  new Function('Game','clearEnemyFocus','collapseUpgradeTraySoon',
    stability.slice(graceStart,graceEnd)+'\n'+stability.slice(wrapStart,wrapEnd))(
      Game,()=>{focusClears++;},()=>{});
  return ()=>focusClears;
}
function gameAt(Game,level=45,tier=3){
  const g=new Game();
  g.player={level,spawnShieldT:0,hitFlash:9};
  g.pendingOffer=tier;g.input={firing:true,abilityQueued:true};
  g.paused=true;g.setPaused=x=>{g.paused=x;};g.syncHud=()=>{};
  return g;
}
test('real stability evolution wrapper grants cap grace once, not on each EVOLVE READY cycle',()=>{
  const Game=compiledGame(),focusClears=installStability(Game),g=gameAt(Game);
  g.dismissOffer(['dmg','speed','wealth']);
  assert.equal(g.player.spawnShieldT,1.8,'first legitimate cap deferral receives existing grace');
  assert.equal(g.player.hitFlash,0);
  assert.equal(g.pendingOffer,3);
  assert.equal(focusClears(),1);
  for(let i=0;i<20;i++){
    g.player.spawnShieldT=0;
    g.player.hitFlash=9;
    g.input.firing=true;g.input.abilityQueued=true;
    g.dismissOffer(['dmg','speed','wealth']);
    assert.equal(g.player.spawnShieldT,0,'repeat deferral cannot farm invulnerability');
    assert.equal(g.player.hitFlash,9,'repeat deferral cannot clear damage feedback');
    assert.equal(focusClears(),1,'repeat deferral cannot erase AI focus');
    assert.equal(g.pendingOffer,3);
    assert.equal(g.paused,false);
    assert.equal(g.input.firing,false,'repeat deferral releases held fire');
    assert.equal(g.input.abilityQueued,false,'repeat deferral releases queued ability');
  }
  g.pendingOffer=4;
  g.dismissOffer();
  assert.equal(g.player.spawnShieldT,1.8,'new earned tier still gets its normal grace');
  assert.equal(focusClears(),2);
  g.player={level:45,spawnShieldT:0,hitFlash:9};
  g.pendingOffer=3;
  g.dismissOffer(['dmg','speed','wealth']);
  assert.equal(g.player.spawnShieldT,1.8,'new player identity receives fresh grace');
  assert.equal(focusClears(),3);
});
test('below-cap deferral retains original grace and clears pending; no empty-offer grace',()=>{
  const Game=compiledGame(),focusClears=installStability(Game),g=gameAt(Game,44);
  g.dismissOffer();
  assert.equal(g.pendingOffer,null);
  assert.equal(g.player.spawnShieldT,1.8);
  assert.equal(focusClears(),1);
  g.player.spawnShieldT=0;
  g.pendingOffer=3;
  g.dismissOffer();
  assert.equal(g.player.spawnShieldT,1.8,'next legitimate milestone retains grace');
  assert.equal(focusClears(),2);
  g.player.spawnShieldT=0;
  g.dismissOffer();
  assert.equal(g.player.spawnShieldT,0,'empty dismissal cannot grant protection');
  assert.equal(focusClears(),2);
});
