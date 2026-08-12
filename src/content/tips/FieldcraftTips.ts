export interface FieldcraftTip {
  readonly id: string;
  readonly text: string;
  readonly tags: readonly string[];
  readonly reviewed: string;
  readonly active: boolean;
}

export const FIELDCRAFT_DISPLAY_MS = 10_400;
const reviewed = '2026-08-08';
const tip = (id:string,text:string,tags:readonly string[]):FieldcraftTip => Object.freeze({id,text,tags:Object.freeze([...tags]),reviewed,active:true});

/** Canonical migration of the 50 reviewed v1.7.9 Fieldcraft tips. */
export const FIELDCRAFT_TIPS: readonly FieldcraftTip[] = Object.freeze([
 tip('cover-partial-blast','Hard cover can fully occlude a blast, but exposing part of your hull around an edge can still take partial blast damage.',['battlefield','combat']),
 tip('cover-penetration','A penetrating round only carries through destructible cover when that impact actually breaks the barricade and the projectile still has integrity left.',['battlefield','combat']),
 tip('cover-breach-route','Destroying a barricade is a route change, not just damage: a breach permanently turns that blocker into non-blocking rubble for the rest of the run.',['battlefield','combat']),
 tip('cover-last-seen-ai','Breaking line of sight denies AI a live target. It may investigate your last legitimately seen position, so relocate instead of waiting behind the same corner.',['battlefield','combat','ai']),
 tip('cover-cannon-ai','Cannon AI can deliberately shell destructible cover that blocks a recent legitimate contact. Do not treat a damaged barricade as permanent safety.',['battlefield','combat','ai']),
 tip('cover-observer-relay','A wall can break a sniper reconnaissance chain without killing the Observer: remote contact requires clear terrain sight.',['battlefield','sniper','combat']),
 tip('cover-layouts','Crossfire, Split Horizon, and Four Gates are mirrored layouts. Learn the repeatable lanes and crossings; spawn side should not change the geometry problem.',['battlefield','general']),
 tip('cover-strip','The battlefield strip reports remaining destructible cover. A falling count means routes and sightlines may have changed even if the breach happened off-screen.',['battlefield','ui']),
 tip('gunner-burst-discipline','Gunner spread is deterministic: stable aim and controlled bursts tighten fire, while excessive heat adds predictable dispersion and hull recoil.',['gunner','discipline','combat']),
 tip('gunner-midheat','Base Minigun descendants want sustainable mid-heat cadence. Holding fire until the meter is cooked sacrifices accuracy and forces a worse vent cycle.',['gunner','discipline','combat']),
 tip('tempest-redline','Tempest peaks inside its broad redline band. Overshooting the band buys severe recoil and recovery rather than extra useful throughput.',['gunner','apex','discipline']),
 tip('needle-storm-gate','Needle Storm has a narrow precision gate: exact heat plus stable tracking makes needles faster, stronger, and harder. Heat alone is not the payoff.',['gunner','apex','discipline']),
 tip('breachlord-brace','Breachlord rewards a settled, cooled brace volley. Firing the payoff creates a short movement-recovery opening, so choose the firing position before committing.',['gunner','apex','discipline']),
 tip('flakmaster-stability','Flakmaster converts stability into tighter, faster, longer-lived pellets. Bracing before the shot matters more at range than simply closing distance.',['gunner','apex','discipline']),
 tip('cannon-stick-depth','For Cannons, right-stick direction aims while stick depth programs detonation distance. You can change burst range without changing the bearing.',['cannon','discipline','controls']),
 tip('cannon-impact-before-fuse','The FUSE marker is a program, not a promise. If terrain is hit first, IMPACT marks the physical collision and the planned airburst becomes unreachable.',['cannon','battlefield','discipline']),
 tip('cannon-cover-fuse','Program Cannon bursts around the geometry you can actually reach. A deep fuse behind intact cover does not make splash ignore the wall.',['cannon','battlefield','combat']),
 tip('cluster-king-sector','Cluster King fuse depth also shapes the child-bomb sector: short programs spread wide; deep programs focus the sector forward.',['cannon','apex','discipline']),
 tip('siege-bomber-structure','Siege Bomber is the structural Cannon specialist. When opening a lane matters, its extra barricade damage is often more valuable than chasing hull damage.',['cannon','apex','battlefield']),
 tip('annihilator-deep-fuse','Annihilator gains stronger commitment from deep fuse programs, but the payoff leaves a larger reload opening. Place the burst where the reload can be survived.',['cannon','apex','discipline']),
 tip('quake-fuse-displacement','Quake Cannon converts deeper fuse programs into wider, stronger displacement rather than simple damage inflation. Use depth to move a fight, not only finish one.',['cannon','apex','discipline']),
 tip('guardian-facing','Guardian armor is directional. Your aim direction is also your strongest defensive facing, so tracking the wrong target can expose the hull you meant to protect.',['guardian','discipline','combat']),
 tip('guardian-perfect-guard','The opening fraction of a defensive activation is the Perfect Guard window. A correct read negates the incoming hit and banks Countercharge for your next projectile.',['guardian','discipline','combat']),
 tip('guardian-counterstructure','A Countercharged Guardian shot has modest structural authority. A successful Perfect Guard can therefore turn defense into limited lane pressure.',['guardian','battlefield','discipline']),
 tip('bastion-anchor','Bastion gains frontal lane efficiency while nearly stationary. Repositioning or letting a flank develop breaks the anchor advantage.',['guardian','apex','discipline']),
 tip('aegis-flow','Aegis converts a successful Perfect Guard into a brief mobility-flow window. Spend that window on angle or distance before the normal movement state returns.',['guardian','apex','discipline']),
 tip('meteor-straight-line','Meteor owns the highest straight-line Stampede peak, but steering bleeds momentum quickly. Build the route first; correct the aim before the charge.',['guardian','apex','discipline']),
 tip('ravager-steering','Ravager preserves more Stampede charge through moderate steering than Meteor. Trade peak impact for routes that need correction mid-charge.',['guardian','apex','discipline']),
 tip('stampede-collision','Sharp turns and terrain collisions dump stored Stampede charge. A wall scrape can erase the hit before contact with the target.',['guardian','battlefield','discipline']),
 tip('sniper-direct-vs-relay','Purple sniper hulls keep ordinary direct sight. Long-range authorization comes from the Forward Observer, so losing the relay does not disable close direct combat.',['sniper','observer','combat']),
 tip('sniper-kill-observer','Destroying the active Forward Observer temporarily removes remote sniper authorization. Use that downtime to cross lanes that were unsafe under relay.',['sniper','observer','combat']),
 tip('observer-cone','Forward Observers search a broad cone of roughly 700 units and about 149 degrees, plus short point-blank awareness. Approaching outside the cone can matter until suspicion turns it.',['sniper','observer','combat']),
 tip('observer-suspicion','Recent contacts and nearby hostile projectile paths create decaying suspicion bearings for Observers. Firing near a scout can rotate its search even without revealing exact coordinates.',['sniper','observer','combat']),
 tip('observer-search-after-loss','An Observer keeps searching purposeful sectors after contact is lost. Breaking sight is the first step; changing the expected re-acquisition angle is the second.',['sniper','observer','combat']),
 tip('observer-contact-ui','Cyan CONTACT relays and off-screen distance markers are authorization information, not decoration. They tell a sniper when the Observer has established the remote link.',['sniper','observer','ui']),
 tip('sniper-postshot','Non-beam purple forms telegraph precision dwell and carry punishable post-shot reveal. Survive the lined-up shot, then exploit the recovery instead of peeking during the dwell.',['sniper','discipline','combat']),
 tip('controller-bearing-depth','Controller right-stick direction sets swarm bearing, analog depth sets deployment distance, and releasing the command recalls the squad while the left stick keeps driving the hull.',['controller','drones','controls']),
 tip('controller-command-node-cover','A Controller Command Node can be placed beyond cover, but it does not teleport threat through terrain: the squad still has to physically reach that space.',['controller','drones','battlefield']),
 tip('controller-committed-dive','A locked Controller attack dive stays committed. If the route intersects hard cover, the drone crashes into recovery instead of pathfinding around the wall mid-dive.',['controller','drones','battlefield']),
 tip('controller-routing-states','Controller drones use local corner routing while forming, farming, defending, and recalling. Attack dives are the exception, so issue them from geometry the swarm can actually clear.',['controller','drones','battlefield']),
 tip('controller-shape-reservations','Friendly Controller drones reserve different harvest shapes when alternatives exist. Spreading the swarm over nearby resources reduces redundant travel.',['controller','drones','economy']),
 tip('controller-auto-defense','Automatic Controller defense intercepts nearby hostile combat drones but deliberately ignores Forward Observer spotters.',['controller','drones','observer']),
 tip('controller-manual-spotter','Manual swarm commands can target hostile Forward Observers even though automatic drone defense ignores them. Spotter removal is a deliberate command decision.',['controller','drones','observer','combat']),
 tip('drone-iff','Drone IFF halos encode allegiance without replacing lineage color: faint blue is friendly or allied; faint red is hostile.',['controller','drones','ui']),
 tip('graft-preview','Blackglass graft previews show exact base-before-to-after stat changes. Judge the actual weapon, hull, mobility, splash, drone, or reduction delta instead of the gene name.',['blackglass','graft','lineage']),
 tip('apex-sidegrade','Apex forms are mastery sidegrades, not automatic upgrades: Tempest, Cluster King, Bastion, and their peers ask you to exploit a specific discipline to earn the ceiling.',['blackglass','apex','lineage']),
 tip('aim-sensitivity-clamp','Aim sensitivity changes how much thumb travel crosses the stick response, but the game still uses its existing clamp. Raising it does not grant extra aim range or combat stats.',['settings','controls']),
 tip('move-sensitivity-clamp','Move sensitivity changes touch-stick response before normalized movement. A higher value reaches full input sooner; it does not increase tank top speed.',['settings','controls']),
 tip('stick-presentation','Joystick size and opacity are presentation-only. Use size to improve thumb leverage and opacity to keep battlefield information visible beneath the controls.',['settings','controls','ui']),
 tip('screen-shake-render','Screen shake is scaled only for rendering and restored immediately after the frame. Reducing it changes readability, not recoil, explosions, or simulation state.',['settings','controls','ui']),
]);

export function auditFieldcraftTips(tips:readonly FieldcraftTip[]=FIELDCRAFT_TIPS){
  const ids=new Set<string>(),texts=new Set<string>();const duplicateIds:string[]=[],duplicateTexts:string[]=[];
  for(const entry of tips){if(ids.has(entry.id))duplicateIds.push(entry.id);ids.add(entry.id);const text=entry.text.toLowerCase();if(texts.has(text))duplicateTexts.push(entry.id);texts.add(text);}
  return Object.freeze({current:tips.filter((entry)=>entry.active).length,total:tips.length,duplicateIds:Object.freeze(duplicateIds),duplicateTexts:Object.freeze(duplicateTexts),displayMs:FIELDCRAFT_DISPLAY_MS});
}
