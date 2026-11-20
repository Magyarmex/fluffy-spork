'use strict';
// RESEARCH ONLY. Preserve a bounded history of camera geometry actually
// submitted to the canvas. Do not infer a camera from event delivery time.
class PresentedCameraHistory {
  constructor({capacity=12,maxAgeMs=120}={}) {
    if(!Number.isInteger(capacity)||capacity<2||capacity>64||
       !Number.isFinite(maxAgeMs)||maxAgeMs<=0||maxAgeMs>1000)
      throw Error('invalid camera history budget');
    this.capacity=capacity;this.maxAgeMs=maxAgeMs;
    this.frames=[];this.misses=0;this.stale=0;this.invalid=0;
  }
  reset(){this.frames.length=0;}
  record(at,{x,y,zoom,width,height,rect}={}) {
    if(!Number.isFinite(at)||at<=0||!Number.isFinite(x)||
       !Number.isFinite(y)||!Number.isFinite(zoom)||zoom<=0||
       !Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||
       !rect||!Number.isFinite(rect.left)||!Number.isFinite(rect.top)||
       !Number.isFinite(rect.width)||rect.width<=0||
       !Number.isFinite(rect.height)||rect.height<=0){this.invalid++;return false;}
    const prev=this.frames.at(-1);
    if(prev&&at<=prev.at){this.invalid++;return false;}
    this.frames.push(Object.freeze({at,x,y,zoom,width,height,
      left:rect.left,top:rect.top,rectWidth:rect.width,rectHeight:rect.height}));
    if(this.frames.length>this.capacity)this.frames.shift();
    return true;
  }
  project(event,{timestampTrusted=false,timestampExact=false,physicalAtMs:at,deliveryMs}={}) {
    if(!timestampTrusted||!timestampExact||!Number.isFinite(at)||at<=0||
       !Number.isFinite(deliveryMs)||at>deliveryMs||
       !Number.isFinite(event.clientX)||!Number.isFinite(event.clientY)){
      this.invalid++;return null;
    }
    let frame=null;
    for(let i=this.frames.length-1;i>=0;i--){
      if(this.frames[i].at<=at){frame=this.frames[i];break;}
    }
    if(!frame){this.misses++;return null;}
    if(at-frame.at>this.maxAgeMs){this.stale++;return null;}
    const wx=frame.x+(event.clientX-frame.left-frame.width*.5)/frame.zoom;
    const wy=frame.y+(event.clientY-frame.top-frame.height*.5)/frame.zoom;
    if(!Number.isFinite(wx)||!Number.isFinite(wy)){this.invalid++;return null;}
    return Object.freeze({x:wx,y:wy,frameAt:frame.at,ageMs:at-frame.at});
  }
}
module.exports={PresentedCameraHistory};
