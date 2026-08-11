const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const srcDir = path.join(root, 'src');

function walkTs(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return walkTs(file);
    return name.endsWith('.ts') ? [file] : [];
  });
}

function loadProgression() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-progression-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sources = [
    ...walkTs(path.join(srcDir, 'content')),
    ...walkTs(path.join(srcDir, 'game', 'progression')),
  ];
  execFileSync(process.execPath, [
    tsc,
    '--target', 'ES2022',
    '--module', 'commonjs',
    '--moduleResolution', 'node',
    '--skipLibCheck',
    '--strict',
    '--rootDir', srcDir,
    '--outDir', outDir,
    ...sources,
  ], { cwd: root, stdio: 'pipe' });
  return { progression: require(path.join(outDir, 'game', 'progression', 'index.js')), dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}

function state(p, overrides = {}) {
  return {
    level: 1, xp: 0, statPoints: 0, tankId: 'scout',
    stats: { ...p.ZERO_STATS },
    ...overrides,
  };
}

test('Mission 11 preserves XP thresholds, wealth gain, level points and pity protocol', () => {
  const { progression: p, dispose } = loadProgression();
  try {
    assert.equal(p.xpForLevel(1), 20);
    assert.equal(p.pityStartLevel(3), 1);
    assert.equal(p.pityStartLevel(30), 9);
    const sys = new p.ProgressionSystem();
    const result = sys.gainXp(state(p, { level: 29, perkId: 'wealth' }), p.xpForLevel(29));
    assert.equal(result.awardedXp, p.xpForLevel(29) * 1.3);
    assert.equal(result.state.level, 30);
    assert.equal(result.state.statPoints, 1);
  } finally { dispose(); }
});

test('Mission 11 upgrade spending is capped and applied power follows committed points only', () => {
  const { progression: p, dispose } = loadProgression();
  try {
    const upgrades = new p.UpgradeSystem();
    let s = state(p, { level: 10, statPoints: 9 });
    s = upgrades.spend(s, 'damage');
    assert.equal(s.stats.damage, 1);
    assert.equal(s.statPoints, 8);
    assert.equal(p.appliedPowerLevel(10, s.stats), 2);
    assert.equal(p.appliedPowerLevel(10, { ...s.stats, damage: 8 }), 9);
    assert.throws(() => upgrades.spend({ ...s, statPoints: 1, stats: { ...s.stats, damage: 8 } }, 'damage'), /Cannot spend/);
  } finally { dispose(); }
});

test('Mission 11 rejects invalid evolutions and native genes while preserving milestone order', () => {
  const { progression: p, dispose } = loadProgression();
  try {
    const evolutions = new p.EvolutionSystem();
    let s = state(p, { level: 10, statPoints: 9 });
    assert.equal(evolutions.nextMilestone(s), 'tier1');
    assert.throws(() => evolutions.evolve(s, 'minigun'), /Invalid evolution/);
    s = evolutions.evolve(s, 'twin');
    assert.equal(s.tankId, 'twin');
    s = { ...s, level: 20 };
    s = evolutions.evolve(s, 'minigun');
    s = { ...s, level: 35, perkId: 'dmg' };
    assert.equal(evolutions.nextMilestone(s), 'gene');
    assert.throws(() => evolutions.chooseGene(s, 'gunner'), /not foreign/);
    s = evolutions.chooseGene(s, 'guardian');
    assert.equal(s.geneId, 'guardian');
    s = { ...s, level: 40 };
    assert.equal(evolutions.nextMilestone(s), 'apex');
    assert.deepEqual(evolutions.evolutionChoices(s), ['tempest', 'needlestorm']);
  } finally { dispose(); }
});

test('Mission 11 exposes an inspectable effective TankBuild with production formulas', () => {
  const { progression: p, dispose } = loadProgression();
  try {
    const resolver = new p.BuildResolver();
    const build = resolver.resolve(state(p, {
      level: 35,
      tankId: 'railgun',
      perkId: 'vitality',
      geneId: 'guardian',
      stats: { ...p.ZERO_STATS, damage: 3, reload: 2, bulletspeed: 4, penetration: 2, maxhp: 5, regen: 3, speed: 2, body: 1 },
    }));
    assert.equal(build.appliedPowerLevel, 23);
    assert.equal(build.maxHealth, Math.round((100 + 14 * 5) * 0.95 * (1 + 35 * 0.02) * 1.3 * 1.22));
    assert.equal(build.penetration, 10 + Math.floor(2 * 0.6));
    assert.ok(build.passiveDamageReduction > 0.09 && build.passiveDamageReduction < 0.11);
    assert.equal(build.bodyReflectFraction, 0);
    assert.ok(build.projectileDamage > 46);
    assert.ok(build.weaponRange > 1000);
  } finally { dispose(); }
});
