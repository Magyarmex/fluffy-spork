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

test('Mission 26 main game starts the canonical Scout run, not the War Room roster', () => {
  const compiled = compile(['src/scenes/gameplay/GameplayBattle.ts'], 'nova-main-game-');
  try {
    const { GameplayBattle } = require(path.join(compiled.out, 'scenes/gameplay/GameplayBattle.js'));
    const game = new GameplayBattle({ seed: 17, bestRunLevel: 1 });
    const snapshot = game.snapshot();
    assert.equal(snapshot.progression.tankId, 'scout');
    assert.equal(snapshot.progression.level, 1);
    assert.equal(snapshot.progression.statPoints, 0);
    assert.equal(snapshot.tanks.length, 9, 'player plus eight rivals');
    assert.equal(snapshot.tanks.find((tank) => tank.id === snapshot.playerId).tankDefinitionId, 'scout');
    const counts = Object.fromEntries(['circle','triangle','square','pentagon','hexagon','star'].map((kind) => [kind, snapshot.shapes.filter((shape) => shape.shapeType === kind).length]));
    assert.deepEqual(counts, { circle:62, triangle:30, square:16, pentagon:8, hexagon:4, star:1 });
    assert.equal(snapshot.powerups.length, 0);
    assert.equal(snapshot.status, 'playing');
  } finally { compiled.dispose(); }
});

test('Mission 26 main game preserves pity start and upgrade spending through canonical progression', () => {
  const compiled = compile(['src/scenes/gameplay/GameplayBattle.ts'], 'nova-main-pity-');
  try {
    const { GameplayBattle } = require(path.join(compiled.out, 'scenes/gameplay/GameplayBattle.js'));
    const game = new GameplayBattle({ seed: 31, bestRunLevel: 30 });
    assert.equal(game.snapshot().progression.level, 9);
    assert.equal(game.snapshot().progression.statPoints, 8);
    game.spendStat('damage');
    const after = game.snapshot().progression;
    assert.equal(after.stats.damage, 1);
    assert.equal(after.statPoints, 7);
  } finally { compiled.dispose(); }
});

test('Mission 26 main game is deterministic for an identical seed and command stream', () => {
  const compiled = compile(['src/scenes/gameplay/GameplayBattle.ts'], 'nova-main-determinism-');
  try {
    const { GameplayBattle } = require(path.join(compiled.out, 'scenes/gameplay/GameplayBattle.js'));
    const run = () => {
      const game = new GameplayBattle({ seed: 99, bestRunLevel: 1 });
      game.issuePlayerCommand({ type:'move', vector:{ x:1, y:0 } }, 'scripted');
      game.issuePlayerCommand({ type:'aim', vector:{ x:0, y:1 } }, 'scripted');
      return game.step(3);
    };
    assert.deepEqual(run(), run());
  } finally { compiled.dispose(); }
});

test('Fieldcraft survives legacy deletion as 50 reviewed, non-repeating canonical tips', () => {
  const compiled = compile(['src/content/tips/FieldcraftTips.ts','src/ui/tips/TipDeck.ts'], 'nova-fieldcraft-final-');
  try {
    const content = require(path.join(compiled.out, 'content/tips/FieldcraftTips.js'));
    const { TipDeck } = require(path.join(compiled.out, 'ui/tips/TipDeck.js'));
    assert.equal(content.FIELDCRAFT_TIPS.length, 50);
    assert.equal(content.FIELDCRAFT_DISPLAY_MS, 10400);
    assert.equal(content.auditFieldcraftTips().duplicateIds.length, 0);
    assert.equal(content.auditFieldcraftTips().duplicateTexts.length, 0);
    const deck = new TipDeck({ random: () => 0.37 });
    const seen = new Set();
    for (let index = 0; index < 50; index += 1) seen.add(deck.next('audit').id);
    assert.equal(seen.size, 50, 'one shuffle-bag cycle must not repeat tips');
    const first = deck.next('deprecate-test');
    assert.equal(deck.deprecate(first.id), true);
    assert.notEqual(deck.next('deprecate-test').id, first.id);
  } finally { compiled.dispose(); }
});

test('Living Archive survives as canonical release content with current release first', () => {
  const compiled = compile(['src/content/releases/ReleaseHistory.ts'], 'nova-archive-final-');
  try {
    const archive = require(path.join(compiled.out, 'content/releases/ReleaseHistory.js'));
    assert.ok(archive.RELEASE_HISTORY.length >= 25);
    assert.equal(archive.LATEST_RELEASE.version, '1.10.9');
    assert.equal(archive.RELEASE_HISTORY[0], archive.LATEST_RELEASE);
    assert.ok(archive.RELEASE_HISTORY.some((entry) => entry.version === '1.7.9'));
    assert.ok(archive.RELEASE_HISTORY.some((entry) => entry.version === '1.2.0'));
  } finally { compiled.dispose(); }
});

test('Production composition keeps gameplay, War Room and Blackglass as distinct canonical scenes', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(runtime, /#gameplay:GameplayScene/);
  assert.match(runtime, /readonly #lobby=new LobbyScene\(\)/);
  assert.match(runtime, /readonly #blackglass=new BlackglassScene\(\)/);
  assert.match(runtime, /private renderGameplay/);
  assert.match(runtime, /private renderLobby/);
  assert.doesNotMatch(runtime, /setPlayerTank\(/);
  assert.match(runtime, /PersistenceService/);
  assert.match(runtime, /WebAudioPresenter/);
  assert.match(runtime, /TipDeck/);
});
