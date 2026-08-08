const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness(){
  const nodes=[]; const byId=new Map(); let observerCb=null;
  function prev(node){const i=nodes.indexOf(node);return i>0?nodes[i-1]:null;}
  const head={appendChild(node){const i=nodes.indexOf(node);if(i>=0)nodes.splice(i,1);nodes.push(node);if(node.id)byId.set(node.id,node);if(observerCb)observerCb([{addedNodes:[node]}]);return node;}};
  const document={readyState:'complete',head,getElementById(id){return byId.get(id)||null;},createElement(tag){const n={tagName:String(tag).toUpperCase(),id:'',textContent:''};Object.defineProperty(n,'previousElementSibling',{get(){return prev(n);}});return n;},addEventListener(){}};
  function MutationObserver(cb){this.observe=function(){observerCb=cb;};}
  const context={window:{},document,MutationObserver,requestAnimationFrame(fn){fn();},console};
  const containment=document.createElement('style'); containment.id='nova-showroom-containment-v172'; containment.textContent='/* containment */'; head.appendChild(containment);
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/showroom-fit-v1.7.3.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'showroom-fit-v1.7.3.js'});
  return {nodes,byId,document};
}

test('portrait simulator uses a responsive 4:3 display bay rather than a hard pixel height',()=>{
  const h=harness(); const css=h.byId.get('nova-showroom-fit-v173').textContent;
  assert.match(css,/aspect-ratio:4\s*\/\s*3!important/);
  assert.match(css,/height:auto!important/);
  assert.doesNotMatch(css,/height:178px/);
});

test('touch steering hint is separated from the canvas footer and uses mobile wording',()=>{
  const h=harness(); const css=h.byId.get('nova-showroom-fit-v173').textContent;
  assert.match(css,/top:8px!important/);
  assert.match(css,/bottom:auto!important/);
  assert.match(css,/content:'DRAG TO STEER'/);
  assert.match(css,/font-size:0!important/);
});

test('fit stylesheet stays after v1.7.2 containment when containment is reinserted',()=>{
  const h=harness(); const fit=h.byId.get('nova-showroom-fit-v173');
  const containment=h.byId.get('nova-showroom-containment-v172');
  h.document.head.appendChild(containment);
  assert.equal(h.nodes[h.nodes.length-1],fit);
  assert.equal(fit.previousElementSibling,containment);
});
