/* NOVA TANKS — opt-in fixed60 browser pilot.
 * Research only: ?nova_fixed60=pilot selects one chronological simulation owner.
 * The default game path is untouched. Never persist this in player settings.
 * Physical Android CPU, latency and visual gates precede any default rollout.
 */
(function(){
'use strict';
const win=window, mods=win.__novaModules;
if(!mods || typeof mods['game/engine']!=='function')return;
let selected=false;
try{selected=new URLSearchParams(win.location.search).get('nova_fixed60')==='pilot'}
catch(_){return}
if(!selected)return;
// Explicit research-only catch-up budget for a falsifiable 3-vs-4 test.
// Never persist this parameter or alter ordinary production startup.
const stepBudget=new URLSearchParams(win.location.search).get('nova_fixed60_steps');
const invalidBudget=stepBudget!==null && stepBudget!=='3' && stepBudget!=='4';
const maxSteps=stepBudget==='3'?3:4;
const previous=mods['game/engine'];
mods['game/engine']=function(module,exports,require){
  previous(module,exports,require);
  const Game=module.exports.Game;
  if(!Game || Game.prototype.__novaFixed60BootDelegate)return;
  const productionStart=Game.prototype.start;
  if(typeof productionStart!=='function')
    throw Error('fixed60 pilot requires canonical Game.start');
  Game.prototype.start=function(){
    // Reject invalid research parameters only AFTER installing the exclusive
    // Game.start guard. Throwing at script evaluation would leave production
    // Game.start untouched and could silently launch the wrong scheduler.
    if(invalidBudget)throw Error('fixed60 pilot requires a supported step budget');
    const api=win.__novaFixed60Research;
    if(!api || typeof api.createFixedStepBrowserPilot!=='function')
      throw Error('fixed60 pilot requested but browser research bundle is missing');
    if(this.__novaFixed60Pilot)throw Error('fixed60 pilot already attached');
    if(this.raf)throw Error('production RAF already owns this Game');
    const renderer=require('game/render');
    if(!renderer || typeof renderer.render!=='function')
      throw Error('fixed60 pilot requires composed game renderer');
    const clock={now:()=>win.performance.now(),timeOrigin:win.performance.timeOrigin};
    const pilot=api.createFixedStepBrowserPilot(this,{
      window:win,document:win.document,clock,
      request:fn=>win.requestAnimationFrame(fn),
      cancel:id=>win.cancelAnimationFrame(id),
      render:(g,w,h)=>renderer.render(g,w,h),
      canvas:this.canvas,maxSteps
    });
    this.__novaFixed60Pilot=pilot;
    try{pilot.start()}
    catch(error){
      delete this.__novaFixed60Pilot;
      try{pilot.stop()}catch(cleanupError){
        win.console.error('[NOVA fixed60] failed to release pilot:',cleanupError);
      }
      throw error;
    }
  };
  Object.defineProperty(Game.prototype,'__novaFixed60BootDelegate',{value:true});
};
// Invalid research budgets retain the fail-closed delegate without fetching
// an optional bundle that must never be allowed to start the match.
if(invalidBudget)return;
// Parser-time, query-only loading: default players neither fetch nor parse the
// research bundle, and the PWA's atomic shell validation does not require it.
// The fail-closed Game.start delegate above is installed FIRST, so a missing
// optional pilot asset cannot silently fall back to production simulation.
if(win.document.readyState==='loading' && typeof win.document.write==='function'){
  // The optional bundle is not in the SW's atomic critical-asset cache.
  // Key its browser HTTP-cache identity to the validated shell fingerprint,
  // otherwise a returning pilot can execute stale research code after update.
  const stamp=win.document.querySelector('meta[name="nova-runtime-build"]')?.content;
  if(!stamp || !/^[a-f0-9]{16,64}$/i.test(stamp))
    throw Error('fixed60 pilot requires a fingerprinted canonical shell');
  const url='./nova-updates/fixed60-research-browser.js?nova_build='+encodeURIComponent(stamp);
  win.document.write('<script src="'+url+'"></'+'script>');
}
})();
