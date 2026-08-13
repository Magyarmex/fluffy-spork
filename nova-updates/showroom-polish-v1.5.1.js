/* NOVA TANKS v1.5.1 — Blackglass mobile/visual polish */
(function(){
'use strict';
var ID='nova-showroom-polish-v151';
if(document.getElementById(ID))return;
var s=document.createElement('style');s.id=ID;s.textContent=`
/* global showroom finish */
.nvs-panel{box-shadow:0 22px 76px rgba(0,0,0,.72),inset 0 1px rgba(255,255,255,.045);}
.nvs-head{padding:14px 16px}.nvs-title{line-height:1.3;text-wrap:balance}.nvs-sub{line-height:1.35;max-width:720px}
.nvs-filter,.nvs-card,.nvs-gene,.nvs-launch{transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .12s ease,opacity .16s ease}.nvs-filter:active,.nvs-card:active,.nvs-gene:active{transform:scale(.975)}
.nvs-library,.nvs-intel{scrollbar-width:thin;scrollbar-color:rgba(125,243,255,.22) transparent}.nvs-library::-webkit-scrollbar,.nvs-intel::-webkit-scrollbar{width:5px;height:5px}.nvs-library::-webkit-scrollbar-thumb,.nvs-intel::-webkit-scrollbar-thumb{background:rgba(125,243,255,.20);border-radius:999px}
.nvs-card{min-width:0}.nvs-card>span:nth-child(2){min-width:0;display:block}.nvs-card-name,.nvs-card-role{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nvs-card-role{line-height:1.2}
.nvs-stagebar{min-width:0}.nvs-lineage,.nvs-bread{min-width:0}.nvs-bread{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
.nvs-canvaswrap{box-shadow:inset 0 0 60px rgba(77,227,255,.025)}.nvs-stagehint{max-width:calc(100% - 20px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nvs-desc{max-width:720px}.nvs-stat-top{align-items:flex-end}.nvs-stat-l{min-width:0;overflow-wrap:anywhere}.nvs-stat-v{flex:0 0 auto;text-align:right;white-space:nowrap}
.nvs-ability-n{line-height:1.35}.nvs-delta{align-items:flex-start}.nvs-delta span:first-child{min-width:0;overflow-wrap:anywhere}.nvs-delta span:last-child{max-width:58%;white-space:normal;overflow-wrap:anywhere}
.nvs-gene-desc,.nvs-note,.nvs-trade{overflow-wrap:anywhere}

@media(max-width:720px){
 .nvs-host.nvs-open{left:50%;width:calc(100vw - 8px)!important;transform:translateX(-50%);}
 .nvs-panel{margin-top:8px;border-radius:15px;overflow:hidden}
 .nvs-head{padding:12px 12px 10px}.nvs-title{font-size:11px;letter-spacing:.16em;line-height:1.35}.nvs-sub{font-size:9px;line-height:1.28;margin-top:3px;color:#8795aa}
 .nvs-filters{position:relative;padding:8px 9px;gap:5px;scroll-padding-inline:9px}.nvs-filter{padding:6px 9px;font-size:7.5px;letter-spacing:.09em}
 .nvs-library{padding:8px 9px 9px;gap:7px;scroll-snap-type:x proximity;scroll-padding-inline:9px}.nvs-card{flex:0 0 164px;grid-template-columns:32px minmax(0,1fr);gap:8px;padding:8px;scroll-snap-align:start;border-radius:12px}.nvs-card-icon{width:32px;height:32px}.nvs-card-name{font-size:8.5px}.nvs-card-role{font-size:8.5px;margin-top:3px;color:#8090a7}
 .nvs-stage{padding:10px 10px 11px}.nvs-stagebar{display:grid;grid-template-columns:1fr;gap:4px}.nvs-lineage{font-size:7.5px;letter-spacing:.13em}.nvs-bread{margin-left:0;text-align:left;font-size:8px;white-space:nowrap;color:#7a899f}
 .nvs-canvaswrap{min-height:218px;height:218px;margin-top:7px;border-radius:12px}.nvs-canvas{min-height:218px;height:218px}.nvs-stagehint{font-size:6.8px;letter-spacing:.08em;bottom:7px;left:8px;color:#6f7d93}
 .nvs-name{font-size:17px;margin-top:9px;line-height:1.15;letter-spacing:.065em}.nvs-quote{font-size:12px;line-height:1.2;margin-top:4px}.nvs-desc{font-size:10.5px;line-height:1.38;margin-top:6px}.nvs-tags{gap:4px;margin-top:7px}.nvs-tag{font-size:7px;padding:4px 6px;letter-spacing:.07em}
 .nvs-intel{padding:11px 10px 13px}.nvs-section{font-size:8px;letter-spacing:.17em}.nvs-stat{margin-top:8px}.nvs-stat-top{font-size:8.5px;line-height:1.1}.nvs-bar{height:4px;margin-top:4px}
 .nvs-ability{padding:8px 9px;margin-top:10px}.nvs-ability-k{font-size:7px}.nvs-ability-n{font-size:10px;margin-top:3px}
 .nvs-graft{margin-top:12px;padding-top:11px}.nvs-note{font-size:8px;line-height:1.35;margin-top:6px}.nvs-gene-row{margin-top:7px;gap:6px}.nvs-gene{width:42px;height:36px;font-size:15px;flex:0 0 42px}.nvs-gene-name{font-size:9px;line-height:1.2}.nvs-gene-desc{font-size:9.5px;line-height:1.35}.nvs-deltas{gap:5px;margin-top:7px}.nvs-delta{font-size:8.5px;line-height:1.25;padding:6px 7px}.nvs-trade{font-size:8.5px;line-height:1.3}
 .nvs-launch{padding:9px 10px;gap:9px}.nvs-launch-icon{width:31px;height:31px;border-radius:9px}.nvs-launch-k{font-size:8.5px;letter-spacing:.16em}.nvs-launch-go{font-size:7px;letter-spacing:.08em}
}
@media(max-width:390px){
 .nvs-host.nvs-open{width:calc(100vw - 4px)!important}.nvs-title{font-size:10.5px;letter-spacing:.14em}.nvs-sub{font-size:8.5px}
 .nvs-card{flex-basis:154px}.nvs-canvaswrap,.nvs-canvas{height:205px;min-height:205px}.nvs-name{font-size:16px}.nvs-bread{font-size:7.5px}
}
@media(max-width:350px){
 .nvs-head{padding-left:10px;padding-right:10px}.nvs-title{font-size:10px;letter-spacing:.11em}.nvs-card{flex-basis:148px}.nvs-canvaswrap,.nvs-canvas{height:192px;min-height:192px}.nvs-stat-top{font-size:8px}.nvs-delta span:last-child{max-width:55%}
}
`;
document.head.appendChild(s);
console.info('[NOVA TANKS] v1.5.1 Blackglass portrait polish linked');
})();
