import type { PowerupState } from '../../game/entities/types';
import type { RenderCommand } from '../types';

const VISUALS: Readonly<Record<string,{ color:string; glyph:string }>> = Object.freeze({
  heal:{color:'#4be37e',glyph:'+'}, shield:{color:'#6ef0ff',glyph:'◇'}, triple:{color:'#ffd166',glyph:'Ⅲ'}, haste:{color:'#ff9f43',glyph:'»'}, nuke:{color:'#ff4d6d',glyph:'☢'},
});

export class PowerupRenderer {
  build(state: PowerupState): readonly RenderCommand[] {
    if (state.lifecycle !== 'active') return [];
    const visual=VISUALS[state.powerupType] ?? VISUALS.heal;
    return Object.freeze([
      {kind:'glow',layer:'effect-under',x:state.position.x,y:state.position.y,radius:34,color:visual.color,alpha:0.24},
      {kind:'circle',layer:'entity',x:state.position.x,y:state.position.y,radius:15,fill:'#07111d',stroke:visual.color,lineWidth:2,alpha:0.98},
      {kind:'text',layer:'entity',x:state.position.x,y:state.position.y+5,text:visual.glyph,color:visual.color,size:14,alpha:1},
    ]);
  }
}
