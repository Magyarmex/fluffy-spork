import { FIELDCRAFT_TIPS, type FieldcraftTip } from '../../content/tips/FieldcraftTips';

export interface TipDeckOptions { readonly random?:()=>number; readonly tips?:readonly FieldcraftTip[]; }

/** Non-repeating shuffle-bag replacement for the old Fieldcraft global registry. */
export class TipDeck {
  readonly #random:()=>number;
  #tips:FieldcraftTip[];
  readonly #bags=new Map<string,string[]>();
  readonly #last=new Map<string,string>();

  constructor(options:TipDeckOptions={}) { this.#random=options.random??Math.random; this.#tips=[...(options.tips??FIELDCRAFT_TIPS)]; }
  current(tags?:readonly string[]):readonly FieldcraftTip[]{const active=this.#tips.filter((entry)=>entry.active);return Object.freeze(tags?.length?active.filter((entry)=>tags.some((tag)=>entry.tags.includes(tag))):active);}
  register(entry:FieldcraftTip):void{const index=this.#tips.findIndex((tip)=>tip.id===entry.id);if(index>=0)this.#tips[index]=entry;else this.#tips.push(entry);this.reset();}
  deprecate(id:string):boolean{const index=this.#tips.findIndex((tip)=>tip.id===id);if(index<0)return false;this.#tips[index]=Object.freeze({...this.#tips[index],active:false});this.reset();return true;}
  next(key='main',tags?:readonly string[]):FieldcraftTip|undefined{
    let pool=[...this.current(tags)];if(!pool.length)pool=[...this.current()];if(!pool.length)return undefined;
    const allowed=new Set(pool.map((entry)=>entry.id));let bag=(this.#bags.get(key)??[]).filter((id)=>allowed.has(id)&&this.#tips.some((entry)=>entry.id===id&&entry.active));
    if(!bag.length){bag=pool.map((entry)=>entry.id);for(let i=bag.length-1;i>0;i--){const j=Math.floor(this.#random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}const last=this.#last.get(key);if(last&&bag.length>1&&bag[0]===last)[bag[0],bag[1]]=[bag[1],bag[0]];}
    const id=bag.shift();this.#bags.set(key,bag);if(!id)return undefined;this.#last.set(key,id);return this.#tips.find((entry)=>entry.id===id&&entry.active);
  }
  private reset(){this.#bags.clear();this.#last.clear();}
}
