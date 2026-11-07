'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');
const step = workflow.slice(workflow.indexOf('      - name: Commit the plain page'));
assert.ok(step.startsWith('      - name: Commit the plain page'));
const script = step.slice(step.indexOf('        run: |') + '        run: |'.length)
  .split('\n').slice(1).map(line => line.replace(/^          /, '')).join('\n');
assert.match(script, /for attempt in 1 2 3/);

test('initial and retry freshness guards cover identical runtime paths', () => {
  const pattern = /git diff --quiet (?:HEAD|"\\$tested_source") origin\\/main -- \\\n([\\s\\S]*?)index\\.html; then/g;
  const matches = [...workflow.matchAll(pattern)];
  assert.equal(matches.length, 2, 'both source guards must remain present');
  const paths = matches.map(match => match[1].replace(/\\\\\\n/g, ' ').trim().split(/\\s+/));
  assert.deepEqual(paths[0], paths[1], 'retry guard must never omit a runtime input');
});


function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: {
    ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  } });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}

for (const scenario of ['tests-only', 'pre-and-post', 'runtime', 'index', 'transport', 'red-tests', 'exhaustion']) {
  test('materializer post-fetch/pre-push recovery: ' + scenario, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-push-race-'));
    try {
      const remote = path.join(root, 'remote.git');
      const producer = path.join(root, 'producer');
      const worker = path.join(root, 'worker');
      git(root, 'init', '--bare', remote);
      git(root, 'clone', remote, producer);
      git(producer, 'checkout', '-b', 'main');
      fs.mkdirSync(path.join(producer, 'nova-updates'), { recursive: true });
      fs.writeFileSync(path.join(producer, 'nova-updates', 'sample.js'), 'original runtime');
      fs.writeFileSync(path.join(producer, 'index.html'), 'old page');
      fs.writeFileSync(path.join(producer, 'package.json'), JSON.stringify({
        scripts: { test: 'node -e "require(\'fs\').writeFileSync(\'validation.marker\', \'ran\')" && node --test tests/node/*.test.js' },
      }));
      git(producer, 'add', '.');
      git(producer, 'commit', '-m', 'original runtime');
      git(producer, 'push', '-u', 'origin', 'main');
      git(root, 'clone', '--branch', 'main', remote, worker);
      if (scenario === 'pre-and-post') {
        fs.mkdirSync(path.join(producer, 'tests/node'), { recursive: true });
        fs.writeFileSync(path.join(producer, 'tests/node/earlier.test.js'), '1');
        git(producer, 'add', '.');
        git(producer, 'commit', '-m', 'earlier tests-only merge');
        git(producer, 'push', 'origin', 'main');
      }
      fs.writeFileSync(path.join(worker, 'index.html'), 'tested new page');

      // The hook creates a real competing commit *inside* git push, after the
      // workflow's freshness fetch. A third race must exhaust the bounded loop.
      const hook = path.join(worker, '.git', 'hooks', 'pre-push');
      fs.writeFileSync(hook, `#!/bin/sh
set -eu
count_file="\${RACE_COUNTER}"
count=0
if [ -f "$count_file" ]; then count=$(cat "$count_file"); fi
count=$((count + 1))
echo "$count" > "$count_file"
if [ "\${RACE_KIND}" = "transport" ]; then exit 1; fi
if [ "\${RACE_KIND}" = "exhaustion" ] || [ "$count" -eq 1 ]; then
  git -C "\${RACE_PRODUCER}" fetch origin main >/dev/null 2>&1
  git -C "\${RACE_PRODUCER}" reset --hard origin/main >/dev/null
  if [ "\${RACE_KIND}" = "runtime" ]; then
    echo changed > "\${RACE_PRODUCER}/nova-updates/sample.js"
  elif [ "\${RACE_KIND}" = "index" ]; then
    echo newer > "\${RACE_PRODUCER}/index.html"
  else
    mkdir -p "\${RACE_PRODUCER}/tests/node"
    if [ "\${RACE_KIND}" = "red-tests" ]; then
      echo "throw new Error('new regression')" > "\${RACE_PRODUCER}/tests/node/concurrent-$count.test.js"
    else
      echo "$count" > "\${RACE_PRODUCER}/tests/node/concurrent-$count.test.js"
    fi
  fi
  git -C "\${RACE_PRODUCER}" add .
  git -C "\${RACE_PRODUCER}" commit -m "competing change $count" >/dev/null
  git -C "\${RACE_PRODUCER}" push origin main >/dev/null 2>&1
fi
`);
      fs.chmodSync(hook, 0o755);
      const temp = path.join(root, 'runner-temp');
      fs.mkdirSync(temp);
      const r = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
        cwd: worker, encoding: 'utf8', timeout: 30000,
        env: {
          ...process.env, RUNNER_TEMP: temp, RACE_COUNTER: path.join(root, 'count'),
          RACE_PRODUCER: producer, RACE_KIND: scenario,
          GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
          GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
        },
      });
      assert.equal(r.status, ['exhaustion', 'transport', 'red-tests'].includes(scenario) ? 1 : 0, r.stderr || r.stdout);
      git(producer, 'fetch', 'origin', 'main');
      const published = git(producer, 'show', 'origin/main:index.html');
      assert.equal(published, ['tests-only', 'pre-and-post'].includes(scenario) ? 'tested new page' : scenario === 'index' ? 'newer' : 'old page');
      if (['tests-only', 'pre-and-post', 'exhaustion'].includes(scenario)) {
        assert.equal(git(producer, 'show', 'origin/main:tests/node/concurrent-1.test.js'), '1');
      }
      if (scenario === 'runtime') {
        assert.equal(git(producer, 'show', 'origin/main:nova-updates/sample.js'), 'changed');
      }
      if (scenario === 'pre-and-post') {
        assert.equal(git(producer, 'show', 'origin/main:tests/node/earlier.test.js'), '1');
      }
      if (scenario === 'tests-only' || scenario === 'pre-and-post') {
        assert.equal(fs.readFileSync(path.join(worker, 'validation.marker'), 'utf8'), 'ran');
      }
      if (scenario === 'red-tests') {
        assert.match(r.stderr + r.stdout, /new regression/);
      }
      if (scenario === 'transport') {
        assert.match(r.stderr, /reason other than a non-fast-forward race/);
        assert.equal(fs.readFileSync(path.join(root, 'count'), 'utf8').trim(), '1');
      }
      if (scenario === 'exhaustion') {
        assert.match(r.stderr, /exhausted three safe push attempts/);
        assert.equal(fs.readFileSync(path.join(root, 'count'), 'utf8').trim(), '3');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
