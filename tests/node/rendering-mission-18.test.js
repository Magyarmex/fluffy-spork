const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const renderingDir = path.join(root, 'src/rendering');

function allTs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? allTs(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

function loadMission18() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-rendering-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sources = [
    path.join(root, 'src/content/schema.ts'), path.join(root, 'src/content/registry.ts'),
    path.join(root, 'src/content/tanks/catalog.ts'), path.join(root, 'src/content/catalog.ts'),
    path.join(root, 'src/content/upgrades/catalog.ts'), path.join(root, 'src/content/index.ts'),
    path.join(root, 'src/game/simulation/types.ts'), path.join(root, 'src/game/entities/types.ts'),
    ...allTs(renderingDir),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return { rendering: require(path.join(outDir, 'rendering/index.js')), content: require(path.join(outDir, 'content/index.js')), dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}

function tank(definitionId = 'scout', rotation = 0) { return { id:'tank', kind:'tank', lifecycle:'active', position:{x:100,y:50}, rotation:0, turretRotation:rotation, team:{teamId:'blue',allegiance:'allied'}, health:{current:100,max:100}, spawnedAtTick:0, tankDefinitionId:definitionId }; }
function drone(definitionId, allegiance = 'allied') { return { id:'drone', kind:'drone', lifecycle:'active', position:{x:20,y:30}, rotation:.25, team:{teamId:'blue',allegiance}, health:{current:30,max:30}, ownerId:'tank', spawnedAtTick:0, droneDefinitionId:definitionId }; }
function projectile(definitionId) { return { id:'projectile', kind:'projectile', lifecycle:'active', position:{x:140,y:50}, rotation:0, team:{teamId:'blue',allegiance:'allied'}, ownerId:'tank', spawnedAtTick:0, projectileDefinitionId:definitionId, velocity:{x:400,y:0} }; }

const api = loadMission18();
test.after(() => api.dispose());
function missionTest(name, fn) { test(name, () => { try { fn(); } catch (error) { const message = String(error && error.stack ? error.stack : error).replace(/\r?\n/g, '%0A'); console.log(`::error file=tests/node/rendering-mission-18.test.js,title=${name}::${message}`); throw error; } }); }

missionTest('Mission 18 canonical tank metadata and muzzle geometry', () => { const factory=new api.rendering.CanonicalVisualFactory(), scout=api.content.TankRegistry.get('scout'), visual=factory.tank(tank('scout',Math.PI/2)); assert.equal(visual.color,scout.color);assert.equal(visual.icon,scout.icon);assert.equal(visual.size,scout.size);assert.equal(visual.barrels.length,scout.weapon.barrels.length);assert.ok(Math.abs(visual.barrels[0].muzzle.x-100)<1e-9);assert.ok(Math.abs(visual.barrels[0].muzzle.y-76)<1e-9);assert.equal(factory.tank(tank('twin')).barrels.length,2); });
missionTest('Mission 18 preserves v1.7.6 drone IFF presentation', () => { const renderer=new api.rendering.DroneRenderer(), friendly=renderer.build(drone('carrier:drone')); assert.equal(friendly[0].kind,'glow');assert.equal(friendly[0].color,'#4da8ff');assert.equal(friendly[0].alpha,.18);assert.equal(friendly[0].radius,31);assert.equal(friendly[1].radius,18);assert.equal(friendly[1].alpha,.30);assert.equal(renderer.build(drone('carrier:drone','hostile'))[0].color,'#ff4d62');assert.equal(renderer.build(drone('carrier:drone',null)).filter(c=>c.kind==='glow').length,0); });
missionTest('Mission 18 projectile appearance varies by canonical weapon mode', () => { const factory=new api.rendering.CanonicalVisualFactory(), shell=factory.projectile(projectile('bomber:weapon')), beam=factory.projectile(projectile('railgun:weapon'));assert.equal(shell.fireMode,'shell');assert.equal(beam.fireMode,'beam');assert.notEqual(shell.trailLength,beam.trailLength);assert.notEqual(shell.radius,beam.radius); });
missionTest('Mission 18 camera transform is invertible', () => { const camera=new api.rendering.Camera2D({x:100,y:-50},2,{width:800,height:600}),point={x:320,y:75},restored=camera.screenToWorld(camera.worldToScreen(point));assert.ok(Math.abs(restored.x-point.x)<1e-9&&Math.abs(restored.y-point.y)<1e-9);assert.equal(camera.contains({x:100,y:-50}),true);assert.equal(camera.contains({x:1e4,y:1e4}),false); });
missionTest('Mission 18 deterministic render frame from canonical inputs', () => { const renderer=new api.rendering.Renderer();renderer.start();const entities=[tank(),drone('scout:drone'),projectile('scout:weapon')],battlefield=api.content.BattlefieldRegistry.get('crossfire'),events=[{type:'projectile-impact',tick:3,elapsedMs:48,payload:{x:160,y:50,color:'#7dd3fc'}}],first=renderer.render({tick:3,elapsedMs:48,entities,battlefield,events}),second=renderer.render({tick:3,elapsedMs:48,entities,battlefield,events});assert.deepEqual(first,second);assert.deepEqual(first.metrics,{entitiesVisited:3,entitiesRendered:3,commandsBuilt:first.commands.length,effectsBuilt:1});assert.ok(first.commands.some(c=>c.layer==='terrain'));assert.ok(first.commands.some(c=>c.layer==='effect-over'));renderer.stop();assert.throws(()=>renderer.render({tick:4,elapsedMs:64,entities:[]}),/running/); });
missionTest('Mission 18 carries forward v1.10.9 signal discipline', () => { const intents=api.rendering.CANONICAL_VISUAL_INTENTS;assert.ok(intents.length>=8);for(const item of intents){assert.ok(item.question.length>=8,item.id);assert.ok(item.reason.length>=12,item.id);assert.ok(['reticle','edge','world','hud','chassis'].includes(item.channel),item.id)}const effects=new api.rendering.EffectRenderer();assert.equal(effects.build([{type:'unknown',tick:1,elapsedMs:16,payload:{x:1,y:2}}]).length,0);assert.equal(effects.build([{type:'weapon-fired',tick:1,elapsedMs:16,payload:{x:1,y:2}}]).length,1); });
missionTest('Mission 18 source contains no gameplay authority or Blackglass copy', () => { const source=allTs(renderingDir).map(file=>readFileSync(file,'utf8')).join('\n');assert.doesNotMatch(source,/CombatSystem|TargetingService|NavigationService|TankMovement|DroneMovement|terrainCollision|entityCollision/);assert.doesNotMatch(source,/scenes\/blackglass|blackglass\//i);assert.doesNotMatch(source,/\.health\s*=/);assert.doesNotMatch(source,/\.position\s*=/);assert.doesNotMatch(source,/teamId\s*===|teamId\s*!==/); });
