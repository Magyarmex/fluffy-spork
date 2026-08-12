const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
const validator=fs.readFileSync(path.join(root,'scripts/validate-dist.mjs'),'utf8');

test('canonical Pages releases serialize competing main deployments',()=>{assert.match(workflow,/concurrency:\s*[\s\S]*group:\s*nova-pages-\$\{\{ github\.ref \}\}/);assert.match(workflow,/cancel-in-progress:\s*true/);});
test('canonical artifact cannot deploy before locked install, typecheck, tests, build and validation pass',()=>{const install=workflow.indexOf('npm ci'),typecheck=workflow.indexOf('npm run typecheck'),tests=workflow.indexOf('npm run test'),build=workflow.indexOf('npm run build'),validate=workflow.indexOf('npm run validate:dist'),upload=workflow.indexOf('actions/upload-pages-artifact@v3');for(const value of [install,typecheck,tests,build,validate,upload])assert.ok(value>=0);assert.ok(install<typecheck&&typecheck<tests&&tests<build&&build<validate&&validate<upload);});
test('deployment uploads only the validated dist artifact',()=>{assert.match(workflow,/path: dist/);assert.match(workflow,/actions\/deploy-pages@v4/);assert.doesNotMatch(workflow,/nova-gz|nova-updates|index\.html\.new|git push|Materialize NOVA/);});
test('artifact validation rejects legacy runtime dependencies',()=>{for(const legacy of ['nova-updates/','nova-gz/','__novaModules','__bootModule'])assert.ok(validator.includes(legacy));assert.match(validator,/Legacy production dependency survived build/);});
test('legacy patch corpus remains available only as Mission 26 validation evidence',()=>{for(const name of ['visual-overhaul-v1.9.0.js','sensory-feedback-v1.9.1.js','drone-field-service-v1.10.3.js','shared-battlefield-view-v1.10.5.js','second-body-live-vector-v1.10.7.js','applied-power-parity-v1.10.8.js','visual-language-v1.10.9.js'])assert.ok(fs.existsSync(path.join(root,'nova-updates',name)),name+' legacy evidence missing');});
