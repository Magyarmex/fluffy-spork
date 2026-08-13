const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness() {
  const nodes = [];
  const byId = new Map();
  let observerCb = null;
  function previousOf(node){const i=nodes.indexOf(node);return i>0?nodes[i-1]:null;}
  const head = {
    appendChild(node){
      const old=nodes.indexOf(node);if(old>=0)nodes.splice(old,1);
      nodes.push(node);if(node.id)byId.set(node.id,node);
      if(observerCb)observerCb([{addedNodes:[node]}]);
      return node;
    }
  };
  const classes=new Set();
  const document={
    readyState:'complete',
    head,
    documentElement:{classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}},
    getElementById(id){return byId.get(id)||null;},
    createElement(tag){
      const n={tagName:String(tag).toUpperCase(),id:'',textContent:''};
      Object.defineProperty(n,'previousElementSibling',{get(){return previousOf(n);}});
      return n;
    },
    addEventListener(){}
  };
  function MutationObserver(cb){this.observe=function(){observerCb=cb;};}
  const window={
    addEventListener(){},
    setTimeout(fn){fn();},
    innerWidth:390,innerHeight:844,
    ontouchstart:null
  };
  const context={window,document,MutationObserver,matchMedia(q){return {matches:q.includes('pointer:coarse')||q.includes('orientation:portrait')};},innerWidth:390,innerHeight:844,setTimeout:window.setTimeout,console};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/showroom-containment-v1.7.2.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'showroom-containment-v1.7.2.js'});
  return {context,nodes,byId,classes,document};
}

test('portrait touch mode is explicitly enabled',()=>{
  const h=harness();
  assert.equal(h.classes.has('nvs-portrait-mobile'),true);
});

test('containment CSS forces a bounded one-column portrait layout',()=>{
  const h=harness();
  const css=h.byId.get('nova-showroom-containment-v172').textContent;
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/width:100%!important/);
  assert.match(css,/overflow-x:hidden!important/);
  assert.match(css,/\.nvs-intel/);
  assert.match(css,/\.nvs-delta/);
  assert.doesNotMatch(css,/,[\s\n]*@media/,'media rules must not be embedded in a selector list');
});

test('late base showroom stylesheet cannot overtake containment CSS',()=>{
  const h=harness();
  const containment=h.byId.get('nova-showroom-containment-v172');
  const base=h.document.createElement('style');base.id='nova-showroom-css';base.textContent='.nvs-body{display:grid}';
  h.document.head.appendChild(base);
  assert.equal(h.nodes[h.nodes.length-1],containment,'containment stylesheet should be re-appended last');
  assert.equal(containment.previousElementSibling,base);
});
