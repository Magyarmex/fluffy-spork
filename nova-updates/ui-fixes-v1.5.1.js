/* NOVA TANKS v1.5.1 — tiny presentation fixes */
(function(){
'use strict';
if(typeof CanvasRenderingContext2D==='undefined'||CanvasRenderingContext2D.prototype.__novaUprightShot)return;
var proto=CanvasRenderingContext2D.prototype,oldFill=proto.fillText;
proto.__novaUprightShot=true;
proto.fillText=function(text,x,y,maxWidth){
  if(text==='SHOT'&&this.getTransform&&this.setTransform){
    var m=this.getTransform();
    /* Violet Doctrine draws this label inside a rotated edge-indicator frame.
       Convert its local anchor to canvas coordinates, then keep only scale so
       typography is always upright while the indicator itself may rotate. */
    var px=m.a*x+m.c*y+m.e,py=m.b*x+m.d*y+m.f;
    var sx=Math.hypot(m.a,m.b)||1,sy=Math.hypot(m.c,m.d)||1;
    this.save();
    this.setTransform(sx,0,0,sy,px,py);
    try{if(arguments.length>3)oldFill.call(this,text,0,0,maxWidth);else oldFill.call(this,text,0,0);}finally{this.restore();}
    return;
  }
  return oldFill.apply(this,arguments);
};
console.info('[NOVA TANKS] v1.5.1 screen-upright SHOT callout linked');
})();
