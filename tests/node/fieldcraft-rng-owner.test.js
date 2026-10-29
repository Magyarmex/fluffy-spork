'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/menu-slot-compat-v1.7.8.js'),'utf8');
const start=source.indexOf('/* NOVA TANKS v1.7.9 — Fieldcraft');
const end=source.indexOf('/* NOVA FIELDCRAFT DEATH INSIGHT',start);
assert.ok(start>=0&&end>start,'canonical Fieldcraft module markers changed');
const fieldcraft=source.slice(start,end);
function load(){
 let sharedDraws=0;
 const math=Object.create(Math);
 math.random=()=>{sharedDraws++;return .5;};
 const window={};
 const document={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(fieldcraft,{window,document,Math:math,Date:{now:()=>123456789}},
  {filename:'shipping-fieldcraft',timeout:5000});
 assert.ok(window.NOVATips,'actual shipping tip API did not initialize');
 return {tips:window.NOVATips,sharedDraws:()=>sharedDraws};
}
test('shipping Fieldcraft shuffle never advances gameplay Math.random',()=>{
 const {tips,sharedDraws}=load();
 const count=tips.audit().current;
 assert.equal(count,50);
 const first=Array.from({length:count},()=>tips.next('main').id);
 assert.equal(new Set(first).size,count,'shuffle-bag must exhaust all tips before repeating');
 const next=tips.next('main').id;
 assert.notEqual(next,first.at(-1),'new bag repeats previous final tip');
 for(let i=0;i<100;i++)tips.next('controls',['controls','settings','ui']);
 assert.equal(sharedDraws(),0,'menu tip rotation consumed combat RNG');
});
test('Fieldcraft bag RNG streams are independent across menu contexts',()=>{
 const a=load(),b=load();
 const expected=Array.from({length:8},()=>a.tips.next('main').id);
 const actual=[];
 for(let i=0;i<8;i++){
  b.tips.next('controls',['controls','settings','ui']);
  actual.push(b.tips.next('main').id);
 }
 assert.deepEqual(actual,expected,'another menu card perturbed main tip order');
 assert.equal(a.sharedDraws()+b.sharedDraws(),0);
});
test('Fieldcraft registration and retirement keep active tip contract',()=>{
 const {tips,sharedDraws}=load();
 assert.equal(tips.register({id:'rng-regression-probe',text:'Use a legal firing lane.',tags:['general']}),true);
 assert.equal(tips.audit().current,51);
 const withNew=Array.from({length:51},()=>tips.next('added').id);
 assert.equal(new Set(withNew).size,51);
 assert.ok(withNew.includes('rng-regression-probe'));
 assert.equal(tips.deprecate('rng-regression-probe'),true);
 assert.equal(tips.audit().current,50);
 const retired=Array.from({length:50},()=>tips.next('retired').id);
 assert.ok(!retired.includes('rng-regression-probe'));
 assert.equal(sharedDraws(),0);
});
test('shipping composition loads Fieldcraft before canonical game boot',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const tips=html.indexOf('./nova-updates/menu-slot-compat-v1.7.8.js');
 const boot=html.indexOf("window.__bootModule('main')");
 assert.ok(tips>=0&&boot>tips);
 // This file also owns actual terrain-safe spawn randomness; do not replace it.
 assert.match(source,/Math\.random/);
});
