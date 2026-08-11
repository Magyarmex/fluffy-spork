const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const legacyIndex = read('index.html');
const tanksSource = read('src/content/tanks/catalog.ts');
const catalogSource = read('src/content/catalog.ts');
const publicSource = read('src/content/index.ts');
const battlefieldPatch = read('nova-updates/battlefield-v1.6.0.js');
const apexPatch = read('nova-updates/apex-disciplines-v1.7.1.js');

function between(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing end marker ${endNeedle}`);
  return source.slice(start + startNeedle.length, end);
}

function same(actual, expected, label) {
  const a = JSON.stringify(plain(actual));
  const e = JSON.stringify(plain(expected));
  if (a !== e) console.log(`::error title=Mission 05 parity drift::${label} actual=${a} expected=${e}`);
  assert.equal(a, e, label);
}

function evalLegacyClasses() {
  const registryAnchor = legacyIndex.indexOf('const ESCORT = ');
  assert.notEqual(registryAnchor, -1, 'missing game/classes ESCORT anchor');
  const registrySource = legacyIndex.slice(registryAnchor);
  const escortLiteral = between(registrySource, 'const ESCORT = ', ';\nexports.GENES =');
  const classesLiteral = between(registrySource, 'exports.CLASSES = ', ';\n// ================= ULTIMATE ABILITIES');
  const sandbox = { result: null };
  vm.runInNewContext(`const ESCORT=${escortLiteral}; result=${classesLiteral};`, sandbox);
  return { classes: plain(sandbox.result), escort: plain(vm.runInNewContext(`(${escortLiteral})`)) };
}

function evalCanonicalRawTanks() {
  const body = between(tanksSource, 'const RAW_TANKS: readonly RawTank[] = ', ';\n\nexport const TANK_DEFINITIONS');
  const sandbox = { result: null };
  vm.runInNewContext(`const b=(off,len,w,x=0,y=0)=>({off,len,w,x,y}); const t=(value)=>value; result=${body};`, sandbox);
  return plain(sandbox.result);
}

function normalizedLegacyTank(id, classes) {
  const value = classes[id];
  return plain({
    id:value.id,name:value.name,tier:value.tier,parent:value.parent,color:value.color,icon:value.icon,
    barrels:value.barrels,fireMode:value.fireMode,bullet:value.bullet,hpMult:value.hpMult,moveMult:value.moveMult,
    bodyMult:value.bodyMult,size:value.size,ability:value.ability,aura:value.aura,droneCount:value.droneCount,
    droneRole:value.droneRole,droneDmg:value.droneDmg,droneHp:value.droneHp,droneSpeed:value.droneSpeed,
    droneLeash:value.droneLeash,droneRespawnMult:value.droneRespawnMult,
  });
}

function normalizedCanonicalTank(raw, escort) {
  return plain({
    id:raw.id,name:raw.name,tier:raw.tier,parent:raw.parent,color:raw.color,icon:raw.icon,
    barrels:raw.barrels,fireMode:raw.fireMode,bullet:raw.bullet,hpMult:raw.hpMult,moveMult:raw.moveMult,
    bodyMult:raw.bodyMult,size:raw.size,ability:raw.ability,aura:raw.aura,droneCount:raw.droneCount,
    droneRole:raw.droneRole ?? escort.droneRole,droneDmg:raw.droneDmg ?? escort.droneDmg,
    droneHp:raw.droneHp ?? escort.droneHp,droneSpeed:raw.droneSpeed ?? escort.droneSpeed,
    droneLeash:raw.droneLeash ?? escort.droneLeash,droneRespawnMult:raw.droneRespawnMult,
  });
}

test('Mission 05 canonical tank/weapon/drone balance is exact to materialized game/classes', () => {
  const { classes, escort } = evalLegacyClasses();
  const canonical = evalCanonicalRawTanks();
  assert.equal(Object.keys(classes).length, 36);
  assert.equal(canonical.length, 36);
  same(canonical.map((x) => x.id).sort(), Object.keys(classes).sort(), 'class id set');
  for (const raw of canonical) same(normalizedCanonicalTank(raw, escort), normalizedLegacyTank(raw.id, classes), `tank ${raw.id}`);
});

test('effective doctrine descriptions are used where active class patch actually overrides them', () => {
  const canonical = new Map(evalCanonicalRawTanks().map((x) => [x.id, x]));
  const textLiteral = between(apexPatch, 'var C=c.CLASSES||{},text=', ';\n  Object.keys(text)');
  const overrides = plain(vm.runInNewContext(`(${textLiteral})`));
  const { classes } = evalLegacyClasses();
  for (const [id, description] of Object.entries(overrides)) {
    if (classes[id]) assert.equal(canonical.get(id).desc, description, `effective description drift: ${id}`);
  }
  assert.equal(classes.quake.id, 'quake');
  assert.equal(overrides.quakecannon !== undefined, true);
});

function evalLegacyBattlefields() {
  const templateLiteral = between(battlefieldPatch, 'var TEMPLATES=', ';\nfunction ensureTerrain');
  const sandbox = { result: null };
  vm.runInNewContext(`
    function addRect(a,id,x,y,w,h,type,hp){a.push({shape:'rect',x,y,width:w,height:h,type,hp:hp||undefined});}
    function addCircle(a,id,x,y,r,type,hp){a.push({shape:'circle',x,y,radius:r,type,hp:hp||undefined});}
    function txPoint(p,rot,mirror){var x=p[0]*(mirror?-1:1),y=p[1];for(var i=0;i<rot;i++){var q=x;x=-y;y=q;}return[x,y];}
    function txRect(x,y,w,h,rot,mirror){var p=txPoint([x,y],rot,mirror);if(rot%2){var q=w;w=h;h=q;}return[p[0],p[1],w,h];}
    const templates=${templateLiteral};
    result=templates.map((template)=>{const terrain=[];template.build(terrain,0,false);return {name:template.name,description:template.desc,terrain};});
  `, sandbox);
  return plain(sandbox.result);
}

function evalCanonicalBattlefields() {
  const expression = between(catalogSource, 'export const BATTLEFIELD_DEFINITIONS: readonly BattlefieldDefinition[] = Object.freeze(', ');\n\nexport const BALANCE');
  const sandbox = { result: null };
  vm.runInNewContext(`
    const rect=(x,y,width,height,type,hp)=>({shape:'rect',x,y,width,height,type,hp});
    const circle=(x,y,radius)=>({shape:'circle',x,y,radius,type:'pillar'});
    const battlefield=(id,name,description,terrain)=>({id,name,description,mapLimit:2250,terrainCell:360,terrain});
    result=${expression};
  `, sandbox);
  return plain(sandbox.result);
}

test('BattlefieldRegistry preserves all three legacy geometry templates', () => {
  const legacy = evalLegacyBattlefields();
  const canonical = evalCanonicalBattlefields();
  assert.equal(canonical.length, 3);
  same(canonical.map((x) => x.name), legacy.map((x) => x.name), 'battlefield names');
  for (let i = 0; i < canonical.length; i++) {
    assert.equal(canonical[i].description, legacy[i].description);
    same(canonical[i].terrain, legacy[i].terrain, `battlefield ${canonical[i].name}`);
    assert.equal(canonical[i].mapLimit, 2250);
    assert.equal(canonical[i].terrainCell, 360);
  }
});

test('canonical catalogs expose the complete legacy genes, abilities, perks and evolution tree', () => {
  const { classes } = evalLegacyClasses();
  for (const marker of ['GENE_DEFINITIONS','ABILITY_DEFINITIONS','MASTERY_PERK_DEFINITIONS','EVOLUTION_DEFINITIONS']) assert.match(catalogSource, new RegExp(marker));
  for (const id of ['gunner','cannon','sniper','controller','guardian']) assert.match(catalogSource, new RegExp(`id:'${id}'`));
  for (const id of ['ragnarok','overheat','pointblank','supercharge','phase','swarm','bulwark','taunt','stampede']) assert.match(catalogSource, new RegExp(`id:'${id}'`));
  for (const id of ['dmg','speed','vitality','alacrity','thorns','wealth']) assert.match(catalogSource, new RegExp(`id:'${id}'`));
  for (const [id, value] of Object.entries(classes)) {
    if (value.parent) assert.match(catalogSource, new RegExp(`(?:fromTankId:'${value.parent}'.*${id}|${id}.*fromTankId:'${value.parent}')`), `evolution missing ${value.parent} -> ${id}`);
  }
});

test('public content boundary exports canonical registries and no scene-specific duplicate catalogs', () => {
  for (const name of ['TankRegistry','WeaponRegistry','DroneRegistry','LineageRegistry','EvolutionRegistry','BattlefieldRegistry','GeneRegistry','AbilityRegistry','MasteryPerkRegistry']) assert.match(publicSource, new RegExp(name));
  assert.doesNotMatch(catalogSource, /BlackglassRegistry|LobbyRegistry|ShowroomRegistry/);
  assert.match(publicSource, /CONTENT_SPECIMEN = 'main@52009c406b948a7b9a9402bb56495f20b3918ba6'/);
});
