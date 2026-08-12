import type { CombatLineageId, StatUpgradeId } from '../../content/schema';
import type { MasteryPerkId } from '../../game/progression/types';
import type { GameCommand } from '../../input/commands/GameCommand';
import type { LiveSettingsPatch } from '../settings/LiveSettings';
import type { UIStore } from '../store/UIStore';
import type { UIScreen, UISettingsState } from '../types';

/** Application-owned mutation boundary. UI never receives underlying simulation objects. */
export interface UIApplicationPort {
  issue(command: GameCommand): void;
  chooseEvolution?(tankId: string): void;
  chooseMastery?(perkId: MasteryPerkId): void;
  chooseGene?(geneId: CombatLineageId): void;
  spendStat?(statId: StatUpgradeId): void;
  togglePause?(): void;
  redeploy?(): void;
  settingsChanged?(settings: UISettingsState): void;
}

export class UIController {
  constructor(private readonly store:UIStore,private readonly app:UIApplicationPort){}
  open(screen:UIScreen):void{this.store.setScreen(screen);}
  issue(command:GameCommand):void{this.app.issue(command);}
  swarm(order:'follow'|'attack'|'defend'|'recall',targetId?:string):void{this.app.issue({type:'swarm-order',order,targetId});}
  designate(targetId:string|null):void{this.app.issue({type:'designate-target',targetId});}
  evolve(tankId:string):void{if(!this.app.chooseEvolution)throw new Error('Evolution application API unavailable');this.app.chooseEvolution(tankId);}
  mastery(perkId:MasteryPerkId):void{if(!this.app.chooseMastery)throw new Error('Mastery application API unavailable');this.app.chooseMastery(perkId);}
  gene(geneId:CombatLineageId):void{if(!this.app.chooseGene)throw new Error('Gene application API unavailable');this.app.chooseGene(geneId);}
  spendStat(statId:StatUpgradeId):void{if(!this.app.spendStat)throw new Error('Upgrade application API unavailable');this.app.spendStat(statId);}
  togglePause():void{if(!this.app.togglePause)throw new Error('Pause application API unavailable');this.app.togglePause();}
  redeploy():void{if(!this.app.redeploy)throw new Error('Redeploy application API unavailable');this.app.redeploy();}
  updateSettings(patch:LiveSettingsPatch):void{const next=this.store.settings.update(patch);this.store.refreshSettings();this.app.settingsChanged?.(next);}
}
