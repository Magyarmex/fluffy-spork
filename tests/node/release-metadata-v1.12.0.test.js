const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('canonical release metadata identifies v1.12.0 Living Front as current', () => {
  const data = JSON.parse(read('nova-updates/releases.json'));
  assert.equal(data.currentVersion, '1.12.0');
  assert.equal(data.releases[0]?.version, '1.12.0');
  assert.equal(data.releases[0]?.codename, 'Living Front');

  const versions = new Set(data.releases.map((release) => release.version));
  assert.ok(versions.has('1.11.2'), 'Fair Engagement must remain represented');
  assert.ok(versions.has('1.11.1'), 'Owner Operations must remain represented');
});

test('Living Front structured patch notes cover the actual shipped feature set', () => {
  const data = JSON.parse(read('nova-updates/releases.json'));
  const release = data.releases.find((item) => item.version === '1.12.0');
  assert.ok(release, 'v1.12.0 release metadata must exist');

  const expectedGroups = [
    'World Ecology',
    'Neutral Shape Behaviors',
    'Crashers and Rogue Stars',
    'Disturbance, Herding and Migration',
    'Front Director',
    'AI and Class Integration',
    'Progression and Skill',
    'Readability, Tips and Debugging',
    'Performance, Fairness and Reliability',
  ];

  for (const group of expectedGroups) {
    assert.ok(Array.isArray(release.groups?.[group]), `missing Living Front patch-note group: ${group}`);
    assert.ok(release.groups[group].length >= 3, `${group} must describe the shipped content rather than collapse to a label`);
  }

  const notes = Object.values(release.groups).flat().join('\n');
  for (const required of [
    /sixteen invisible ecological sectors/i,
    /62\s*\/\s*30\s*\/\s*16\s*\/\s*8\s*\/\s*4/i,
    /Triangles.*evade/i,
    /Hexagons.*keystone/i,
    /Track.*Telegraph.*Charge.*Overshoot.*Recover/i,
    /capped bounty/i,
    /Rogue Stars?.*interception/i,
    /BLOOM/i,
    /MIGRATION/i,
    /public Director signals/i,
    /Controller drones.*local/i,
    /no hidden XP-zone multipliers/i,
    /Seven tactical Living Front tips/i,
    /projectile index/i,
    /twelve concrete/i,
  ]) {
    assert.match(notes, required);
  }
});

test('human-facing current/latest surfaces cannot regress behind Living Front', () => {
  const readme = read('README.md');
  const current = read('CURRENT_RELEASE.md');
  const ledger = read('RELEASES.md');

  assert.match(readme, /Current release[\s\S]*v1\.12\.0\s*·\s*Living Front/i);
  assert.match(current, /v1\.12\.0\s*·\s*Living Front/);
  assert.match(ledger, /v1\.12\.0\s*[—-]\s*Living Front/);
  assert.match(ledger, /v1\.11\.2\s*[—-]\s*Fair Engagement/);
  assert.match(ledger, /v1\.11\.1\s*[—-]\s*Owner Operations/);

  assert.doesNotMatch(readme, /Current release:\s*v1\.7\.2/i);
  assert.doesNotMatch(readme, /Latest\s*[—-]\s*v1\.7\.2/i);
});

test('current release doc does not hard-code an ephemeral materialization hash', () => {
  const current = read('CURRENT_RELEASE.md');
  assert.match(current, /intentionally does not hard-code a materialization commit or runtime fingerprint/i);
  assert.doesNotMatch(current, /Shipping materialization:\s*`[0-9a-f]{40}`/i);
  assert.doesNotMatch(current, /Runtime build:\s*`[0-9a-f]{24}`/i);
});

test('v1.11 shipping owners remain wired while v1.12 stays after Fair Engagement', () => {
  const pwa = read('pwa-register.js');
  const deploy = read('.github/workflows/deploy.yml');

  assert.match(pwa, /owner-operations-v1\.11\.1\.js/);

  const fair = deploy.indexOf("'./nova-updates/fair-engagement-v1.11.2.js'");
  const core = deploy.indexOf("'./nova-updates/living-front-core-v1.12.0.js'");
  const instincts = deploy.indexOf("'./nova-updates/living-front-instincts-v1.12.0.js'");
  const director = deploy.indexOf("'./nova-updates/living-front-director-v1.12.0.js'");

  assert.ok(fair >= 0, 'Fair Engagement must be materialized');
  assert.ok(core > fair, 'Living Front Core must load after Fair Engagement');
  assert.ok(instincts > core, 'Wild Instincts must load after Ecology Core');
  assert.ok(director > instincts, 'Front Director must load after Wild Instincts');
});
