'use strict';
/* A real Quake Cannon shipped as class "quake" while three overlays still
 * checked "quakecannon", silently disabling its authored specialization.
 * Guard the whole active overlay set against this category of regression. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const marker='window.__defineModule("game/classes", function (module, exports, require) {';
function canonicalClasses(){
 const start=html.indexOf(marker),end=html.indexOf('\n});',start);
 assert.ok(start>=0&&end>start,'materialized canonical class registry');
 const mod={exports:{}};
 new Function('module','exports','require',html.slice(start+marker.length,end))(
   mod,mod.exports,()=>{throw Error('unexpected class-module dependency');});
 return mod.exports;
}
test('active overlays never compare tank class IDs against nonexistent classes',()=>{
 const classes=canonicalClasses(),ids=new Set(Object.keys(classes.CLASSES));
 const dir=path.join(root,'nova-updates'),failures=[];
 let inspected=0,comparisons=0;
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.js'))){
  const source=fs.readFileSync(path.join(dir,name),'utf8');
  const expressions=[
   /(?:\bt\.cls|\bcls|\bclassId)\s*===?\s*(['"])([a-z][a-z0-9_-]+)\1/g,
   /(['"])([a-z][a-z0-9_-]+)\1\s*===?\s*(?:\bt\.cls|\bcls|\bclassId)\b/g
  ];
  for(const re of expressions)for(const match of source.matchAll(re)){
   comparisons++;const id=match[2];
   if(!ids.has(id))failures.push(name+': '+id);
  }
  inspected++;
 }
 assert.ok(inspected>=45,'scanned the active shipping overlay collection');
 assert.ok(comparisons>=40,'the guard must cover meaningful class checks');
 assert.deepEqual(failures,[],
   'a misspelled class check can silently disable an entire combat specialization');
});
test('Apex whitelist only contains canonical playable class IDs',()=>{
 const classes=canonicalClasses(),ids=new Set(Object.keys(classes.CLASSES));
 const apex=fs.readFileSync(path.join(root,'nova-updates/apex-disciplines-v1.7.1.js'),'utf8');
 const body=apex.match(/function isApex\(id\)\{([^}]+)\}/);
 assert.ok(body,'Apex whitelist exists');
 const names=[...body[1].matchAll(/\bid===['"]([a-z][a-z0-9_-]+)['"]/g)].map(m=>m[1]);
 assert.ok(names.length>=10,'all Apex descendants covered');
 for(const id of names)assert.ok(ids.has(id),'Apex whitelist contains nonexistent class '+id);
 assert.ok(names.includes('quake'),'canonical Quake must be recognized as an Apex');
});
test('class-specific description keys in Three Disciplines and Apex exist',()=>{
 const classes=canonicalClasses(),ids=new Set(Object.keys(classes.CLASSES));
 for(const name of ['disciplines-v1.7.0.js','apex-disciplines-v1.7.1.js']){
  const source=fs.readFileSync(path.join(root,'nova-updates',name),'utf8');
  const start=source.indexOf('var text={');
  assert.ok(start>=0,name+' description registry');
  const end=source.indexOf('\n  };',start);
  assert.ok(end>start,name+' description registry terminator');
  const keys=[...source.slice(start,end).matchAll(/^\s*([a-z][a-z0-9_-]+):\s*'/gm)].map(m=>m[1]);
  assert.ok(keys.length>=10,name+' class descriptions covered');
  for(const id of keys)assert.ok(ids.has(id),name+' describes nonexistent class '+id);
 }
});
