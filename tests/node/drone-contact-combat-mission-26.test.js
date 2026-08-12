const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

function compile() {
  const out = mkdtempSync(path.join(tmpdir(), 'nova-drone-contact-'));
  const tsc = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '--target','ES2022','--module','commonjs','--moduleResolution','node','--skipLibCheck','--strict','--rootDir',path.join(root,'src'),'--outDir',out,
    path.join(root,'src/game/combat/DroneContactCombat.ts')], { cwd:root, stdio:'pipe' });
  return { api:require(path.join(out,'game/combat/DroneContactCombat.js')), combat:require(path.join(out,'game/combat/CombatSystem.js')), dispose:()=>rmSync(out,{recursive:true,force:true}) };
}

test('Mission 26 resolves drone contact damage through canonical CombatSystem', () => {
  const compiled = compile();
  try {
    const combat = new compiled.combat.CombatSystem();
    const resolver = new compiled.api.DroneContactCombat(combat);
    const result = resolver.resolve({
      sourceId:'drone:a', sourceTeamId:'blue', position:{x:0,y:0}, damage:24, atSeconds:1,
      target:{ id:'tank:b', teamId:'red', position:{x:1,y:0}, velocity:{x:0,y:0}, radius:20, health:100, maxHealth:100, alive:true },
    });
    assert.equal(result.appliedDamage, 24);
    assert.equal(result.target.health, 76);
    assert.equal(result.destroyed, false);
  } finally { compiled.dispose(); }
});

test('Mission 26 main-game composition consumes attack and harvest intents instead of presentation-owned damage', () => {
  const source = readFileSync(path.join(root,'src/scenes/gameplay/GameplayBattle.ts'),'utf8');
  assert.match(source, /intent\.attack&&intent\.targetId/);
  assert.match(source, /executeDroneAttack\(/);
  assert.match(source, /intent\.harvest/);
  assert.match(source, /executeDroneHarvest\(/);
  assert.match(source, /DroneContactCombat/);
  assert.doesNotMatch(source, /CanvasRenderingContext2D|document\.|window\.|AudioContext/);
});