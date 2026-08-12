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
    const ecology=state.livingFront;
    const bounty=ecology?.bountyFraction ?? 0;
    const telegraph=ecology?.crasherPhase==='telegraph';
    const charging=ecology?.crasherPhase==='charge';
    const star=state.shapeType==='star';
    const triangleEvade=Boolean(ecology?.triangleEvading);
    const commands:RenderCommand[]=[
      {kind:'glow',layer:'effect-under',x:state.position.x,y:state.position.y,radius:visual.radius*(1.8+bounty*1.25),color:visual.color,alpha:0.14+bounty*0.22},
      ...(telegraph?[{kind:'circle' as const,layer:'effect-under' as const,x:state.position.x,y:state.position.y,radius:visual.radius*2.35,stroke:visual.color,lineWidth:3,alpha:.72}]:[]),
      ...(charging?[{kind:'line' as const,layer:'effect-under' as const,x1:state.position.x-Math.cos(state.rotation)*visual.radius*2.8,y1:state.position.y-Math.sin(state.rotation)*visual.radius*2.8,x2:state.position.x,y2:state.position.y,width:4,color:visual.color,alpha:.62}]:[]),
      ...(star?[{kind:'line' as const,layer:'effect-under' as const,x1:state.position.x-Math.cos(state.rotation)*visual.radius*2.2,y1:state.position.y-Math.sin(state.rotation)*visual.radius*2.2,x2:state.position.x,y2:state.position.y,width:3,color:visual.color,alpha:.46}]:[]),
      {kind:'circle',layer:'entity',x:state.position.x,y:state.position.y,radius:visual.radius,fill:'#08111c',stroke:visual.color,lineWidth:2+(bounty>0?.75:0),alpha:0.94},
      {kind:'text',layer:'entity',x:state.position.x,y:state.position.y+4,text:visual.glyph,color:visual.color,size:Math.max(9,visual.radius*0.82),alpha:0.95},
      ...(triangleEvade?[{kind:'line' as const,layer:'effect-over' as const,x1:state.position.x-Math.cos(state.rotation)*visual.radius,y1:state.position.y-Math.sin(state.rotation)*visual.radius,x2:state.position.x-Math.cos(state.rotation)*visual.radius*1.9,y2:state.position.y-Math.sin(state.rotation)*visual.radius*1.9,width:2,color:visual.color,alpha:.55}]:[]),
      ...(hp<1?[{kind:'line' as const,layer:'overlay' as const,x1:state.position.x-visual.radius,y1:state.position.y-visual.radius-7,x2:state.position.x-visual.radius+visual.radius*2*hp,y2:state.position.y-visual.radius-7,width:2,color:visual.color}]:[]),
    ];
    return Object.freeze(commands);
  }
}
