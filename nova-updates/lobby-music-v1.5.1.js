/* NOVA TANKS v1.5.1 — Lobby / Blackglass score
 * Procedural, asset-free music with a shared motif and a smooth showroom variation.
 */
(function(){
'use strict';
var VERSION='1.5.1',BPM=112,STEP=60/BPM/4,STEPS=64;
var roots=[40,36,43,38]; /* Em - C - G - D */
var chords=[[0,3,7],[0,4,7],[0,4,7],[0,4,7]];
var motif=[12,19,22,19,24,22,19,15];
var AC=window.AudioContext||window.webkitAudioContext;
if(!AC)return;
function midi(n){return 440*Math.pow(2,(n-69)/12)}
function off(){try{return localStorage.getItem('novatanks_musicoff')==='1'||localStorage.getItem('novatanks_muted')==='1'}catch(_){return false}}
function menu(){return document.querySelector('#root .menu-grid-bg')}
function showroom(){return !!document.querySelector('#root .nvs-host.nvs-open .nvs-panel')}
function Score(){this.ctx=null;this.bus=null;this.noise=null;this.timer=null;this.step=0;this.next=0;this.mode=0;this.targetMode=0;this.started=false;this.lastMenu=false;}
Score.prototype.ensure=function(){if(this.ctx)return true;try{this.ctx=new AC();this.bus=this.ctx.createGain();this.bus.gain.value=0;this.bus.connect(this.ctx.destination);var n=Math.max(1,Math.floor(this.ctx.sampleRate*.35)),b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),d=b.getChannelData(0);for(var i=0;i<n;i++)d[i]=Math.random()*2-1;this.noise=b;return true}catch(_){return false}};
Score.prototype.voice=function(freq,t,dur,type,vol,cutoff,detune){if(!this.ctx||!this.bus)return;var o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type||'triangle';o.frequency.setValueAtTime(freq,t);if(detune)o.detune.value=detune;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),t+.009);g.gain.exponentialRampToValueAtTime(.0001,t+dur);if(cutoff){var f=this.ctx.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(cutoff,t);o.connect(f).connect(g).connect(this.bus)}else o.connect(g).connect(this.bus);o.start(t);o.stop(t+dur+.025)};
Score.prototype.hit=function(t,dur,vol,type,freq){if(!this.ctx||!this.bus||!this.noise)return;var src=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();src.buffer=this.noise;f.type=type;f.frequency.value=freq;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(f).connect(g).connect(this.bus);src.start(t);src.stop(t+dur+.02)};
Score.prototype.kick=function(t,v){if(!this.ctx||!this.bus)return;var o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';o.frequency.setValueAtTime(125,t);o.frequency.exponentialRampToValueAtTime(44,t+.115);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+.19);o.connect(g).connect(this.bus);o.start(t);o.stop(t+.21)};
Score.prototype.play=function(step,t){var bar=(step>>4)&3,s=step&15,root=roots[bar],ch=chords[bar],m=this.mode,lobby=1-m,glass=m;
 /* slow neon pad: harmonic identity persists between lobby and archive */
 if(s===0){var dur=STEP*16*1.08;for(var i=0;i<ch.length;i++){var f=midi(root+12+ch[i]);this.voice(f,t,dur,'sawtooth',.016*lobby+.010*glass,620+glass*520,-7);this.voice(f,t,dur,'sawtooth',.016*lobby+.010*glass,620+glass*520,7)}}
 /* memorable syncopated bass pulse */
 if(s===0||s===3||s===6||s===8||s===11||s===14){var bf=midi(root+(s===14?12:0));this.voice(bf,t,STEP*(s===14?1.5:1.15),'sawtooth',.078*lobby+.032*glass,300+glass*160);this.voice(bf,t,STEP*.9,'square',.020*lobby+.008*glass,190)}
 /* lobby groove */
 if(lobby>.04){if(s%4===0)this.kick(t,.17*lobby);if(s===4||s===12)this.hit(t,.12,.052*lobby,'bandpass',1800);if(s%2===1)this.hit(t,.032,.015*lobby*(s%4===1?1:.65),'highpass',7200)}
 /* NOVA hook: a short, repeatable 4-bar lead signature */
 if(s%2===0){var mi=(s>>1)&7,note=root+motif[mi],accent=(mi===0||mi===4)?1.25:1;this.voice(midi(note),t,STEP*1.55,'triangle',(.027*lobby+.015*glass)*accent,3000);if(lobby>.25)this.voice(midi(note-12),t,STEP*.65,'square',.007*lobby,1700)}
 /* showroom variation: crystalline response notes and data-pulse ticks */
 if(glass>.03){if(s===1||s===5||s===9||s===13){var gi=((s-1)>>2)%ch.length,gf=midi(root+36+ch[gi]);this.voice(gf,t,STEP*2.4,'sine',.026*glass);this.voice(gf*2,t,STEP*1.15,'triangle',.008*glass,5200)}if(s%4===2)this.hit(t,.025,.009*glass,'highpass',9200);if(s===7||s===15)this.voice(midi(root+31),t,STEP*2.3,'sine',.018*glass)}
};
Score.prototype.schedule=function(){if(!this.ctx||!this.started||!this.lastMenu)return;this.targetMode=showroom()?1:0;this.mode+=(this.targetMode-this.mode)*.10;var horizon=this.ctx.currentTime+.13,guard=0;while(this.next<horizon&&guard++<48){this.play(this.step,this.next);this.next+=STEP;this.step=(this.step+1)%STEPS}};
Score.prototype.sync=function(fromGesture){var has=!!menu();this.lastMenu=has;if(!has||off()){if(this.bus&&this.ctx){this.bus.gain.cancelScheduledValues(this.ctx.currentTime);this.bus.gain.setTargetAtTime(0,this.ctx.currentTime,.08)}if(this.timer!==null){clearInterval(this.timer);this.timer=null}return}if(!this.ensure())return;if(fromGesture&&this.ctx.state==='suspended')this.ctx.resume();if(this.ctx.state!=='running')return;this.started=true;this.bus.gain.cancelScheduledValues(this.ctx.currentTime);this.bus.gain.setTargetAtTime(.20,this.ctx.currentTime,.20);if(this.timer===null){this.next=this.ctx.currentTime+.07;var self=this;this.timer=setInterval(function(){self.schedule()},25)}};
var score=new Score();window.__NOVA_LOBBY_SCORE__=score;window.__NOVA_MUSIC_RELEASE__={version:VERSION,codename:'Swarm Discipline',feature:'Lobby score',headline:'NOVA gains a distinct lobby theme and a glassy Blackglass variation.'};
function gesture(){score.sync(true)}
document.addEventListener('pointerdown',gesture,{passive:true});document.addEventListener('keydown',gesture);document.addEventListener('click',function(){setTimeout(function(){score.sync(true)},0)},true);setInterval(function(){score.sync(false)},350);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){score.sync(false)});else score.sync(false);
console.info('[NOVA TANKS] v1.5.1 lobby/showroom score linked');
})();
