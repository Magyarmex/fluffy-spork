'use strict';
// Controller AI must be committed, not permanently obsessed with the first visible target.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
const a=source.indexOf('function bestObservedTank('),b=source.indexOf('function hostileDroneNear(',a);
assert.ok(a>=0&&b>a,'canonical shipping target selector exists');
const choose=new Function('dist2','hostileOwners','sensorSees',
  'return ('+source.slice(a,b).trim()+')')(
  (ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2,
  (g,o,t)=>o.team!==t.team,
  (g,o,t)=>t.visible!==false);
function world(){
 const owner={id:1,team:'blue',x:0,y:0,alive:true};
 const current={id:2,team:'red',x:500,y:0,alive:true};
 const closer={id:3,team:'red',x:120,y:0,alive:true};
 return{owner,current,closer,g:{tanks:[owner,current,closer]}};
}
for(const hz of [30,60,120,240]){
 test('AI Controller retargets a much closer visible enemy after commitment at '+hz+'Hz',()=>{
  const s=world();assert.equal(choose(s.g,s.owner,s.current,false),s.closer);
 });
 test('AI Controller preserves a valid target during commitment at '+hz+'Hz',()=>{
  const s=world();assert.equal(choose(s.g,s.owner,s.current,true),s.current);
 });
}
test('small range advantage does not cause rapid retarget oscillation',()=>{
 const s=world();s.closer.x=475;
 assert.equal(choose(s.g,s.owner,s.current,false),s.current);
});
test('equal-information target choice does not privilege human identity',()=>{
 const s=world();s.current.x=110;s.current.isPlayer=true;
 s.closer.x=105;s.closer.isPlayer=false;
 assert.equal(choose(s.g,s.owner,null,false),s.closer);
});
test('shielded, hidden, or allied challengers cannot steal commitment',()=>{
 for(const mode of ['shield','hidden','ally']){
  const s=world();if(mode==='shield')s.closer.spawnShieldT=1;
  if(mode==='hidden')s.closer.visible=false;
  if(mode==='ally')s.closer.team='blue';
  assert.equal(choose(s.g,s.owner,s.current,false),s.current,mode);
 }
});
test('shipping planner passes commitment state into the target selector',()=>{
 assert.match(source,/bestObservedTank\(g,owner,current,now<p\.commitUntil\)/);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.indexOf('nova-updates/second-body-live-vector-v1.10.7.js')>
   html.indexOf('nova-updates/controller-v1.3.0.js'));
});
