const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
function loadMission24() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-m24-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const entry = path.join(root, 'src/replay/index.ts');
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'ES2022,DOM', '--skipLibCheck', '--strict', '--outDir', outDir, entry], { cwd: root, stdio: 'pipe' });
  return { replay: require(path.join(outDir, 'replay/index.js')), dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}
const api = loadMission24();
test.after(() => api.dispose());
function recording() { const recorder = new api.replay.ReplayRecorder({ seed:90210, buildVersion:'foundation-reference', runtimeVersion:'1', fixedStepMs:1000/60 }); recorder.recordCommand({tick:1,actorId:'player',envelope:{source:'keyboard',sequence:1,command:{type:'move',vector:{x:.5,y:.25}}}}); return recorder.finish(); }
class FakeRuntime { constructor(kind,drift=0){this.kind=kind;this.drift=drift;this.energy=0;this.events=[];} reset(r){this.energy=r.seed%10;this.events=[];} stepTo(){} applyCommand(){this.energy+=1+this.drift;} drainSemanticEvents(){const e=this.events;this.events=[];return e;} outcome(){return {energy:this.energy};} }

test('Mission 24 replay recording remains deterministic after legacy runtime retirement',()=>{const r=recording();assert.equal(r.schemaVersion,1);assert.equal(r.seed,90210);assert.equal(r.commands.length,1);});
test('accepted historical parity can remain a regression reference without a bootable legacy runtime',()=>{const r=recording(), player=new api.replay.ReplayPlayer();const reference=player.play(r,new FakeRuntime('legacy')), foundation=player.play(r,new FakeRuntime('foundation'));assert.deepEqual(reference.outcome,foundation.outcome);assert.deepEqual(reference.semanticEvents,foundation.semanticEvents);});
test('parity harness still exposes meaningful discrepancies and coverage gaps',()=>{const r=recording();const incomplete=new api.replay.ParityHarness().run([{id:'desktop-only',surfaces:['desktop'],recording:r,legacy:()=>new FakeRuntime('legacy'),foundation:()=>new FakeRuntime('foundation')}]);assert.equal(incomplete.passed,false);assert.ok(incomplete.missingSurfaces.includes('pwa'));const drift=new api.replay.ParityHarness().run([{id:'drift',surfaces:api.replay.REQUIRED_PARITY_SURFACES,recording:r,legacy:()=>new FakeRuntime('legacy'),foundation:()=>new FakeRuntime('foundation',1)}]);assert.equal(drift.passed,false);});
test('Mission 26 removes the development runtime switch while retaining replay tooling',()=>{const bootstrap=readFileSync(path.join(root,'src/app/bootstrap.ts'),'utf8');assert.equal(require('node:fs').existsSync(path.join(root,'src/app/runtimeSelector.ts')),false);assert.doesNotMatch(bootstrap,/LegacyRuntime|resolveDevelopmentRuntime|runtime\.selected/);assert.match(bootstrap,/new GameApp\(root\)/);});
