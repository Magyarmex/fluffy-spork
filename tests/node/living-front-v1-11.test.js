const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

function compile(entries, prefix) {
  const out = mkdtempSync(path.join(tmpdir(), prefix));
  const tsc = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [
    tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node',
    '--skipLibCheck', '--strict', '--rootDir', path.join(root, 'src'), '--outDir', out,
    ...entries.map((entry) => path.join(root, entry)),
  ], { cwd: root, stdio: 'pipe' });
  return { out, dispose: () => rmSync(out, { recursive: true, force: true }) };
}

function loadLivingFront() {
  const compiled = compile([
    'src/game/entities/shapes/LivingFrontSystem.ts',
    'src/game/battlefield/Battlefield.ts',
    'src/game/simulation/SeededRandom.ts',
  ], 'nova-living-front-');
  const system = require(path.join(compiled.out, 'game/entities/shapes/LivingFrontSystem.js'));
  const { Battlefield } = require(path.join(compiled.out, 'game/battlefield/Battlefield.js'));
  const { SeededRandom } = require(path.join(compiled.out, 'game/simulation/SeededRandom.js'));
  return { compiled, system, Battlefield, SeededRandom };
}

const DEF = {
  circle:{hp:14,xp:10,radius:12,speed:10}, triangle:{hp:30,xp:25,radius:16,speed:16}, square:{hp:55,xp:50,radius:20,speed:9},
  pentagon:{hp:100,xp:100,radius:26,speed:6}, hexagon:{hp:190,xp:200,radius:33,speed:4}, star:{hp:340,xp:500,radius:24,speed:78}, crasher:{hp:95,xp:60,radius:15,speed:105},
};
let serial = 0;
function shape(type, x, y, angle=0) {
  const def=DEF[type];
  return {state:{id:`shape:${type}:${serial++}`,kind:'shape',lifecycle:'active',position:{x,y},rotation:angle,team:{teamId:'neutral'},health:{current:def.hp,max:def.hp},spawnedAtTick:0,shapeType:type},velocity:{x:Math.cos(angle)*def.speed,y:Math.sin(angle)*def.speed},spin:0,xp:def.xp,radius:def.radius};
}
function tank(id,x,y,healthFraction=1,radius=30){return{state:{id,kind:'tank',lifecycle:'active',position:{x,y},rotation:0,turretRotation:0,team:{teamId:id},health:{current:100*healthFraction,max:100},spawnedAtTick:0,tankDefinitionId:'scout'},velocity:{x:0,y:0},radius,healthFraction};}
function projectile(id,x,y,vx,vy,radius=4){return{state:{id,kind:'projectile',lifecycle:'active',position:{x,y},rotation:0,team:{teamId:'p'},ownerId:'owner',spawnedAtTick:0,projectileDefinitionId:'test',velocity:{x:vx,y:vy}},radius};}
function step(system,tick,shapes=[],tanks=[],projectiles=[]){return system.step({tick,elapsedMs:tick*1000/60,dtSeconds:1/60,shapes,tanks,projectiles});}

test('Living Front maturity rises in calm sectors, pressure disrupts it, and pressure decays', () => {
  const {compiled,system:{LivingFrontSystem},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const ecology=new LivingFrontSystem({battlefield:new Battlefield({template:'crossfire'}),random:new SeededRandom(7),directorEnabled:false});
    for(let tick=1;tick<=3600;tick++)step(ecology,tick);
    const calm=ecology.snapshot();
    assert.ok(calm.sectors.every(s=>s.maturity>0.15),'calm sectors mature toward the age ceiling');
    const beforePressure=calm.sectors[0].pressure;
    for(let cycle=0;cycle<30;cycle++){ecology.recordGunfire({x:-1900,y:-1900},2);for(let k=1;k<=12;k++)step(ecology,3600+cycle*12+k);}
    const disturbed=ecology.snapshot();
    assert.ok(disturbed.sectors[0].maturity<disturbed.sectors[15].maturity,'sustained pressure depresses local maturity');
    assert.ok(disturbed.sectors[0].pressure>beforePressure);
    const pressurePeak=disturbed.sectors[0].pressure;
    for(let tick=3961;tick<=4560;tick++)step(ecology,tick);
    assert.ok(ecology.snapshot().sectors[0].pressure<pressurePeak,'pressure decays without new disturbance');
  }finally{compiled.dispose();}
});

test('Living Front recovery preserves 120 ordinary neutrals and match age gates high-value composition', () => {
  const {compiled,system:{LivingFrontSystem,LIVING_FRONT_BASELINE_COUNTS},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const ecology=new LivingFrontSystem({battlefield:new Battlefield({template:'crossfire'}),random:new SeededRandom(9)});
    const early=ecology.desiredCounts(0),late=ecology.desiredCounts(300000);
    assert.equal(Object.values(early).reduce((a,b)=>a+b,0),120);
    assert.equal(early.pentagon,0);assert.equal(early.hexagon,0);
    assert.deepEqual(late,LIVING_FRONT_BASELINE_COUNTS);
    assert.equal(Object.values(late).reduce((a,b)=>a+b,0),120);
  }finally{compiled.dispose();}
});

test('Living Front spawn selection never returns solid terrain and mature calm sectors attract valuable recovery', () => {
  const {compiled,system:{LivingFrontSystem},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const battlefield=new Battlefield({template:'crossfire'}),ecology=new LivingFrontSystem({battlefield,random:new SeededRandom(11),directorEnabled:false});
    for(let tick=1;tick<=18000;tick++){
      if(tick%12===0){for(const p of [{x:-1800,y:-1800},{x:-600,y:-1800},{x:600,y:-1800},{x:1800,y:-1800},{x:-1800,y:-600},{x:-600,y:-600},{x:600,y:-600},{x:1800,y:-600},{x:-1800,y:600},{x:-600,y:600},{x:600,y:600},{x:1800,y:600},{x:-1800,y:1800},{x:-600,y:1800},{x:600,y:1800}])ecology.recordGunfire(p,2);}
      step(ecology,tick);
    }
    const maturity=ecology.snapshot().sectors.map(s=>s.maturity);
    assert.ok(maturity[15]>maturity[0]+0.25,'the undisturbed sector becomes materially more mature');
    let matureHits=0;
    for(let i=0;i<80;i++){
      const p=ecology.chooseSpawnPoint('hexagon',()=>({x:1700,y:1700}));
      assert.equal(battlefield.isSpawnSafe(p,42),true,'high-value recovery cannot spawn inside solids');
      if(p.x>1250&&p.y>1250)matureHits++;
    }
    assert.ok(matureHits>=20,'mature calm space receives a strong high-value weighting');
  }finally{compiled.dispose();}
});

test('Triangle evasion has a reaction floor and cannot chain infinite dodges', () => {
  const {compiled,system:{LivingFrontSystem},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const ecology=new LivingFrontSystem({battlefield:new Battlefield({template:'crossfire'}),random:new SeededRandom(13),directorEnabled:false});
    const prey=shape('triangle',0,0),shot=projectile('shot',-220,0,420,0);
    for(let tick=1;tick<18;tick++)step(ecology,tick,[prey],[],[shot]);
    assert.equal(ecology.snapshot().telemetry.triangleEvasions,0,'Triangle may not frame-perfect dodge on spawn');
    for(let tick=18;tick<=35;tick++)step(ecology,tick,[prey],[],[shot]);
    assert.equal(ecology.snapshot().telemetry.triangleEvasions,1);
    assert.ok(Math.hypot(prey.velocity.x,prey.velocity.y)>=40,'evasion is a short committed displacement');
    for(let tick=36;tick<=55;tick++)step(ecology,tick,[prey],[],[shot]);
    assert.equal(ecology.snapshot().telemetry.triangleEvasions,1,'cooldown prevents projectile-by-projectile chain dodges');
  }finally{compiled.dispose();}
});

test('Hexagon attraction is bounded and does not turn ordinary prey into orbiting missiles', () => {
  const {compiled,system:{LivingFrontSystem},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const ecology=new LivingFrontSystem({battlefield:new Battlefield({template:'crossfire'}),random:new SeededRandom(15),directorEnabled:false});
    const circle=shape('circle',-220,0,Math.PI/2),hex=shape('hexagon',0,0);
    for(let tick=1;tick<=12;tick++)step(ecology,tick,[circle,hex]);
    assert.ok(circle.velocity.x>0,'keystone attraction gently biases movement toward the Hexagon');
    assert.ok(Math.hypot(circle.velocity.x,circle.velocity.y)<=10.01,'attraction does not grant speed');
  }finally{compiled.dispose();}
});

test('Crasher telegraph commits a locked charge, overshoots misses, recovers, and respects arena collision', () => {
  const {compiled,system:{LivingFrontSystem},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const battlefield=new Battlefield({template:'crossfire'}),ecology=new LivingFrontSystem({battlefield,random:new SeededRandom(17),directorEnabled:false});
    const crasher=shape('crasher',1800,0),victim=tank('victim',2300,0,.2);
    let locked;let sawTelegraph=false,sawCharge=false,sawRecover=false;
    for(let tick=1;tick<=220;tick++){
      if(sawCharge)victim.state={...victim.state,position:{x:2300,y:900}};
      step(ecology,tick,[crasher],[victim]);
      const phase=crasher.state.livingFront?.crasherPhase;
      if(phase==='telegraph')sawTelegraph=true;
      if(phase==='charge'){
        if(!locked)locked={...crasher.velocity};
        else assert.ok(Math.abs(crasher.velocity.x/Math.max(1,Math.hypot(crasher.velocity.x,crasher.velocity.y))-locked.x/Math.max(1,Math.hypot(locked.x,locked.y)))<1e-6,'charge heading remains committed after target moves');
        sawCharge=true;
      }
      if(phase==='recover')sawRecover=true;
      assert.equal(battlefield.contains(crasher.state.position,crasher.radius),true,'Crasher remains physically inside arena bounds');
    }
    assert.ok(sawTelegraph&&sawCharge&&sawRecover);
    assert.ok(ecology.snapshot().telemetry.crasherChargeMisses>=1,'a missed committed charge produces overshoot/recovery telemetry');
  }finally{compiled.dispose();}
});

test('Fed Crasher bounty changes reward only, never HP or movement stats', () => {
  const {compiled,system:{LivingFrontSystem,LIVING_FRONT_BOUNTY_CAP},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const ecology=new LivingFrontSystem({battlefield:new Battlefield({template:'crossfire'}),random:new SeededRandom(19),directorEnabled:false}),crasher=shape('crasher',0,0);
    ecology.registerShape(crasher,0);const before={health:{...crasher.state.health},velocity:{...crasher.velocity},xp:crasher.xp};
    ecology.creditCrasherBounty(crasher,1000,1);
    assert.equal(crasher.state.health.current,before.health.current);assert.equal(crasher.state.health.max,before.health.max);
    assert.deepEqual(crasher.velocity,before.velocity);assert.equal(crasher.xp,before.xp+LIVING_FRONT_BOUNTY_CAP);
    assert.equal(crasher.state.livingFront.bountyFraction,1);
  }finally{compiled.dispose();}
});

test('Star roaming stays traversable instead of chasing like a boss', () => {
  const {compiled,system:{LivingFrontSystem},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const battlefield=new Battlefield({template:'crossfire'}),ecology=new LivingFrontSystem({battlefield,random:new SeededRandom(23),directorEnabled:false}),star=shape('star',900,900,.4);
    for(let tick=1;tick<=1200;tick++){step(ecology,tick,[star]);assert.equal(battlefield.contains(star.state.position,star.radius),true);assert.equal(battlefield.isOccupied(star.state.position,star.radius),false);}
    assert.ok(Math.hypot(star.state.position.x-900,star.state.position.y-900)>250,'Star traverses a long route');
  }finally{compiled.dispose();}
});

test('Bloom recognizes real ecological value and never manufactures it', () => {
  const {compiled,system:{LivingFrontSystem},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const ecology=new LivingFrontSystem({battlefield:new Battlefield({template:'crossfire'}),random:new SeededRandom(29),directorEnabled:true});
    for(let tick=1;tick<=10800;tick++)step(ecology,tick);
    assert.notEqual(ecology.snapshot().signal?.type,'bloom','maturity alone is not a Bloom');
    const rich=[shape('hexagon',1300,1300),shape('hexagon',1400,1300),shape('hexagon',1300,1400),shape('hexagon',1400,1400)];
    const before=rich.length;let result;
    for(let tick=10801;tick<=10830;tick++)result=step(ecology,tick,rich);
    assert.equal(ecology.snapshot().signal?.type,'bloom');assert.equal(rich.length,before);assert.equal(result.spawnRogueStar,false);
  }finally{compiled.dispose();}
});

test('Migration signal requires actual cross-sector movement and Rogue Star is cooldown-gated', () => {
  const {compiled,system:{LivingFrontSystem},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const ecology=new LivingFrontSystem({battlefield:new Battlefield({template:'crossfire'}),random:new SeededRandom(31),directorEnabled:true});
    const herd=Array.from({length:9},(_,i)=>shape('circle',-1700+i*8,-1700));
    for(let tick=1;tick<=12;tick++)step(ecology,tick,herd);
    assert.notEqual(ecology.snapshot().signal?.type,'migration');
    herd.forEach((s,i)=>{s.state={...s.state,position:{x:-900+i*8,y:-1700}};});
    for(let tick=13;tick<=30;tick++)step(ecology,tick,herd);
    assert.equal(ecology.snapshot().signal?.type,'migration','signal follows physical sector crossings');
    const quiet=new LivingFrontSystem({battlefield:new Battlefield({template:'crossfire'}),random:new SeededRandom(37),directorEnabled:true});
    let first=false,second=false;
    for(let tick=1;tick<=8000;tick++){const r=step(quiet,tick);if(r.spawnRogueStar){if(!first)first=true;else second=true;}}
    assert.equal(first,true,'prolonged quiet can generate one movement incentive');assert.equal(second,false,'Rogue Star cooldown prevents event spam');
  }finally{compiled.dispose();}
});

test('Director-off ultimate acceptance path keeps ecology alive without scripted signals', () => {
  const compiled=compile(['src/scenes/gameplay/GameplayBattle.ts'],'nova-living-front-director-off-');
  try{
    const {GameplayBattle}=require(path.join(compiled.out,'scenes/gameplay/GameplayBattle.js'));
    const game=new GameplayBattle({seed:41,livingFrontDirectorEnabled:false});
    const start=game.snapshot();
    assert.equal(start.livingFront.directorEnabled,false);assert.equal(start.shapes.length,120);
    const later=game.step(180);
    assert.equal(later.livingFront.signal,null,'Director-off mode emits no scripted announcements');
    assert.ok(later.livingFront.maturityCeiling>0,'ecology continues advancing without Director');
    assert.equal(later.shapes.length>=110,true,'ordinary farming availability remains bounded and present');
    assert.ok(later.shapes.some(s=>s.livingFront),'shape behavior state is wired into the production composition root');
  }finally{compiled.dispose();}
});

test('AI receives shape identity only through direct sight; ecology code contains no hidden maturity bridge', () => {
  const compiled=compile(['src/game/targeting/PerceptionCore.ts'],'nova-living-front-ai-boundary-');
  try{
    const {PerceptionCore}=require(path.join(compiled.out,'game/targeting/PerceptionCore.js'));
    const observer={id:'tank',kind:'tank',lifecycle:'active',position:{x:0,y:0},rotation:0,turretRotation:0,team:{teamId:'a'},health:{current:100,max:100},spawnedAtTick:0,tankDefinitionId:'scout'};
    const neutral={id:'shape',kind:'shape',lifecycle:'active',position:{x:100,y:0},rotation:0,team:{teamId:'neutral'},health:{current:100,max:100},spawnedAtTick:0,shapeType:'hexagon'};
    const hidden=new PerceptionCore({lineOfSight:{hasLineOfSight:()=>false}}).perceive({tick:1,elapsedMs:16,observerId:'tank',entities:[observer,neutral]});
    assert.equal(hidden.getContact('shape').shapeType,undefined,'hidden neutral identity does not become AI strategy data');
    const visible=new PerceptionCore({lineOfSight:{hasLineOfSight:()=>true}}).perceive({tick:1,elapsedMs:16,observerId:'tank',entities:[observer,neutral]});
    assert.equal(visible.getContact('shape').shapeType,'hexagon');
    const controllerSource=readFileSync(path.join(root,'src/ai/controllers/TankAIController.ts'),'utf8');
    assert.doesNotMatch(controllerSource,/maturity|LivingFrontSystem|sector.*value/i,'AI controller must not import hidden ecological state');
    assert.match(controllerSource,/directSight/);assert.match(controllerSource,/saturation/,'tank-density saturation is part of anti-dogpile utility');
  }finally{compiled.dispose();}
});

test('Controller automation remains local and never receives a strategic ecology command channel', () => {
  const battle=readFileSync(path.join(root,'src/scenes/gameplay/GameplayBattle.ts'),'utf8');
  const drones=readFileSync(path.join(root,'src/game/entities/drones/DroneSystem.ts'),'utf8');
  assert.doesNotMatch(drones,/LivingFront|bloom|migration|rogue.?star/i);
  assert.doesNotMatch(battle,/swarm-order[^\n]+bloom|swarm-order[^\n]+migration/i);
  assert.match(battle,/executeDroneHarvest/,'existing local harvest automation remains integrated');
});

test('Living Front planning stays decimated, spatially indexed, allocation-bounded, and entity growth capped', () => {
  const source=readFileSync(path.join(root,'src/game/entities/shapes/LivingFrontCore.ts'),'utf8');
  const facade=readFileSync(path.join(root,'src/game/entities/shapes/LivingFrontSystem.ts'),'utf8');
  const battle=readFileSync(path.join(root,'src/scenes/gameplay/GameplayBattle.ts'),'utf8');
  assert.match(facade,/export \* from '.\/LivingFrontCore'/,'one canonical public owner is retained');
  assert.match(source,/SECTOR_HZ_TICKS=12/);assert.match(source,/BEHAVIOR_HZ_TICKS=6/);assert.match(source,/DIRECTOR_HZ_TICKS=30/);
  assert.match(source,/class SpatialHash/);assert.match(source,/#projectileHash\.query/);assert.doesNotMatch(source,/for\(const p of frame\.projectiles\)/,'Triangles must not perform a global projectile scan');
  assert.match(battle,/MAX_NORMAL_SHAPES=132/);assert.match(battle,/this\.normalShapeCount\(\)<MAX_NORMAL_SHAPES/);
  assert.match(source,/#scratch:T\[\]=\[\]/,'query scratch storage is reused');
});

test('Production Living Front planning remains inside a generous CI-safe frame budget', () => {
  const {compiled,system:{LivingFrontSystem},Battlefield,SeededRandom}=loadLivingFront();
  try{
    const ecology=new LivingFrontSystem({battlefield:new Battlefield({template:'crossfire'}),random:new SeededRandom(43),directorEnabled:false});
    const shapes=[];for(let i=0;i<62;i++)shapes.push(shape('circle',-1600+(i%16)*200,-1600+Math.floor(i/16)*200));for(let i=0;i<30;i++)shapes.push(shape('triangle',-1500+(i%15)*210,300+Math.floor(i/15)*210));for(let i=0;i<16;i++)shapes.push(shape('square',-1400+i*180,900));for(let i=0;i<8;i++)shapes.push(shape('pentagon',-1200+i*300,1300));for(let i=0;i<4;i++)shapes.push(shape('hexagon',-900+i*600,1700));
    const tanks=Array.from({length:9},(_,i)=>tank(`t${i}`,-1200+i*300,0,.8));
    const shots=Array.from({length:120},(_,i)=>projectile(`p${i}`,-1800+(i%30)*120,-800+Math.floor(i/30)*400,300,0));
    for(let tick=1;tick<=600;tick++)step(ecology,tick,shapes,tanks,shots);
    const metrics=ecology.snapshot().telemetry;
    assert.ok(Number.isFinite(metrics.planningWorkEmaMs));assert.ok(metrics.planningWorkPeakMs<50,`planning peak ${metrics.planningWorkPeakMs.toFixed(2)}ms exceeded CI-safe budget`);
  }finally{compiled.dispose();}
});

test('Director and neutral presentation stay restrained and world-readable without a permanent ecology panel', () => {
  const scene=readFileSync(path.join(root,'src/scenes/gameplay/GameplayScene.ts'),'utf8');
  const renderer=readFileSync(path.join(root,'src/rendering/shapes/ShapeRenderer.ts'),'utf8');
  assert.match(scene,/SHAPE BLOOM/);assert.match(scene,/MIGRATION/);assert.match(scene,/ROGUE STAR/);
  assert.match(renderer,/crasherPhase/);assert.match(renderer,/bountyFraction/);assert.match(renderer,/triangleEvading/);
  assert.doesNotMatch(scene,/maturity meter|capture bar|quest log/i);
});
