'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');
const start = workflow.indexOf('          git fetch origin main\n', workflow.indexOf('- name: Commit the plain page'));
const end = workflow.indexOf("          git config user.name", start);
assert.ok(start >= 0 && end > start, 'materializer freshness guard must exist');
const guard = workflow.slice(start, end).split('\n').map(line => line.replace(/^          /, '')).join('\n');

function run(cwd, command, args = []) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

test('materializer guard distinguishes tests-only from newer runtime changes', () => {
  for (const [file, shouldAdvance] of [['tests/node/concurrent.test.js', true], ['nova-updates/sample.js', false], ['index.html', false]]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-materializer-race-'));
    try {
      const remote = path.join(root, 'remote.git');
      const producer = path.join(root, 'producer');
      const worker = path.join(root, 'worker');
      run(root, 'git', ['init', '--bare', remote]);
      run(root, 'git', ['clone', remote, producer]);
      run(producer, 'git', ['checkout', '-b', 'main']);
      fs.mkdirSync(path.join(producer, 'nova-updates'));
      fs.writeFileSync(path.join(producer, 'nova-updates', 'sample.js'), 'runtime A');
      fs.writeFileSync(path.join(producer, 'index.html'), 'old shell');
      fs.writeFileSync(path.join(producer, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "require(\'fs\').writeFileSync(\'validation.marker\', \'ran\')"' } }));
      run(producer, 'git', ['add', '.']);
      run(producer, 'git', ['commit', '-m', 'runtime A']);
      run(producer, 'git', ['push', '-u', 'origin', 'main']);
      const oldHead = run(producer, 'git', ['rev-parse', 'HEAD']);
      run(root, 'git', ['clone', '--branch', 'main', remote, worker]);
      fs.writeFileSync(path.join(worker, 'index.html'), 'tested new shell');
      const target = path.join(producer, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'newer commit');
      run(producer, 'git', ['add', '.']);
      run(producer, 'git', ['commit', '-m', 'concurrent change']);
      run(producer, 'git', ['push']);
      const newerHead = run(producer, 'git', ['rev-parse', 'HEAD']);
      const runnerTemp = path.join(root, 'runner-temp');
      fs.mkdirSync(runnerTemp);
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', guard], {
        cwd: worker, encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: runnerTemp },
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(run(worker, 'git', ['rev-parse', 'HEAD']), shouldAdvance ? newerHead : oldHead, file);
      assert.equal(fs.readFileSync(path.join(worker, 'index.html'), 'utf8'), 'tested new shell', file);
      assert.equal(fs.existsSync(path.join(worker, 'validation.marker')), shouldAdvance,
        'only a safe latest-main reattachment must rerun acceptance tests');
      if (shouldAdvance) {
        run(worker, 'git', ['add', 'index.html']);
        run(worker, 'git', ['commit', '-m', 'Materialize NOVA TANKS runtime release']);
        run(worker, 'git', ['push', 'origin', 'HEAD:main']);
        run(producer, 'git', ['fetch', 'origin', 'main']);
        assert.equal(run(producer, 'git', ['show', 'origin/main:index.html']), 'tested new shell');
        assert.equal(run(producer, 'git', ['show', 'origin/main:tests/node/concurrent.test.js']), 'newer commit');
      }

    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
