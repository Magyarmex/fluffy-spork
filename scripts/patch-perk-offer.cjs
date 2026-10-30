'use strict';
/* The level-30 mastery modal used Array.sort(() => Math.random() - 0.5),
 * which is not a shuffle: a random comparator is non-transitive and the
 * resulting three-of-six offers are heavily engine/order biased.
 *
 * Select three distinct perks with partial Fisher-Yates instead. Keep the
 * original pool, React memo lifetime, dismissal and choice UI unchanged.
 * Patch the canonical compressed shell BEFORE the runtime is materialized,
 * and patch the same shell before real Chromium smoke.
 */
const fs=require('node:fs');
const before="    const shuffled = (0, react_1.useMemo)(() => [...pool].sort(() => Math.random() - 0.5).slice(0, 3), []);";
const after=[
"    const shuffled = (0, react_1.useMemo)(() => {",
"        const picks = [...pool];",
"        for (let i = 0; i < 3; i++) {",
"            const j = i + Math.floor(Math.random() * (picks.length - i));",
"            [picks[i], picks[j]] = [picks[j], picks[i]];",
"        }",
"        return picks.slice(0, 3);",
"    }, []);"
].join('\n');

/* At the level cap there is no next level-up to reoffer a postponed evolution.
 * Keep the pending milestone available through EVOLVE READY, and retain the
 * original mastery triple across React modal remounts (no free rerolls).
 * This patches the original compiled owners, not generated index.html.
 */
const capDismissBefore=[
"    dismissOffer() {",
"        this.pendingOffer = null;",
"        this.setPaused(false);",
"        this.syncHud();",
"    }"
].join('\n');
const capDismissAfter=[
"    dismissOffer(masterChoices) {",
"        const capped = this.player && this.player.level >= types_1.MAX_LEVEL;",
"        if (capped && this.pendingOffer === 3 && !this.masteryOfferChoices) {",
"            const pool = ['dmg', 'speed', 'vitality', 'alacrity', 'thorns', 'wealth'];",
"            if (Array.isArray(masterChoices) && masterChoices.length === 3 &&",
"                new Set(masterChoices).size === 3 && masterChoices.every(id => pool.includes(id)))",
"                this.masteryOfferChoices = masterChoices.slice();",
"        }",
"        if (!capped) {",
"            this.pendingOffer = null;",
"            this.masteryOfferChoices = null;",
"        }",
"        this.setPaused(false);",
"        this.syncHud();",
"    }"
].join('\n');
const capPerkSelectionAfter=after
  .replace('        const picks = [...pool];',
    "        if (Array.isArray(savedChoices) && savedChoices.length === 3 && new Set(savedChoices).size === 3 && savedChoices.every(id => pool.includes(id))) return savedChoices;\n        const picks = [...pool];")
  .replace('    }, []);','    }, [savedChoices]);');
const capModalBefore='offer === 3 && React.createElement(PerkOffer, { onPick: (p) => { setOffer(null); gameRef.current?.applyPerk(p); }, onLater: () => { setOffer(null); gameRef.current?.dismissOffer(); } }),';
const capModalAfter='offer === 3 && React.createElement(PerkOffer, { savedChoices: gameRef.current?.masteryOfferChoices, onPick: (p) => { setOffer(null); gameRef.current?.applyPerk(p); }, onLater: (choices) => { setOffer(null); gameRef.current?.dismissOffer(choices); } }),';
function swapOnce(s, oldText, newText, label) {
  const nOld=count(s,oldText),nNew=count(s,newText);
  if(nOld===0 && nNew===1)return s;
  if(nOld!==1 || nNew!==0)throw Error('canonical level-cap '+label+' drift ('+nOld+'/'+nNew+')');
  return s.replace(oldText,newText);
}
function patchLevelCapOffer(html){
  if(typeof html!=='string'||!html.includes('class Game {')||
     !html.includes('function PerkOffer({'))throw Error('canonical level-cap owners missing');
  html=swapOnce(html,capDismissBefore,capDismissAfter,'dismiss');
  html=swapOnce(html,capModalBefore,capModalAfter,'modal callback');
  html=swapOnce(html,'function PerkOffer({ onPick, onLater }) {',
    'function PerkOffer({ onPick, onLater, savedChoices }) {','PerkOffer props');
  html=swapOnce(html,after,capPerkSelectionAfter,'mastery memo');
  const start=html.indexOf('function PerkOffer({');
  const end=html.indexOf('function GameOver(',start);
  if(start<0||end<start)throw Error('canonical PerkOffer boundaries missing');
  const part=html.slice(start,end);
  const oldLater='onClick: onLater, className: "btn-ghost mt-3 w-full py-2 text-[10px]"';
  const newLater='onClick: () => onLater(shuffled), className: "btn-ghost mt-3 w-full py-2 text-[10px]"';
  html=html.slice(0,start)+swapOnce(part,oldLater,newLater,'mastery postpone')+html.slice(end);
  const perkStart=html.indexOf('    applyPerk(p) {',html.indexOf('class Game {'));
  const perkEnd=html.indexOf('    applyGene(g) {',perkStart);
  if(perkStart<0||perkEnd<perkStart)throw Error('canonical applyPerk boundaries missing');
  const perk=html.slice(perkStart,perkEnd);
  html=html.slice(0,perkStart)+swapOnce(perk,'        t.perk = p;\n        this.pendingOffer = null;',
    '        t.perk = p;\n        this.masteryOfferChoices = null;\n        this.pendingOffer = null;','mastery consumption')+html.slice(perkEnd);
  const redeployStart=html.indexOf('    redeploy() {',html.indexOf('class Game {'));
  const redeployEnd=html.indexOf('    // ============ helpers ============',redeployStart);
  if(redeployStart<0||redeployEnd<redeployStart)throw Error('canonical redeploy boundaries missing');
  const redeploy=html.slice(redeployStart,redeployEnd);
  html=html.slice(0,redeployStart)+swapOnce(redeploy,'        this.pendingOffer = null;\n        this.statPoints = 0;',
    '        this.pendingOffer = null;\n        this.masteryOfferChoices = null;\n        this.statPoints = 0;','redeploy reset')+html.slice(redeployEnd);
  return html;
}

const count=(s,x)=>s.split(x).length-1;
function patchPerkOffer(html){
 if(typeof html!=='string')throw new TypeError('expected UTF-8 HTML');
 if(!html.includes('function PerkOffer({ onPick, onLater }) {')||
    !html.includes("const pool = ['dmg', 'speed', 'vitality', 'alacrity', 'thorns', 'wealth'];"))
   throw Error('canonical PerkOffer owner missing');
 const old=count(html,before),fixed=count(html,after);
 if(old===0&&(fixed===1||count(html,capPerkSelectionAfter)===1))return html;
 if(old!==1||fixed!==0)throw Error('canonical PerkOffer selection drift');
 return html.replace(before,after);
}
module.exports={patchPerkOffer,patchLevelCapOffer,before,after,capDismissBefore,capDismissAfter,capPerkSelectionAfter};
if(require.main===module){
 const file=process.argv[2];
 if(!file)throw Error('Usage: node scripts/patch-perk-offer.cjs <index.html>');
 const raw=fs.readFileSync(file,'utf8'),patched=patchLevelCapOffer(patchPerkOffer(raw));
 if(patched!==raw)fs.writeFileSync(file,patched,'utf8');
 process.stdout.write('NOVA mastery selection and level-cap offer preservation validated\n');
}
