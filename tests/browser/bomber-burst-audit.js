'use strict';
/* Research-only Bomber burst witness. Observe the ACTUAL composed clusterBurst
 * owner without changing projectiles, RNG, frame clocks, damage or AI.
 * Callsite categories are diagnostic, not a physical first-contact oracle. */
(function(root){
 function siteFromStack(stack){
  const lines=String(stack||'').split('\n');
  for(const line of lines){
   const match=line.match(/(?:^|\/)([a-zA-Z0-9_-]+\.(?:js|html)):(\d+):\d+/);
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
 function create(pilotId){
  return {schema:1,pilotId,calls:0,firstBursts:0,suppressedCalls:0,
   childrenCreated:0,byOwner:{pilot:0,other:0,unknown:0},
   bySource:{battlefield:0,core:0,disciplines:0,other:0,unknown:0},
   byTTL:{positive:0,expired:0,unknown:0},
   bySite:{},examples:[]};
 }
 function install(g,a,stackProvider){
  if(!g||typeof g.clusterBurst!=='function'||!Array.isArray(g.bullets))
   throw Error('real composed Bomber burst owner missing');
  if(!a||a.schema!==1)throw Error('invalid burst audit');
  const original=g.clusterBurst;
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
   const result=original.apply(this,arguments);
   const added=Math.max(0,(Array.isArray(this.bullets)?this.bullets.length:0)-before);
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
 const api={create,install,siteFromStack,source};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.__novaBomberBurstAudit=api;
})(typeof window!=='undefined'?window:globalThis);
