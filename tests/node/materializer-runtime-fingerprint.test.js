const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const deployPath = path.join(__dirname,'../../.github/workflows/deploy.yml');
const deploy = fs.readFileSync(deployPath,'utf8');

test('materializer loads Blackglass Mirror after the historical showroom fit layer',()=>{
  const fit="'./nova-updates/showroom-fit-v1.7.3.js'";
  const mirror="'./nova-updates/blackglass-mirror-v1.10.6.js'";
  assert.ok(deploy.includes(fit),'historical showroom fit must remain materialized');
  assert.ok(deploy.includes(mirror),'Blackglass Mirror v1.10.6 must be materialized');
  assert.ok(deploy.indexOf(mirror)>deploy.indexOf(fit),'Mirror must load after the historical fit layer');
  assert.match(deploy,/grep -q 'nova-updates\/blackglass-mirror-v1\.10\.6\.js' index\.html\.new/);
});

test('materialized HTML fingerprint changes when a local runtime input changes',()=>{
  assert.match(deploy,/import hashlib/);
  assert.match(deploy,/runtime_inputs = \[/);
  assert.match(deploy,/\*script_paths/);
  assert.match(deploy,/'pwa-register\.js'/);
  assert.match(deploy,/'sw\.js'/);
  assert.match(deploy,/'manifest\.webmanifest'/);
  assert.match(deploy,/'nova-updates\/releases\.json'/);
  assert.match(deploy,/digest\.update\(input_path\.read_bytes\(\)\)/);
  assert.match(deploy,/runtime_build = digest\.hexdigest\(\)\[:24\]/);
  assert.match(deploy,/name="nova-runtime-build"/);
  assert.match(deploy,/grep -q 'name="nova-runtime-build"' index\.html\.new/);
});

test('runtime fingerprint stamp is produced before the service-worker-visible shell is committed',()=>{
  const stamp=deploy.indexOf('runtime_build = digest.hexdigest()[:24]');
  const write=deploy.indexOf("path.write_text(html, encoding='utf-8')");
  const commit=deploy.indexOf('- name: Commit the plain page');
  assert.ok(stamp>=0 && write>stamp && commit>write);
});
