'use strict';
// RESEARCH ONLY. Prototype a physically released sub-tick rail quick shot.
// Never loaded by the production materializer. This deliberately uses the
// shipping Sniper overlay's own fireRail/annotateNewRails/cooldown semantics.
function patchSniper(source){
 const needle=`      var pl = this.player;
      var heldAfter = !!(this.input && (this.input.firing || this.input.autofire));`;
 if(source.indexOf(needle)<0||source.indexOf(needle)!==source.lastIndexOf(needle))
  throw Error('Sniper quick-release patch anchor absent or ambiguous');
 const replacement=`      var pl = this.player;
      // A release-owned direct intent has no held-to-released simulation edge.
      // The ordinary oldUpdate may start rail focus, but never finishes it.
      // Convert ONLY this one synthetic, unsampled press into the weakest
      // existing quick rail; never create a full rail or bank focus.
      var releasedIntent = this.input && this.input.__novaShotIntent;
      if (releasedIntent && releasedIntent.fire === true && pl &&
          pl === plBefore && pl.alive && isRailTank(pl) &&
          !wasHeld && pl.fireCd <= 0 && pl.__novaFocusStart) {
        resetFocus(pl);
        fireRail(this, pl, false, 0.05);
      }
      var heldAfter = !!(this.input && (this.input.firing || this.input.autofire));`;
 return source.replace(needle,replacement);
}
module.exports={patchSniper};
