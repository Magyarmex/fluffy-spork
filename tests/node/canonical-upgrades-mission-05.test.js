const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '../..');
function legacySpecimen() {
  const directory = path.join(root, 'nova-gz');
  const encoded = fs.readdirSync(directory).filter((name) => /^\d+\.b64$/.test(name)).sort().map((name) => fs.readFileSync(path.join(directory, name), 'utf8').trim()).join('');
  return zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
}
const legacy = legacySpecimen();
const upgrades = fs.readFileSync(path.join(root, 'src/content/upgrades/catalog.ts'), 'utf8');
const publicApi = fs.readFileSync(path.join(root, 'src/content/index.ts'), 'utf8');
const ids = ['damage','reload','bulletspeed','penetration','maxhp','regen','speed','body'];

test('Mission 05 owns every assignable frozen-legacy stat key in UpgradeRegistry', () => {
  for (const id of ids) {
    assert.match(upgrades, new RegExp(`id: '${id}'`), `missing canonical stat upgrade ${id}`);
    assert.match(legacy, new RegExp(`(?:stats\\.${id}|stats\\[['\"]${id}['\"]\\]|['\"]${id}['\"])`), `legacy specimen does not contain stat key ${id}`);
  }
  assert.equal((upgrades.match(/maxRank: 8/g) || []).length, 8);
  assert.match(legacy, /t\.stats\[k\] < 8/);
  assert.match(publicApi, /UpgradeRegistry/);
});
