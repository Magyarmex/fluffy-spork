'use strict';
// The Pilot Console's opt-in backing-resolution control must not alter world
// dimensions, camera projection, input geometry, or established default DPR.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const overlay=fs.readFileSync(path.join(__dirname,'../../nova-updates/settings-v1.7.7.js'),'utf8');
function boot(saved,base=1.5){
 const storage=new Map(saved===undefined?[]:[['novatanks_pilot_settings_v1',JSON.stringify(saved)]]);
 class Game{
  constructor(){this.base=base;this.w=320;this.h=568;this.zoom=.75;this.canvas={width:0,height:0};this.resize();}
  resize(){this.dpr=this.base;this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);return 'resized';}
  start(){} destroy(){}
 }
 const mods={'game/engine':(module)=>{module.exports={Game}}};
 const doc={readyState:'loading',addEventListener(){}};
 const win={__novaModules:mods};
 const context=vm.createContext({window:win,document:doc,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},console:{error(){}}});
 vm.runInContext(overlay,context,{filename:'settings-v1.7.7.js'});
 const module={exports:{}};mods['game/engine'](module,module.exports,()=>{});
 return {Game:module.exports.Game,storage,win};
}
test('original default DPR and geometry are unchanged when the new setting is absent',()=>{
 const {Game}=boot(undefined),g=new Game();
 assert.equal(g.dpr,1.5);assert.deepEqual([g.canvas.width,g.canvas.height],[480,852]);
 assert.deepEqual([g.w,g.h,g.zoom],[320,568,.75]);
});
test('explicit render clarity reduces backing pixels but not CSS geometry or camera',()=>{
 for(const [scale,expected] of [[65,1],[85,1.275],[100,1.5]]){
  const {Game}=boot({renderScale:scale}),g=new Game();
  assert.ok(Math.abs(g.dpr-expected)<1e-10);
  assert.deepEqual([g.canvas.width,g.canvas.height],[Math.round(320*expected),Math.round(568*expected)]);
  assert.deepEqual([g.w,g.h,g.zoom],[320,568,.75]);
  g.w=800;g.h=600;g.resize();
  assert.deepEqual([g.canvas.width,g.canvas.height],[Math.round(800*expected),Math.round(600*expected)]);
 }
});
test('invalid storage fails closed to original clarity; DPR never falls below one',()=>{
 for(const invalid of [-100,NaN,'nonsense',null]){
  const {Game}=boot({renderScale:invalid}),g=new Game();
  assert.equal(g.dpr,1.5,'invalid saved clarity must not silently lower resolution');
 }
 const {Game}=boot({renderScale:65},1),g=new Game();
 assert.equal(g.dpr,1);assert.deepEqual([g.canvas.width,g.canvas.height],[320,568]);
});
