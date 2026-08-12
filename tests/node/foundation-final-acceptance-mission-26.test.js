const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

const retired=['nova-gz','nova-payload','nova-updates','src/legacy','src/app/runtimeSelector.ts','pwa-register.js'];

test('Mission 26 physically removes every retired runtime layer',()=>{for(const item of retired)assert.equal(fs.existsSync(path.join(root,item)),false,`${item} must be absent`);});
test('canonical bootstrap has exactly one game runtime path',()=>{const source=read('src/app/bootstrap.ts');assert.match(source,/const app = new GameApp\(root\)/);assert.match(source,/app\.start\(\)/);assert.doesNotMatch(source,/LegacyRuntime|resolveDevelopmentRuntime|runtime\.selected|@legacy|__bootModule|__novaModules/);});
test('toolchain has no legacy source alias or materializer dependency',()=>{for(const file of ['tsconfig.json','vite.config.ts','.github/workflows/ci.yml','.github/workflows/deploy.yml']){const source=read(file);assert.doesNotMatch(source,/@legacy|src\/legacy/);}const deploy=read('.github/workflows/deploy.yml');assert.match(deploy,/path: dist/);assert.doesNotMatch(deploy,/nova-gz|nova-payload|nova-updates|Materialize NOVA|index\.html\.new/);});
test('production shell remains thin and source-driven',()=>{const html=read('index.html');assert.ok(Buffer.byteLength(html)<32*1024);assert.match(html,/type="module" src="\/src\/main\.ts"/);assert.doesNotMatch(html,/__bootModule|__novaModules|nova-updates|nova-gz|nova-payload/);});
test('retired patch-presence tests no longer masquerade as canonical regression coverage',()=>{const names=fs.readdirSync(path.join(root,'tests/node'));const forbidden=names.filter(name=>/v1\.\d|legacy-boundary|materializer-runtime-fingerprint/.test(name));assert.deepEqual(forbidden,[]);});
test('Foundation migration has all predecessor markers before Mission 26 seal',()=>{for(let i=1;i<=25;i++){const name=`MISSION-${String(i).padStart(2,'0')}.md`;assert.equal(fs.existsSync(path.join(root,'docs/nova-foundation/completed',name)),true,name);}});
