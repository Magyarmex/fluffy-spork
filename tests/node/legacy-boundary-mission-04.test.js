const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const legacyNames = /__novaModules|__novaCache|__novaMakeRequire|__bootModule/;

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.tsx?$/.test(entry.name) ? [absolute] : [];
  });
}

test('Mission 04 installs the complete typed compatibility boundary', () => {
  for (const relativePath of ['src/legacy/LegacyRuntime.ts','src/legacy/LegacyModules.ts','src/legacy/LegacyEvents.ts','src/legacy/LegacyStateAdapter.ts','src/legacy/README.md']) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} should exist`);
  }
});

test('legacy runtime globals are prohibited outside src/legacy', () => {
  const srcRoot = path.join(root, 'src');
  const violations = sourceFiles(srcRoot)
    .filter((absolute) => !absolute.startsWith(path.join(srcRoot, 'legacy') + path.sep))
    .filter((absolute) => legacyNames.test(fs.readFileSync(absolute, 'utf8')))
    .map((absolute) => path.relative(root, absolute));
  assert.deepEqual(violations, [], `legacy runtime globals escaped boundary: ${violations.join(', ')}`);
});

test('Mission 25 production app is Foundation-owned and legacy boot stays behind the development selector', () => {
  const gameApp = read('src/app/GameApp.ts');
  const bootstrap = read('src/app/bootstrap.ts');
  assert.match(gameApp, /FoundationRuntime/);
  assert.doesNotMatch(gameApp, /LegacyRuntime|legacyRuntime\.boot/);
  assert.doesNotMatch(gameApp, legacyNames);
  assert.match(bootstrap, /runtime\.selected === 'legacy'/);
  assert.match(bootstrap, /import\.meta\.env\.DEV/);
  assert.match(bootstrap, /await import\('@legacy\/LegacyRuntime'\)/);
});

test('LegacyRuntime remains the explicit owner of historical module-wrapper access until Mission 26', () => {
  const runtime = read('src/legacy/LegacyRuntime.ts');
  assert.match(runtime, /__novaModules/);
  assert.match(runtime, /__novaCache/);
  assert.match(runtime, /__novaMakeRequire/);
  assert.match(runtime, /__bootModule/);
  assert.match(runtime, /snapshot\(\)/);
  const docs = read('src/legacy/README.md');
  assert.match(docs, /temporary deletion target/i);
  assert.match(docs, /must not be implemented here/i);
});
