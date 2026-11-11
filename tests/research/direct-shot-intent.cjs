'use strict';
/* RESEARCH ONLY — live Input event owner for the existing opt-in explicit
 * shot-intent engine patch. Not loaded by the production materializer.
 * A short aimed press+release is an intent for ONE next simulation update,
 * never a held physical right stick or a Controller drone command. */
class DirectShotIntent {
  constructor(game,{window:win,document:doc,maxIntentAgeMs=Infinity,nowMs=null,eventOriginMs=null,rebindDomListeners=true,requireTrustedDuration=false,maxTrustedPressMs=100}={}) {
    if(!game||!game.input||!win||!doc||typeof game.update!=='function'||
       typeof game.setPaused!=='function'||typeof win.addEventListener!=='function'||
       typeof win.removeEventListener!=='function'||typeof doc.addEventListener!=='function'||
       typeof doc.removeEventListener!=='function')throw Error('invalid direct shot intent owner');
    if(maxIntentAgeMs!==Infinity&&(!Number.isFinite(maxIntentAgeMs)||maxIntentAgeMs<0||typeof nowMs!=='function'))
      throw Error('invalid direct intent freshness gate');
    if(eventOriginMs!==null&&!Number.isFinite(eventOriginMs))
      throw Error('invalid direct intent event origin');
    if(typeof rebindDomListeners!=='boolean')throw Error('invalid DOM ownership option');
    if(typeof requireTrustedDuration!=='boolean'||(requireTrustedDuration&&eventOriginMs===null))throw Error('trusted duration requires event origin');
    if(requireTrustedDuration&&maxIntentAgeMs===Infinity)throw Error('trusted duration requires finite release freshness');
    if(!Number.isFinite(maxTrustedPressMs)||maxTrustedPressMs<=0)throw Error('invalid unsampled press ceiling');
    this.requireTrustedDuration=requireTrustedDuration;
    this.maxTrustedPressMs=maxTrustedPressMs;
    this.rebindDomListeners=rebindDomListeners;
    this.game=game;this.input=game.input;this.win=win;this.doc=doc;
    this.maxIntentAgeMs=maxIntentAgeMs;this.nowMs=nowMs;this.eventOriginMs=eventOriginMs;
    this.pendingAt=null;this.pendingSource=null;this.pendingPlayer=null;this.rejectedStale=0;
    this.stamp=()=>{try{const v=this.nowMs();return Number.isFinite(v)?v:NaN;}catch(_){return NaN;}};
    // Research timeline events carry physical occurrence time separately from
    // their later replay tick. Never refresh a stale physical release merely
    // because the browser delivered/replayed it late. Ordinary DOM events
    // without timeline metadata retain the existing delivery-clock behavior.
    this.releaseStamp=e=>{
      if(this.eventOriginMs!==null&&e&&Object.prototype.hasOwnProperty.call(e,'__novaOriginalAt')){
        const at=e.__novaOriginalAt;
        // The browser bridge clamps pre-start event timestamps to zero.
        // Reject that ambiguous boundary rather than refreshing an older
        // physical release as if it occurred when the pilot started.
        if(e.__novaTimestampTrusted!==true||!Number.isFinite(at)||at<=0)return NaN;
        const physical=this.eventOriginMs+at*1000;
        return Number.isFinite(physical)?physical:NaN;
      }
      return this.stamp();
    };
    // Both edges must come from trusted physical browser timestamps. A delayed
    // replay callback must never inflate a Sniper charge.
    this.physicalStamp=e=>{
      if(this.eventOriginMs===null||!e||e.__novaTimestampTrusted!==true||
         (this.requireTrustedDuration ? e.__novaPhysicalTimestampExact!==true :
          e.__novaPhysicalTimestampExact===false)||
         !Object.prototype.hasOwnProperty.call(e,'__novaOriginalAt')||
         !Number.isFinite(e.__novaOriginalAt)||e.__novaOriginalAt<=0)return NaN;
      const at=this.eventOriginMs+e.__novaOriginalAt*1000;
      return Number.isFinite(at)?at:NaN;
    };
    this.down=null;this.pending=null;this.intents=0;this.canceled=0;
    const i=this.input,self=this;
    this.old={pd:i.pd,pu:i.pu,update:game.update,setPaused:game.setPaused,
      destroy:game.destroy,blurReset:i.__novaBlurReset};
    this.destroyHadOwn=Object.prototype.hasOwnProperty.call(game,'destroy');
    this.blurResetHadOwn=Object.prototype.hasOwnProperty.call(i,'__novaBlurReset');
    this.clear=()=>{if(self.down||self.pending)self.canceled++;self.down=null;self.pending=null;self.pendingAt=null;self.pendingSource=null;self.pendingPlayer=null;};
    this.hidden=()=>{if(doc.hidden)self.clear();};
    // Capture a physical release in world space using the rendered camera,
    // not the target zoom. The next simulation may run after a camera pan.
    this.captureMouse=e=>{
      const x=Number.isFinite(e.clientX)?e.clientX:i.mouseX;
      const y=Number.isFinite(e.clientY)?e.clientY:i.mouseY;
      let world=null;
      if(Number.isFinite(x)&&Number.isFinite(y)&&game.cam&&i.canvas&&
         typeof i.canvas.getBoundingClientRect==='function'){
        const rect=i.canvas.getBoundingClientRect();
        const z=Number(game.cam.zoom)||Number(game.zoom)||1;
        if(Number.isFinite(z)&&z>0&&Number.isFinite(game.cam.x)&&
           Number.isFinite(game.cam.y)&&Number.isFinite(game.w)&&
           Number.isFinite(game.h)&&Number.isFinite(rect.left)&&
           Number.isFinite(rect.top)){
          const wx=game.cam.x+(x-rect.left-game.w*.5)/z;
          const wy=game.cam.y+(y-rect.top-game.h*.5)/z;
          if(Number.isFinite(wx)&&Number.isFinite(wy))world=Object.freeze({x:wx,y:wy});
        }
      }
      return Object.freeze({x,y,world});
    };
    this.resolveMouse=mouse=>{
      if(!mouse.world||!game.cam||!i.canvas||
         typeof i.canvas.getBoundingClientRect!=='function')return mouse;
      const rect=i.canvas.getBoundingClientRect();
      const z=Number(game.cam.zoom)||Number(game.zoom)||1;
      if(!Number.isFinite(z)||z<=0||!Number.isFinite(game.cam.x)||
         !Number.isFinite(game.cam.y)||!Number.isFinite(game.w)||
         !Number.isFinite(game.h)||!Number.isFinite(rect.left)||
         !Number.isFinite(rect.top))return mouse;
      const x=rect.left+game.w*.5+(mouse.world.x-game.cam.x)*z;
      const y=rect.top+game.h*.5+(mouse.world.y-game.cam.y)*z;
      return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:mouse;
    };

    i.pd=function(e){
      // New physical intent invalidates an unconsumed old one. Never replay a
      // tap after a new stick owner has taken control.
      if(e&&e.pointerType!=='mouse'&&e.pointerId===i.stickId.aim)self.clear();
      const prior=i.firing,oldAimId=i.stickId.aim;
      const result=self.old.pd.call(this,e);
      if(!e||!e.pointerType||game.status!=='playing'||game.paused||doc.hidden||
         i.__novaInputPaused||e.target&&typeof e.target.closest==='function'&&e.target.closest('[data-ui]'))return result;
      if(e.pointerType==='mouse'){
        if(e.button===0&&!prior&&i.firing&&!i.touchSeen){self.pending=null;self.pendingAt=null;self.pendingSource=null;self.pendingPlayer=null;self.down={type:'mouse',id:e.pointerId,sampled:false,player:game.player,pressedAt:self.physicalStamp(e)};}
      }else if((e.pointerType==='touch'||e.pointerType==='pen')&&
         oldAimId!==e.pointerId&&i.stickId.aim===e.pointerId&&i.aim.active){
        self.pending=null;self.pendingAt=null;self.pendingSource=null;self.pendingPlayer=null;self.down={type:e.pointerType,id:e.pointerId,sampled:false,player:game.player,pressedAt:self.physicalStamp(e)};
      }
      return result;
    };
    i.pu=function(e){
      const d=self.down;
      const canceled=!!(e&&e.type==='pointercancel');
      // If a platform or synthesized event reports secondary-button pointerup
      // while primary remains held, do not mistake it for primary release.
      // Conforming mouse Pointer Events normally report only the final up.
      const primaryReleased=!!(e&&(e.button==null||e.button===0)&&
        (e.buttons==null||(e.buttons&1)===0));
      const same=!!(d&&e&&e.pointerType===d.type&&
        (d.type==='mouse'?(canceled||primaryReleased):e.pointerId===d.id));
      const valid=!!(same&&!d.sampled&&!canceled&&game.status==='playing'&&
        !game.paused&&!doc.hidden&&!i.__novaInputPaused);
      const mouse=d&&d.type==='mouse';
      let dx=i.aim.dx,dy=i.aim.dy;
      // A short touch/pen flick may end without a separate pointermove.
      // Read its final coordinate through the REAL Input stick geometry on a
      // temporary object; never revive the released stick or drone command.
      if(same&&!mouse&&!canceled&&i.canvas&&
         Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)&&
         typeof i.canvas.getBoundingClientRect==='function'&&
         typeof i.updateStick==='function'){
        const rect=i.canvas.getBoundingClientRect();
        const final={ox:i.aim.ox,oy:i.aim.oy,dx:0,dy:0};
        i.updateStick(final,e.clientX-rect.left,e.clientY-rect.top);
        dx=final.dx;dy=final.dy;
      }
      const len=Math.hypot(dx,dy);
      const eligible=valid&&(mouse?i.firing&&i.mouseActive:
        i.stickId.aim===d.id&&i.aim.active&&Number.isFinite(len)&&len>=9);
      const result=self.old.pu.call(this,e);
      // Pointerup is a physical cursor sample even without pointermove.
      // Preserve it as live input after the synthetic shot is consumed.
      if(same&&mouse&&!canceled){
        if(Number.isFinite(e.clientX))i.mouseX=e.clientX;
        if(Number.isFinite(e.clientY))i.mouseY=e.clientY;
      }
      if(same){self.down=null;
        if(canceled){self.clear();return result;}
        const releasedAt=self.physicalStamp(e);
        const durationMs=releasedAt-d.pressedAt;
        const trustedDuration=Number.isFinite(d.pressedAt)&&Number.isFinite(releasedAt)&&
          Number.isFinite(durationMs)&&durationMs>=0&&
          durationMs<=self.maxTrustedPressMs+1e-6;
        if(eligible&&(!self.requireTrustedDuration||trustedDuration)){
          const shotMouse=mouse?self.captureMouse(e):null;
          self.pending=Object.freeze({fire:true,
          aim:mouse?null:Object.freeze({x:dx/len,y:dy/len}),
          mouse:shotMouse,world:shotMouse&&shotMouse.world,
          depth:mouse?null:Math.max(.08,Math.min(1,(len-5)/55)),
          durationMs:trustedDuration?durationMs:null});
          self.pendingAt=self.maxIntentAgeMs===Infinity?null:self.releaseStamp(e);
          self.pendingSource=Object.freeze({type:d.type,id:d.id});
          self.pendingPlayer=d.player;}
      }else if(canceled&&self.pending&&self.pendingSource&&e&&
        e.pointerType===self.pendingSource.type&&e.pointerId===self.pendingSource.id)self.clear();
      return result;
    };
    game.update=function(...args){
      // A physical press belongs to its original life, not a replacement tank.
      if(self.down&&self.down.player!==game.player){
        const d=self.down;self.clear();
        self.old.pu.call(i,{type:'pointercancel',pointerType:d.type,pointerId:d.id,
          button:0,buttons:0});
        if(d.type==='mouse')i.mouseActive=false;
      }
      // A pressed right stick with zero deflection cannot fire: Game.aimVec
      // returns null. Do not consume the tap merely because an un-aimed tick
      // occurred before the final release coordinate arrived.
      if(self.down&&game.status==='playing'&&!game.paused&&!doc.hidden&&
         !i.__novaInputPaused&&i.firing&&
         (self.down.type==='mouse'?i.mouseActive:
           i.aim.active&&Math.hypot(i.aim.dx,i.aim.dy)>=9))
        self.down.sampled=true;
      const intent=self.pending,at=self.pendingAt,sourcePlayer=self.pendingPlayer;
      self.pending=null;self.pendingAt=null;self.pendingSource=null;self.pendingPlayer=null;
      if(intent&&sourcePlayer!==game.player)return self.old.update.apply(this,args);
      if(intent&&self.maxIntentAgeMs!==Infinity){
        const now=self.stamp(),age=now-at;
        if(!Number.isFinite(now)||!Number.isFinite(at)||!Number.isFinite(age)||
           age < 0||age > self.maxIntentAgeMs){
          self.rejectedStale++;return self.old.update.apply(this,args);
        }
      }
      if(!intent||game.status!=='playing'||game.paused||doc.hidden||
         i.__novaInputPaused||i.aim.active||i.firing)return self.old.update.apply(this,args);
      if(i.__novaShotIntent)throw Error('shot intent already owned');
      i.__novaShotIntent=intent;
      // Keep the release-time mouse target stable across a later cursor move.
      // All current Game/overlay aim and Cannon fuse readers share these
      // coordinates. Restore immediately so the next physical input is live.
      const previousMouseX=i.mouseX,previousMouseY=i.mouseY;
      try{
        if(intent.mouse){const target=self.resolveMouse(intent.mouse);
          i.mouseX=target.x;i.mouseY=target.y;}
        const result=self.old.update.apply(this,args);self.intents++;return result;
      }finally{i.mouseX=previousMouseX;i.mouseY=previousMouseY;delete i.__novaShotIntent;}
    };
    game.setPaused=function(value,...args){if(value)self.clear();return self.old.setPaused.call(this,value,...args);};
    if(typeof this.old.blurReset==='function')i.__novaBlurReset=function(...args){self.clear();return self.old.blurReset.apply(this,args);};
    /* Standalone Input.attach registers function objects, not property lookups,
     * so the default owner must rebind DOM listeners. When BrowserInputCapture
     * already owns DOM, opt out: ChronologicalInput invokes wrapped pd/pu on
     * replay, and a second physical listener would bypass the timeline. */
    this.canvas=i.canvas;
    if(this.rebindDomListeners&&this.canvas&&typeof this.canvas.removeEventListener==='function'&&
       typeof this.canvas.addEventListener==='function'){
      this.canvas.removeEventListener('pointerdown',this.old.pd);
      this.canvas.addEventListener('pointerdown',i.pd);
      win.removeEventListener('pointerup',this.old.pu);
      win.removeEventListener('pointercancel',this.old.pu);
      win.addEventListener('pointerup',i.pu);
      win.addEventListener('pointercancel',i.pu);
      this.rebound=true;
    }
    /* Native mouse edges are needed when secondary button already owns the
     * Pointer Events pointer: no second pointerdown/up is dispatched. */
    this.nativeDown=e=>{
      if(!e||e.button!==0||i.touchSeen||game.status!=='playing'||game.paused||doc.hidden)return;
      if(!self.down){self.pending=null;self.pendingAt=null;self.pendingSource=null;self.pendingPlayer=null;self.down={type:'mouse',id:1,sampled:false,player:game.player,pressedAt:self.physicalStamp(e)};}
    };
    this.nativeUp=e=>{
      if(!e||e.button!==0||!self.down||self.down.type!=='mouse')return;
      const d=self.down;self.down=null;
      if(Number.isFinite(e.clientX))i.mouseX=e.clientX;
      if(Number.isFinite(e.clientY))i.mouseY=e.clientY;
      const releasedAt=self.physicalStamp(e),durationMs=releasedAt-d.pressedAt;
      const trustedDuration=Number.isFinite(d.pressedAt)&&Number.isFinite(releasedAt)&&
        Number.isFinite(durationMs)&&durationMs>=0&&
        durationMs<=self.maxTrustedPressMs+1e-6;
      if(!d.sampled&&game.status==='playing'&&!game.paused&&!doc.hidden&&!i.__novaInputPaused&&i.mouseActive&&
         (!self.requireTrustedDuration||trustedDuration))
        {const shotMouse=self.captureMouse(e);
         self.pending=Object.freeze({fire:true,aim:null,
          mouse:shotMouse,world:shotMouse.world,depth:null,
          durationMs:trustedDuration?durationMs:null});
         self.pendingAt=self.maxIntentAgeMs===Infinity?null:self.releaseStamp(e);
         self.pendingSource=Object.freeze({type:'mouse',id:d.id});
         self.pendingPlayer=d.player;}
    };
    if(this.rebindDomListeners&&this.canvas){this.canvas.addEventListener('mousedown',this.nativeDown);
      win.addEventListener('mouseup',this.nativeUp);}
    // The outer RAF owner may detach this research owner before invoking the
    // destroy wrapper it previously captured. Keep the underlying destroy
    // reference stable rather than reading self.old after detach cleared it.
    const underlyingDestroy=this.old.destroy;
    this.destroyWrapper=function(...args){self.detach();return underlyingDestroy.apply(this,args);};
    game.destroy=this.destroyWrapper;
    win.addEventListener('blur',this.clear);doc.addEventListener('visibilitychange',this.hidden);
  }
  detach(){
    if(!this.old)return;
    this.clear();const o=this.old,i=this.input,g=this.game;
    if(this.rebindDomListeners&&this.canvas){this.canvas.removeEventListener('mousedown',this.nativeDown);
      this.win.removeEventListener('mouseup',this.nativeUp);}
    if(this.rebound){
      this.canvas.removeEventListener('pointerdown',i.pd);
      this.win.removeEventListener('pointerup',i.pu);
      this.win.removeEventListener('pointercancel',i.pu);
      this.canvas.addEventListener('pointerdown',o.pd);
      this.win.addEventListener('pointerup',o.pu);
      this.win.addEventListener('pointercancel',o.pu);
    }
    i.pd=o.pd;i.pu=o.pu;g.update=o.update;g.setPaused=o.setPaused;
    if(this.blurResetHadOwn)i.__novaBlurReset=o.blurReset;
    else delete i.__novaBlurReset;
    if(g.destroy===this.destroyWrapper){if(this.destroyHadOwn)g.destroy=o.destroy;else delete g.destroy;}
    delete i.__novaShotIntent;
    this.win.removeEventListener('blur',this.clear);
    this.doc.removeEventListener('visibilitychange',this.hidden);
    this.old=null;
  }
}
module.exports={DirectShotIntent};
