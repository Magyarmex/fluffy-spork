import type { BattlefieldDefinition } from '../content/schema';
import type { EntityState } from '../game/entities/types';
import type { GameEvent } from '../game/simulation/types';

export type RenderLayer = 'arena' | 'terrain' | 'effect-under' | 'entity' | 'effect-over' | 'overlay';
export type VisualChannel = 'reticle' | 'edge' | 'world' | 'hud' | 'chassis';
export type VisualIntent = 'confirmation' | 'threat' | 'readiness' | 'state' | 'spatial' | 'identity';

interface BaseCommand { readonly layer: RenderLayer; readonly alpha?: number; }
export interface CircleCommand extends BaseCommand { readonly kind:'circle'; readonly x:number; readonly y:number; readonly radius:number; readonly fill?:string; readonly stroke?:string; readonly lineWidth?:number; }
export interface RectCommand extends BaseCommand { readonly kind:'rect'; readonly x:number; readonly y:number; readonly width:number; readonly height:number; readonly rotation?:number; readonly fill?:string; readonly stroke?:string; readonly lineWidth?:number; }
export interface LineCommand extends BaseCommand { readonly kind:'line'; readonly x1:number; readonly y1:number; readonly x2:number; readonly y2:number; readonly width:number; readonly color:string; }
export interface GlowCommand extends BaseCommand { readonly kind:'glow'; readonly x:number; readonly y:number; readonly radius:number; readonly color:string; }
export interface TextCommand extends BaseCommand { readonly kind:'text'; readonly x:number; readonly y:number; readonly text:string; readonly color:string; readonly size:number; }
export type RenderCommand = CircleCommand | RectCommand | LineCommand | GlowCommand | TextCommand;

export interface VisualIntentSpec { readonly id:string; readonly intent:VisualIntent; readonly channel:VisualChannel; readonly question:string; readonly reason:string; readonly duration:'event'|'transient'|'while-active'|'while-critical'|'while-commanded'|'persistent'; }
export interface RenderFrameInput { readonly tick:number; readonly elapsedMs:number; readonly entities:readonly EntityState[]; readonly battlefield?:BattlefieldDefinition; readonly events?:readonly GameEvent[]; }
export interface RenderMetrics { readonly entitiesVisited:number; readonly entitiesRendered:number; readonly commandsBuilt:number; readonly effectsBuilt:number; }
export interface RenderFrame { readonly tick:number; readonly elapsedMs:number; readonly commands:readonly RenderCommand[]; readonly metrics:RenderMetrics; }
