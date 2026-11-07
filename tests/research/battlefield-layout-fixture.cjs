'use strict';
// Research-only: replace the single Battlefield layout entropy expression in
// the exact shipping overlay response. Never write to production source.
// This controls terrain layout, NOT spawn RNG or a matched physical world.
const NEEDLE='((Date.now()>>>8)^(Math.random()*0x7fffffff))>>>0';
function injectBattlefieldSeed(source,seed){
 if(typeof source!=='string'||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)
  throw new TypeError('research Battlefield seed must be a uint32');
 const first=source.indexOf(NEEDLE);
 if(first<0||source.indexOf(NEEDLE,first+NEEDLE.length)!==-1)
  throw new Error('shipping Battlefield entropy expression must match exactly once');
 return source.slice(0,first)+'('+seed+'>>>0)'+source.slice(first+NEEDLE.length);
}
module.exports={injectBattlefieldSeed};
