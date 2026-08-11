const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const droneDir = path.join(root, 'src/game/entities/drones');

function loadMission17() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-drones-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const dirs = [
    ['src/game/simulation', ['math.ts', 'types.ts']],
    ['src/game/entities', ['types.ts']],
    ['src/game/targeting', ['types.ts']],
    ['src/input/commands', ['GameCommand.ts']],
    ['src/ai/navigation', ['types.ts', 'RoutePlanner.ts', 'NavigationService.ts', 'index.ts']],
    ['src/game/battlefield', readdirSync(path.join(root, 'src/game/battlefield')).filter((n) => n.endsWith('.ts'))],
    ['src/game/entities/drones', readdirSync(droneDir).filter((n) => n.endsWith('.ts'))],
  ];
  const sources = dirs.flatMap(([dir, files]) => files.map((file) => path.join(root, dir, file)));
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return {
    drones: require(path.join(outDir, 'game/entities/drones/index.js')),
    Battlefield: require(path.join(outDir, 'game/battlefield/Battlefield.js')).Battlefield,
    RoutePlanner: require(path.join(outDir, 'ai/navigation/RoutePlanner.js')).RoutePlanner,
    NavigationService: require(path.join(outDir, 'ai/navigation/NavigationService.js')).NavigationService,
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

function owner(position = { x: 0, y: 0 }) {
  return { id:'owner', kind:'tank', lifecycle:'active', position, rotation:0, team:{teamId:'blue',allegiance:'allied'}, health:{current:100,max:100}, spawnedAtTick:0, tankDefinitionId:'controller', turretRotation:0 };
}

function drone(id, position, health = 30, definition = 'hunter-drone') {
  return { id, kind:'drone', lifecycle:'active', position, rotation:0, team:{teamId:'blue',allegiance:'allied'}, health:{current:health,max:100}, ownerId:'owner', spawnedAtTick:0, droneDefinitionId:definition };
}

function contact(id, kind, relation, position, options = {}) {
  return Object.freeze({ id, kind, relation, teamId:relation === 'hostile' ? 'red' : (relation === 'neutral' ? 'neutral' : 'blue'), source: options.source || 'direct', position:Object.freeze(position), observedAtTick:options.tick || 1, observedAtMs:(options.tick || 1)*16, visibility:Object.freeze({ directSight:options.directSight !== false, publiclyTracked:false, relayed:Boolean(options.relayed), designated:Boolean(options.designated) }), live:options.live !== false, targetable:options.targetable !== false });
}

function world(contacts, tick = 1) {
  return Object.freeze({ tick, elapsedMs:tick*16, observerId:'owner', contacts:Object.freeze(contacts), getContact(id){return contacts.find((c)=>c.id===id);}, hostileContacts(){return contacts.filter((c)=>c.relation==='hostile');} });
}

function fakeNavigation() {
  return {
    stuck:{ observe(){return {stuck:false,replan:false,recoveryDirection:{x:0,y:0},stationaryTicks:0};} },
    routeForDrone(start, goal){return {reached:true,waypoints:[goal],diagnostics:{cacheHit:false,expandedNodes:0,generatedNodes:0,direct:true,cost:Math.hypot(goal.x-start.x,goal.y-start.y)}};},
    movementDirection(position, waypoint){ if(!waypoint)return{x:0,y:0}; const x=waypoint.x-position.x,y=waypoint.y-position.y,m=Math.hypot(x,y)||1; return{x:x/m,y:y/m}; },
  };
}

function frame(overrides = {}) {
  return { tick:1, elapsedMs:16, dtSeconds:.1, owner:owner(), ownerLineage:'controller', drones:[drone('d1',{x:20,y:0})], perceivedWorld:world([]), order:{type:'swarm-order',order:'follow'}, ...overrides };
}

test('Mission 17 formations and local-defense cost are deterministic and preserve v1.10.7 depth semantics', () => {
  const api = loadMission17();
  try {
    assert.equal(api.drones.formationForOrder('follow'), 'ring');
    assert.equal(api.drones.formationForOrder('attack','controller'), 'crescent');
    assert.equal(api.drones.formationForOrder('attack','broodmother'), 'claw');
    assert.equal(api.drones.formationForOrder('defend'), 'phalanx');
    assert.deepEqual(api.drones.formationSlot({x:0,y:0},0,0,4,'phalanx'), {x:64,y:-51});
    assert.ok(Math.abs(api.drones.localDefenseFraction(0) - .36) < 1e-9);
    assert.equal(api.drones.localDefenseFraction(.58), 0);
    assert.equal(api.drones.localDefenseFraction(1), 0);
  } finally { api.dispose(); }
});

test('Mission 17 out-of-combat repair preserves delay, radius, threat suppression, and 11%/second rate', () => {
  const api = loadMission17();
  try {
    const system = new api.drones.DroneSystem(fakeNavigation());
    system.update(frame({ tick:1, elapsedMs:0, drones:[drone('d1',{x:20,y:0},50)] }));
    const damaged = system.update(frame({ tick:2, elapsedMs:100, drones:[drone('d1',{x:20,y:0},10)], order:{type:'swarm-order',order:'attack'} }));
    assert.equal(damaged.intents[0].mode, 'recover');
    assert.equal(damaged.intents[0].repairFraction, 0);
    const healed = system.update(frame({ tick:3, elapsedMs:2800, drones:[drone('d1',{x:20,y:0},10)], order:{type:'swarm-order',order:'attack'} }));
    assert.equal(healed.intents[0].mode, 'repair');
    assert.ok(Math.abs(healed.intents[0].repairFraction - .011) < 1e-9);
    const threatened = system.update(frame({ tick:4, elapsedMs:3000, drones:[drone('d1',{x:20,y:0},10)], order:{type:'swarm-order',order:'attack'}, perceivedWorld:world([contact('enemy-drone','drone','hostile',{x:100,y:0})],4) }));
    assert.equal(threatened.intents[0].repairFraction, 0);
  } finally { api.dispose(); }
});

test('Mission 17 committed attack runs ignore recall until explicitly completed', () => {
  const api = loadMission17();
  try {
    const system = new api.drones.DroneSystem(fakeNavigation());
    system.update(frame());
    system.commitAttack('d1','enemy');
    const contacts = [contact('enemy','tank','hostile',{x:300,y:0})];
    const recalled = system.update(frame({ tick:2, perceivedWorld:world(contacts,2), order:{type:'swarm-order',order:'recall'} }));
    assert.equal(recalled.states[0].committed, true);
    assert.equal(recalled.intents[0].mode, 'attack-run');
    assert.equal(recalled.intents[0].targetId, 'enemy');
    system.completeAttackRun('d1');
    const recovered = system.update(frame({ tick:3, perceivedWorld:world(contacts,3), order:{type:'swarm-order',order:'recall'} }));
    assert.equal(recovered.states[0].committed, false);
    assert.notEqual(recovered.intents[0].mode, 'attack-run');
  } finally { api.dispose(); }
});

test('Mission 17 shallow pressure allows physical local interception while deep pressure spends it', () => {
  const api = loadMission17();
  try {
    const shallowSystem = new api.drones.DroneSystem(fakeNavigation());
    const shallowContacts = [contact('tank','tank','hostile',{x:120,y:0}), contact('breach','drone','hostile',{x:80,y:0})];
    const shallow = shallowSystem.update(frame({ drones:[drone('d1',{x:10,y:0}),drone('d2',{x:15,y:0}),drone('d3',{x:20,y:0})], perceivedWorld:world(shallowContacts), order:{type:'swarm-order',order:'attack',targetId:'tank'} }));
    assert.ok(shallow.intents.some((intent)=>intent.mode==='intercept' && intent.targetId==='breach'));
    const deepSystem = new api.drones.DroneSystem(fakeNavigation());
    const deepContacts = [contact('tank','tank','hostile',{x:620,y:0}), contact('breach','drone','hostile',{x:80,y:0})];
    const deep = deepSystem.update(frame({ drones:[drone('d1',{x:10,y:0}),drone('d2',{x:15,y:0}),drone('d3',{x:20,y:0})], perceivedWorld:world(deepContacts), order:{type:'swarm-order',order:'attack',targetId:'tank'} }));
    assert.equal(deep.intents.some((intent)=>intent.mode==='intercept'), false);
  } finally { api.dispose(); }
});

test('Mission 17 observers expose explicit relay IDs and every intent carries canonical IFF state', () => {
  const api = loadMission17();
  try {
    const system = new api.drones.DroneSystem(fakeNavigation());
    const result = system.update(frame({ drones:[drone('spot',{x:10,y:0},100,'observer-spotter'),drone('hunter',{x:20,y:0},100)] }));
    assert.deepEqual(result.relayObserverIds, ['spot']);
    assert.equal(result.intents.find((i)=>i.droneId==='spot').observer, true);
    for (const intent of result.intents) assert.deepEqual(intent.iff, {ownerId:'owner',teamId:'blue',allegiance:'allied'});
  } finally { api.dispose(); }
});

test('Mission 17 routes drone movement through canonical navigation and anti-stuck hooks', () => {
  const api = loadMission17();
  try {
    const field = new api.Battlefield({template:'split-horizon'});
    const navigation = new api.NavigationService(new api.RoutePlanner(field,{cellSize:80,defaultClearance:18}), {movementEpsilon:2,stuckTicks:2,recoveryDistance:80});
    const system = new api.drones.DroneSystem(navigation);
    const f = frame({ owner:owner({x:-1300,y:1700}), drones:[drone('d1',{x:-1700,y:1700},100)], order:{type:'swarm-order',order:'recall'} });
    const first = system.update({...f,tick:1});
    assert.ok(Math.hypot(first.intents[0].desiredDirection.x,first.intents[0].desiredDirection.y) > .9);
    system.update({...f,tick:2});
    const stuck = system.update({...f,tick:3});
    assert.equal(stuck.intents[0].replan, true);
    assert.ok(Math.hypot(stuck.intents[0].desiredDirection.x,stuck.intents[0].desiredDirection.y) > 1);
  } finally { api.dispose(); }
});

test('Mission 17 target selection consumes PerceivedWorld and cannot invent hidden hostile state', () => {
  const api = loadMission17();
  try {
    const system = new api.drones.DroneSystem(fakeNavigation());
    const visible = contact('visible','tank','hostile',{x:400,y:0},{designated:true});
    const hidden = contact('hidden','tank','hostile',{x:50,y:0},{live:false,directSight:false});
    const selected = system.selectTarget({owner:owner(),perceivedWorld:world([hidden,visible])});
    assert.equal(selected.contact.id,'visible');
  } finally { api.dispose(); }
});

test('Mission 17 source boundary forbids a second physics model, renderer authority, and unrestricted world access', () => {
  const source = readdirSync(droneDir).filter((name)=>name.endsWith('.ts')).map((name)=>readFileSync(path.join(droneDir,name),'utf8')).join('\n');
  for (const forbidden of ['stepDroneVelocity','moveCircleWithSliding','GameWorld','EntityStore','rendering/','document.','window.']) assert.equal(source.includes(forbidden), false, `forbidden drone authority leak: ${forbidden}`);
  assert.match(source, /NavigationService/);
  assert.match(source, /PerceivedWorld/);
  assert.match(source, /swarm-order/);
});
