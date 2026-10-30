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
const count=(s,x)=>s.split(x).length-1;
function patchPerkOffer(html){
 if(typeof html!=='string')throw new TypeError('expected UTF-8 HTML');
 if(!html.includes('function PerkOffer({ onPick, onLater }) {')||
    !html.includes("const pool = ['dmg', 'speed', 'vitality', 'alacrity', 'thorns', 'wealth'];"))
   throw Error('canonical PerkOffer owner missing');
 const old=count(html,before),fixed=count(html,after);
 if(old===0&&fixed===1)return html;
 if(old!==1||fixed!==0)throw Error('canonical PerkOffer selection drift');
 return html.replace(before,after);
}
module.exports={patchPerkOffer,before,after};
if(require.main===module){
 const file=process.argv[2];
 if(!file)throw Error('Usage: node scripts/patch-perk-offer.cjs <index.html>');
 const raw=fs.readFileSync(file,'utf8'),patched=patchPerkOffer(raw);
 if(patched!==raw)fs.writeFileSync(file,patched,'utf8');
 process.stdout.write('NOVA level-30 mastery offers uniformly sampled and validated\n');
}
