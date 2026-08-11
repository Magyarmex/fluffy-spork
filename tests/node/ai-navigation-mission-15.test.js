const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const battlefieldDir = path.join(root, 'src', 'game', 'battlefield');
const navigationDir = path.join(root, 'src', 'ai', 'navigation');

function loadMission15() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-navigation-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sources = [
    path.join(root, 'src', 'game', 'simulation', 'math.ts'),
    ...readdirSync(battlefieldDir).filter((name) => name.endsWith('.ts')).map((name) => path.join(battlefieldDir, name)),
    ...readdirSync(navigationDir).filter((name) => name.endsWith('.ts')).map((name) => path.join(navigationDir, name)),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return {
    battlefield: require(path.join(outDir, 'game', 'battlefield', 'index.js')),
    navigation: require(path.join(outDir, 'ai', 'navigation', 'index.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

function assertRouteSegmentsClear(field, start, route, clearance) {
  let previous = start;
  for (const waypoint of route.waypoints) {
    assert.equal(field.hasLineOfSight(previous, waypoint, clearance), true, `route segment ${JSON.stringify(previous)} -> ${JSON.stringify(waypoint)} crosses canonical terrain`);
    previous = waypoint;
  }
}

test('Mission 15 A* routes deterministically around walls and narrow battlefield structure', () => {
  const { battlefield, navigation, dispose } = loadMission15();
  try {
    const field = new battlefield.Battlefield({ template: 'crossfire' });
    const planner = new navigation.RoutePlanner(field, { cellSize: 90, defaultClearance: 34 });
    const request = { start: { x: -1500, y: 0 }, goal: { x: 1500, y: 0 }, clearance: 34 };
    const first = planner.plan(request);
    assert.equal(first.reached, true);
    assert.equal(first.diagnostics.direct, false);
    assert.ok(first.waypoints.length >= 2);
    assertRouteSegmentsClear(field, request.start, first, 34);
    const second = planner.plan(request);
    assert.deepEqual(second.waypoints, first.waypoints);
    assert.equal(second.diagnostics.cacheHit, true);
  } finally { dispose(); }
});

test('Mission 15 dynamic obstructions participate in routing and cache identity', () => {
  const { battlefield, navigation, dispose } = loadMission15();
  try {
    const field = new battlefield.Battlefield({ template: 'split-horizon' });
    const planner = new navigation.RoutePlanner(field, { cellSize: 80, defaultClearance: 24 });
    const start = { x: -360, y: 1600 };
    const goal = { x: 360, y: 1600 };
    const direct = planner.plan({ start, goal, clearance: 24 });
    assert.equal(direct.reached, true);
    assert.equal(direct.diagnostics.direct, true);
    const blocked = planner.plan({ start, goal, clearance: 24, dynamicObstacles: [{ id: 'tank:blocker', position: { x: 0, y: 1600 }, radius: 110 }] });
    assert.equal(blocked.reached, true);
    assert.equal(blocked.diagnostics.direct, false);
    assert.notDeepEqual(blocked.waypoints, direct.waypoints);
  } finally { dispose(); }
});

test('Mission 15 destructible-cover changes invalidate cached terrain routes automatically', () => {
  const { battlefield, navigation, dispose } = loadMission15();
  try {
    const field = new battlefield.Battlefield({ template: 'crossfire' });
    const planner = new navigation.RoutePlanner(field, { cellSize: 60, defaultClearance: 12 });
    const request = { start: { x: -500, y: -250 }, goal: { x: 0, y: -250 }, clearance: 12 };
    const before = planner.plan(request);
    assert.equal(before.reached, true);
    assert.equal(before.diagnostics.direct, false);
    const destroyed = field.damageCover(-1012, 1000, 100);
    assert.equal(destroyed.destroyed, true);
    const after = planner.plan(request);
    assert.equal(after.reached, true);
    assert.equal(after.diagnostics.cacheHit, false);
    assert.equal(after.diagnostics.direct, true);
  } finally { dispose(); }
});

test('Mission 15 expansion budgets fail closed instead of hitching indefinitely', () => {
  const { battlefield, navigation, dispose } = loadMission15();
  try {
    const field = new battlefield.Battlefield({ template: 'four-gates' });
    const planner = new navigation.RoutePlanner(field, { cellSize: 80 });
    const route = planner.plan({ start: { x: -1600, y: 0 }, goal: { x: 1600, y: 0 }, clearance: 30, maxExpandedNodes: 1 });
    assert.equal(route.reached, false);
    assert.equal(route.failureReason, 'budget-exhausted');
    assert.equal(route.diagnostics.expandedNodes, 1);
  } finally { dispose(); }
});

test('Mission 15 anti-stuck recovery is bounded, deterministic, and requests replanning without teleporting', () => {
  const { navigation, dispose } = loadMission15();
  try {
    const monitor = new navigation.StuckMonitor({ movementEpsilon: 2, stuckTicks: 3, recoveryDistance: 100 });
    const destination = { x: 500, y: 0 };
    assert.equal(monitor.observe({ id: 'tank-a', tick: 1, position: { x: 0, y: 0 }, desiredDestination: destination }).stuck, false);
    assert.equal(monitor.observe({ id: 'tank-a', tick: 2, position: { x: 0, y: 0 }, desiredDestination: destination }).stuck, false);
    const recovery = monitor.observe({ id: 'tank-a', tick: 4, position: { x: 0, y: 0 }, desiredDestination: destination });
    assert.equal(recovery.stuck, true);
    assert.equal(recovery.replan, true);
    assert.ok(Math.abs(Math.hypot(recovery.recoveryDirection.x, recovery.recoveryDirection.y) - 100) < 0.001);
    const clean = monitor.observe({ id: 'tank-a', tick: 5, position: { x: 20, y: 0 }, desiredDestination: destination });
    assert.equal(clean.stuck, false);
  } finally { dispose(); }
});

test('Mission 15 local avoidance is a low-level steering adjustment shared by tank and drone hooks', () => {
  const { battlefield, navigation, dispose } = loadMission15();
  try {
    const adjusted = navigation.localAvoidance({
      position: { x: 0, y: 0 }, desiredDirection: { x: 1, y: 0 }, clearance: 30,
      obstacles: [{ id: 'near', position: { x: 25, y: 20 }, radius: 20 }],
    });
    assert.ok(adjusted.y < 0);
    assert.ok(Math.abs(Math.hypot(adjusted.x, adjusted.y) - 1) < 0.001);
    const field = new battlefield.Battlefield({ template: 'four-gates' });
    const service = new navigation.NavigationService(new navigation.RoutePlanner(field));
    assert.equal(service.routeForTank({ x: -1700, y: 1700 }, { x: -1300, y: 1700 }).reached, true);
    assert.equal(service.routeForDrone({ x: -1700, y: 1700 }, { x: -1300, y: 1700 }).reached, true);
  } finally { dispose(); }
});

test('Mission 15 representative pathfinding load stays inside hard expansion and CI timing budgets', () => {
  const { battlefield, navigation, dispose } = loadMission15();
  try {
    const started = process.hrtime.bigint();
    let expanded = 0;
    let routes = 0;
    for (const template of ['crossfire', 'split-horizon', 'four-gates']) {
      const field = new battlefield.Battlefield({ template });
      const planner = new navigation.RoutePlanner(field, { cellSize: 90, defaultClearance: 28, maxExpandedNodes: 5000 });
      for (let index = 0; index < 12; index += 1) {
        const offset = index * 9;
        const route = planner.plan({
          start: { x: -1700, y: -1500 + offset },
          goal: { x: 1700, y: 1500 - offset },
          clearance: 28,
          dynamicObstacles: [{ id: `moving-${index}`, position: { x: offset - 50, y: 1200 }, radius: 32 }],
        });
        assert.equal(route.reached, true, `${template} representative route ${index} should be reachable`);
        assert.ok(route.diagnostics.expandedNodes <= 5000);
        expanded += route.diagnostics.expandedNodes;
        routes += 1;
      }
    }
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`Mission 15 navigation benchmark: ${routes} routes, ${expanded} expanded nodes, ${elapsedMs.toFixed(2)}ms`);
    assert.ok(elapsedMs < 2500, `representative navigation load took ${elapsedMs.toFixed(2)}ms`);
  } finally { dispose(); }
});

test('Mission 15 navigation cannot absorb renderer geometry, combat doctrine, or later AI authority', () => {
  const forbidden = /(?:renderer|rendering|CanvasRenderingContext2D|document\b|window\b|HTMLElement|game\/combat|ai\/tactics|ai\/controllers|EntityState|GameWorld)/;
  for (const name of readdirSync(navigationDir).filter((entry) => entry.endsWith('.ts'))) {
    const source = readFileSync(path.join(navigationDir, name), 'utf8');
    assert.equal(forbidden.test(source), false, `${name} crosses the Mission 15 navigation boundary`);
  }
});
