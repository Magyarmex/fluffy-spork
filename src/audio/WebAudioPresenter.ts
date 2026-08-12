import type { AudioCue } from './contracts';

function hashPitch(id:string):number{let hash=2166136261;for(let i=0;i<id.length;i++){hash^=id.charCodeAt(i);hash=Math.imul(hash,16777619);}return 120+(Math.abs(hash) % 520);}

/** Browser-only downstream presenter. It has no simulation or gameplay authority. */
export class WebAudioPresenter {
  #context:AudioContext|undefined;
  #muted=false;
  #musicOff=false;
  #musicTimer=0;
  #step=0;

  constructor(){
    const unlock=()=>void this.unlock();
    window.addEventListener('pointerdown',unlock,{passive:true});
    window.addEventListener('keydown',unlock,{passive:true});
  }

  setPreferences(options:{muted:boolean;musicOff:boolean}){this.#muted=options.muted;this.#musicOff=options.musicOff;if(this.#musicOff)this.stopMusic();else this.startMusic();}
  async unlock():Promise<void>{const context=this.context();if(context.state==='suspended')await context.resume().catch(()=>undefined);if(!this.#musicOff)this.startMusic();}
  play(cue:AudioCue):void{
    if(this.#muted)return;const context=this.context();if(context.state!=='running')return;
    const now=context.currentTime,osc=context.createOscillator(),gain=context.createGain(),pan=context.createStereoPanner();
    const base=hashPitch(cue.id);osc.type=cue.id.includes('destroyed')||cue.id.includes('impact')?'sawtooth':cue.channel==='ui'?'sine':'square';osc.frequency.setValueAtTime(base*cue.pitch,now);
    if(cue.id.includes('destroyed'))osc.frequency.exponentialRampToValueAtTime(Math.max(45,base*0.25),now+0.18);
    gain.gain.setValueAtTime(0.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(0.0001,cue.gain*0.18),now+0.008);gain.gain.exponentialRampToValueAtTime(0.0001,now+(cue.id.includes('destroyed')?0.22:0.09));
    pan.pan.value=cue.pan;osc.connect(gain).connect(pan).connect(context.destination);osc.start(now);osc.stop(now+0.24);
  }
  startMusic():void{if(this.#musicOff||this.#musicTimer)return;this.#musicTimer=window.setInterval(()=>this.musicPulse(),420);}
  stopMusic():void{if(this.#musicTimer){window.clearInterval(this.#musicTimer);this.#musicTimer=0;}}
  dispose():void{this.stopMusic();void this.#context?.close();this.#context=undefined;}
  private context():AudioContext{if(!this.#context)this.#context=new AudioContext();return this.#context;}
  private musicPulse():void{if(this.#musicOff||this.#muted)return;const context=this.context();if(context.state!=='running')return;const notes=[55,55,65.41,73.42,55,82.41,73.42,65.41];const now=context.currentTime;const osc=context.createOscillator(),gain=context.createGain();osc.type='triangle';osc.frequency.value=notes[this.#step++%notes.length];gain.gain.setValueAtTime(0.0001,now);gain.gain.exponentialRampToValueAtTime(0.035,now+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,now+0.34);osc.connect(gain).connect(context.destination);osc.start(now);osc.stop(now+0.36);}
}
