import type { ShapeState } from '../../game/entities/types';
import type { RenderCommand } from '../types';

const VISUALS: Readonly<Record<string,{ color:string; radius:number; glyph:string }>> = Object.freeze({
  circle:{color:'#5ad1ff',radius:12,glyph:'●'}, triangle:{color:'#54e38a',radius:16,glyph:'▲'}, square:{color:'#c98bff',radius:20,glyph:'■'},
  pentagon:{color:'#ffb45e',radius:26,glyph:'⬟'}, hexagon:{color:'#ff6ea9',radius:33,glyph:'⬢'}, star:{color:'#ffe066',radius:24,glyph:'★'}, crasher:{color:'#ff5d5d',radius:15,glyph:'◆'},
});

export class ShapeRenderer {
  build(state: ShapeState): readonly RenderCommand[] {
    if (state.lifecycle !== 'active') return [];
    const visual=VISUALS[state.shapeType] ?? VISUALS.circle;
    const hp=state.health ? Math.max(0,Math.min(1,state.health.current/Math.max(1,state.health.max))) : 1;
    return Object.freeze([
      {kind:'glow',layer:'effect-under',x:state.position.x,y:state.position.y,radius:visual.radius*1.8,color:visual.color,alpha:0.14},
      {kind:'circle',layer:'entity',x:state.position.x,y:state.position.y,radius:visual.radius,fill:'#08111c',stroke:visual.color,lineWidth:2,alpha:0.94},
      {kind:'text',layer:'entity',x:state.position.x,y:state.position.y+4,text:visual.glyph,color:visual.color,size:Math.max(9,visual.radius*0.82),alpha:0.95},
      ...(hp<1?[{kind:'line' as const,layer:'overlay' as const,x1:state.position.x-visual.radius,y1:state.position.y-visual.radius-7,x2:state.position.x-visual.radius+visual.radius*2*hp,y2:state.position.y-visual.radius-7,width:2,color:visual.color}]:[]),
    ]);
  }
}
