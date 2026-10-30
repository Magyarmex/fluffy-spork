'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchPerkOffer,patchLevelCapOffer,capDismissBefore,capDismissAfter,capPerkSelectionAfter}=require('../../scripts/patch-perk-offer.cjs');
const root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function compressedShell(){
  const b64=fs.readdirSync(path.join(root,'nova-gz')).filter(f=>f.endsWith('.b64')).sort()
    .map(f=>read('nova-gz/'+f)).join('').replace(/\s+/g,'');
  return zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
}
const original=compressedShell(),shipping=read('index.html');
const fixed=patchLevelCapOffer(patchPerkOffer(original));
function method(src,name,next){
  const start=src.indexOf('    '+name+'(',src.indexOf('class Game {'));
  const end=src.indexOf('\n    '+next+'(',start);
  assert.ok(start>=0&&end>start,'real compiled Game method '+name);
  return src.slice(start,end);
}
function GameMethods(src){
  const methods=[
    method(src,'gainXP','offerNextMilestone'),
    method(src,'offerNextMilestone','tryOffer'),
    method(src,'tryOffer','setClass'),
    method(src,'applyClass','applyPerk'),
    method(src,'applyPerk','applyGene'),
    method(src,'applyGene','openOffer'),
    method(src,'openOffer','dismissOffer'),
    method(src,'dismissOffer','usePlayerAbility')
  ].join('\n');
  return new Function('types_1','classes_1','return class GameHarness {\n'+methods+'\n}')({
    MAX_LEVEL:45,xpForLevel:()=>1000
  },{
    CLASSES:{scout:{tier:0},tier1:{tier:1},tier2:{tier:2},apex:{tier:3,parent:'tier2'}},
    PERKS:{speed:{name:'Speed'}},GENES:{guardian:{name:'Guardian',color:'#fff'}},
    lineageForClass:()=> 'sniper'
  });
}
function boot(Owner,level,tier=3){
  const g=new Owner(),events=[];
  g.player={level,tier,perk:null,gene:null,isPlayer:true,xp:0,score:0,x:0,y:0};
  g.status='playing';g.pendingOffer=tier;g.paused=true;g.masteryOfferChoices=null;
  g.setPaused=value=>{g.paused=value;};g.syncHud=()=>{};
  g.cb={event:e=>events.push(e)};g.sfx={levelup:()=>{}};
  g.recalcMaxHp=()=>{};g.addText=()=>{};g.addRing=()=>{};g.addParticles=()=>{};
  g.syncAILevels=()=>{};g.refitDrones=()=>{};
  g.setClass=(t,id)=>{t.cls=id;t.tier={tier1:1,tier2:2,apex:3}[id];};
  g.sfx.evolve=()=>{};
  return {g,events};
}
const Original=GameMethods(original),Fixed=GameMethods(fixed);
const triple=['dmg','speed','thorns'];
test('level-45 softlock reproduced against original Game methods; corrected Game retains reopen path',()=>{
  const before=boot(Original,45);before.g.dismissOffer();
  before.g.gainXP(before.g.player,1000000);
  assert.equal(before.g.pendingOffer,null,'original loses earned milestone at cap');
  const after=boot(Fixed,45);after.g.dismissOffer(triple);
  assert.equal(after.g.pendingOffer,3,'capped offer remains available');
  assert.equal(after.g.paused,false,'DECIDE LATER resumes combat');
  assert.deepEqual(after.g.masteryOfferChoices,triple);
  after.g.gainXP(after.g.player,1000000);
  assert.equal(after.g.player.level,45);
  after.g.openOffer();
  assert.equal(after.g.paused,true);
  assert.deepEqual(after.events,[{type:'offer',tier:3}]);
  after.g.dismissOffer(['speed','wealth','vitality']);
  assert.deepEqual(after.g.masteryOfferChoices,triple,'repeat postponement cannot reroll');
  assert.equal(after.g.paused,false);
});
test('below-cap dismissal still waits for a real level-up; all capped evolution tiers can reopen',()=>{
  const below=boot(Fixed,44);below.g.dismissOffer(triple);
  assert.equal(below.g.pendingOffer,null);
  assert.equal(below.g.masteryOfferChoices,null);
  below.g.gainXP(below.g.player,2000);
  assert.equal(below.g.player.level,45);
  assert.equal(below.g.pendingOffer,3,'real level-up reoffers the unclaimed mastery');
  for(const tier of [1,2,3,4,5]){
    const {g,events}=boot(Fixed,45,tier);
    g.dismissOffer(tier===3?triple:undefined);
    assert.equal(g.pendingOffer,tier,'tier '+tier+' stays earned at cap');
    assert.equal(g.paused,false);
    g.openOffer();
    assert.equal(g.paused,true);
    assert.deepEqual(events,[{type:'offer',tier}]);
  }
});
test('capped earned choices can be consumed and advance milestones exactly once',()=>{
  const mastery=boot(Fixed,45);mastery.g.player.gene='guardian';
  mastery.g.dismissOffer(triple);
  mastery.g.openOffer();
  mastery.g.applyPerk('speed');
  assert.equal(mastery.g.player.perk,'speed');
  assert.equal(mastery.g.pendingOffer,null,'mastery consumed exactly once');
  assert.equal(mastery.g.masteryOfferChoices,null,'cached offer cleared on consumption');
  assert.equal(mastery.g.paused,false);
  const first=boot(Fixed,45,1);
  first.g.player.tier=0;
  first.g.dismissOffer();first.g.openOffer();first.g.applyClass('tier1');
  assert.equal(first.g.player.tier,1);
  assert.equal(first.g.pendingOffer,2,'next earned evolution follows the first at cap');
  const gene=boot(Fixed,45,4);
  gene.g.player.perk='speed';
  gene.g.dismissOffer();gene.g.openOffer();gene.g.applyGene('guardian');
  assert.equal(gene.g.player.gene,'guardian');
  assert.equal(gene.g.pendingOffer,null);
  const apex=boot(Fixed,45,5);
  apex.g.player.cls='tier2';apex.g.player.tier=2;
  apex.g.player.perk='speed';apex.g.player.gene='guardian';
  apex.g.dismissOffer();apex.g.openOffer();apex.g.applyClass('apex');
  assert.equal(apex.g.player.tier,3);
  assert.equal(apex.g.pendingOffer,null);
});
test('invalid mastery choices fail closed and cannot contaminate the saved triple',()=>{
  for(const bad of [null,undefined,[],['dmg','dmg','speed'],['dmg','speed','forged'],['dmg','speed']]){
    const {g}=boot(Fixed,45);
    g.dismissOffer(bad);
    assert.equal(g.masteryOfferChoices,null);
    assert.equal(g.pendingOffer,3,'offer still recoverable even when bad choices rejected');
  }
});
test('compiled React PerkOffer reuses the same three choices across modal remounts',()=>{
  const start=fixed.indexOf('function PerkOffer({');
  const end=fixed.indexOf('function GameOver(',start);
  assert.ok(start>0&&end>start);
  const tree=(type,props,...children)=>({type,props:props||{},children});
  const pool=['dmg','speed','vitality','alacrity','thorns','wealth'];
  const perks=Object.fromEntries(pool.map(id=>[id,{name:id,icon:'+',desc:id}]));
  const Component=new Function('React','react_1','classes_1',
    fixed.slice(start,end)+'\nreturn PerkOffer;')({createElement:tree},{useMemo:fn=>fn()},{PERKS:perks});
  const buttons=root=>{
    const found=[];const visit=x=>{
      if(!x||typeof x!=='object')return;
      if(x.type==='button')found.push(x);
      for(const child of x.children||[])Array.isArray(child)?child.forEach(visit):visit(child);
    };visit(root);return found;
  };
  let saved;
  const first=buttons(Component({onPick:()=>{},onLater:choices=>{saved=choices;}}));
  assert.equal(first.length,4);
  assert.equal(new Set(first.slice(0,3).map(b=>b.props.key)).size,3);
  first[3].props.onClick();
  assert.equal(saved.length,3);
  const {g}=boot(Fixed,45);g.dismissOffer(saved);
  const reopened=buttons(Component({savedChoices:g.masteryOfferChoices,onPick:()=>{},onLater:()=>{}}));
  assert.deepEqual(reopened.slice(0,3).map(b=>b.props.key),first.slice(0,3).map(b=>b.props.key));
  assert.equal(reopened.length,4);
});
test('materializer patch is fail-closed, idempotent, and does not alter unrelated shell',()=>{
  assert.equal(original.split(capDismissBefore).length-1,1);
  assert.equal(fixed.split(capDismissAfter).length-1,1);
  assert.equal(fixed.split(capPerkSelectionAfter).length-1,1);
  assert.equal(patchLevelCapOffer(patchPerkOffer(fixed)),fixed);
  assert.equal(patchLevelCapOffer(patchPerkOffer(shipping)).includes('dismissOffer(masterChoices)'),true);
  assert.throws(()=>patchLevelCapOffer('unrelated'),/owners missing/);
  assert.throws(()=>patchLevelCapOffer(fixed.replace('this.masteryOfferChoices = null;\n        this.statPoints = 0;',
    'this.masteryOfferChoices = 17;\n        this.statPoints = 0;')),/redeploy reset drift/);
  const src=read('scripts/patch-perk-offer.cjs');
  assert.match(src,/patchLevelCapOffer\(patchPerkOffer\(raw\)\)/);
  for(const file of ['.github/workflows/deploy.yml','.github/workflows/browser-smoke.yml']){
    assert.match(read(file),/node scripts\/patch-perk-offer\.cjs index\.html/);
  }
});
