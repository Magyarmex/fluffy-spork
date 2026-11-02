'use strict';
/* RESEARCH ONLY — live Input event owner for the existing opt-in explicit
 * shot-intent engine patch. Not loaded by the production materializer.
 * A short aimed press+release is an intent for ONE next simulation update,
 * never a held physical right stick or a Controller drone command. */
class DirectShotIntent {
  constructor(game,{window:win,document:doc}={}) {
    if(!game||!game.input||!win||!doc||typeof game.update!=='function'||
       typeof game.setPaused!=='function'||typeof win.addEventListener!=='function'||
       typeof win.removeEventListener!=='function'||typeof doc.addEventListener!=='function'||
       typeof doc.removeEventListener!=='function')throw Error('invalid direct shot intent owner');
    this.game=game;this.input=game.input;this.win=win;this.doc=doc;
    this.down=null;this.pending=null;this.intents=0;this.canceled=0;
    const i=this.input,self=this;
    this.old={pd:i.pd,pu:i.pu,update:game.update,setPaused:game.setPaused,
      destroy:game.destroy,blurReset:i.__novaBlurReset};
    this.destroyHadOwn=Object.prototype.hasOwnProperty.call(game,'destroy');
    this.blurResetHadOwn=Object.prototype.hasOwnProperty.call(i,'__novaBlurReset');
    this.clear=()=>{if(self.down||self.pending)self.canceled++;self.down=null;self.pending=null;};
    this.hidden=()=>{if(doc.hidden)self.clear();};
    i.pd=function(e){
      // New physical intent invalidates an unconsumed old one. Never replay a
      // tap after a new stick owner has taken control.
      if(e&&e.pointerType!=='mouse'&&e.pointerId===i.stickId.aim)self.clear();
      const prior=i.firing,oldAimId=i.stickId.aim;
      const result=self.old.pd.call(this,e);
      if(!e||!e.pointerType||game.status!=='playing'||game.paused||doc.hidden||
         i.__novaInputPaused||e.target&&typeof e.target.closest==='function'&&e.target.closest('[data-ui]'))return result;
      if(e.pointerType==='mouse'){
        if(e.button===0&&!prior&&i.firing&&!i.touchSeen){self.pending=null;self.down={type:'mouse',id:e.pointerId,sampled:false};}
      }else if((e.pointerType==='touch'||e.pointerType==='pen')&&
         oldAimId!==e.pointerId&&i.stickId.aim===e.pointerId&&i.aim.active){
        self.pending=null;self.down={type:e.pointerType,id:e.pointerId,sampled:false};
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
      if(same){self.down=null;
        if(canceled){self.clear();return result;}
        if(eligible){self.pending=Object.freeze({fire:true,
          aim:mouse?null:Object.freeze({x:dx/len,y:dy/len}),
          depth:mouse?null:Math.max(.08,Math.min(1,(len-5)/55))});}
      }else if(canceled&&self.pending)self.clear();
      return result;
    };
    game.update=function(...args){
      if(self.down&&i.firing&&(self.down.type==='mouse'||i.aim.active))self.down.sampled=true;
      const intent=self.pending;self.pending=null;
      if(!intent||game.status!=='playing'||game.paused||doc.hidden||
         i.__novaInputPaused||i.aim.active||i.firing)return self.old.update.apply(this,args);
      if(i.__novaShotIntent)throw Error('shot intent already owned');
      i.__novaShotIntent=intent;
      try{const result=self.old.update.apply(this,args);self.intents++;return result;}
      finally{delete i.__novaShotIntent;}
    };
    game.setPaused=function(value,...args){if(value)self.clear();return self.old.setPaused.call(this,value,...args);};
    if(typeof this.old.blurReset==='function')i.__novaBlurReset=function(...args){self.clear();return self.old.blurReset.apply(this,args);};
    /* Input.attach registers function objects, not property lookups. A wrapper
     * installed after Game construction must rebind those DOM listeners or it
     * would pass direct unit tests while missing every real pointer event. */
    this.canvas=i.canvas;
    if(this.canvas&&typeof this.canvas.removeEventListener==='function'&&
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
      if(!self.down){self.pending=null;self.down={type:'mouse',id:1,sampled:false};}
    };
    this.nativeUp=e=>{
      if(!e||e.button!==0||!self.down||self.down.type!=='mouse')return;
      const d=self.down;self.down=null;
      if(!d.sampled&&game.status==='playing'&&!game.paused&&!doc.hidden&&!i.__novaInputPaused&&i.mouseActive)
        self.pending=Object.freeze({fire:true,aim:null,depth:null});
    };
    if(this.canvas){this.canvas.addEventListener('mousedown',this.nativeDown);
      win.addEventListener('mouseup',this.nativeUp);}
    this.destroyWrapper=function(...args){const destroy=self.old.destroy;self.detach();return destroy.apply(this,args);};
    game.destroy=this.destroyWrapper;
    win.addEventListener('blur',this.clear);doc.addEventListener('visibilitychange',this.hidden);
  }
  detach(){
    if(!this.old)return;
    this.clear();const o=this.old,i=this.input,g=this.game;
    if(this.canvas){this.canvas.removeEventListener('mousedown',this.nativeDown);
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
