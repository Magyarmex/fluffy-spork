const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const spotter = fs.readFileSync(path.resolve(__dirname, '../../nova-updates/spotter-intelligence-v1.5.1.js'), 'utf8');
const stability = fs.readFileSync(path.resolve(__dirname, '../../nova-updates/stability-v1.4.0.js'), 'utf8');

test('both active Observer relay paths require terrain line of sight when Battlefield provides it', () => {
  const guard = /g\.hasLineOfSight&&!g\.hasLineOfSight\(d\.x,d\.y,t\.x,t\.y,2\)\)continue/;
  assert.match(spotter, guard);
  assert.match(stability, guard);
});
