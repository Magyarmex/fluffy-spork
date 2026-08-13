/* NOVA TANKS v1.3.1 — Signal Bloom
 * Presentation / feedback polish for Silent Horizon + Second Body.
 * No new controls: improves readability, reward, audio, and mobile combat feel.
 */
(function () {
  'use strict';

  var mods = window.__novaModules;
  if (!mods) {
    console.error('[NOVA v1.3.1] module registry unavailable; polish update not installed');
    return;
  }

  var VERSION = '1.3.1';
  var CODENAME = 'Signal Bloom';
  var TAU = Math.PI * 2;
  var GREEN = '#75f0a3';
  var VIOLET = '#c493ff';
  var GOLD = '#ffd98a';
  var CONTROLLER_IDS = {
    carrier:1, overlord:1, warden:1, hivemind:1,
    broodmother:1, citadel:1, valkyrie:1
  };

  window.__NOVA_POLISH_RELEASE__ = {
    version: VERSION,
    codename: CODENAME,
    date: '2026-08-07',
    headline: 'Sniper and Controller mastery gets a full feedback pass.'
  };

  function wrapModule(id, after) {
    var original = mods[id];
    if (!original) {
      console.warn('[NOVA v1.3.1] module not found:', id);
      return;
    }
    mods[id] = function (module, exports, require) {
      original(module, exports, require);
      after(module.exports, require);
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist2(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  }
  function isController(t) { return !!(t && CONTROLLER_IDS[t.cls]); }
  function isRail(t, CLASSES) {
    var d = t && CLASSES[t.cls];
    return !!(d && d.fireMode === 'beam');
  }
  function worldToScreen(g, x, y) {
    var z = g.cam && g.cam.zoom ? g.cam.zoom : 1;
    return { x:(x - g.cam.x) * z + g.w * 0.5, y:(y - g.cam.y) * z + g.h * 0.5 };
  }
  function panFrom(g, x) {
    if (!g.player) return 0;
    var span = Math.max(420, g.w / Math.max(0.55, (g.cam && g.cam.zoom) || 1));
    return clamp((x - g.player.x) / span, -1, 1);
  }
  function vibrate(ms) {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    try { navigator.vibrate(ms); } catch (_) {}
  }

  wrapModule('game/audio', function (audio) {
    var Sfx = audio.Sfx;
    if (!Sfx || Sfx.prototype.__novaSignalBloom) return;
    Sfx.prototype.__novaSignalBloom = true;

    function route(self, node, pan) {
      if (!self.ctx || !self.master) return;
      if (self.ctx.createStereoPanner) {
        var p = self.ctx.createStereoPanner();
        p.pan.value = clamp(pan || 0, -1, 1);
        node.connect(p); p.connect(self.master);
      } else {
        node.connect(self.master);
      }
    }
    function voice(self, f0, f1, dur, gain, pan, type, delay) {
      self.resume();
      if (!self.ctx || !self.master || self.muted) return;
      var c = self.ctx, t0 = c.currentTime + (delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(Math.max(20, f0), t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.014, dur * 0.22));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); route(self, g, pan); o.start(t0); o.stop(t0 + dur + 0.025);
    }
    function noise(self, dur, gain, pan, hp, lp, delay) {
      self.resume();
      if (!self.ctx || !self.master || self.muted) return;
      var c = self.ctx;
      if (!self.__novaPolishNoise) {
        var n = Math.max(1, Math.floor(c.sampleRate * 0.32));
        var buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
        for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
        self.__novaPolishNoise = buf;
      }
      var t0 = c.currentTime + (delay || 0);
      var src = c.createBufferSource(), hi = c.createBiquadFilter(), lo = c.createBiquadFilter(), g = c.createGain();
      src.buffer = self.__novaPolishNoise;
      hi.type = 'highpass'; hi.frequency.value = hp || 800;
      lo.type = 'lowpass'; lo.frequency.value = lp || 9000;
      g.gain.setValueAtTime(Math.max(0.0002, gain), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(hi); hi.connect(lo); lo.connect(g); route(self, g, pan);
      src.start(t0); src.stop(t0 + dur + 0.025);
    }

    Sfx.prototype.novaFocusReady = function () {
      var now = performance.now();
      if (this.__novaFocusReadyAt && now - this.__novaFocusReadyAt < 420) return;
      this.__novaFocusReadyAt = now;
      voice(this, 720, 1260, 0.10, 0.020, 0, 'sine', 0);
      voice(this, 1180, 1770, 0.10, 0.014, 0, 'triangle', 0.045);
      voice(this, 1770, 1770, 0.06, 0.010, 0, 'sine', 0.105);
    };
    Sfx.prototype.novaRailInterceptPolish = function (pan, destroyed, playerDidIt) {
      var now = performance.now();
      if (this.__novaRailIntAt && now - this.__novaRailIntAt < 60) return;
      this.__novaRailIntAt = now;
      voice(this, destroyed ? 2100 : 1680, destroyed ? 520 : 820, destroyed ? 0.16 : 0.11,
        playerDidIt ? 0.038 : 0.025, pan, 'triangle', 0);
      noise(this, destroyed ? 0.12 : 0.07, playerDidIt ? 0.036 : 0.022, pan, 1500, 11000, 0);
      if (destroyed) voice(this, 430, 95, 0.18, 0.026, pan, 'sine', 0.012);
    };
    Sfx.prototype.novaDroneImpactPolish = function (pan, hostile) {
      var now = performance.now();
      if (this.__novaDroneImpactAt && now - this.__novaDroneImpactAt < 55) return;
      this.__novaDroneImpactAt = now;
      voice(this, hostile ? 170 : 220, 58, 0.16, hostile ? 0.050 : 0.035, pan, 'sine', 0);
      noise(this, 0.085, hostile ? 0.040 : 0.026, pan, 750, 5200, 0);
      voice(this, 980, 320, 0.07, 0.018, pan, 'square', 0.005);
    };
    Sfx.prototype.novaDroneBreakPolish = function (pan, friendlyBreak) {
      var now = performance.now();
      if (this.__novaDroneBreakAt && now - this.__novaDroneBreakAt < 75) return;
      this.__novaDroneBreakAt = now;
      voice(this, 1450, 430, 0.12, friendlyBreak ? 0.030 : 0.022, pan, 'triangle', 0);
      voice(this, 760, 330, 0.09, 0.015, pan, 'square', 0.03);
    };
    Sfx.prototype.novaDroneNearMissPolish = function (pan) {
      var now = performance.now();
      if (this.__novaNearMissAt && now - this.__novaNearMissAt < 120) return;
      this.__novaNearMissAt = now;
      noise(this, 0.10, 0.025, pan, 1700, 11500, 0);
      voice(this, 1500, 440, 0.09, 0.016, pan, 'sawtooth', 0);
    };
  });

  wrapModule('game/engine', function (engine, require) {
    var Game = engine.Game;
    if (!Game || Game.prototype.__novaSignalBloom) return;
    Game.prototype.__novaSignalBloom = true;

    var CLASSES = require('./classes').CLASSES;

    var oldUpdate = Game.prototype.update;
    Game.prototype.update = function (dt) {
      oldUpdate.call(this, dt);
      var pl = this.player;
      if (!pl || !pl.alive) return;

      if (isRail(pl, CLASSES)) {
        var q = clamp(pl.__novaFocus || 0, 0, 1);
        if (q >= 0.92 && !pl.__novaPolishFocusReady) {
          pl.__novaPolishFocusReady = true;
          pl.__novaPolishFocusReadyAt = this.time;
          if (this.sfx && this.sfx.novaFocusReady) this.sfx.novaFocusReady();
          if (this.addRing) this.addRing(pl.x, pl.y, '#d8c0ff', 38);
          vibrate(5);
        } else if (q < 0.08) {
          pl.__novaPolishFocusReady = false;
        }
      }
    };

    var oldResolve = Game.prototype.resolveBulletCollisions;
    Game.prototype.resolveBulletCollisions = function () {
      var before = Object.create(null);
      for (var i = 0; i < this.bullets.length; i++) {
        var b = this.bullets[i];
        if (b && b.__novaRail && !b.dead) before[b.id] = { hp:b.hp, x:b.x, y:b.y, ownerId:b.ownerId };
      }
      oldResolve.call(this);
      var pl = this.player;
      for (var j = 0; j < this.bullets.length; j++) {
        var r = this.bullets[j], snap = r && before[r.id];
        if (!r || !snap || r.hp == null || snap.hp == null || r.hp >= snap.hp - 0.001) continue;
        if (r.__novaPolishInterceptFxFrame === this.time) continue;
        r.__novaPolishInterceptFxFrame = this.time;

        var playerDidIt = false;
        if (pl && r.ownerId !== pl.id) {
          for (var k = 0; k < this.bullets.length; k++) {
            var pb = this.bullets[k];
            if (!pb || pb.ownerId !== pl.id || pb.id === r.id) continue;
            if (dist2(pb.x, pb.y, r.x, r.y) < 58 * 58) { playerDidIt = true; break; }
          }
        }
        var destroyed = !!r.dead || r.hp <= 0;
        if (this.addParticles) this.addParticles(r.x, r.y, destroyed ? '#ffffff' : '#d8c0ff', destroyed ? 9 : 5, destroyed ? 125 : 80, 'glow');
        if (this.addRing) this.addRing(r.x, r.y, destroyed ? '#ffffff' : '#c493ff', destroyed ? 34 : 22);
        if (this.sfx && this.sfx.novaRailInterceptPolish) {
          this.sfx.novaRailInterceptPolish(panFrom(this, r.x), destroyed, playerDidIt);
        }
        if (playerDidIt && destroyed && this.addText) {
          this.addText(r.x, r.y - 18, 'RAIL DENIED', '#d9f7ff', 10);
          this.cam.shake = Math.max(this.cam.shake || 0, 0.10);
          vibrate(7);
        }
      }
    };

    var oldDamageTank = Game.prototype.damageTank;
    Game.prototype.damageTank = function (victim, dmg, killerId, kx, ky) {
      var droneOwner = this.__novaDroneDamageOwner;
      var out = oldDamageTank.call(this, victim, dmg, killerId, kx, ky);
      if (droneOwner != null && droneOwner === killerId && victim) {
        var owner = this.tankById && this.tankById.get(killerId);
        var hostile = !!(victim.isPlayer && owner && !owner.isPlayer);
        if (this.sfx && this.sfx.novaDroneImpactPolish) {
          this.sfx.novaDroneImpactPolish(panFrom(this, victim.x), hostile);
        }
        if (this.addFlash) this.addFlash(victim.x, victim.y, owner && owner.color ? owner.color : GREEN, 28);
        if (owner && owner.isPlayer) this.cam.shake = Math.max(this.cam.shake || 0, 0.07);
        if (hostile) {
          this.cam.shake = Math.max(this.cam.shake || 0, 0.13);
          vibrate(11);
        }
      }
      return out;
    };

    var oldDamageDrone = Game.prototype.damageDrone;
    Game.prototype.damageDrone = function (d, dmg, killerId) {
      var winding = !!(d && d.__novaPhase === 'windup' && !d.__novaCommitted);
      var owner = d && this.tankById ? this.tankById.get(d.ownerId) : null;
      var killer = killerId >= 0 && this.tankById ? this.tankById.get(killerId) : null;
      var out = oldDamageDrone.call(this, d, dmg, killerId);
      if (winding && d && d.hp > 0 && (!d.__novaPolishBreakAt || this.time - d.__novaPolishBreakAt > 0.12)) {
        d.__novaPolishBreakAt = this.time;
        if (this.sfx && this.sfx.novaDroneBreakPolish) this.sfx.novaDroneBreakPolish(panFrom(this, d.x), !!(killer && killer.isPlayer));
        if (this.addRing) this.addRing(d.x, d.y, '#ffd98a', 19);
        if (killer && killer.isPlayer && owner && !owner.isPlayer && this.addText) {
          this.addText(d.x, d.y - 15, 'DIVE BROKEN', '#ffd98a', 9);
        }
      }
      return out;
    };

    var oldUpdateDrones = Game.prototype.updateDrones;
    Game.prototype.updateDrones = function (dt) {
      var prev = Object.create(null);
      for (var i = 0; i < this.drones.length; i++) {
        var d = this.drones[i];
        prev[d.id] = {
          phase:d.__novaPhase || '',
          hit:!!d.__novaHitRun,
          targetId:d.__novaTarget && d.__novaTarget.id != null ? d.__novaTarget.id : -1,
          x:d.x, y:d.y, ownerId:d.ownerId
        };
      }
      oldUpdateDrones.call(this, dt);
      var pl = this.player;
      if (!pl) return;
      for (var j = 0; j < this.drones.length; j++) {
        var nd = this.drones[j], p = prev[nd.id];
        if (!p) continue;
        if (p.phase === 'dash' && nd.__novaPhase === 'recover' && !nd.__novaHitRun && p.targetId === pl.id) {
          var owner = this.tankById && this.tankById.get(nd.ownerId);
          if (owner && !owner.isPlayer) {
            var near = Math.sqrt(dist2(nd.x, nd.y, pl.x, pl.y));
            if (near < 150 && (!pl.__novaNearMissAt || this.time - pl.__novaNearMissAt > 0.18)) {
              pl.__novaNearMissAt = this.time;
              if (this.sfx && this.sfx.novaDroneNearMissPolish) this.sfx.novaDroneNearMissPolish(panFrom(this, nd.x));
              if (this.addRing) this.addRing(pl.x, pl.y, '#ffd98a', 30);
              if (this.addText) this.addText(pl.x, pl.y - 30, 'EVADED', '#ffd98a', 9);
              vibrate(5);
            }
          }
        }
      }
    };
  });

  wrapModule('game/render', function (renderMod, require) {
    var oldRender = renderMod.render;
    if (!oldRender || oldRender.__novaSignalBloom) return;
    var CLASSES = require('./classes').CLASSES;

    function drawFocusPolish(g, ctx, w, h, pl) {
      if (!isRail(pl, CLASSES)) return;
      var q = clamp(pl.__novaFocus || 0, 0, 1);
      if (q <= 0.01) return;
      var cx = w * 0.5, cy = h * 0.5, ready = q >= 0.92;
      var pulse = 0.78 + Math.sin(performance.now() * 0.018) * 0.22;
      ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * TAU - Math.PI * 0.5;
        var active = i < Math.floor(q * 12 + 0.001);
        var r0 = 38, r1 = active ? 45 : 42;
        ctx.strokeStyle = active ? 'rgba(216,192,255,' + (0.34 + 0.46 * q) + ')' : 'rgba(150,140,175,0.12)';
        ctx.lineWidth = active ? 1.7 : 1;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
      }
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = ready ? 'rgba(255,255,255,' + (0.65 + 0.25 * pulse) + ')' : 'rgba(196,147,255,0.42)';
      ctx.lineWidth = ready ? 1.6 : 1;
      ctx.shadowBlur = ready ? 16 : 8; ctx.shadowColor = ready ? '#ffffff' : VIOLET;
      var rr = ready ? 6.5 : 5;
      ctx.strokeRect(-rr, -rr, rr * 2, rr * 2);
      ctx.rotate(-Math.PI / 4); ctx.textAlign = 'center';
      ctx.font = '800 8px Orbitron,system-ui';
      ctx.fillStyle = ready ? 'rgba(244,236,255,0.92)' : 'rgba(205,185,235,0.66)';
      ctx.fillText(ready ? 'FOCUS READY' : Math.round(q * 100) + '%', 0, 58);
      ctx.restore();
    }

    function drawRailTrails(g, ctx, w, h) {
      for (var i = 0; i < g.bullets.length; i++) {
        var b = g.bullets[i];
        if (!b || !b.__novaRail || b.dead) continue;
        var p = worldToScreen(g, b.x, b.y);
        var pp = worldToScreen(g, b.px == null ? b.x : b.px, b.py == null ? b.y : b.py);
        if ((p.x < -100 && pp.x < -100) || (p.x > w + 100 && pp.x > w + 100) ||
            (p.y < -100 && pp.y < -100) || (p.y > h + 100 && pp.y > h + 100)) continue;
        var dx = p.x - pp.x, dy = p.y - pp.y, len = Math.hypot(dx, dy) || 1;
        var ux = dx / len, uy = dy / len;
        var tail = Math.min(150, 54 + len * 1.8);
        var tx = p.x - ux * tail, ty = p.y - uy * tail;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var gr = ctx.createLinearGradient(tx, ty, p.x, p.y);
        gr.addColorStop(0, 'rgba(176,107,255,0)');
        gr.addColorStop(0.56, 'rgba(196,147,255,0.24)');
        gr.addColorStop(1, 'rgba(244,238,255,0.92)');
        ctx.strokeStyle = gr; ctx.lineWidth = b.__novaFullRail ? 3.2 : 2.2;
        ctx.shadowBlur = b.__novaFullRail ? 18 : 12; ctx.shadowColor = '#d8c0ff';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.52)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x - ux * 13, p.y - uy * 13); ctx.lineTo(p.x + ux * 8, p.y + uy * 8); ctx.stroke();
        ctx.restore();
      }
    }

    function formationGlyph(cls, i, n, ang, radius) {
      var mid = (n - 1) * 0.5, slot = i - mid, ux = Math.cos(ang), uy = Math.sin(ang), px = -uy, py = ux;
      if (cls === 'warden' || cls === 'citadel') {
        var sp = cls === 'citadel' ? 18 : 16;
        return { x:px * slot * sp, y:py * slot * sp };
      }
      if (cls === 'hivemind') {
        var a = i / Math.max(1, n) * TAU + performance.now() * 0.00022;
        return { x:Math.cos(a) * radius, y:Math.sin(a) * radius };
      }
      if (cls === 'overlord') {
        var off = n <= 1 ? 0 : (i / (n - 1) - 0.5) * 1.65;
        var a2 = ang + Math.PI + off;
        return { x:Math.cos(a2) * radius, y:Math.sin(a2) * radius };
      }
      if (cls === 'broodmother') {
        var side = i % 2 ? 1 : -1, rank = Math.floor(i / 2);
        var a3 = ang + Math.PI + side * (0.45 + rank * 0.16);
        return { x:Math.cos(a3) * (radius + rank * 4), y:Math.sin(a3) * (radius + rank * 4) };
      }
      if (cls === 'valkyrie') {
        return { x:px * slot * 16 - ux * Math.abs(slot) * 10, y:py * slot * 16 - uy * Math.abs(slot) * 10 };
      }
      return { x:px * slot * 17 - ux * Math.abs(slot) * 9, y:py * slot * 17 - uy * Math.abs(slot) * 9 };
    }

    function drawControllerPolish(g, ctx, w, h, pl) {
      if (!isController(pl) || !pl.__novaSwarm) return;
      var st = pl.__novaSwarm, own = [], max = (CLASSES[pl.cls] && CLASSES[pl.cls].droneCount) || 0;
      for (var i = 0; i < g.drones.length; i++) if (g.drones[i].ownerId === pl.id && g.drones[i].hp > 0) own.push(g.drones[i]);
      max += pl.swarmT > 0 ? 2 : 0;

      var node = worldToScreen(g, st.nodeX, st.nodeY);
      var nodeOn = node.x > 25 && node.x < w - 25 && node.y > 25 && node.y < h - 25;
      if (st.active && nodeOn) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var pulse = 0.80 + 0.20 * Math.sin(performance.now() * 0.012);
        ctx.strokeStyle = 'rgba(117,240,163,' + (0.16 + 0.08 * pulse) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(node.x, node.y, 24 + st.power * 8, 0, TAU); ctx.stroke();

        var gr = 18 + st.power * 8;
        for (var gi = 0; gi < Math.max(1, own.length); gi++) {
          var gp = formationGlyph(pl.cls, gi, Math.max(1, own.length), st.angle || pl.angle || 0, gr);
          ctx.fillStyle = 'rgba(158,255,193,0.20)';
          ctx.beginPath(); ctx.arc(node.x + gp.x, node.y + gp.y, 2.3, 0, TAU); ctx.fill();
        }

        var counts = {form:0, windup:0, dash:0, recover:0};
        for (var di = 0; di < own.length; di++) {
          var ph = own[di].__novaPhase || 'form';
          if (counts[ph] == null) counts[ph] = 0;
          counts[ph]++;
          var aa = di / Math.max(1, own.length) * TAU - Math.PI * 0.5;
          var col = ph === 'dash' ? '#ffd98a' : ph === 'windup' ? '#ffffff' : ph === 'recover' ? '#6e8f7a' : GREEN;
          ctx.fillStyle = col; ctx.globalAlpha = ph === 'recover' ? 0.45 : 0.88;
          ctx.beginPath(); ctx.arc(node.x + Math.cos(aa) * 14, node.y + Math.sin(aa) * 14, ph === 'dash' ? 2.4 : 1.8, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.shadowBlur = 0;
        ctx.font = '800 7px Orbitron,system-ui'; ctx.fillStyle = 'rgba(205,255,222,0.82)';
        var action = counts.dash ? counts.dash + ' DIVING' : counts.windup ? counts.windup + ' ARMING' : counts.recover ? counts.recover + ' RECOVER' : 'FORMATION';
        ctx.fillText(own.length + '/' + Math.max(max, own.length) + ' LINKED · ' + action, node.x, node.y + 42);
        ctx.restore();
      }

      for (var j = 0; j < g.drones.length; j++) {
        var d = g.drones[j], owner = g.tankById && g.tankById.get(d.ownerId);
        if (!owner || owner.isPlayer || !isController(owner) || !d.__novaCommitted || d.__novaPhase !== 'windup') continue;
        var target = d.__novaTarget;
        if (!target || target.id !== pl.id) continue;
        var dp = worldToScreen(g, d.x, d.y);
        if (dp.x < -30 || dp.x > w + 30 || dp.y < -30 || dp.y > h + 30) continue;
        var len = 72;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var lg = ctx.createLinearGradient(dp.x, dp.y, dp.x + d.__novaDiveDX * len, dp.y + d.__novaDiveDY * len);
        lg.addColorStop(0, 'rgba(255,217,138,0.52)'); lg.addColorStop(1, 'rgba(255,217,138,0)');
        ctx.strokeStyle = lg; ctx.lineWidth = 1.2; ctx.setLineDash([5,5]);
        ctx.beginPath(); ctx.moveTo(dp.x, dp.y); ctx.lineTo(dp.x + d.__novaDiveDX * len, dp.y + d.__novaDiveDY * len); ctx.stroke();
        ctx.restore();
      }
    }

    function patchedRender(g, w, h) {
      oldRender(g, w, h);
      if (!g || !g.ctx || !g.player || !g.player.alive) return;
      var ctx = g.ctx, pl = g.player;
      ctx.save();
      ctx.setTransform(g.dpr || 1, 0, 0, g.dpr || 1, 0, 0);
      drawRailTrails(g, ctx, w, h);
      drawFocusPolish(g, ctx, w, h, pl);
      drawControllerPolish(g, ctx, w, h, pl);
      ctx.restore();
    }
    patchedRender.__novaSignalBloom = true;
    renderMod.render = patchedRender;
  });

  console.info('[NOVA TANKS] v' + VERSION + ' ' + CODENAME + ' feedback polish online');
})();