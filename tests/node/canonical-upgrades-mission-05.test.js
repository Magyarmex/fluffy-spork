const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const test=require('node:test');
const root=path.resolve(__dirname,'../..');
function load(){const out=mkdtempSync(path.join(tmpdir(),'nova-upgrades-final-'));const tsc=require.resolve('typescript/bin/tsc');execFileSync(process.execPath,[tsc,'--target','ES2022','--module','commonjs','--moduleResolution','node','--skipLibCheck','--strict','--outDir',out,path.join(root,'src/content/index.ts')],{cwd:root,stdio:'pipe'});return{api:require(path.join(out,'content/index.js')),dispose:()=>rmSync(out,{recursive:true,force:true})};}
const loaded=load();test.after(()=>loaded.dispose());
test('all eight accepted stat upgrades remain canonical after legacy deletion',()=>{const expected=['damage','reload','bulletspeed','penetration','maxhp','regen','speed','body'];const actual=loaded.api.UpgradeRegistry.all();assert.deepEqual(actual.map(x=>x.id),expected);for(const upgrade of actual)assert.equal(upgrade.maxRank,8);});
