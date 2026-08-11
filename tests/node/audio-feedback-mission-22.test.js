const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const audioDir = path.join(root, 'src/audio');

function loadMission22() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-audio-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const entries = [
    path.join(audioDir, 'AudioEngine.ts'),
    path.join(audioDir, 'MusicDirector.ts'),
    path.join(audioDir, 'feedback.ts'),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...entries], { cwd: root, stdio: 'pipe' });
  return {
    audio: require(path.join(outDir, 'audio/AudioEngine.js')),
    music: require(path.join(outDir, 'audio/MusicDirector.js')),
    feedback: require(path.join(outDir, 'audio/feedback.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

const api = loadMission22();
test.after(() => api.dispose());

function missionTest(name, fn) {
  test(name, () => {
    try { fn(); }
    catch (error) {
      const message = String(error && error.stack ? error.stack : error).replace(/\r?\n/g, '%0A');
      console.log(`::error file=tests/node/audio-feedback-mission-22.test.js,title=${name}::${message}`);
      throw error;
    }
  });
}

missionTest('Mission 22 spatial audio is presentation-only, bounded, and distance aware', () => {
  const engine = new api.audio.AudioEngine();
  const event = { type: 'ProjectileFired', atSeconds: 1, actorId: 'enemy', weaponId: 'cannon', projectileIds: ['p1'], position: { x: 100, y: 0 } };
  const near = engine.selectCues(event, { position: { x: 0, y: 0 } })[0];
  const far = engine.selectCues(event, { position: { x: -700, y: 0 } })[0];
  assert.equal(near.id, 'weapon:cannon');
  assert.ok(near.gain > far.gain && near.gain <= 1 && far.gain >= 0);
  assert.ok(near.pan > 0 && near.pan <= 1);
});

missionTest('Mission 22 flyby cues remain restrained and require meaningful proximity', () => {
  const engine = new api.audio.AudioEngine();
  const far = engine.selectCues({ type: 'ProjectileFlyby', atSeconds: 2, projectileId: 'p', position: { x: 0, y: 0 }, nearestDistance: 220 }, { position: { x: 0, y: 0 } });
  const close = engine.selectCues({ type: 'ProjectileFlyby', atSeconds: 2, projectileId: 'p', position: { x: 30, y: 0 }, nearestDistance: 35 }, { position: { x: 0, y: 0 } });
  assert.equal(far.length, 0);
  assert.equal(close[0].id, 'projectile:flyby');
  assert.ok(close[0].gain > 0);
});

missionTest('Mission 22 selects distinct combat, drone, progression, ability, and UI cues', () => {
  const engine = new api.audio.AudioEngine();
  const cases = [
    [{ type: 'PerfectGuard', atSeconds: 1, actorId: 'g' }, 'combat:perfect-guard', 'effects'],
    [{ type: 'DroneDestroyed', atSeconds: 1, droneId: 'd' }, 'impact:drone-destroyed', 'effects'],
    [{ type: 'EvolutionAvailable', atSeconds: 1, actorId: 'p' }, 'progression:evolution-available', 'ui'],
    [{ type: 'AbilityActivated', atSeconds: 1, actorId: 'p', abilityId: 'nova', isUltimate: true }, 'ultimate:nova', 'effects'],
    [{ type: 'UiActivated', atSeconds: 1, controlId: 'confirm' }, 'ui:confirm', 'ui'],
  ];
  for (const [event, id, channel] of cases) {
    const cue = engine.selectCues(event)[0];
    assert.equal(cue.id, id);
    assert.equal(cue.channel, channel);
  }
});

missionTest('Mission 22 music direction is a pure presentation policy', () => {
  const director = new api.music.MusicDirector();
  assert.equal(director.select({ inMatch: false, inCombat: false, healthRatio: 1 }).state, 'menu');
  assert.equal(director.select({ inMatch: true, inCombat: false, healthRatio: 1 }).state, 'ambient');
  assert.equal(director.select({ inMatch: true, inCombat: true, healthRatio: 1 }).state, 'combat');
  assert.equal(director.select({ inMatch: true, inCombat: true, healthRatio: 0.2 }).state, 'critical');
  assert.equal(director.select({ inMatch: true, inCombat: false, healthRatio: 0, matchEnded: true, playerWon: true }).state, 'victory');
  assert.equal(director.select({ inMatch: true, inCombat: false, healthRatio: 0, matchEnded: true, playerWon: false }).state, 'defeat');
});

missionTest('Mission 22 adapts existing combat semantics without coupling combat to assets', () => {
  const fired = api.feedback.feedbackFromCombatEvent({ type: 'weapon-fired', atSeconds: 3, actorId: 'a', weaponId: 'twin', projectileIds: ['p1', 'p2'] });
  const damaged = api.feedback.feedbackFromCombatEvent({ type: 'combatant-damaged', atSeconds: 4, actorId: 'a', targetId: 'b', damage: 20, remainingHealth: 80 });
  assert.deepEqual(fired, [{ type: 'ProjectileFired', atSeconds: 3, actorId: 'a', weaponId: 'twin', projectileIds: ['p1', 'p2'] }]);
  assert.deepEqual(damaged, [{ type: 'TankDamaged', atSeconds: 4, actorId: 'a', targetId: 'b', damage: 20, remainingHealth: 80 }]);
  assert.equal(api.feedback.feedbackFromCombatEvent({ type: 'weapon-cooldown', atSeconds: 4, actorId: 'a', weaponId: 'twin', readyAtSeconds: 5 }).length, 0);
});

missionTest('Mission 22 audio and VFX subscribe independently to the same semantic feedback', () => {
  const event = { type: 'TankDamaged', atSeconds: 2, actorId: 'a', targetId: 'b', damage: 70, remainingHealth: 30, position: { x: 5, y: 6 } };
  const audio = new api.audio.AudioEngine().selectCues(event);
  const visual = api.feedback.selectVisualFeedback(event);
  assert.equal(audio[0].id, 'impact:hull');
  assert.deepEqual(visual.map((cue) => cue.id), ['impact-spark', 'damage-edge']);
  assert.equal(visual[0].position.x, 5);
});

missionTest('Mission 22 covers the canonical semantic feedback vocabulary', () => {
  const source = readFileSync(path.join(audioDir, 'contracts.ts'), 'utf8');
  for (const token of ['ProjectileFired', 'ProjectileFlyby', 'ProjectileEnteredView', 'TankDamaged', 'DroneDestroyed', 'PerfectGuard', 'EvolutionAvailable']) {
    assert.match(source, new RegExp(token));
  }
});

missionTest('Mission 22 presentation code owns no gameplay authority or concrete asset filenames', () => {
  const sources = readdirSync(audioDir).filter((name) => name.endsWith('.ts')).map((name) => readFileSync(path.join(audioDir, name), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /GameWorld|EntityStore|CombatSystem|applyDamage|damageTank|stepTankMovement|spawnProjectile|TargetingService|Collision/i);
  assert.doesNotMatch(sources, /\.(mp3|wav|ogg|flac)\b|particleAsset|soundFile/i);
  const combat = readFileSync(path.join(root, 'src/game/combat/types.ts'), 'utf8');
  assert.doesNotMatch(combat, /from ['"].*audio|\.(mp3|wav|ogg|flac)\b/i);
});
