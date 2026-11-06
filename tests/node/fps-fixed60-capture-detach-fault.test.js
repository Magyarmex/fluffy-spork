'use strict';
// Opt-in fixed60 capture must not strand normal browser controls if the
// production Input.detach transaction itself throws.
const test=require('node:test');
const assert=require('node:assert/strict');
const {BrowserInputCapture}=require('../research/fixed-step-browser-capture.cjs');

function emitter(){
  const listeners=new Map();
  return {
    addEventListener(type,fn){
      if(!listeners.has(type))listeners.set(type,new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
    count(){return [...listeners.values()].reduce((n,s)=>n+s.size,0)}
  };
}
for(const phase of ['before','after']){
  test('failed production detach '+phase+' side effects restores original input',()=>{
    const win=emitter(),doc=emitter(),canvas=emitter();
    let attaches=0;
    const input={canvas,kd(){},
      attach(c){attaches++;this.canvas=c;win.addEventListener('keydown',this.kd)},
      detach(){
        if(phase==='after'){win.removeEventListener('keydown',this.kd);this.canvas=null}
        throw Error('production detach failed');
      }};
    input.attach(canvas);
    const timeline={input,reset(){}};
    let caught;
    try{new BrowserInputCapture(input,canvas,timeline,{timeline},
      {window:win,document:doc})}catch(error){caught=error}
    assert.match(caught?.message||'',/production detach failed/);
    assert.equal(input.canvas,canvas);
    assert.equal(attaches,2,'best-effort reattach must execute');
    assert.equal(win.count(),1,'DOM listener registration must not duplicate');
    assert.equal(doc.count(),0);
    assert.equal(canvas.count(),0);
  });
}

test('failed recovery attach retains original detach exception and secondary evidence',()=>{
  const win=emitter(),doc=emitter(),canvas=emitter();
  const input={canvas,attach(){throw Error('recovery attach failed')},
    detach(){this.canvas=null;throw Error('original detach failed')}};
  const timeline={input,reset(){}};
  let caught;
  try{new BrowserInputCapture(input,canvas,timeline,{timeline},
    {window:win,document:doc})}catch(error){caught=error}
  assert.match(caught?.message||'',/original detach failed/);
  assert.match(caught.cleanupError?.message||'',/recovery attach failed/);
  assert.equal(win.count(),0);
  assert.equal(doc.count(),0);
  assert.equal(canvas.count(),0);
  // If the host's own attach() throws, recovery cannot be certified.
  assert.equal(input.canvas,null);
});

test('partial composed detach must finish cached listener cleanup before reattach',()=>{
  const win=emitter(),doc=emitter(),canvas=emitter();
  let detaches=0,attaches=0;
  const input={canvas,kd(){},resize(){},cached:false,
    attach(c){
      attaches++;this.canvas=c;win.addEventListener('keydown',this.kd);
      if(!this.cached){win.addEventListener('resize',this.resize);this.cached=true}
    },
    detach(){
      detaches++;win.removeEventListener('keydown',this.kd);
      win.removeEventListener('resize',this.resize);
      if(detaches===1)throw Error('partial detach before cache reset');
      this.cached=false;this.canvas=null;
    }};
  input.attach(canvas);
  const timeline={input,reset(){}};
  let caught;
  try{new BrowserInputCapture(input,canvas,timeline,{timeline},
    {window:win,document:doc})}catch(error){caught=error}
  assert.match(caught?.message||'',/partial detach before cache reset/);
  assert.equal(detaches,2,'retry must complete idempotent cleanup');
  assert.equal(attaches,2,'normal input must be reattached');
  assert.equal(input.canvas,canvas);
  assert.equal(win.count(),2,'keyboard and cached geometry listener both restored');
  assert.equal(doc.count(),0);
  assert.equal(canvas.count(),0);
});
