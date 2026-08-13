const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('NOVA Owner Android companion sources are present', () => {
  assert.equal(fs.existsSync('android-owner/app/src/main/AndroidManifest.xml'), true);
  assert.equal(fs.existsSync('android-owner/app/src/main/java/com/novatanks/owner/MainActivity.java'), true);
});
