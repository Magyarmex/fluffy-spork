const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function baseContext(){
  const listeners = {};
  const context = {
    console, window:{},
    document:{ readyState:'loading', documentElement:{}, addEventListener(type,fn){listeners[type]=fn;}, getElementById(){return null;}, querySelectorAll(){return [];} },
    navigator:{onLine:true,maxTouchPoints:0}, requestAnimationFrame(fn){return fn();}, MutationObserver:class{observe(){} disconnect(){}},
    fetch(){throw new Error('fetch should not run before DOMContentLoaded in this unit harness');}, setTimeout, clearTimeout, setInterval, clearInterval,
  };
  context.window.window=context.window; return {context,listeners};
}
function load(){const {context}=baseContext();const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/living-archive-v1.7.9.js'),'utf8');vm.runInNewContext(src,context,{filename:'living-archive-v1.7.9.js'});return{context,hooks:context.window.__NOVA_LIVING_ARCHIVE_TEST__,src};}
function loadColorPatch(){const {context}=baseContext();context.window.__NOVA_LIVING_ARCHIVE_TEST__={version:'test-only'};const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/living-archive-runtime-cleanup-v1.7.9.js'),'utf8');vm.runInNewContext(src,context,{filename:'living-archive-runtime-cleanup-v1.7.9.js'});return{context,patch:context.window.__NOVA_ARCHIVE_COLOR_PATCH__,src};}
function hue(color){const m=/^hsl\(([-\d.]+)/.exec(color);return m?Number(m[1]):NaN;}

test('Living Archive publishes v1.7.9 release metadata',()=>{const{context,hooks}=load();assert.equal(hooks.version,'1.7.9');assert.equal(context.window.__NOVA_LIVING_ARCHIVE_RELEASE__.codename,'Living Archive');});
test('major versions own distinct hue families while v1 releases stay cohesive',()=>{const{patch}=loadColorPatch();const a=hue(patch.colorFor('1.1.0','A')),b=hue(patch.colorFor('1.7.0','B')),c=hue(patch.colorFor('2.1.0','C'));assert.ok(Math.abs(a-b)<12);assert.ok(Math.abs(a-c)>40);});
test('patch posts get distinct variations inside the same minor family',()=>{const{patch}=loadColorPatch();const a=patch.colorFor('1.1.0','Alpha'),b=patch.colorFor('1.1.1','Beta'),c=patch.colorFor('1.1.2','Gamma');assert.notEqual(a,b);assert.notEqual(b,c);assert.ok(Math.abs(hue(a)-hue(c))<6);});
test('same semantic version can still give separate release posts their own tint',()=>{const{patch}=loadColorPatch();assert.notEqual(patch.colorFor('1.7.7','Contained First Contact'),patch.colorFor('1.7.7','Pilot Console'));assert.notEqual(patch.colorFor('1.7.8','Signal Flow'),patch.colorFor('1.7.8','Zero Churn'));});
test('archive dedupes exact release posts but preserves different codenames on the same version',()=>{const{hooks}=load();const rows=hooks.dedupe([{version:'1.7.7',codename:'Pilot Console',headline:'A'},{version:'1.7.7',codename:'Pilot Console',headline:'A'},{version:'1.7.7',codename:'Contained First Contact',headline:'B'},{version:'1.7.8',codename:'Signal Flow',headline:'C'}]);assert.equal(rows.length,3);assert.equal(rows[0].version,'1.7.8');const names=Array.from(rows.filter(r=>r.version==='1.7.7'),r=>String(r.codename)).sort();assert.equal(names.join('|'),'Contained First Contact|Pilot Console');});
test('UI contract includes persistent latest card, scrollable archive, ambience and reduced-motion support',()=>{const{src}=load();assert.match(src,/dataset\.novaSlot='latest-release'/);assert.match(src,/OPEN ARCHIVE/);assert.match(src,/overflow-y:auto/);assert.match(src,/nvl-ambience/);assert.match(src,/prefers-reduced-motion:reduce/);assert.match(src,/data-nova-action=\\?"updates\\?"/);});
test('runtime refinement removes discovery test metadata and recolors rendered release posts',()=>{const{context,patch,src}=loadColorPatch();assert.ok(patch&&typeof patch.colorFor==='function');assert.equal(context.window.__NOVA_LIVING_ARCHIVE_TEST__,undefined);assert.match(src,/\.nvl-release,\.nvl-latest/);assert.match(src,/delete window\.__NOVA_LIVING_ARCHIVE_TEST__/);});
test('Living Archive remains legacy parity evidence and is absent from canonical deployment',()=>{const root=path.join(__dirname,'../..');const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');assert.ok(fs.existsSync(path.join(root,'nova-updates/menu-slot-compat-v1.7.8.js')));assert.ok(fs.existsSync(path.join(root,'nova-updates/living-archive-v1.7.9.js')));assert.ok(fs.existsSync(path.join(root,'nova-updates/living-archive-runtime-cleanup-v1.7.9.js')));assert.equal(fs.existsSync(path.join(root,'nova-updates/auto-update-test-v1.7.4.js')),false);assert.doesNotMatch(deploy,/living-archive|menu-slot-compat|auto-update-test|nova-updates\//);assert.match(deploy,/path: dist/);});
