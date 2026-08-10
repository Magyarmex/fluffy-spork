const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/deploy.yml'),'utf8');

test('materializer serializes competing main releases',()=>{
  assert.match(workflow,/concurrency:\s*[\s\S]*group:\s*nova-materialize-\$\{\{ github\.ref \}\}/);
  assert.match(workflow,/cancel-in-progress:\s*true/);
});

test('materializer cannot publish before the production build and regression suite pass',()=>{
  const build=workflow.indexOf('npm run build');
  const tests=workflow.indexOf('npm run test');
  const rebuild=workflow.indexOf('Rebuild tested NOVA payload');
  assert.ok(build>=0,'production build gate missing');
  assert.ok(tests>=0,'regression test gate missing');
  assert.ok(rebuild>=0,'materialization step missing');
  assert.ok(build<rebuild,'build must run before materialization');
  assert.ok(tests<rebuild,'tests must run before materialization');
});

test('every runtime script named by the materializer must exist before HTML injection',()=>{
  assert.match(workflow,/missing\s*=\s*\[\]/);
  assert.match(workflow,/Path\(script_path\)\.is_file\(\)/);
  assert.match(workflow,/Missing runtime update files/);
});

test('completion releases are injected in wrapper-safe chronological order',()=>{
  const names=['visual-overhaul-v1.9.0.js','sensory-feedback-v1.9.1.js','upgrade-dwell-v1.9.2.js','spotter-comms-v1.9.3.js','controller-command-weave-v1.10.0.js','drone-field-service-v1.10.1.js','lobby-war-room-v1.10.2.js'];
  let previous=-1;
  for(const name of names){const at=workflow.indexOf(name);assert.ok(at>previous,name+' missing or out of order');previous=at;}
});

test('new completion layers are explicit materialization assertions',()=>{
  for(const name of ['sensory-feedback-v1.9.1.js','drone-field-service-v1.10.1.js','lobby-war-room-v1.10.2.js']){
    const hits=workflow.split(name).length-1;
    assert.ok(hits>=2,name+' should appear in scripts and post-materialization verification');
  }
});

test('stale materializer run refuses to push over a newer main commit',()=>{
  assert.match(workflow,/git fetch origin main/);
  assert.match(workflow,/git rev-parse HEAD/);
  assert.match(workflow,/git rev-parse origin\/main/);
  assert.match(workflow,/newer materializer run owns index\.html/);
  assert.ok(workflow.indexOf('git fetch origin main')<workflow.lastIndexOf('git push'));
});
