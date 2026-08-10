const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/deploy.yml'),'utf8');

test('materializer serializes competing main releases',()=>{assert.match(workflow,/concurrency:\s*[\s\S]*group:\s*nova-materialize-\$\{\{ github\.ref \}\}/);assert.match(workflow,/cancel-in-progress:\s*true/);});
test('materializer cannot publish before production build and regression suite pass',()=>{const build=workflow.indexOf('npm run build'),tests=workflow.indexOf('npm run test'),rebuild=workflow.indexOf('Rebuild tested NOVA payload');assert.ok(build>=0);assert.ok(tests>=0);assert.ok(rebuild>=0);assert.ok(build<rebuild);assert.ok(tests<rebuild);});
test('every runtime script must exist before HTML injection',()=>{assert.match(workflow,/missing\s*=\s*\[\]/);assert.match(workflow,/Path\(script_path\)\.is_file\(\)/);assert.match(workflow,/Missing runtime update files/);});
test('remaining releases preserve chronological wrapper order',()=>{const names=['visual-overhaul-v1.9.0.js','sensory-feedback-v1.9.1.js','upgrade-dwell-v1.9.2.js','spotter-comms-v1.9.3.js','controller-command-weave-v1.10.0.js','lobby-battlefield-v1.10.1.js','terrain-intelligence-v1.10.2.js','drone-field-service-v1.10.3.js'];let prev=-1;for(const name of names){const at=workflow.indexOf(name);assert.ok(at>prev,name+' missing or out of order');prev=at;}});
test('new completion layers are explicitly materialized',()=>{for(const name of ['sensory-feedback-v1.9.1.js','drone-field-service-v1.10.3.js'])assert.ok(workflow.split(name).length-1>=2,name+' must appear in injection and verification');});
test('stale materializer refuses to push over newer main',()=>{assert.match(workflow,/git fetch origin main/);assert.match(workflow,/git rev-parse HEAD/);assert.match(workflow,/git rev-parse origin\/main/);assert.match(workflow,/newer materializer run owns index\.html/);assert.ok(workflow.indexOf('git fetch origin main')<workflow.lastIndexOf('git push'));});
