'use strict';
/* Regression contract: superseded PR and feature-branch validation may be
 * cancelled, but canonical main commits and manual research must retain
 * their own runs. This is intentionally a source-level workflow assertion;
 * GitHub Actions validates the actual YAML/expression syntax on each PR. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const workflows=[
  'ci.yml',
  'browser-smoke.yml',
  'frontlines-natural-match.yml',
  'frontlines-live-turn-causal.yml'
];
const read=name=>fs.readFileSync(path.join(root,'.github/workflows',name),'utf8');

test('superseded PR/feature checks cancel without cancelling main or manual runs',()=>{
  for(const name of workflows){
    const src=read(name);
    assert.match(src,/^concurrency:\s*$/m,name+': top-level concurrency missing');
    assert.equal((src.match(/^concurrency:\s*$/gm)||[]).length,1,name+': duplicate concurrency');
    const group=src.match(/^  group: (.+)$/m)?.[1];
    const cancel=src.match(/^  cancel-in-progress: (.+)$/m)?.[1];
    assert.ok(group&&cancel,name+': incomplete concurrency contract');
    for(const term of ['github.workflow','github.event_name',
      'github.event.pull_request.number',
      "github.event_name == 'workflow_dispatch' && github.run_id",
      "github.ref == 'refs/heads/main' && github.sha",
      'github.ref']){
      assert.ok(group.includes(term),name+': missing group isolation '+term);
    }
    assert.equal(cancel,
      "${{ github.event_name == 'pull_request' || (github.event_name == 'push' && github.ref != 'refs/heads/main') }}",
      name+': must never cancel main or manual validations');
    assert.match(src,/^  pull_request:/m,name+': PR validation must remain enabled');
    assert.match(src,/^jobs:/m,name+': original jobs must remain');
  }
});

test('production materializer retains its own separate serialization contract',()=>{
  const src=read('deploy.yml');
  assert.match(src,/group: nova-materialize-\$\{\{ github\.ref \}\}/);
  assert.match(src,/cancel-in-progress: true/);
  assert.match(src,/^  push:/m);
});
