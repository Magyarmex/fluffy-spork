const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const test=require('node:test');
const root=path.resolve(__dirname,'../..');
function load(){const out=mkdtempSync(path.join(tmpdir(),'nova-content-final-'));const tsc=require.resolve('typescript/bin/tsc');execFileSync(process.execPath,[tsc,'--target','ES2022','--module','commonjs','--moduleResolution','node','--skipLibCheck','--strict','--outDir',out,path.join(root,'src/content/index.ts')],{cwd:root,stdio:'pipe'});return{api:require(path.join(out,'content/index.js')),dispose:()=>rmSync(out,{recursive:true,force:true})};}
const loaded=load();test.after(()=>loaded.dispose());const api=loaded.api;

test('canonical content registry is self-contained after frozen legacy specimen retirement',()=>{assert.equal(api.TankRegistry.size,36);assert.equal(api.WeaponRegistry.size,36);assert.equal(api.DroneRegistry.size,36);assert.equal(api.BattlefieldRegistry.size,3);assert.equal(api.UpgradeRegistry.size,8);for(const id of ['basic','gunner','cannon','sniper','controller','guardian','tempest','annihilator','prism','carrier','bastion'])assert.ok(api.TankRegistry.has(id),id);});
test('canonical battlefield and lineage contracts remain stable without runtime patches',()=>{assert.deepEqual(api.BattlefieldRegistry.all().map(x=>x.name),['Crossfire','Split Horizon','Four Gates']);for(const tank of api.TankRegistry.all()){assert.ok(tank.weapon);assert.equal(api.WeaponRegistry.get(`${tank.id}:weapon`).id,`${tank.id}:weapon`);assert.equal(api.DroneRegistry.get(`${tank.id}:drone`).id,`${tank.id}:drone`);}});
test('canonical source retains frozen specimen provenance in Git history rather than executable payloads',()=>{assert.match(api.CONTENT_SPECIMEN,/^main@[0-9a-f]{40}$/);});
