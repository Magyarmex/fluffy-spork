const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
const validator=fs.readFileSync(path.join(root,'scripts/validate-dist.mjs'),'utf8');

test('canonical Pages releases serialize competing main deployments',()=>{assert.match(workflow,/concurrency:\s*[\s\S]*group:\s*nova-pages-\$\{\{ github\.ref \}\}/);assert.match(workflow,/cancel-in-progress:\s*true/);});
test('canonical artifact cannot deploy before locked install, typecheck, tests, build and validation pass',()=>{const install=workflow.indexOf('npm ci'),typecheck=workflow.indexOf('npm run typecheck'),tests=workflow.indexOf('npm run test'),build=workflow.indexOf('npm run build'),validate=workflow.indexOf('npm run validate:dist'),upload=workflow.indexOf('actions/upload-pages-artifact@v3');for(const value of [install,typecheck,tests,build,validate,upload])assert.ok(value>=0);assert.ok(install<typecheck&&typecheck<tests&&tests<build&&build<validate&&validate<upload);});
test('deployment uploads only the validated dist artifact',()=>{assert.match(workflow,/path: dist/);assert.match(workflow,/actions\/deploy-pages@v4/);assert.doesNotMatch(workflow,/nova-gz|nova-payload|nova-updates|index\.html\.new|git push|Materialize NOVA/);});
test('artifact validation rejects reintroduction of every retired runtime mechanism',()=>{for(const legacy of ['nova-updates/','nova-gz/','nova-payload/','__novaModules','__novaCache','__novaMakeRequire','__bootModule','runtime=legacy','pwa-register.js'])assert.ok(validator.includes(legacy),legacy);assert.match(validator,/Retired production dependency survived build/);});
test('historical payload, patch and migration source is absent from the executable repository',()=>{for(const retired of ['nova-gz','nova-payload','nova-updates','src/legacy','src/app/runtimeSelector.ts','src/replay/ParityHarness.ts','pwa-register.js'])assert.equal(fs.existsSync(path.join(root,retired)),false,retired+' should be gone');});
