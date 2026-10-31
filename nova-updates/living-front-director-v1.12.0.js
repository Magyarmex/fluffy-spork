/* NOVA TANKS v1.12.0 — Living Front / Stage III: Front Director + Strategic AI */
/* NOVA_VISUAL_INTENT: CONTESTED marks a witnessed hostile contest of an existing public BLOOM on the minimap; it adds no enemy radar, persistent HUD or decorative effects. */
(function(){'use strict';
var LF=window.__NOVA_LIVING_FRONT_INTERNAL__,mods=window.__novaModules;if(!LF||!mods||!LF.instincts){console.error('[NOVA v1.12.0] Living Front stages missing');return;}if(window.__NOVA_LIVING_FRONT__)return;
var V=LF.VERSION,clamp=LF.clamp,d2=LF.d2,alive=LF.alive,xp=LF.xp,sectorCenter=LF.sectorCenter,sectorIndex=LF.sectorIndex;
var REJECTED=['convoys','reactors','supply beacons','extraction','crafting currency','factions','reputation','shape breeding','deep food chain','multiple Crasher species','random shape stat mutations','quests','daily objectives','XP multiplier zones','class ecology trees','new controls'];
var TIP_DEFS=[
 {id:'living-front-quiet-maturity',text:'Quiet ground matures. If a lane has been ignored, its next harvest may be worth the rotation.',tags:['battlefield','economy','living-front'],reviewed:'2026-08-30',source:'living-front-v1.12.0'},
 {id:'living-front-hex-keystone',text:'A Hexagon is more than 200 XP: undisturbed ones tend to gather a loose pocket of prey around themselves.',tags:['battlefield','economy','living-front'],reviewed:'2026-08-30',source:'living-front-v1.12.0'},
 {id:'living-front-triangle-evade',text:'Triangles get one committed evade, not infinite dodges. Bait the sidestep, then place the follow-up shot.',tags:['combat','aim','living-front'],reviewed:'2026-08-30',source:'living-front-v1.12.0'},
 {id:'living-front-crasher-bounty',text:'A bright Crasher core means bonus XP, not extra damage. Bait its charge into cover; punish while recovery brackets fade.',tags:['combat','economy','living-front'],reviewed:'2026-08-30',source:'living-front-v1.12.0'},
 {id:'living-front-bloom-choice',text:'BLOOM compass points from your hull to the announced sector. Its dashed ring is last-known, not fresh intel. A dashed red ! at a BLOOM warns of a visible rival ahead; solid ! means you entered the contest. Scout, flank, or leave.',tags:['battlefield','economy','living-front'],reviewed:'2026-10-27',source:'living-front-v1.12.0'},
 {id:'living-front-star-intercept',text:'Rogue Stars reward interception. Cut the route instead of chasing directly from behind.',tags:['battlefield','combat','living-front'],reviewed:'2026-08-30',source:'living-front-v1.12.0'},
 {id:'living-front-herding',text:'Explosions and near fire can herd skittish prey, but repeated disturbance quickly loses efficiency and depletes the lane.',tags:['battlefield','economy','living-front'],reviewed:'2026-08-30',source:'living-front-v1.12.0'}
];
var TIPS=TIP_DEFS.map(function(t){return t.text;});
function mean(st){var n=0;for(var i=0;i<16;i++)n+=st.sectors[i].value;return n/16;}
function bloomAgeEligible(st){return !!st&&LF.ageProgress(st)>=.15;}
function bloomCandidate(st){if(!bloomAgeEligible(st))return-1;var avg=mean(st),best=-1,score=0;for(var i=0;i<16;i++){var s=st.sectors[i],m=s.maturity/Math.max(.1,st.ceiling),v=s.value/(avg+1);if(s.value<310||m<.62||v<1.34)continue;var q=v*.72+m*.55-clamp(s.pressure,0,1)*.42;if(q>score){score=q;best=i;}}return best;}
/* Only physical source-local crossing flow can authorize a public direction.
 * A cancelled or boundary-clamped busiest source must not mask a different
 * sector's coherent witnessed migration. Explicit research source overrides
 * remain fail-closed and never silently substitute another origin. */
function migrationAt(st,from){
 var local=st.sectors[from],routes=local&&local.flowTo;
 if(!routes)return null;
 var bestTo=-1,bestWeight=1e-6,runnerUp=0;
 for(var to=0;to<16;to++){
  if(to===from)continue;
  var weight=Number(routes[to])||0;
  if(!(weight>0))continue;
  if(weight>bestWeight){runnerUp=bestWeight;bestWeight=weight;bestTo=to;}
  else if(weight>runnerUp)runnerUp=weight;
 }
 /* Report the strongest witnessed physical route. Exact ties and cancelled
  * aggregate flow remain ambiguous; do not fabricate a dominant direction.
  * Do not require a majority: that would erase legitimate split migrations. */
 var net=Math.hypot(Number(local.flowX)||0,Number(local.flowY)||0);
 return bestTo>=0&&bestWeight>runnerUp+1e-6&&net>1e-6?
  {type:'MIGRATION',from:from,to:bestTo}:null;
}
function decision(st,ctx){var adopting=!!(ctx&&ctx.adoptStarId>0);if(ctx&&ctx.enabled===false)return null;var now=ctx&&ctx.now||0;if(st.signal&&now<st.signal.until)return null;if(now-st.lastSignalAt<8)return null;if(st.cooldowns.bloom<=0){var b=bloomCandidate(st);if(b>=0&&(b!==st.lastBloomSector||st.sectors[b].maturity>.78*st.ceiling))return{type:'BLOOM',sector:b};}
if(st.cooldowns.migration<=0&&st.migrationHeat>=5){
 var forced=ctx&&ctx.migrationFrom;
 if(forced!=null&&!(forced<0)){
  if(!Number.isInteger(forced)||forced>=16)return null;
  var selected=migrationAt(st,forced);if(selected)return selected;
 }
 else{
  var best=null,bestOutbound=0;
  for(var i=0;i<16;i++){
   var outbound=Number(st.sectors[i]&&st.sectors[i].outbound)||0;
   if(!(outbound>bestOutbound))continue;
   var candidate=migrationAt(st,i);
   if(candidate){best=candidate;bestOutbound=outbound;}
  }
  if(best)return best;
 }
}
/* Publicizing a real fresh Star has a shorter quiet gate than creating one.
 * BLOOM still wins first when actually eligible; a rich sector on BLOOM
 * cooldown must not permanently veto an unrelated time-limited Star. */
if(st.cooldowns.star<=0&&(!(ctx&&ctx.hasStar)||adopting)&&
 (adopting||bloomCandidate(st)<0)&&st.migrationHeat<3&&now>72&&
 now-st.lastMeaningfulAt>(adopting?16:31))return{type:'ROGUE STAR',starId:ctx&&ctx.adoptStarId||null};return null;}
/* A public BLOOM already identifies a sector on the minimap. Reuse only
 * that public destination and the pilot's own hull to give an immediate
 * rotation bearing on tiny mobile maps. The direction is frozen at announcement,
 * not a live radar pointer or a new permanent HUD. */
function compassBearing(dx,dy){
 return ['E','SE','S','SW','W','NW','N','NE'][
  (Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8];
}
function bloomToast(g,sector){
 var p=g&&g.player;
 if(!p||!alive(p)||!Number.isFinite(p.x)||!Number.isFinite(p.y))
  return '✦ SHAPE BLOOM · value has accumulated in quiet ground';
 var c=sectorCenter(sector);
 var bearing=sectorIndex(p.x,p.y)===sector?'SAME SECTOR':
  compassBearing(c.x-p.x,c.y-p.y);
 return '✦ SHAPE BLOOM · '+bearing+' · quiet ground is rich';
}
/* A MIGRATION is an already-public report of actual neutral crossings.
 * Tell the player where the reported crossing lies AND which way the
 * population was moving. Both bearings are frozen at announcement; neither
 * is a live shape tracker, a hidden-value scan or a permanent HUD. */
function migrationToast(g,from,to){
 var a=sectorCenter(from),b=sectorCenter(to);
 var flow=compassBearing(b.x-a.x,b.y-a.y);
 var p=g&&g.player;
 if(!p||!alive(p)||!Number.isFinite(p.x)||!Number.isFinite(p.y))
  return '⇢ MIGRATION · FLOW '+flow+' · neutral shapes moving';
 var mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
 var dx=mx-p.x,dy=my-p.y;
 var location=Math.hypot(dx,dy)<120?'NEAR YOU':compassBearing(dx,dy)+' OF YOU';
 return '⇢ MIGRATION · '+location+' · FLOW '+flow;
}
/* Rogue Star is already a PUBLIC created opportunity, with its position on
 * the existing minimap. Give small-screen players the initial reported bearing
 * without tracking its future route or revealing another hidden entity.
 * REPORTED is deliberately explicit: this one-shot bearing becomes stale. */
function rogueStarToast(g,sig){
 var base='★ ROGUE STAR · intercept the roaming prize';
 var p=g&&g.player;
 if(!sig||!p||!alive(p)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
    !Number.isFinite(sig.x)||!Number.isFinite(sig.y))return base;
 var dx=sig.x-p.x,dy=sig.y-p.y;
 var bearing=Math.hypot(dx,dy)<120?'NEAR YOU':compassBearing(dx,dy);
 return '★ ROGUE STAR · REPORTED '+bearing+' · cut its route';
}
function setSignal(g,st,d){var now=g.time||0,sig={type:d.type,started:now,until:now+(d.type==='BLOOM'?5:d.type==='MIGRATION'?4.4:7)};if(d.type==='BLOOM'){sig.sector=d.sector;var c=sectorCenter(d.sector);sig.x=c.x;sig.y=c.y;st.cooldowns.bloom=24;st.lastBloomSector=d.sector;st.bloomMemory={sector:d.sector,announcedAt:now,until:now+24,initialValue:st.sectors[d.sector]?st.sectors[d.sector].value:0};st.lastMeaningfulAt=now;st.stats.blooms++;}else if(d.type==='MIGRATION'){sig.from=d.from;sig.to=d.to;var a=sectorCenter(d.from),b=sectorCenter(d.to);sig.x=(a.x+b.x)/2;sig.y=(a.y+b.y)/2;st.cooldowns.migration=20;st.migrationMemory={from:d.from,to:d.to,announcedAt:now,until:now+16};st.lastMeaningfulAt=now;st.stats.migrations++;st.migrationHeat*=.28;}else{
  /* The canonical game already maintains one ordinary Star. A freshly
   * spawned, real Star can become the rare public opportunity without
   * duplicating or teleporting it. Preserve the old created-Star fallback
   * only when the world genuinely has no Star. */
  var s=null,adopted=false;
  if(d.starId>0){
   s=g.getShape&&g.getShape(d.starId);
   if(!s||s.type!=='star'||!(s.hp>0)||s.__lfPublicAnnounced)return;
   adopted=true;
  }else{
   var n=(g.shapes||[]).length;
   if(g.spawnShape)g.spawnShape('star',false);
   s=(g.shapes||[])[(g.shapes||[]).length-1];
   if((g.shapes||[]).length<=n||!s||s.type!=='star')return;
   LF.initStar(g,st,s);
  }
  st.cooldowns.star=58;s.__lfPublicAnnounced=true;
  sig.starId=s.id;sig.x=s.x;sig.y=s.y;
  st.lastMeaningfulAt=now;
  st.stats.starAnnouncements=(st.stats.starAnnouncements||0)+1;
 }if(d.type!=='MIGRATION')st.migrationMemory=null;st.signal=sig;st.lastSignal=d.type;st.lastSignalAt=now;if(d.type==='BLOOM')ensureFrontline(g,st);if(g.toast)g.toast(d.type==='BLOOM'?bloomToast(g,d.sector):d.type==='MIGRATION'?migrationToast(g,d.from,d.to):rogueStarToast(g,sig),'info');if(g.sfx&&g.sfx.novaLivingSignal)g.sfx.novaLivingSignal(d.type,g.player?clamp((sig.x-g.player.x)/900,-1,1):0);}
LF.directorTick=function(g,st){var t0=LF.ms(),hasStar=false,adoptStarId=null,sh=g.shapes||[],now=g.time||0;
 for(var i=0;i<sh.length;i++){
  var s=sh[i];if(!s||!(s.hp>0)||s.type!=='star')continue;
  hasStar=true;
  var age=now-Number(s.__lfStarBorn);
  if(!s.__lfPublicAnnounced&&Number.isFinite(s.__lfStarBorn)&&age>=0&&age<=8)
   adoptStarId=s.id;
 }
 if(st.signal&&st.signal.type==='ROGUE STAR'&&st.signal.starId&&g.getShape&&!g.getShape(st.signal.starId))st.signal=null;var d=decision(st,{enabled:st.directorEnabled,now:g.time||0,hasStar:hasStar,adoptStarId:adoptStarId});if(d)setSignal(g,st,d);if(st.signal&&(g.time||0)>=st.signal.until)st.signal=null;var observed=updateContest(g,st);frontlineTick(g,st,observed);LF.planSample(st,LF.ms()-t0);};
function visible(g,t,s){var F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;var inView=F&&F.inGameplayViewport?F.inGameplayViewport(g,t,s):(function(){var z=(g.cam&&g.cam.zoom)||1,hx=(g.w||800)/(2*z),hy=(g.h||600)/(2*z);return Math.abs(s.x-t.x)<=hx&&Math.abs(s.y-t.y)<=hy;})();return !!inView&&(!g.hasLineOfSight||g.hasLineOfSight(t.x,t.y,s.x,s.y,2));}

/* Tactical Frontlines: a BLOOM is contested only when the human pilot and a
 * genuinely hostile, unshielded tank are in that sector and the opponent is
 * actually visible through the shipping Fair Engagement + terrain contracts.
 * This does not reveal unseen coordinates, modify AI utility, or spawn value. */
/* A public BLOOM announcement remains actionable as last-known intelligence for
 * one bounded rotation. After its live five-second signal, the memory ring is
 * explicitly stale: it cannot reveal enemy positions or guarantee current XP. */
function publicBloom(st,now){
 if(!st||st.directorEnabled===false)return null;
 /* Public intelligence cannot precede its announcement. A clock reset,
  * replay discontinuity or malformed future record must not manufacture a
  * CONTESTED badge, Frontlines telemetry window or AI memory commitment. */
 var sig=st.signal;
 if(sig&&sig.type==='BLOOM'&&Number.isFinite(sig.started)&&
    now>=sig.started&&now<sig.until)
  return{sector:sig.sector,announcedAt:sig.started,until:sig.until,live:true};
 var mem=st.bloomMemory;
 if(mem&&Number.isFinite(mem.announcedAt)&&
    now>=mem.announcedAt&&now<mem.until)
  return{sector:mem.sector,announcedAt:mem.announcedAt,until:mem.until,live:false};
 return null;
}

/* Frontlines research telemetry: observation only. No authority over movement,
 * damage, Director decisions, player HUD, or AI information. */
function frontlineTrace(f,g,kind,mode,amount){
 var now=Number(g&&g.time)||0,phase=mode;
 /* A missing explicit AI mode is not necessarily stale memory. Classify
  * player entry, observed contest and actual neutral XP by the SAME public
  * BLOOM window that authorized them; never label a live event as memory. */
 if(!phase){
  var op=publicBloom(g&&g.__lfState,now);
  phase=op&&op.sector===f.sector&&op.announcedAt===f.announcedAt?
   (op.live?'live':'memory'):'ended';
 }
 var e={t:+now.toFixed(2),kind:kind,sector:f.sector,mode:phase};
 if(Number.isFinite(amount))e.xp=+amount.toFixed(2);
 /* A dense neutral-orb pickup burst must not evict the announcement, entry
  * and visible contest that explain it. Coalesce only consecutive harvests
  * in the SAME public sector/phase within 0.5s of the FIRST pickup. A
  * strategic event, new opportunity, clock reset or phase transition breaks
  * the group. Raw XP stays in private telemetry until rounded for Debug;
  * counts.neutralXP and the original gainXP hook remain authoritative. */
 if(kind==='neutral-harvest'&&Number.isFinite(amount)){
  var last=f.events[f.events.length-1];
  if(last&&last.kind==='neutral-harvest'&&last.sector===f.sector&&
     last.mode===phase&&Number.isFinite(f.harvestStartedAt)&&
     now>=f.harvestStartedAt&&now-f.harvestStartedAt<=.5){
   f.harvestRawXP+=amount;
   /* Core snapshots shallow-copy the event ring. Replace the event instead
    * of mutating an object already published to Debug/replay observers. */
   f.events[f.events.length-1]=Object.assign({},last,{
    xp:+f.harvestRawXP.toFixed(2),count:(last.count||1)+1,end:+now.toFixed(2)
   });
   return;
  }
  f.harvestStartedAt=now;f.harvestRawXP=amount;e.count=1;
 }else{f.harvestStartedAt=null;f.harvestRawXP=0;}
 f.events.push(e);if(f.events.length>48)f.events.shift();
}
function closeFrontline(g,st,reason){
 var f=st&&st.frontlineTelemetry;
 if(!f||f.closed||!f.currentKey)return false;
 /* Closure is not a death witness. If sampling resumes after the public
  * opportunity expired (or a new BLOOM replaced it), a dead pilot cannot
  * retroactively censor the old opportunity. The authoritative damage hook
  * records in-window deaths immediately; this fallback only covers a still-
  * active, matching public opportunity when the damage hook was missed. */
 var active=g&&publicBloom(st,Number(g.time)||0);
 if(g&&g.player&&f.pilotWasAlive&&!alive(g.player)&&!f.pilotDeathCensored&&
    active&&active.sector===f.sector&&active.announcedAt===f.announcedAt){
  f.pilotDeathCensored=true;f.counts.pilotDeathCensors=(f.counts.pilotDeathCensors||0)+1;
  frontlineTrace(f,g,'pilot-death-censor');
 }
 f.closed=true;f.counts.resolved++;
 /* Do not retain tank references after the public opportunity closes. */
 f.aiPhysicalMotion={};f.aiPhysicalLast={};f.aiPhysicalIdentity={};
 if(f.seenContest&&!f.deathRecorded&&g.player&&alive(g.player)){
  f.counts.contestSurvivals++;frontlineTrace(f,g,'contest-survived');
 }
 frontlineTrace(f,g,'resolved',reason);
 return true;
}
function ensureFrontline(g,st){
 if(!g||!st||g.__novaDecorativeWorld||g.status!=='playing'||st.directorEnabled===false)return null;
 var op=publicBloom(st,g.time||0);if(!op)return null;
 var f=st.frontlineTelemetry;
 if(!f)f=st.frontlineTelemetry={currentKey:null,sector:-1,announcedAt:-1,playerInside:false,
  seenContest:false,aiSeen:{},aiStartDist:{},aiApproachSeen:{},aiPhysicalLast:{},aiPhysicalMotion:{},aiPhysicalIdentity:{},aiPhysicalArrived:{},aiPhysicalApproachSeen:{},events:[],counts:{announcements:0,resolved:0,contestSurvivals:0,playerSeconds:0,playerApproaches:0,aiApproaches:0,playerEntries:0,playerExits:0,
  observedContests:0,playerDeaths:0,pilotDeathCensors:0,sampledSeconds:0,pilotAliveSeconds:0,hostileBotSeconds:0,hostileOutsideBotSeconds:0,aiArrivals:0,aiPhysicalArrivals:0,aiPhysicalApproaches:0,aiPhysicalRejectedCrossings:0,neutralXP:0}};
 var key=op.sector+':'+op.announcedAt;
 /* A disabled Director resolves this public observation. Re-enabling it
  * during the same announcement must not resurrect closed telemetry: that
  * would count post-closure XP/exposure while the death hook still refuses
  * attribution. Wait for a genuinely new public opportunity instead. */
 if(f.closed&&f.currentKey===key)return null;
 if(f.currentKey!==key){
  closeFrontline(g,st,'replaced');
  f.currentKey=key;f.sector=op.sector;f.announcedAt=op.announcedAt;
  f.playerInside=false;f.seenContest=false;f.deathRecorded=false;f.pilotDeathCensored=false;f.pilotWasAlive=!!(g.player&&alive(g.player));f.closed=false;f.lastSampleTime=Number(g.time)||0;f.playerStartDist=null;f.playerApproachSeen=false;f.aiSeen={};f.aiStartDist={};f.aiApproachSeen={};f.aiPhysicalLast={};f.aiPhysicalMotion={};f.aiPhysicalIdentity={};f.aiPhysicalArrived={};f.aiPhysicalApproachSeen={};
  f.counts.announcements++;frontlineTrace(f,g,'announced',op.live?'live':'memory');
 }
 return f;
}
function recordFrontlinePlayerDeath(g,st,t){
 var f=st&&st.frontlineTelemetry;
 if(!f||f.closed||!t||t!==g.player||alive(t))return false;
 var op=publicBloom(st,g.time||0);
 if(!op||op.sector!==f.sector||op.announcedAt!==f.announcedAt)return false;
 /* A/B death censor is independent of where the fatal hit happened. */
 if(!f.pilotDeathCensored){
  f.pilotDeathCensored=true;f.counts.pilotDeathCensors=(f.counts.pilotDeathCensors||0)+1;
  frontlineTrace(f,g,'pilot-death-censor');
 }
 if(f.deathRecorded||sectorIndex(t.x,t.y)!==f.sector)return false;
 if(!f.playerInside){f.playerInside=true;f.counts.playerEntries++;frontlineTrace(f,g,'player-entry');}
 f.deathRecorded=true;f.counts.playerDeaths++;frontlineTrace(f,g,'player-death');
 return true;
}
/* Physical A/B witness: count every hostile AI that *actually moves* into
 * the public opportunity, regardless of its current ecology steering mode.
 * The older aiArrivals counter remains memory-only for diagnosis, but is not
 * a valid ON/OFF comparator. This function is observational: never influences
 * AI movement, signals, combat or XP. Raw coordinates stay internal and are
 * deliberately omitted by LF.snapshot and the Debug event ring. */
function physicalAIArrivals(g,f,p,ts,now){
 if(!p||!alive(p)){f.aiPhysicalMotion={};return;}
 var c=sectorCenter(f.sector),last=f.aiPhysicalLast,motion=f.aiPhysicalMotion||{},arrived=f.aiPhysicalArrived,approached=f.aiPhysicalApproachSeen,identity=f.aiPhysicalIdentity||(f.aiPhysicalIdentity={}),seen={},present={};
 for(var i=0;i<ts.length;i++){
  var t=ts[i],id=t&&t.id!=null?String(t.id):null;
  if(!id)continue;
  present[id]=true;
  /* A temporary shield clears the movement baseline but not identity. A new
   * tank with the same numeric id must still receive a fresh arrival budget. */
  if(identity[id]&&identity[id]!==t){
   delete arrived[id];delete approached[id];delete last[id];
   delete f.aiSeen[id];delete f.aiApproachSeen[id];delete f.aiStartDist[id];
  }
  identity[id]=t;
  if(!t.ai||t===p||!alive(t)||t.spawnShieldT>0||!contestHostile(g,p,t)){
   /* Death ends one physical bot incarnation. Temporary shields do not. */
   if(!alive(t)){
    delete identity[id];delete arrived[id];delete approached[id];
    delete f.aiSeen[id];delete f.aiApproachSeen[id];delete f.aiStartDist[id];
   }
   delete last[id];continue;
  }
  seen[id]=true;
  var inside=sectorIndex(t.x,t.y)===f.sector,dist=Math.hypot(t.x-c.x,t.y-c.y),prev=last[id];
  if(!prev||prev.ref!==t){
   if(prev&&prev.ref!==t){
    /* Same numeric id, new physical tank: never inherit the old arrival. */
    delete arrived[id];delete approached[id];
    delete f.aiSeen[id];delete f.aiApproachSeen[id];delete f.aiStartDist[id];
   }
   last[id]={ref:t,x:t.x,y:t.y,t:now,inside:inside,startDist:inside?null:dist,approached:false};
   continue;
  }
  var dt=now-prev.t,travel=Math.hypot(t.x-prev.x,t.y-prev.y),w=motion[id];
  /* Position samples alone cannot distinguish a 25-unit teleport from real
   * travel. Require the actual moveTank owner to account for the complete
   * interval, including every intermediate call and its final position. */
  var certified=!!(w&&w.ref===t&&w.valid&&w.segments>0&&
   Math.hypot(w.startX-prev.x,w.startY-prev.y)<=.01&&
   Math.hypot(w.endX-t.x,w.endY-t.y)<=.01);
  if(dt<=0&&travel<=1e-6)continue;
  var speed=typeof g.tankSpeed==='function'?Number(g.tankSpeed(t)):900;
  if(!(speed>0)||!Number.isFinite(speed))speed=900;
  /* A jump, long background gap or recycled body is not a witnessed journey.
   * Prefer missing a dash arrival over fabricating a physical A/B advantage. */
  if(!certified||!(dt>0&&dt<=2)||travel>Math.max(180,speed*dt*2.2+60)){
   /* Report coverage loss separately: a zero arrival count may otherwise
    * mean either no tactical rotation or a movement we could not certify. */
   if(!prev.inside&&inside)f.counts.aiPhysicalRejectedCrossings++;
   last[id]={ref:t,x:t.x,y:t.y,t:now,inside:inside,startDist:inside?null:dist,approached:false};
   continue;
  }
  if(!approached[id]&&prev.startDist!=null&&prev.startDist-dist>=60){
   approached[id]=true;f.counts.aiPhysicalApproaches++;
   frontlineTrace(f,g,'ai-physical-approach',t.ai.__lfEcoMode||'none');
  }
  /* A bot may enter and leave between two decimated Director samples.
   * An actual moveTank substep ending inside is a physical visit even when
   * both sampling endpoints are outside. Never infer visits from straight-
   * line interpolation or uncertified/discontinuous movement. */
  if(!prev.inside&&(inside||w.entered)&&!arrived[id]){
   arrived[id]=true;f.counts.aiPhysicalArrivals++;
   frontlineTrace(f,g,'ai-physical-arrival',t.ai.__lfEcoMode||'none');
  }
  prev.x=t.x;prev.y=t.y;prev.t=now;prev.inside=inside;
 }
 for(var oldId in identity)if(!present[oldId]){
  delete identity[oldId];delete arrived[oldId];delete approached[oldId];
  delete f.aiSeen[oldId];delete f.aiApproachSeen[oldId];delete f.aiStartDist[oldId];
 }
 for(var key in last)if(!seen[key]){
  delete last[key];delete arrived[key];delete approached[key];
  delete f.aiSeen[key];delete f.aiApproachSeen[key];delete f.aiStartDist[key];
 }
 /* One witness is valid for one telemetry interval, never a later sample. */
 f.aiPhysicalMotion={};
}
function frontlineTick(g,st,observedContest){
 var f=ensureFrontline(g,st);
 if(!f){
  if(g&&st&&!g.__novaDecorativeWorld)
   closeFrontline(g,st,st.directorEnabled===false?'disabled':g.status!=='playing'?'ended':'expired');
  return false;
 }
 var p=g.player,inside=!!(p&&alive(p)&&!(p.spawnShieldT>0)&&sectorIndex(p.x,p.y)===f.sector);
 var now=Number(g.time)||0,delta=clamp(now-(f.lastSampleTime==null?now:f.lastSampleTime),0,LF.SECTOR_PERIOD*2);
 f.counts.playerSeconds+=delta*(f.playerInside&&inside?1:((f.playerInside||inside)?0.5:0));
 f.lastSampleTime=now;
 if(p&&alive(p))f.pilotWasAlive=true;
 /* Bounded exposure denominators: independent of AI ecology mode. */
 f.counts.sampledSeconds=(f.counts.sampledSeconds||0)+delta;
 if(p&&alive(p))f.counts.pilotAliveSeconds=(f.counts.pilotAliveSeconds||0)+delta;
 if(p&&alive(p)){
  var c=sectorCenter(f.sector),dist=Math.hypot(p.x-c.x,p.y-c.y);
  if(f.playerStartDist==null&&!inside)f.playerStartDist=dist;
  if(!f.playerApproachSeen&&f.playerStartDist!=null&&f.playerStartDist-dist>=120){
   f.playerApproachSeen=true;f.counts.playerApproaches++;frontlineTrace(f,g,'player-approach');
  }
 }
 if(inside&&!f.playerInside){f.counts.playerEntries++;frontlineTrace(f,g,'player-entry');}
 if(!inside&&f.playerInside){
  f.counts.playerExits++;frontlineTrace(f,g,'player-exit');
  if(p&&!alive(p))recordFrontlinePlayerDeath(g,st,p);
 }
 f.playerInside=inside;
 if(inside&&observedContest&&!f.seenContest){
  f.seenContest=true;f.counts.observedContests++;frontlineTrace(f,g,'observed-contest');
 }
 var ts=g.tanks||[];
 for(var i=0;i<ts.length;i++){
  var t=ts[i],a=t&&t.ai;
  if(delta>0&&p&&alive(p)&&t&&t!==p&&a&&alive(t)&&!(t.spawnShieldT>0)&&contestHostile(g,p,t)){
   f.counts.hostileBotSeconds=(f.counts.hostileBotSeconds||0)+delta;
   /* Already-inside bots cannot make a new outside-to-inside arrival.
    * Keep their exposure separate from the population at risk of entry. */
   if(sectorIndex(t.x,t.y)!==f.sector)
    f.counts.hostileOutsideBotSeconds=(f.counts.hostileOutsideBotSeconds||0)+delta;
  }
  if(!t||t===p||!p||!alive(t)||t.spawnShieldT>0||!contestHostile(g,p,t)||!a||a.__lfEcoMode!=='memory'||a.__lfEcoKey!=='BLOOM:'+f.sector||
    !(a.__lfEcoWeight>.04))continue;
  var id=String(t.id),c2=sectorCenter(f.sector),dist2=Math.hypot(t.x-c2.x,t.y-c2.y),
   aiInside=sectorIndex(t.x,t.y)===f.sector;
  if(!aiInside&&f.aiStartDist[id]==null)f.aiStartDist[id]=dist2;
  if(!f.aiApproachSeen[id]&&f.aiStartDist[id]!=null&&f.aiStartDist[id]-dist2>=60){
   f.aiApproachSeen[id]=true;f.counts.aiApproaches++;frontlineTrace(f,g,'ai-memory-approach');
  }
  if(!aiInside||!f.aiApproachSeen[id]||f.aiSeen[id])continue;
  f.aiSeen[id]=true;f.counts.aiArrivals++;frontlineTrace(f,g,'ai-memory-arrival');
 }
 physicalAIArrivals(g,f,p,ts,now);
 return true;
}
function recordFrontlineNeutralXP(g,st,t,amount,orb){
 if(!g||!t||t!==g.player||!orb||!(amount>0))return false;
 var f=ensureFrontline(g,st);
 if(!f||!alive(t)||sectorIndex(t.x,t.y)!==f.sector||
    sectorIndex(orb.x,orb.y)!==f.sector)return false;
 f.counts.neutralXP+=amount;frontlineTrace(f,g,'neutral-harvest',null,amount);
 return true;
}
LF.frontlineTick=frontlineTick;
LF.recordFrontlinePlayerDeath=recordFrontlinePlayerDeath;
LF.recordFrontlineNeutralXP=recordFrontlineNeutralXP;
function contestHostile(g,a,b){
 if(g.areAllies&&g.areAllies(a,b))return false;
 if(typeof g.areHostile==='function')return !!g.areHostile(a,b);
 /* The canonical free-for-all Game has no areHostile method. Match Fair
  * Engagement's existing team-tag fallback rather than disabling the feature. */
 var keys=['teamId','team','factionId','faction','side'];
 for(var i=0;i<keys.length;i++){var k=keys[i];if(a[k]!=null&&b[k]!=null)return a[k]!==b[k];}
 return true;
}
/* CONTESTED is player-facing intelligence: use the same viewport geometry as
 * Fair Engagement, but do not pass shapes through its tank-ID predicate.
 * A shape and tank may share an ID. Terrain LoS is required for every counted
 * shape. This runs only at the decimated Director cadence and stops as soon
 * as enough visible neutral value is proven (canonical neutral population is
 * bounded), rather than scanning hidden sector state or adding frame work. */
/* Long Glass / tactical framing can move the actual rendered camera away from
 * the player hull. A player-centered Fair Engagement check alone is not proof
 * that an object is presently on screen. Fail closed for tactical UI intel. */
function inRenderedCamera(g,p,s,e){
 var cam=g.cam||{},cx=Number.isFinite(cam.x)?cam.x:p.x,cy=Number.isFinite(cam.y)?cam.y:p.y;
 return Math.abs(s.x-cx)<=e.x&&Math.abs(s.y-cy)<=e.y;
}
function observedPocketValue(g,st,p,sector,required){
 var F=window.__NOVA_FAIR_ENGAGEMENT_TEST__,defs=st&&st.defs||LF.defs;
 if(!F||typeof F.viewportHalfExtents!=='function'||!g||typeof g.hasLineOfSight!=='function'||!defs)return 0;
 var e=F.viewportHalfExtents(g);
 if(!e||!(e.x>0)||!(e.y>0))return 0;
 var sh=g.shapes||[],value=0;
 for(var i=0;i<sh.length;i++){
  var s=sh[i];if(!s||!(s.hp>0)||sectorIndex(s.x,s.y)!==sector)continue;
  if(Math.abs(s.x-p.x)>e.x||Math.abs(s.y-p.y)>e.y||!inRenderedCamera(g,p,s,e))continue;
  var base=xp(defs,s.type);if(!(base>0))continue;
  if(!g.hasLineOfSight(p.x,p.y,s.x,s.y,2))continue;
  value+=base+(s.type==='crasher'?(Number(s.__lfBounty)||0):0)
   +(s.type==='hexagon'?80:s.type==='star'?170:s.type==='pentagon'?22:0);
  if(value>=required)return value;
 }
 return value;
}
function contestCandidate(g,st){
 var now=g&&g.time||0,op=publicBloom(st,now),p=g&&g.player;
 if(!op||!p||!alive(p)||p.spawnShieldT>0||g.__novaDecorativeWorld||sectorIndex(p.x,p.y)!==op.sector)return false;
 /* The BLOOM announcement is historical public intelligence, not proof of
  * current value. Require enough genuinely visible neutral value. Private
  * sector totals and the initial BLOOM value must never control the badge. */
 var F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;
 if(!F||typeof F.inGameplayViewport!=='function'||typeof F.viewportHalfExtents!=='function'||typeof g.hasLineOfSight!=='function')return false;
 var ext=F.viewportHalfExtents(g);if(!ext||!(ext.x>0)||!(ext.y>0))return false;
 var ts=g.tanks||[];
 for(var i=0;i<ts.length;i++){
  var t=ts[i];if(!t||t===p||t.id===p.id||!alive(t)||t.spawnShieldT>0||sectorIndex(t.x,t.y)!==op.sector)continue;
  if(!contestHostile(g,p,t))continue;
  /* Only scan the neutral pocket after a legitimate hostile is witnessed. */
  /* The visible pocket is independent of WHICH hostile was witnessed.
   * Once one legitimate rival is visible, a failed pocket scan cannot
   * become true by repeating the same terrain rays for seven more bots. */
  if(inRenderedCamera(g,p,t,ext)&&visible(g,p,t))
   return observedPocketValue(g,st,p,op.sector,155)>=155;
 }
 return false;
}
/* A near-side warning is useful BEFORE the pilot crosses the BLOOM boundary.
 * This is a fresh local visual witness, not sector radar: both the hostile
 * and at least 155 XP of harvestable prey must already be visible on the
 * actual rendered camera, through terrain. The only public location is the
 * previously announced BLOOM; no hostile coordinates enter the minimap. */
function nearBloomEdge(p,sector){
 if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
    !Number.isInteger(sector)||sector<0||sector>=LF.GRID*LF.GRID)return false;
 var c=sectorCenter(sector),half=LF.ARENA/LF.GRID;
 var dx=Math.max(0,Math.abs(p.x-c.x)-half),
     dy=Math.max(0,Math.abs(p.y-c.y)-half);
 return Math.hypot(dx,dy)<=260;
}
function preEntryCandidate(g,st){
 var now=Number(g&&g.time)||0,op=publicBloom(st,now),p=g&&g.player;
 if(!op||!g||g.status!=='playing'||g.__novaDecorativeWorld||
    !p||!alive(p)||p.spawnShieldT>0||
    !Number.isFinite(p.x)||!Number.isFinite(p.y)||
    sectorIndex(p.x,p.y)===op.sector||!nearBloomEdge(p,op.sector))return false;
 var F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;
 if(!F||typeof F.inGameplayViewport!=='function'||
    typeof F.viewportHalfExtents!=='function'||
    typeof g.hasLineOfSight!=='function')return false;
 var ext=F.viewportHalfExtents(g);if(!ext||!(ext.x>0)||!(ext.y>0))return false;
 var ts=g.tanks||[];
 for(var i=0;i<ts.length;i++){
  var t=ts[i];if(!t||t===p||t.id===p.id||!alive(t)||
     t.spawnShieldT>0||!Number.isFinite(t.x)||!Number.isFinite(t.y)||
     sectorIndex(t.x,t.y)!==op.sector||!contestHostile(g,p,t))continue;
  if(visible(g,p,t)&&inRenderedCamera(g,p,t,ext))
   return observedPocketValue(g,st,p,op.sector,155)>=155;
 }
 return false;
}
function updateContest(g,st){
 if(!contestCandidate(g,st)){
  st.contestSignal=null;
  var op=publicBloom(st,g&&g.time||0);
  st.approachSignal=op&&preEntryCandidate(g,st)?
   {sector:op.sector,until:Math.min(op.until,(g.time||0)+1.4),announcedAt:op.announcedAt,pilotRef:g.player}:null;
  return false;
 }
 st.approachSignal=null;
 var now=g.time||0,op=publicBloom(st,now),key=op.sector+':'+op.announcedAt;
 if(st.__lfLastContestKey!==key){st.__lfLastContestKey=key;st.stats=st.stats||{};st.stats.contests=(st.stats.contests||0)+1;}
 st.contestSignal={sector:op.sector,until:Math.min(op.until,now+1.4),announcedAt:op.announcedAt,pilotRef:g.player};
 return true;
}
function saturation(g,key,id){var n=0,ts=g.tanks||[];for(var i=0;i<ts.length;i++){var q=ts[i];if(q&&q.id!==id&&q.ai&&alive(q)&&q.ai.__lfEcoKey===key&&q.ai.__lfEcoWeight>.05)n++;}return n;}
/* The strategic score and its movement bearing must use the SAME terrain
 * route. Previously routeCost checked a waypoint but AI still steered along
 * the blocked straight line, undoing Battlefield routing at the final move.
 * A missing/invalid waypoint is not permission to walk through solid cover.
 * Preserve direct steering when no Battlefield waypoint owner is installed. */
function routeCost(g,t,x,y,direct,bearing){
 direct=direct==null?Math.hypot(x-t.x,y-t.y):direct;
 if(bearing){bearing.x=(x-t.x)/(direct||1);bearing.y=(y-t.y)/(direct||1);}
 if(!g.hasLineOfSight||g.hasLineOfSight(t.x,t.y,x,y,8)||!g.novaBattlefieldWaypoint)return direct;
 var wp=g.novaBattlefieldWaypoint(t.x,t.y,x,y,18,t.id);
 if(!wp||!Number.isFinite(wp.x)||!Number.isFinite(wp.y))return Infinity;
 var leg=Math.hypot(wp.x-t.x,wp.y-t.y);
 if(!(leg>1))return Infinity;
 if(bearing){bearing.x=(wp.x-t.x)/leg;bearing.y=(wp.y-t.y)/leg;}
 return leg+Math.hypot(x-wp.x,y-wp.y);
}
/* Ecology AI may react to a held combat target only while that target is
 * actually within the same gameplay viewport as the player, or relayed by
 * a legitimate active Sniper Observer. A stale target id is not live radar. */
var ECO_SNIPER_CLASSES={marksman:1,railgun:1,ghost:1,singularity:1,prism:1,specter:1,assassin:1};
function fairEcoTarget(g,t,target){
 if(!target||!alive(target)||target.spawnShieldT>0)return false;
 if(typeof g.areAllies==='function'&&g.areAllies(t,target))return false;
 if(typeof g.areHostile==='function'&&!g.areHostile(t,target))return false;
 var F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;
 var seen=F&&F.inGameplayViewport?F.inGameplayViewport(g,t,target):
  (function(){var z=(g.cam&&g.cam.zoom)||1,hx=(g.w||800)/(2*z),hy=(g.h||600)/(2*z);return Math.abs(target.x-t.x)<=hx&&Math.abs(target.y-t.y)<=hy;})();
 /* The public ecology planner runs against current battlefield state: a
  * previous-frame Observer ID must not suppress an otherwise valid rotation. */
 var live=window.__NOVA_SPOTTER_LIVE_RELAY__;
 var relay=!!ECO_SNIPER_CLASSES[t.cls]&&typeof live==='function'&&live(g,t,target);
 /* A held target within viewport but behind terrain is not current sight. Do not read its live hidden position to suppress ecology; a legitimate active Observer relay remains valid. */return !!(seen&&(!g.hasLineOfSight||g.hasLineOfSight(t.x,t.y,target.x,target.y,2)))||relay;
}
/* Observation-only migration AI gate audit. These are DECISION SAMPLES, not
 * independent rivals, interceptions, player outcomes or hidden ecology.
 * The shipping snapshot already copies st.stats into COPY ECOLOGY. */
function migrationAudit(g,kind,dist,crowd){
 var st=g&&g.__lfState,sig=st&&st.signal,now=Number(g&&g.time)||0;
 if(!st||g.__novaDecorativeWorld||st.directorEnabled===false||!sig||
    sig.type!=='MIGRATION'||now<sig.started||now>=sig.until)return;
 var stats=st.stats||(st.stats={});
 stats.migrationAiSamples=(stats.migrationAiSamples||0)+1;
 var field=kind==='health'?'migrationAiHealthVeto':
  kind==='combat'?'migrationAiCombatVeto':
  kind==='blocked'?'migrationAiRouteBlocked':
  kind==='score'?'migrationAiScoreVeto':'migrationAiSteered';
 stats[field]=(stats[field]||0)+1;
 if(Number.isFinite(dist)){
  var bin=dist<300?'migrationAiRouteLt300':
   dist<644?'migrationAiRoute300to644':
   dist<1200?'migrationAiRoute644to1200':'migrationAiRouteGte1200';
  stats[bin]=(stats[bin]||0)+1;
  if(kind==='score'&&crowd>0&&.48-dist/2300>.20)
   stats.migrationAiCrowdVeto=(stats.migrationAiCrowdVeto||0)+1;
 }
}
function publicEcoBias(g,t,defs,out){out=out||{};out.x=0;out.y=0;out.weight=0;out.key='none';out.mode='none';if(!g||!t||!t.ai)return out;var hp=clamp(t.hp/Math.max(1,t.maxHp||t.hp||1),0,1),a=t.ai,target=a.__v1112TargetId>=0&&g.getTank?g.getTank(a.__v1112TargetId):null;if(!fairEcoTarget(g,t,target))target=null;var st=g.__lfState,sig=st&&st.directorEnabled!==false&&st.signal,now=g.time||0;
if(sig&&sig.started!=null&&now<sig.started)sig=null;
if(hp<.30){migrationAudit(g,'health');return out;}
if(target&&d2(t.x,t.y,target.x,target.y)<330*330){migrationAudit(g,'combat');return out;}
var bx=0,by=0,bw=0,key='none',mode='none',judgment=a.isElite?1.08:.94;/* Once a rival physically reaches a live public BLOOM sector, stop pulling it toward the arbitrary sector center. Its ordinary visible farming/combat choices regain priority; this mirrors the stale-memory arrival handoff. */if(sig&&now<sig.until&&!(sig.type==='BLOOM'&&sectorIndex(t.x,t.y)===sig.sector)){var sx=sig.x,sy=sig.y;if(sig.type==='ROGUE STAR'&&sig.starId&&g.getShape){var star=g.getShape(sig.starId);if(star){/* Only a visible Star updates AI memory. When it escapes sight, pursue the last seen position rather than gaining remote tracking or forgetting the sighting. */if(visible(g,t,star)){sx=star.x;sy=star.y;a.__lfStarSeenId=sig.starId;a.__lfStarSeenX=sx;a.__lfStarSeenY=sy;}else if(a.__lfStarSeenId===sig.starId&&Number.isFinite(a.__lfStarSeenX)&&Number.isFinite(a.__lfStarSeenY)){sx=a.__lfStarSeenX;sy=a.__lfStarSeenY;}}else return out;}var direct=Math.hypot(sx-t.x,sy-t.y),bearing={},dist=routeCost(g,t,sx,sy,direct,bearing),base=sig.type==='ROGUE STAR'?.87:sig.type==='BLOOM'?.68:.48,k=sig.type+':'+(sig.sector!=null?sig.sector:sig.to!=null?sig.to:sig.starId||0),crowd=saturation(g,k,t.id),score=base-dist/2300-crowd*.13;
if(sig.type==='MIGRATION')migrationAudit(g,!Number.isFinite(dist)?'blocked':score>.20?'steer':'score',dist,crowd);
if(score>.20){bx=bearing.x;by=bearing.y;bw=clamp(score*(.72+.28*hp)*judgment,0,.48);key=k;mode='signal';if(sig.type==='MIGRATION')a.__lfMigrationSignalStarted=sig.started;}}
 if(bw<=.04){var F=window.__NOVA_FAIR_ENGAGEMENT_TEST__,ext=F&&F.viewportHalfExtents?F.viewportHalfExtents(g):{x:Math.max(280,(g.w||800)/2),y:Math.max(220,(g.h||600)/2)},rad=Math.hypot(ext.x,ext.y),cand=st?LF.query(g,st,t.x,t.y,rad,0):(g.shapes||[]),vx=0,vy=0,value=0,count=0;for(var i=0;i<cand.length;i++){var s=cand[i];if(!s||s.kind!=='shape'||s.hp<=0||s.type==='crasher'||!visible(g,t,s))continue;var w=Math.max(5,xp(defs,s.type));vx+=s.x*w;vy+=s.y*w;value+=w;count++;}if(count>=4&&value>=170){vx/=value;vy/=value;var dx2=vx-t.x,dy2=vy-t.y,m2=Math.hypot(dx2,dy2)||1,k2='LOCAL:'+sectorIndex(vx,vy),bearing2={},travel=routeCost(g,t,vx,vy,m2,bearing2),score2=clamp((value-160)/750,0,.36)-travel/3200-saturation(g,k2,t.id)*.10;if(score2>.08){bx=bearing2.x;by=bearing2.y;bw=clamp(score2*judgment,0,.32);key=k2;mode='local';}}}
/* AI may remember a *publicly announced* BLOOM, never hidden sector maturity.
 * The stale opportunity loses confidence with age and loses to a stronger
 * locally visible farm. Saturation reuses the live BLOOM key so bots do not
 * all rotate to the same old announcement. */
if((!sig||now>=sig.until)&&st){
 var remembered=publicBloom(st,now);
 if(remembered&&!remembered.live){
  var c=sectorCenter(remembered.sector),dx3=c.x-t.x,dy3=c.y-t.y,direct3=Math.hypot(dx3,dy3),
   conf=clamp((remembered.until-now)/24,0,1),bearing3={},dist3=routeCost(g,t,c.x,c.y,direct3,bearing3),
   k3='BLOOM:'+remembered.sector,
   score3=.54*Math.sqrt(conf)-dist3/2600-saturation(g,k3,t.id)*.13,
   memoryWeight=clamp(score3*.5*judgment,0,.26);
  if(direct3>120&&score3>.20&&memoryWeight>bw+.03){
   bx=bearing3.x;by=bearing3.y;bw=memoryWeight;key=k3;mode='memory';
  }
 }
}
if(target&&alive(target))bw*=.55;if((t.id||0)%4===0)bw*=.72;out.x=bx;out.y=by;out.weight=bw;out.key=key;out.mode=mode;return out;}
/* Tactical Frontlines: a short route commitment lets a few healthy rivals
 * make a meaningful public-opportunity turn instead of only drifting a few
 * degrees. It never consults private ecology, never targets the human by id,
 * and immediately yields to a visible combat target or recent damage.
 * Each rival can commit only once to a particular public announcement. */
function frontlineTurnEligible(g,t,a,now){
 if(!g||!t||!a||!(a.__lfEcoWeight>.10)||!alive(t)||t.spawnShieldT>0)return false;
 var op=publicBloom(g.__lfState,now);
 /* Fresh public BLOOM is the most actionable moment. One selected rival may
  * commit during the live announcement as well as its remembered afterimage;
  * both phases share the SAME once-per-announcement key and combat vetoes.
  * Never promote another signal type or stale ecology to movement authority. */
 if(!op||a.__lfEcoKey!=='BLOOM:'+op.sector||
    a.__lfEcoMode!==(op.live?'signal':'memory')||
    now<op.announcedAt||now-op.announcedAt>12)return false;
 /* The public destination has been reached. Hand control back to local
  * visible farming/combat instead of steering blindly toward its center. */
 if(sectorIndex(t.x,t.y)===op.sector)return false;
 /* Rotate the one-third responder cohort by the PUBLIC announcement epoch.
  * A fixed id%3 cohort made the same rivals react for the entire session.
  * The 24s bucket matches BLOOM's cooldown scale; the announced timestamp
  * stays constant through live signal and stale memory. No private ecology,
  * player identity or per-frame randomness influences this choice. */
 if(Math.abs(Number(t.id)||0)%3!==Math.floor(op.announcedAt/24)%3)return false;
 if(t.hp/Math.max(1,t.maxHp||t.hp||1)<.65)return false;
 /* A visible incoming projectile or an active defensive combat posture wins
  * immediately, even if the old public opportunity still exists. */
 if(a.__v180Threat&&Number(a.__v180Threat.risk)>.12)return false;
 if(a.__v180Posture==='evade'||a.__v180Posture==='break'||a.__v180Posture==='cover')return false;
 var targetId=a.__v1112TargetId;
 if(targetId!=null&&targetId>=0){
  if(typeof g.getTank!=='function')return false;
  if(fairEcoTarget(g,t,g.getTank(targetId)))return false;
 }
 var hitAt=Number(a.__v180HitAt);
 if(Number.isFinite(hitAt)&&now>=hitAt&&now-hitAt<2.5)return false;
 return true;
}
function refreshFrontlineTurn(g,t,a){
 var now=Number(g.time)||0,op=publicBloom(g.__lfState,now);
 if(!frontlineTurnEligible(g,t,a,now)){a.__lfFrontTurn=null;return;}
 var key='BLOOM:'+op.sector+':'+op.announcedAt,active=a.__lfFrontTurn;
 if(active&&(active.key!==key||now>=active.until))a.__lfFrontTurn=null;
 if(!a.__lfFrontTurn&&a.__lfFrontTurnSpentKey!==key){
  a.__lfFrontTurn={key:key,until:now+2.2};
  a.__lfFrontTurnSpentKey=key;
  var st=g.__lfState;st.stats=st.stats||{};
  st.stats.aiFrontlineCommitments=(st.stats.aiFrontlineCommitments||0)+1;
 }
}
LF.wrap('game/ai',function(ai,require){var old=ai.updateAI;if(!old||old.__novaLivingFront)return;var defs=(require('./types')||{}).SHAPE_DEFS||{};function patched(t,g,dt){if(!t||!t.ai||!g)return old(t,g,dt);var a=t.ai;a.__lfEcoT=(a.__lfEcoT||0)-dt;if(a.__lfEcoT<=0){a.__lfEcoT=(a.isElite?LF.AI_PERIOD*.82:LF.AI_PERIOD)+(Math.abs(t.id||0)%5)*.019;var prev=a.__lfEcoKey||'none',b=publicEcoBias(g,t,defs,a.__lfEcoBias||(a.__lfEcoBias={}));a.__lfEcoX=b.x;a.__lfEcoY=b.y;a.__lfEcoWeight=b.weight;a.__lfEcoKey=b.key;a.__lfEcoMode=b.mode;if(b.weight>.08&&prev!==b.key&&g.__lfState)g.__lfState.stats.aiRotations++;refreshFrontlineTurn(g,t,a);}var move=g.moveTank,own=Object.prototype.hasOwnProperty.call(g,'moveTank');if(move&&a.__lfEcoWeight>.04)g.moveTank=function(tt,vx,vy,dd){
 if(tt!==t)return move.apply(g,arguments);
 var now=Number(g.time)||0,turn=a.__lfFrontTurn,
  committed=!!(turn&&now<turn.until&&frontlineTurnEligible(g,t,a,now));
 if(turn&&!committed)a.__lfFrontTurn=null;
 var raw=Math.hypot(vx||0,vy||0),cap=g.tankSpeed&&Number(g.tankSpeed(tt));
 /* A committed dash, boosted move or deliberate stationary hold belongs to
  * its original combat owner; ecology cannot commandeer those commands. */
 if(!(raw>1e-6)||(cap>0&&raw>cap*1.15))return move.apply(g,arguments);
 var sp=raw||(cap||1),w=committed?.66:clamp(a.__lfEcoWeight,0,.48),
  x=(vx||0)/sp*(1-w)+a.__lfEcoX*w,y=(vy||0)/sp*(1-w)+a.__lfEcoY*w,m=Math.hypot(x,y)||1;
 return move.call(g,tt,x/m*sp,y/m*sp,dd);
};try{return old(t,g,dt);}finally{if(move){if(own)g.moveTank=move;else delete g.moveTank;}}}patched.__novaLivingFront=true;ai.updateAI=patched;});

/* A visible pre-entry threat must be actionable before the 0.72s Director
 * sample. The canonical minimap is already refreshed at ~0.08s; reuse its
 * draw owner to sample the EXISTING local visual witness at most every 0.16s.
 * This is not a second Director, hidden-sector radar, or a new UI system.
 * The scan is gated by a public BLOOM, an unshielded living pilot outside
 * its sector, and proximity to its boundary before any tank/shape rays.
 * A prior contest remains authoritative until the Director clears it. */
function refreshApproachCue(g,st,op,now){
 if(!st||!g||g.status!=='playing'||g.__novaDecorativeWorld)return;
 var p=g.player,eligible=!!(op&&p&&alive(p)&&!(p.spawnShieldT>0)&&
   Number.isFinite(p.x)&&Number.isFinite(p.y)&&
   sectorIndex(p.x,p.y)!==op.sector&&nearBloomEdge(p,op.sector));
 var old=st.approachSignal;
 if(old&&(!eligible||old.pilotRef!==p||old.sector!==op.sector||
    old.announcedAt!==op.announcedAt)){
  st.approachSignal=null;
  st.__lfApproachNextAt=now+.16;
  return; /* Do not immediately reissue a witness for a new pilot/BLOOM. */
 }
 /* A previous inside-sector contest can remain cached until the slower
  * Director tick. Outside the BLOOM, that old witness is not current
  * information and must not suppress a newly visible approach. */
 if(!eligible){
  st.approachSignal=null;
  st.__lfApproachNextAt=0;
  return;
 }
 /* A clock reset cannot retain a later-life sampling deadline. */
 if(Number.isFinite(st.__lfApproachLastAt)&&now<st.__lfApproachLastAt)
  st.__lfApproachNextAt=0;
 st.__lfApproachLastAt=now;
 if(Number.isFinite(st.__lfApproachNextAt)&&now<st.__lfApproachNextAt)return;
 st.__lfApproachNextAt=now+.16;
 st.approachSignal=preEntryCandidate(g,st)?
  {sector:op.sector,until:Math.min(op.until,now+1.4),
   announcedAt:op.announcedAt,pilotRef:p}:null;
}
/* The core minimap already draws the public BLOOM. Add a short local contest
 * accent after it, without introducing a new HUD, minimap authority or input. */
LF.wrap('game/engine',function(engine){
 var Game=engine.Game;if(!Game||Game.prototype.__novaFrontlineContest)return;
 Game.prototype.__novaFrontlineContest=true;
 /* Physical Frontlines telemetry must observe the canonical movement owner.
  * No movement/physics authority changes: this wrapper only records the
  * before/after positions returned by the existing fully composed moveTank.
  * Any unobserved relocation between calls invalidates the entire interval. */
/* Physical arrival witness: only a composed moveTank step can establish
 * a real sector entry. Fail closed on unknown speed, teleport/dash-scale
 * displacement, stale signals and repeat entries by the same bot. */
function migrationPhysicalArrival(g,t,bx,by,ax,ay,dt){
 var st=g&&g.__lfState,sig=st&&st.signal,now=Number(g&&g.time)||0;
 if(!st||g.__novaDecorativeWorld||g.status!=='playing'||
    st.directorEnabled===false||!sig||sig.type!=='MIGRATION'||
    now<sig.started||now>=sig.until||!t||!t.ai||!alive(t)||
    t.ai.__lfEcoKey!=='MIGRATION:'+sig.to||t.ai.__lfEcoMode!=='signal'||
    t.ai.__lfMigrationSignalStarted!==sig.started||
    !Number.isFinite(bx)||!Number.isFinite(by)||
    !Number.isFinite(ax)||!Number.isFinite(ay)||!(dt>0)||
    sectorIndex(bx,by)===sig.to||sectorIndex(ax,ay)!==sig.to)return;
 var speed=typeof g.tankSpeed==='function'?Number(g.tankSpeed(t)):NaN;
 if(!(speed>0)||Math.hypot(ax-bx,ay-by)>speed*dt*1.3+1)return;
 var key=sig.started+':'+sig.from+':'+sig.to;
 if(t.ai.__lfMigrationArrivalKey===key)return;
 t.ai.__lfMigrationArrivalKey=key;
 var stats=st.stats||(st.stats={});
 stats.migrationAiPhysicalArrivals=(stats.migrationAiPhysicalArrivals||0)+1;
}
 var oldMove=Game.prototype.moveTank;
 if(oldMove&&!oldMove.__novaFrontlineWitness){
  function witnessedMove(t,vx,vy,dt){
   var st=this.__lfState,f=st&&st.frontlineTelemetry;
   var eligible=!!(f&&!f.closed&&f.currentKey&&st.directorEnabled!==false&&t&&t.ai&&t.id!=null&&alive(t));
   var sig=st&&st.signal,now=Number(this.time)||0;
   var migrationWitness=!!(t&&t.ai&&sig&&sig.type==='MIGRATION'&&
    now>=sig.started&&now<sig.until&&st.directorEnabled!==false);
   var bx=(eligible||migrationWitness)?t.x:0,by=(eligible||migrationWitness)?t.y:0;
   var result=oldMove.apply(this,arguments);
   if(migrationWitness)migrationPhysicalArrival(this,t,bx,by,t.x,t.y,dt);
   if(!eligible||!this.__lfState||this.__lfState.frontlineTelemetry!==f)return result;
   var ax=t.x,ay=t.y,id=String(t.id),m=f.aiPhysicalMotion||(f.aiPhysicalMotion={}),w=m[id];
   var valid=Number.isFinite(bx)&&Number.isFinite(by)&&Number.isFinite(ax)&&Number.isFinite(ay)&&
    Number.isFinite(dt)&&dt>0;
   /* Preserve witnessed transient entries until the next Director sample.
    * The boolean carries no positions into Debug or player-facing signals. */
   var entered=sectorIndex(bx,by)!==f.sector&&sectorIndex(ax,ay)===f.sector;
   if(!w||w.ref!==t){
    m[id]={ref:t,startX:bx,startY:by,endX:ax,endY:ay,segments:1,valid:valid,entered:entered};
   }else{
    if(Math.hypot(w.endX-bx,w.endY-by)>.01)w.valid=false;
    w.endX=ax;w.endY=ay;w.segments++;w.entered=w.entered||entered;
    if(!valid)w.valid=false;
   }
   return result;
  }
  witnessedMove.__novaFrontlineWitness=true;
  Game.prototype.moveTank=witnessedMove;
 }
 var oldMap=Game.prototype.drawMinimap;if(!oldMap)return;
 Game.prototype.drawMinimap=function(){
  var out=oldMap.apply(this,arguments),st=this.__lfState,c=st&&st.contestSignal,ctx=this.mmCtx,now=this.time||0,op=publicBloom(st,now);
  if(ctx)refreshApproachCue(this,st,op,now);
  /* A live MIGRATION lasts 4.4s, too briefly for a distant pilot to
   * plan an intercept. Keep its PUBLIC, frozen sector-to-sector route as
   * a fading dashed minimap afterimage for 16s from announcement. The
   * afterimage is explicitly stale: no live shape tracking, no hidden
   * sector sampling, no AI movement authority and no new HUD control.
   * A new live signal always takes visual priority. */
  var mem=st&&st.migrationMemory,live=st&&st.signal&&now<st.signal.until;
  if(ctx&&mem&&st.directorEnabled!==false&&this.status==='playing'&&!live&&
     now>=mem.announcedAt&&now<mem.until&&
     Number.isInteger(mem.from)&&Number.isInteger(mem.to)&&
     mem.from>=0&&mem.from<16&&mem.to>=0&&mem.to<16&&mem.from!==mem.to){
   var ma=sectorCenter(mem.from),mb=sectorCenter(mem.to),ms=216/(LF.ARENA*2),
     ax=(ma.x+LF.ARENA)*ms,ay=(ma.y+LF.ARENA)*ms,
     bx=(mb.x+LF.ARENA)*ms,by=(mb.y+LF.ARENA)*ms,
     angle=Math.atan2(by-ay,bx-ax),fade=clamp((mem.until-now)/16,0,1);
   ctx.save();ctx.globalAlpha=.23+.43*fade;ctx.strokeStyle='#7df3ff';
   ctx.lineWidth=4.5;if(ctx.setLineDash)ctx.setLineDash([7,5]);
   ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
   if(ctx.setLineDash)ctx.setLineDash([]);
   ctx.beginPath();
   ctx.moveTo(bx-Math.cos(angle-.6)*8,by-Math.sin(angle-.6)*8);
   ctx.lineTo(bx,by);
   ctx.lineTo(bx-Math.cos(angle+.6)*8,by-Math.sin(angle+.6)*8);
   ctx.stroke();ctx.restore();
  }
  if(!ctx||!op)return out;
  var center=sectorCenter(op.sector),scale=216/(LF.ARENA*2),x=(center.x+LF.ARENA)*scale,y=(center.y+LF.ARENA)*scale;
  if(!op.live){
   var fade=clamp((op.until-now)/24,0,1);
   ctx.save();ctx.globalAlpha=.12+.20*fade;ctx.lineWidth=1.5;ctx.strokeStyle='#ffc94d';
   if(ctx.setLineDash)ctx.setLineDash([3,4]);
   ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  /* A solid CONTESTED badge is a live, pilot-specific witness, not stale
   * sector radar. Director sampling is decimated: the player can leave, die,
   * redeploy, or see a new same-sector BLOOM before the next sample. */
  var inside=!!(c&&now<c.until&&c.sector===op.sector&&
   c.announcedAt===op.announcedAt&&this.status==='playing'&&
   this.player&&c.pilotRef===this.player&&alive(this.player)&&
   !(this.player.spawnShieldT>0)&&
   sectorIndex(this.player.x,this.player.y)===op.sector),
   a=st&&st.approachSignal,
   approaching=!inside&&!!(a&&now<a.until&&a.sector===op.sector&&
    a.announcedAt===op.announcedAt&&
    this.status==='playing'&&this.player&&a.pilotRef===this.player&&alive(this.player)&&
    sectorIndex(this.player.x,this.player.y)!==op.sector&&
    nearBloomEdge(this.player,op.sector));
  /* Director alone owns contest credit. A cached solid badge must also
   * have a recent, direct Fair Engagement visual witness. The camera can
   * jump independently of the hull (Long Glass), so large camera jumps,
   * zoom changes and viewport resizes invalidate the cache immediately.
   * Ordinary small camera motion is bounded by the 160ms visual cadence. */
  if(!inside){
   if(st){st.__lfContestVisualFresh=false;st.__lfContestVisualNextAt=0;}
  }else{
   var key=op.sector+':'+op.announcedAt,
    cam=this.cam||{},cx=Number.isFinite(cam.x)?cam.x:this.player.x,
    cy=Number.isFinite(cam.y)?cam.y:this.player.y,
    zoom=Number.isFinite(cam.zoom)&&cam.zoom>0?cam.zoom:1,
    jumpX=Math.max(40,(this.w||0)/(4*zoom)),
    jumpY=Math.max(40,(this.h||0)/(4*zoom));
   if(st.__lfContestVisualPilot!==this.player||st.__lfContestVisualKey!==key||
      st.__lfContestVisualW!==this.w||st.__lfContestVisualH!==this.h||
      st.__lfContestVisualZoom!==zoom||
      Math.abs(cx-st.__lfContestVisualCamX)>jumpX||
      Math.abs(cy-st.__lfContestVisualCamY)>jumpY||
      !Number.isFinite(st.__lfContestVisualNextAt)||
      now<(st.__lfContestVisualLastAt||0)||now>=st.__lfContestVisualNextAt){
    st.__lfContestVisualPilot=this.player;
    st.__lfContestVisualKey=key;
    st.__lfContestVisualW=this.w;st.__lfContestVisualH=this.h;
    st.__lfContestVisualZoom=zoom;
    st.__lfContestVisualCamX=cx;st.__lfContestVisualCamY=cy;
    st.__lfContestVisualLastAt=now;
    st.__lfContestVisualNextAt=now+.16;
    st.__lfContestVisualFresh=contestCandidate(this,st);
   }
   inside=!!st.__lfContestVisualFresh;
  }
  if(!inside&&!approaching)return out;
  /* NOVA_VISUAL_INTENT: spatial minimap threat — a dashed ! means a
   * witnessed visible rival BEFORE entry; the solid ! is the original
   * inside-sector contest. Both reuse one BLOOM marker, never enemy radar. */
  /* The shipping minimap is 216 canvas pixels but only 60 CSS pixels wide.
   * A 9px canvas label was 2.5 CSS px: present in screenshots, unreadable in play.
   * Keep one static, high-contrast 12px CSS badge instead of adding a HUD/toast. */
  /* Offset the badge from the BLOOM center so the pilot/enemy dots and the
   * actual resource location remain visible; flip below near the north edge. */
  var badgeY=y<54?y+28:y-28;
  ctx.save();ctx.globalAlpha=1;
  ctx.fillStyle=inside?'rgba(48,10,25,.94)':'rgba(48,10,25,.78)';
  ctx.strokeStyle=inside?'#ff788b':'#ffb08b';ctx.lineWidth=4;
  if(approaching&&ctx.setLineDash)ctx.setLineDash([7,5]);
  ctx.beginPath();ctx.arc(x,badgeY,22,0,Math.PI*2);ctx.fill();ctx.stroke();
  if(approaching&&ctx.setLineDash)ctx.setLineDash([]);
  ctx.font='900 35px Rajdhani,system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#fff7f8';ctx.fillText('!',x,badgeY+2);
  ctx.restore();return out;
 };
});
function diag(){var g=LF.getActive(),s=g?LF.snapshot(g):LF.getLast()||{active:false,version:V};return'NOVA TANKS · LIVING FRONT '+V+'\n'+JSON.stringify(s,null,2);}
function debugSummary(s){if(!s||!s.active)return'LIVING FRONT · no active/recorded match telemetry yet';var st=s.stats||{},counts=s.counts||{};return'LIVING FRONT v'+V+' · age '+s.age+'s · ceiling '+s.ceiling+' · '+s.director+' / last '+s.lastSignal+' · total XP '+s.totalXP+' · player neutral '+s.playerNeutralXPPerMin+' XP/min · plan '+s.planMsEma+'ms EMA / '+s.planMsPeak+'ms peak\nSHAPES C'+(counts.circle||0)+' T'+(counts.triangle||0)+' S'+(counts.square||0)+' P'+(counts.pentagon||0)+' H'+(counts.hexagon||0)+' ★'+(counts.star||0)+' CR'+(counts.crasher||0)+' · EVADE '+(st.triangleEvasions||0)+' · CRASH '+(st.crasherCharges||0)+'/'+(st.crasherHits||0)+'/'+(st.crasherMisses||0)+' · OVER '+(st.crasherOvershoots||0)+' · BOUNTY '+Math.round(st.bountyAbsorbed||0)+'/'+Math.round(st.bountyReleased||0)+' · STAR '+(st.starsIntercepted||0)+'/'+(st.starsSpawned||0)+' · BLOOM '+(st.blooms||0)+' · MIG '+(st.migrations||0)+' · AI ROT '+(st.aiRotations||0)+' · AI INTENT '+(st.aiFrontlineCommitments||0)+' · MIG AI '+(st.migrationAiSteered||0)+'/'+(st.migrationAiSamples||0)+' · MIG ARR '+(st.migrationAiPhysicalArrivals||0)+' · CONTEST '+(st.contests||0)+' · HEX AVG '+s.hexAvgNeighbors+'\n'+s.sectors.map(function(q){return q.i+':M'+q.m.toFixed(2)+' P'+q.p.toFixed(2)+' N'+q.n+' XP'+q.xp+' H'+q.harvest.toFixed(2)+' C'+q.combat.toFixed(2)+' '+q.in.toFixed(1)+'→/'+q.out.toFixed(1)+'←';}).join(' · ')+(s.frontline?' | FRONTLINES · ANN '+s.frontline.counts.announcements+' · ENTRY '+s.frontline.counts.playerEntries+' · CONTEST '+s.frontline.counts.observedContests+' · AI PHYS '+(s.frontline.counts.aiPhysicalArrivals||0)+' · BOT-S '+(s.frontline.counts.hostileBotSeconds||0).toFixed(1)+' · OUT-S '+(s.frontline.counts.hostileOutsideBotSeconds||0).toFixed(1)+' · ALIVE-S '+(s.frontline.counts.pilotAliveSeconds||0).toFixed(1)+' · CENSORED '+(s.frontline.counts.pilotDeathCensors||0)+' · REJECT '+(s.frontline.counts.aiPhysicalRejectedCrossings||0)+' · AI MEM '+(s.frontline.counts.aiArrivals||0)+' · NEUTRAL XP '+Math.round(s.frontline.counts.neutralXP)+' · SURVIVED '+s.frontline.counts.contestSurvivals+' · IN ZONE '+s.frontline.counts.playerSeconds.toFixed(1)+'s':'');}
function fill(root){if(!root)return;var h=root.querySelector('.nv-lf-debug');if(!h){h=document.createElement('div');h.className='nv-lf-debug';h.style.cssText='margin-top:8px;padding:8px;border:1px solid rgba(255,201,77,.18);border-radius:10px;background:rgba(12,16,26,.7);font:600 9px/1.25 Rajdhani,system-ui;color:#aebed0;white-space:pre-wrap;';var a=root.querySelector('.nv-debug-actions');a?root.insertBefore(h,a):root.appendChild(h);}var s=LF.getActive()?LF.snapshot(LF.getActive()):LF.getLast();h.textContent=debugSummary(s);var b=document.createElement('button');b.type='button';b.dataset.lfCopy='1';b.className='nv-debug-btn';b.textContent='COPY ECOLOGY';b.style.marginTop='7px';b.onclick=function(){if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(diag()).catch(function(){});};h.appendChild(document.createElement('br'));h.appendChild(b);}
function registerTips(){var api=window.NOVATips;if(!api||typeof api.registerMany!=='function'||window.__NOVA_LIVING_FRONT_TIPS_REGISTERED__)return false;window.__NOVA_LIVING_FRONT_TIPS_REGISTERED__=true;api.registerMany(TIP_DEFS);return true;}
function bindTipLine(){return registerTips();} // compatibility shim: canonical Fieldcraft owns rendering, cadence, and shuffle bags.
function bindDebug(p){if(!p||p.__lfDebugBound)return;p.__lfDebugBound=true;fill(p);var r=p.querySelector('[data-debug-refresh]');if(r)r.addEventListener('click',function(){setTimeout(function(){if(p.isConnected)fill(p);},0);});}
function scanUi(){registerTips();var p=document.querySelector('.nv-debug-panel');if(p)bindDebug(p);}
registerTips();
if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'){var queued=false,o=new MutationObserver(function(){if(queued)return;queued=true;setTimeout(function(){queued=false;scanUi();},60);});var root=document.getElementById('root')||document.documentElement;o.observe(root,{childList:true,subtree:true});scanUi();}
window.__NOVA_VERSION=V;window.__NOVA_LIVING_FRONT__={version:V,codename:'Living Front',date:'2026-08-30',contract:{globalShapeTargetsPreserved:true,noXpMultiplierZones:true,noPityLogic:true,noNewControls:true,noPermanentEcologyPanel:true,noControllerStrategicAutonomy:true,noAiHiddenMaturity:true,noAiStatBuffs:true,terrainConstrained:true,physicalMigration:true,boundedHerding:true,nearFireHerding:true,explosionHerding:true,crasherBountyStatsOnly:true,explicitCrasherOvershoot:true,squareIntentionallySimple:true,directorMostlyObserves:true,rogueStarSingleCreatedOpportunity:true,ageGatedHighValueClustering:true,terrainVisibleInstincts:true,canonicalTipRegistry:true,rejectedScope:REJECTED.slice()},cadences:{sectorHz:+(1/LF.SECTOR_PERIOD).toFixed(2),shapeIntentHz:+(1/LF.BEHAVIOR_PERIOD).toFixed(2),directorHz:+(1/LF.DIRECTOR_PERIOD).toFixed(2),aiHz:+(1/LF.AI_PERIOD).toFixed(2)},shapeTargets:Object.assign({},LF.TARGETS)};
window.__NOVA_LIVING_FRONT_RELEASE__={version:V,codename:'Living Front',date:'2026-08-30',headline:'Fighting changes the farm. Farming changes where fights happen.',groups:{'Ecology Core':['Sixteen invisible sectors mature under quiet and lose value concentration under harvesting and combat pressure.','The existing 62/30/16/8/4 shape quotas remain authoritative; Living Front changes safe geography, not requested types or XP multipliers.','A shared match-age ceiling now gates high-value clustering as well as maturity, keeping early arenas distributed before later pockets emerge.'],'Wild Instincts':['Circles school gently, Triangles get one readable evade, Squares remain simple, cascades inherit impact direction and Hexagons become bounded terrain-visible keystones.','Stars are interception prey; Crashers telegraph, commit, explicitly overshoot, obey terrain, and store capped XP bounty from neutral prey without gaining combat stats.','Migration and herding are physical, bounded, terrain-constrained and self-limiting; near fire and explosions can move skittish prey with diminishing response.'],'Front Director':['BLOOM reports existing value only after ecological age makes a true mature pocket possible; MIGRATION reports actual crossings; ROGUE STAR can report a fresh existing Star after strategic quiet without duplication; its rarer created-Star fallback remains when no Star lives.','Signals are brief minimap/world information, not capture zones, event meters, currencies, quests or forced contests.'],'Strategy & Performance':['Human Controller automation remains local and never chooses a distant ecology objective. AI consumes only terrain-visible Fair Engagement viewport shapes and public signals, with health, route cost, saturation and skill-level judgment gates.','Sector, shape, Director and AI planning are decimated and local candidate work reuses the canonical entity hash.'],'Fieldcraft':['Seven Living Front tactical tips register through the canonical NOVATips shuffle-bag API, inheriting the game-wide randomized cadence instead of rewriting the rendered tip line.']}};
window.__NOVA_LIVING_FRONT_TIPS__=TIP_DEFS.map(function(t){return{id:t.id,text:t.text,tags:t.tags.slice(),reviewed:t.reviewed,source:t.source};});
window.NOVALivingFront={version:V,snapshot:function(){var g=LF.getActive();return g?LF.snapshot(g):LF.getLast()||{active:false,version:V};},diagnostics:diag};
window.__NOVA_LIVING_FRONT_TEST__={GRID:LF.GRID,ARENA:LF.ARENA,SECTOR_PERIOD:LF.SECTOR_PERIOD,BEHAVIOR_PERIOD:LF.BEHAVIOR_PERIOD,DIRECTOR_PERIOD:LF.DIRECTOR_PERIOD,AI_PERIOD:LF.AI_PERIOD,BOUNTY_CAP:LF.BOUNTY_CAP,STAR_SPEED_MULT:LF.STAR_SPEED_MULT,sectorIndex:LF.sectorIndex,sectorCenter:LF.sectorCenter,neighbors:LF.neighbors,maturityCeiling:LF.maturityCeiling,ageProgress:LF.ageProgress,makeSector:LF.makeSector,advanceSector:LF.advanceSector,chooseSpawnSector:LF.chooseSpawnSector,bulletThreat:LF.bulletThreat,triangleEvadeVector:LF.evadeVector,advanceCrasherState:LF.crasherState,awardBounty:LF.awardBounty,bloomAgeEligible:bloomAgeEligible,bloomCandidate:bloomCandidate,directorDecision:decision,rogueStarToast:rogueStarToast,publicEcoBias:publicEcoBias,routeCost:routeCost,debugSummary:debugSummary,registerTips:registerTips,rejectedScope:REJECTED.slice(),contestCandidate:contestCandidate,preEntryCandidate:preEntryCandidate,updateContest:updateContest,shapeTargets:Object.assign({},LF.TARGETS)};
console.info('[NOVA TANKS] v'+V+' Living Front director/strategy online');
})();