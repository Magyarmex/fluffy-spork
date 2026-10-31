'use strict';
/* Research-only Bomber burst witness. Observe the ACTUAL composed clusterBurst
 * owner without changing projectiles, RNG, frame clocks, damage or AI.
 * Callsite categories are diagnostic, not a physical first-contact oracle. */
(function(root){
 function siteFromStack(stack){
  const lines=String(stack||'').split('\n');
  for(const line of lines){
   const match=line.match(/(?:^|\/)([a-zA-Z0-9_.-]+\.(?:js|html)):(\d+):\d+/);
   if(match&&match[1]!=='bomber-burst-audit.js')return match[1]+':'+match[2];
  }
  return 'unknown';
 }
 function source(site){
  return site.startsWith('battlefield-v1.6.0.js:')?'battlefield':
   site.startsWith('index.html:')?'core':
   site.startsWith('disciplines-v1.7.0.js:')?'disciplines':
   site==='unknown'?'unknown':'other';
 }
 /* Pure lower-bound diagnostics: no game method calls or hidden-state writes.
  * Nearness to a witnessed burst is a sufficient veto for the parent corridor,
  * not a complete classification of every possible blocker. */
 function gateEvidence(g,p,dt){
  const sx=p.__v17SpawnX,sy=p.__v17SpawnY,fd=p.__v17FuseDist;
  const prev=Math.hypot(p.px-sx,p.py-sy),now=Math.hypot(p.x-sx,p.y-sy);
  const step=Math.hypot(p.vx,p.vy)*dt,used=Math.hypot(p.x-p.px,p.y-p.py);
  const rewound=Number.isFinite(prev)&&Number.isFinite(now)&&Number.isFinite(step)&&
   fd>0&&prev<fd-1e-8&&Math.abs(now-fd)<1e-4&&
   step>0&&used/step>1e-9&&used/step<1-1e-9;
  const clean=rewound&&(p.hits||0)===0&&(p.pen||0)<2&&
   p.__novaBreachAtTime!==g.time&&p.r>0&&
   Array.isArray(g.__novaTerrain)&&typeof g.firstTerrainHit==='function';
  const near={shape:false,tank:false,drone:false};
  if(clean){
   const radius=p.r+120;
   const close=e=>e&&Number.isFinite(e.x)&&Number.isFinite(e.y)&&
    Math.hypot(e.x-p.x,e.y-p.y)<=radius;
   for(const e of g.shapes||[])if(e&&e.hp>0&&close(e)){near.shape=true;break;}
   for(const e of g.tanks||[])if(e&&e.alive&&e.id!==p.ownerId&&close(e)){near.tank=true;break;}
   for(const e of g.drones||[])if(e&&e.hp>0&&e.ownerId!==p.ownerId&&close(e)){near.drone=true;break;}
  }
  return {rewound,clean,near};
 }

 /* Independent read-only lower-bound veto census for sole, physically
  * rewound airbursts with no nearby body at the burst point. A true flag
  * means the shipping clearance code must abstain; false flags never
  * certify a safe path. Overlapping flags are intentionally retained. */
 const VETO_KEYS=['missingShapeVelocity','missingTankVelocity',
  'missingDroneVelocity','excessEntitySpeed','parentShapeProximity',
  'parentTankProximity','parentDroneProximity','fragmentShapeProximity',
  'fragmentTankProximity','fragmentDroneProximity','fragmentTerrainProximity',
  'fragmentInvalid','fragmentBounds','noWitnessedSufficientVeto'];
 function vetoEvidence(g,p,dt,children){
  const flags=Object.fromEntries(VETO_KEYS.map(k=>[k,false]));
  const speed=Math.hypot(p.vx,p.vy);
  const used=Math.hypot(p.x-p.px,p.y-p.py);
  const remaining=dt-used/speed;
  const near=(ax,ay,bx,by,x,y,r)=>{
   if(!Number.isFinite(x)||!Number.isFinite(y)||!(r>=0))return true;
   const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
   const t=den>1e-12?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/den)):0;
   return (ax+dx*t-x)**2+(ay+dy*t-y)**2<=r*r;
  };
  const groups=[
   ['Shape',g.shapes||[],e=>e&&e.hp>0,e=>e.r],
   ['Tank',g.tanks||[],e=>e&&e.alive&&e.id!==p.ownerId,
    e=>1 /* strict lower bound on every canonical tank collision radius */],
   ['Drone',g.drones||[],e=>e&&e.hp>0&&e.ownerId!==p.ownerId,
    e=>(e.r||0)+1]
  ];
  for(const [kind,items,active,radius] of groups){
   for(const e of items){
    if(!active(e))continue;
    if(!Number.isFinite(e.vx)||!Number.isFinite(e.vy)){
     /* After the shipping remote-drone correction, absent ordinary vx/vy
      * is a veto ONLY when the Battlefield motion-ball certificate fails.
      * Keep the historical key for before/after comparison, but do not
      * falsely label a successfully certified remote drone as a blocker. */
     if(kind==='Drone'&&g.__novaShapeSweepActive&&
        e.__novaChronoDroneEpoch===g.__novaShapeSweepEpoch&&
        Number.isFinite(e.__novaChronoDronePrevX)&&
        Number.isFinite(e.__novaChronoDronePrevY)&&
        Number.isFinite(e.speed)&&e.speed>0&&
        Number.isFinite(e.__novaChronoDronePrevSpeed)&&
        e.__novaChronoDronePrevSpeed>0&&
        Number.isFinite(e.__novaChronoDronePrevV)&&
        e.__novaPhase!=='dash'&&e.__novaChronoDronePrevPhase!=='dash'&&
        !e.__novaCommitted&&!e.__novaChronoDronePrevCommitted&&
        !e.__novaSpotter&&!e.__novaTerrainBump){
       const bound=Math.max(1200,e.speed*6,e.__novaChronoDronePrevSpeed*6,
        e.__novaChronoDronePrevV*2,
        Math.hypot(e.__novaVX||0,e.__novaVY||0)*2,
        Math.hypot(e.__lvVX||0,e.__lvVY||0)*2,
        Math.hypot(e.__novaIdleVX||0,e.__novaIdleVY||0)*2);
       const traveled=Math.hypot(e.x-e.__novaChronoDronePrevX,
        e.y-e.__novaChronoDronePrevY);
       const padding=Math.max(120,30+dt*(bound+1600));
       if(Number.isFinite(bound)&&bound<=4000&&traveled<=96&&
          traveled<=bound*dt+1e-6&&
          !near(p.px,p.py,p.x,p.y,e.__novaChronoDronePrevX,
           e.__novaChronoDronePrevY,radius(e)+p.r+padding)&&
          !near(p.px,p.py,p.x,p.y,e.x,e.y,radius(e)+p.r+padding)&&
          children.every(c=>c&&Number.isFinite(c.vx)&&Number.isFinite(c.vy)&&
           !near(c.x,c.y,c.x+c.vx*remaining,c.y+c.vy*remaining,
            e.__novaChronoDronePrevX,e.__novaChronoDronePrevY,
            radius(e)+c.r+padding)&&
           !near(c.x,c.y,c.x+c.vx*remaining,c.y+c.vy*remaining,
            e.x,e.y,radius(e)+c.r+padding)))continue;
     }
     flags['missing'+kind+'Velocity']=true;continue;
    }
    const es=Math.hypot(e.vx,e.vy);
    if(es>2400){flags.excessEntitySpeed=true;continue;}
    const r=radius(e),padBase=Math.max(120,30+dt*(es+1600));
    if(Number.isFinite(r)&&r>0&&
       near(p.px,p.py,p.x,p.y,e.x,e.y,r+p.r+padBase))
     flags['parent'+kind+'Proximity']=true;
    for(const c of children){
     if(!c||!Number.isFinite(c.vx)||!Number.isFinite(c.vy))continue;
     const ex=c.x+c.vx*remaining,ey=c.y+c.vy*remaining;
     if(Number.isFinite(r)&&r>0&&
        near(c.x,c.y,ex,ey,e.x,e.y,r+c.r+padBase))
      flags['fragment'+kind+'Proximity']=true;
    }
   }
  }
  if(!(remaining>0&&remaining<dt)||children.length<3||children.length>12)
   flags.fragmentInvalid=true;
  for(const c of children){
   if(!c||c.dead||c.shell||c.beam||c.ownerId!==p.ownerId||
      !(c.r>0)||!(c.ttl>remaining)||!Number.isFinite(c.x)||
      !Number.isFinite(c.y)||!Number.isFinite(c.px)||
      !Number.isFinite(c.py)||!Number.isFinite(c.vx)||
      !Number.isFinite(c.vy)||!Number.isFinite(c.ttl)||
      Math.hypot(c.vx,c.vy)>360){flags.fragmentInvalid=true;continue;}
   const ex=c.x+c.vx*remaining,ey=c.y+c.vy*remaining,pad=c.r+1;
   if(!Number.isFinite(ex)||!Number.isFinite(ey)||
      Math.max(Math.abs(c.x),Math.abs(c.y),Math.abs(ex),Math.abs(ey))>=2200)
    flags.fragmentBounds=true;
   for(const t of g.__novaTerrain||[]){
    if(!t||t.solid===false||(t.destructible&&!(t.hp>0)))continue;
    if(t.shape==='circle'){
     if(!(t.r>0)||near(c.x,c.y,ex,ey,t.x,t.y,t.r+pad))
      flags.fragmentTerrainProximity=true;
    }else if(t.shape==='rect'){
     if(!(t.w>0&&t.h>0)||
        Math.max(c.x,ex)+pad>=t.x-t.w*.5&&
        Math.min(c.x,ex)-pad<=t.x+t.w*.5&&
        Math.max(c.y,ey)+pad>=t.y-t.h*.5&&
        Math.min(c.y,ey)-pad<=t.y+t.h*.5)
      flags.fragmentTerrainProximity=true;
    }else flags.fragmentTerrainProximity=true;
   }
  }
  flags.noWitnessedSufficientVeto=!VETO_KEYS.some(k=>
   k!=='noWitnessedSufficientVeto'&&flags[k]);
  return flags;
 }
 function create(pilotId){
  return {schema:1,pilotId,calls:0,firstBursts:0,suppressedCalls:0,
   childrenCreated:0,byOwner:{pilot:0,other:0,unknown:0},
   bySource:{battlefield:0,core:0,disciplines:0,other:0,unknown:0},
   byTTL:{positive:0,expired:0,unknown:0},
   bySite:{},examples:[],airburst:{calls:0,sole:0,advanced:0,stationary:0,mixed:0,
    noChildren:0,children:0,advancedChildren:0,advancedDistance:0,
    byOwner:{pilot:0,other:0,unknown:0},examples:[],observerErrors:0,
    gates:{soleWithoutRewound:0,soleRewoundNotClean:0,soleCleanNearAny:0,
     soleCleanNoNearby:0,soleCleanNearShape:0,soleCleanNearTank:0,
     soleCleanNearDrone:0},veto:{eligible:0,counts:Object.fromEntries(VETO_KEYS.map(k=>[k,0]))}}};
 }
 function install(g,a,stackProvider){
  if(!g||typeof g.clusterBurst!=='function'||!Array.isArray(g.bullets))
   throw Error('real composed Bomber burst owner missing');
  if(!a||a.schema!==1)throw Error('invalid burst audit');
  const original=g.clusterBurst;
  /* Frame-local observation only. The production update remains the sole
   * authority for fragment movement, lifetime and contact resolution. */
  let active=null;
  if(typeof g.updateBullets==='function'){
   const originalUpdate=g.updateBullets;
   g.updateBullets=function(){
    const previous=active,frame={sole:this.bullets.length===1,dt:arguments[0],events:[]};
    active=frame;
    try{return originalUpdate.apply(this,arguments);}
    finally{
     try{
      for(const event of frame.events){
       const bucket=a.airburst;bucket.calls++;
       if(event.sole){
        bucket.sole++;
        const e=event.gate,q=bucket.gates;
        if(!e.rewound)q.soleWithoutRewound++;
        else if(!e.clean)q.soleRewoundNotClean++;
        else{
         if(e.near.shape)q.soleCleanNearShape++;
         if(e.near.tank)q.soleCleanNearTank++;
         if(e.near.drone)q.soleCleanNearDrone++;
         if(e.near.shape||e.near.tank||e.near.drone)q.soleCleanNearAny++;
         else {q.soleCleanNoNearby++;
          if(e.veto){bucket.veto.eligible++;
           for(const k of VETO_KEYS)bucket.veto.counts[k]+=Number(e.veto[k]);}
         }
        }
       }
       bucket.byOwner[event.owner]++;
       if(!event.children.length){bucket.noChildren++;continue;}
       bucket.children+=event.children.length;
       let advanced=0,stationary=0,distance=0;
       for(const c of event.children){
        const b=c.ref,dx=b.x-c.x,dy=b.y-c.y,age=c.ttl-b.ttl;
        if(!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(age))continue;
        if(Math.abs(dx)<1e-8&&Math.abs(dy)<1e-8&&Math.abs(age)<1e-8){stationary++;continue;}
        if(age>0&&Math.abs(dx-c.vx*age)<1e-5&&Math.abs(dy-c.vy*age)<1e-5){
         advanced++;distance+=Math.hypot(dx,dy);
        }
       }
       bucket.advancedChildren+=advanced;bucket.advancedDistance+=distance;
       const status=advanced===event.children.length?'advanced':
        stationary===event.children.length?'stationary':'mixed';
       bucket[status]++;
       if(bucket.examples.length<20)bucket.examples.push({owner:event.owner,
        sole:event.sole,status,children:event.children.length,
        advanced,stationary,time:event.time});
      }
     }catch(_){a.airburst.observerErrors++;}
     active=previous;
    }
   };
  }
  const stack=typeof stackProvider==='function'?stackProvider:()=>new Error().stack;
  g.clusterBurst=function(parent){
   if(!parent)return original.apply(this,arguments);
   const wasConsumed=parent.__novaClusterBurstConsumed===true;
   const site=siteFromStack(stack()),kind=source(site);
   const owner=parent.ownerId===a.pilotId?'pilot':
    parent.ownerId==null?'unknown':'other';
   const ttl=Number.isFinite(parent.ttl)?
    parent.ttl<=0?'expired':'positive':'unknown';
   const before=Array.isArray(this.bullets)?this.bullets.length:0;
   const gate=!wasConsumed&&kind==='disciplines'&&active&&active.sole?
    gateEvidence(this,parent,active.dt):null;
   const result=original.apply(this,arguments);
   if(gate&&gate.clean&&!gate.near.shape&&!gate.near.tank&&!gate.near.drone){
    gate.veto=vetoEvidence(this,parent,active.dt,this.bullets.slice(before));
   }
   const added=Math.max(0,(Array.isArray(this.bullets)?this.bullets.length:0)-before);
   if(!wasConsumed&&kind==='disciplines'&&active){
    active.events.push({owner,sole:active.sole,gate,
     time:Number.isFinite(this.time)?this.time:null,
     children:this.bullets.slice(before).map(c=>({ref:c,x:c.x,y:c.y,
      ttl:c.ttl,vx:c.vx,vy:c.vy}))});
   }
   a.calls++;
   if(wasConsumed){a.suppressedCalls++;return result;}
   a.firstBursts++;a.childrenCreated+=added;
   a.byOwner[owner]++;a.bySource[kind]++;a.byTTL[ttl]++;
   a.bySite[site]=(a.bySite[site]||0)+1;
   if(a.examples.length<20)a.examples.push({site,owner,ttl,
    childCount:added,frameTime:Number.isFinite(this.time)?+this.time.toFixed(3):null,
    x:Number.isFinite(parent.x)?+parent.x.toFixed(2):null,
    y:Number.isFinite(parent.y)?+parent.y.toFixed(2):null});
   return result;
  };
  return a;
 }
 const api={create,install,siteFromStack,source,vetoEvidence};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.__novaBomberBurstAudit=api;
})(typeof window!=='undefined'?window:globalThis);
