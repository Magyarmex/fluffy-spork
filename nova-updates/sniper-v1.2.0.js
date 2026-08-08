/* NOVA TANKS v1.2.0 — Silent Horizon
 * Skill-based Railgun counterplay patch.
 * Loaded after bundled module registration and before main boot.
 */
(function () {
  'use strict';

  var mods = window.__novaModules;
  if (!mods) {
    console.error('[NOVA v1.2.0] module registry unavailable; sniper update not installed');
    return;
  }

  var VERSION = '1.2.0';
  var CODENAME = 'Silent Horizon';
  var FULL_CHARGE_MS = 520;
  var SUPPRESS_RADIUS = 34;
  var TAU = Math.PI * 2;

  window.__NOVA_RELEASE__ = {
    version: VERSION,
    codename: CODENAME,
    date: '2026-08-07',
    headline: 'Snipers become readable, lethal skill duels.',
    highlights: [
      'Off-screen Railguns telegraph committed shots with directional glint and spatial audio.',
      'Hold to focus a full-power rail shot; release early for a weaker quick-shot.',
      'Deep focus limits turret agility, enabling movement feints and counter-baits.',
      'Full shots create a real advance window through focus time, reload and origin reveal.',
      'Accurate suppression can break deep focus; random distant spray does not.',
      'Rail rounds now use explicit interception integrity instead of inheriting huge durability from penetration.',
      'Swept projectile collision prevents hypervelocity rounds tunneling through defensive fire.',
      'New synthesized charge, rail-crack, flyby and quick-shot SFX require no external audio files.'
    ]
  };

  function wrapModule(id, after) {
    var original = mods[id];
    if (!original) {
      console.warn('[NOVA v1.2.0] module not found:', id);
      return;
    }
    mods[id] = function (module, exports, require) {
      original(module, exports, require);
      after(module.exports, require);
    };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function angleDelta(target, current) {
    var d = (target - current + Math.PI) % TAU;
    if (d < 0) d += TAU;
    return d - Math.PI;
  }

  function moveAngle(current, target, maxStep) {
    return current + clamp(angleDelta(target, current), -maxStep, maxStep);
  }

  function pointSegmentDist2(px, py, ax, ay, bx, by) {
    var abx = bx - ax;
    var aby = by - ay;
    var den = abx * abx + aby * aby;
    if (den < 1e-8) {
      var dx0 = px - ax;
      var dy0 = py - ay;
      return dx0 * dx0 + dy0 * dy0;
    }
    var t = clamp(((px - ax) * abx + (py - ay) * aby) / den, 0, 1);
    var dx = px - (ax + abx * t);
    var dy = py - (ay + aby * t);
    return dx * dx + dy * dy;
  }

  function sweptBulletHit(a, b, rr) {
    var a0x = a.px == null ? a.x : a.px;
    var a0y = a.py == null ? a.y : a.py;
    var b0x = b.px == null ? b.x : b.px;
    var b0y = b.py == null ? b.y : b.py;
    var r0x = a0x - b0x;
    var r0y = a0y - b0y;
    var rvx = (a.x - a0x) - (b.x - b0x);
    var rvy = (a.y - a0y) - (b.y - b0y);
    var vv = rvx * rvx + rvy * rvy;
    var t = vv > 1e-9 ? clamp(-(r0x * rvx + r0y * rvy) / vv, 0, 1) : 0;
    var dx = r0x + rvx * t;
    var dy = r0y + rvy * t;
    return dx * dx + dy * dy <= rr * rr;
  }

  function worldToScreen(g, x, y) {
    var z = g.cam && g.cam.zoom ? g.cam.zoom : 1;
    return { x: (x - g.cam.x) * z + g.w * 0.5, y: (y - g.cam.y) * z + g.h * 0.5 };
  }

  function isOffscreen(g, t, margin) {
    var p = worldToScreen(g, t.x, t.y);
    margin = margin == null ? 42 : margin;
    return p.x < margin || p.x > g.w - margin || p.y < margin || p.y > g.h - margin;
  }

  function isThreateningPlayer(g, t, maxErr) {
    var pl = g.player;
    if (!pl || !pl.alive || !t || t.isPlayer || !t.alive) return false;
    var want = Math.atan2(pl.y - t.y, pl.x - t.x);
    return Math.abs(angleDelta(want, t.angle)) < (maxErr == null ? 0.20 : maxErr);
  }

  function panFromShooter(g, t) {
    if (!g.player) return 0;
    var dx = t.x - g.player.x;
    var scale = Math.max(420, g.w / Math.max(0.55, g.cam.zoom || 1));
    return clamp(dx / scale, -1, 1);
  }

  wrapModule('game/audio', function (audio) {
    var Sfx = audio.Sfx;
    if (!Sfx || Sfx.prototype.__novaSilentHorizon) return;
    Sfx.prototype.__novaSilentHorizon = true;

    function route(self, node, pan) {
      if (self.ctx && self.ctx.createStereoPanner) {
        var p = self.ctx.createStereoPanner();
        p.pan.value = clamp(pan || 0, -1, 1);
        node.connect(p); p.connect(self.master);
      } else node.connect(self.master);
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
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.018, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); route(self, g, pan); o.start(t0); o.stop(t0 + dur + 0.02);
    }

    function noise(self, dur, gain, pan, hp, lp, delay) {
      self.resume();
      if (!self.ctx || !self.master || self.muted) return;
      var c = self.ctx;
      if (!self.__novaNoise) {
        var n = Math.max(1, Math.floor(c.sampleRate * 0.45));
        var buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
        for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
        self.__novaNoise = buf;
      }
      var t0 = c.currentTime + (delay || 0), src = c.createBufferSource();
      var high = c.createBiquadFilter(), low = c.createBiquadFilter(), g = c.createGain();
      src.buffer = self.__novaNoise;
      high.type = 'highpass'; high.frequency.value = hp || 800;
      low.type = 'lowpass'; low.frequency.value = lp || 9000;
      g.gain.setValueAtTime(Math.max(0.0002, gain), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(high); high.connect(low); low.connect(g); route(self, g, pan);
      src.start(t0); src.stop(t0 + dur + 0.02);
    }

    Sfx.prototype.novaSniperCharge = function (pan, intensity) {
      var q = clamp(intensity == null ? 0.7 : intensity, 0, 1);
      voice(this, 690 + q * 180, 1900 + q * 900, 0.17, 0.018 + q * 0.012, pan, 'sine', 0);
      voice(this, 1380, 2600, 0.12, 0.007, pan, 'triangle', 0.035);
    };
    Sfx.prototype.novaRailIncoming = function (pan, supercharged) {
      noise(this, 0.105, supercharged ? 0.052 : 0.038, pan, 1500, 10500, 0);
      voice(this, supercharged ? 2600 : 2100, 720, 0.13, supercharged ? 0.036 : 0.026, pan, 'sawtooth', 0.008);
    };
    Sfx.prototype.novaRailFire = function (pan, full, supercharged) {
      if (full) {
        voice(this, supercharged ? 150 : 125, 48, 0.22, supercharged ? 0.075 : 0.055, pan, 'sine', 0);
        voice(this, supercharged ? 3400 : 2800, 430, 0.18, supercharged ? 0.055 : 0.042, pan, 'sawtooth', 0.006);
        noise(this, 0.16, supercharged ? 0.075 : 0.055, pan, 850, 12000, 0.002);
        voice(this, 5200, 1300, 0.09, 0.018, pan, 'square', 0.025);
      } else {
        voice(this, 1550, 480, 0.095, 0.026, pan, 'triangle', 0);
        noise(this, 0.07, 0.026, pan, 1800, 11000, 0);
      }
    };

    var oldShoot = Sfx.prototype.shoot;
    Sfx.prototype.shoot = function (mode, isBeam) {
      if (isBeam && this.__novaRailMode) {
        var m = this.__novaRailMode;
        this.novaRailFire(m.pan || 0, m.full !== false, !!m.supercharged);
        return;
      }
      return oldShoot.call(this, mode, isBeam);
    };
  });

  wrapModule('game/engine', function (engine, require) {
    var Game = engine.Game;
    if (!Game || Game.prototype.__novaSilentHorizon) return;
    Game.prototype.__novaSilentHorizon = true;
    var CLASSES = require('./classes').CLASSES;

    if (CLASSES.railgun) CLASSES.railgun.desc = 'Hold to focus a lethal rail shot; release early to quick-shot. Deep focus reveals a glint.';
    if (CLASSES.singularity) CLASSES.singularity.desc = 'Execution rail: extreme focused velocity and penetration, but committed shots reveal their bearing.';
    if (CLASSES.prism) CLASSES.prism.desc = 'Twin focused rails trade one-shot power for faster pressure and quick-shot flexibility.';

    function isRailTank(t) {
      var d = t && CLASSES[t.cls];
      return !!(d && d.fireMode === 'beam');
    }
    function resetFocus(t) {
      if (!t) return;
      t.__novaFocusStart = 0; t.__novaFocus = 0; t.__novaFocusAngle = null;
      t.__novaFocusLast = 0; t.__novaChargeCue = false;
    }
    function annotateNewRails(g, t, before, profile) {
      var q = profile.charge == null ? 1 : profile.charge;
      for (var i = before; i < g.bullets.length; i++) {
        var b = g.bullets[i];
        if (!b || b.ownerId !== t.id || !b.beam) continue;
        b.__novaRail = true; b.__novaFullRail = !!profile.full; b.__novaCharge = q;
        if (!profile.full) {
          var dmgMul = 0.40 + 0.40 * q, speedMul = 0.72 + 0.20 * q, penMul = 0.42 + 0.40 * q;
          b.dmg *= dmgMul; b.vx *= speedMul; b.vy *= speedMul;
          b.pen = Math.max(2, Math.round(b.pen * penMul));
          b.r *= 0.86 + 0.08 * q;
          t.fireCd *= 0.62 + 0.18 * q;
        }
        b.baseDmg = b.dmg;
        b.maxHp = profile.full ? (t.supercharge ? 27 : 20) : (8 + 8 * q);
        b.hp = b.maxHp;
      }
      if (profile.full) {
        t.__novaRevealUntil = g.time + (t.supercharge ? 0.95 : 0.70);
        t.__novaLastFullShot = g.time;
      } else t.__novaRevealUntil = g.time + 0.30;
    }

    var oldTryFire = Game.prototype.tryFire;
    function fireRail(g, t, full, charge) {
      var before = g.bullets.length, pan = t.isPlayer ? 0 : panFromShooter(g, t);
      g.sfx.__novaRailMode = { full: full, pan: pan, supercharged: !!t.supercharge };
      oldTryFire.call(g, t);
      g.sfx.__novaRailMode = null;
      annotateNewRails(g, t, before, { full: full, charge: charge });
      if (!t.isPlayer && isThreateningPlayer(g, t, full ? 0.18 : 0.13)) {
        g.sfx.novaRailIncoming(pan, !!t.supercharge);
        if (full && isOffscreen(g, t, 36) && navigator.vibrate) {
          try { navigator.vibrate(t.supercharge ? 14 : 8); } catch (_) {}
        }
      }
    }

    Game.prototype.tryFire = function (t) {
      if (!isRailTank(t)) return oldTryFire.call(this, t);
      if (!t || !t.alive || t.fireCd > 0) return;
      var now = performance.now();
      if (t.__novaSuppressedUntil && now < t.__novaSuppressedUntil) return;
      if (!t.__novaFocusStart) {
        t.__novaFocusStart = now; t.__novaFocusLast = now; t.__novaFocusAngle = t.angle;
        t.__novaFocus = 0.001; t.__novaChargeCue = false; return;
      }
      var elapsed = now - t.__novaFocusStart, q = clamp(elapsed / FULL_CHARGE_MS, 0, 1);
      var dt = clamp((now - (t.__novaFocusLast || now)) / 1000, 0, 0.05);
      t.__novaFocusLast = now; t.__novaFocus = q;
      if (q >= 0.38) {
        var desired = t.angle;
        if (t.__novaFocusAngle == null) t.__novaFocusAngle = desired;
        var turnRate = q < 0.68 ? 2.8 : q < 0.86 ? 1.45 : 0.70;
        t.__novaFocusAngle = moveAngle(t.__novaFocusAngle, desired, turnRate * dt);
        t.angle = t.__novaFocusAngle;
      } else t.__novaFocusAngle = t.angle;
      if (!t.isPlayer && q >= 0.58 && !t.__novaChargeCue && isOffscreen(this, t, 38) && isThreateningPlayer(this, t, 0.24)) {
        t.__novaChargeCue = true;
        this.sfx.novaSniperCharge(panFromShooter(this, t), q);
      }
      if (q < 1) return;
      resetFocus(t);
      fireRail(this, t, true, 1);
    };

    var oldIntegrity = Game.prototype.initBulletIntegrity;
    Game.prototype.initBulletIntegrity = function (b) {
      if (b && b.__novaRail) {
        if (b.maxHp === undefined || b.hp === undefined || b.baseDmg === undefined) {
          b.baseDmg = b.dmg; b.maxHp = b.__novaFullRail ? 20 : 10; b.hp = b.maxHp;
        }
        return;
      }
      return oldIntegrity.call(this, b);
    };

    Game.prototype.resolveBulletCollisions = function () {
      for (var i = this.bullets.length - 1; i >= 0; i--) {
        var a = this.bullets[i];
        if (!a || a.dead) continue;
        this.initBulletIntegrity(a);
        for (var j = i - 1; j >= 0; j--) {
          var b = this.bullets[j];
          if (!b || b.dead || b.ownerId === a.ownerId) continue;
          this.initBulletIntegrity(b);
          var rr = a.r + b.r + 1.5, dx = a.x - b.x, dy = a.y - b.y;
          if (dx * dx + dy * dy > rr * rr && !sweptBulletHit(a, b, rr)) continue;
          var ah = a.hp || 0, bh = b.hp || 0;
          this.weakenBullet(a, bh); this.weakenBullet(b, ah);
          var mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5;
          if (this.addParticles) this.addParticles(mx, my, '#d9f7ff', 3, 55, 'glow');
          if (a.dead) break;
        }
      }
    };

    var oldUpdate = Game.prototype.update;
    Game.prototype.update = function (dt) {
      var plBefore = this.player;
      var wasHeld = !!this.__novaPlayerHeldFire;
      var focusBefore = plBefore && plBefore.__novaFocusStart ? { rail: isRailTank(plBefore) } : null;
      oldUpdate.call(this, dt);
      var pl = this.player;
      var heldAfter = !!(this.input && (this.input.firing || this.input.autofire));
      if (pl && pl.alive && focusBefore && focusBefore.rail && wasHeld && !heldAfter && pl.fireCd <= 0 && pl.__novaFocusStart) {
        var q = clamp((performance.now() - pl.__novaFocusStart) / FULL_CHARGE_MS, 0.05, 0.96);
        resetFocus(pl); fireRail(this, pl, false, q);
      }
      this.__novaPlayerHeldFire = heldAfter;
      var now = performance.now();
      for (var ti = 0; ti < this.tanks.length; ti++) {
        var t = this.tanks[ti];
        if (!t || !t.alive || !isRailTank(t) || !t.__novaFocusStart || (t.__novaFocus || 0) < 0.24) continue;
        var broke = t.hitFlash > 0.08;
        if (!broke) {
          for (var bi = 0; bi < this.bullets.length; bi++) {
            var bullet = this.bullets[bi];
            if (!bullet || bullet.dead || bullet.ownerId === t.id) continue;
            if (!bullet.__novaSuppressed) bullet.__novaSuppressed = Object.create(null);
            if (bullet.__novaSuppressed[t.id]) continue;
            var rad = SUPPRESS_RADIUS + (bullet.r || 0);
            if (pointSegmentDist2(t.x, t.y, bullet.px == null ? bullet.x : bullet.px, bullet.py == null ? bullet.y : bullet.py, bullet.x, bullet.y) <= rad * rad) {
              bullet.__novaSuppressed[t.id] = 1; broke = true; break;
            }
          }
        }
        if (broke) {
          var wasDeep = (t.__novaFocus || 0) >= 0.48;
          resetFocus(t); t.__novaSuppressedUntil = now + (wasDeep ? 280 : 150);
          if (t.isPlayer && this.addText) this.addText(t.x, t.y - 34, 'FOCUS BROKEN', '#ff8aa0', 12);
          if (this.addParticles) this.addParticles(t.x, t.y, '#d9f7ff', wasDeep ? 7 : 4, 70, 'glow');
        }
      }
      if (pl && isRailTank(pl) && !heldAfter && pl.__novaFocusStart && !wasHeld) resetFocus(pl);
    };
  });

  wrapModule('game/render', function (renderMod) {
    var oldRender = renderMod.render;
    if (!oldRender || oldRender.__novaSilentHorizon) return;
    function edgePoint(w, h, ang, pad) {
      var cx = w * 0.5, cy = h * 0.5, dx = Math.cos(ang), dy = Math.sin(ang);
      var rx = Math.max(1, cx - pad), ry = Math.max(1, cy - pad);
      var s = 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry);
      return { x: cx + dx * s, y: cy + dy * s };
    }
    function drawGlint(ctx, x, y, ang, q, reveal, supercharged) {
      var pulse = 0.72 + 0.28 * Math.sin(performance.now() * 0.025);
      var alpha = clamp((q - 0.42) / 0.58, 0.18, 1) * pulse;
      if (reveal) alpha = Math.max(alpha, 0.78);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = supercharged ? 26 : 18; ctx.shadowColor = supercharged ? '#fff0a8' : '#d8c0ff';
      ctx.strokeStyle = supercharged ? 'rgba(255,240,168,' + alpha + ')' : 'rgba(220,198,255,' + alpha + ')';
      ctx.fillStyle = '#ffffff'; ctx.lineWidth = supercharged ? 2.5 : 1.8;
      ctx.beginPath(); ctx.moveTo(-13 - q * 8, 0); ctx.lineTo(13 + q * 8, 0); ctx.moveTo(0, -5 - q * 3); ctx.lineTo(0, 5 + q * 3); ctx.stroke();
      ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(0, 0, supercharged ? 2.8 : 2.1, 0, TAU); ctx.fill(); ctx.restore();
    }
    function patchedRender(g, w, h) {
      oldRender(g, w, h);
      if (!g || !g.ctx || !g.player || !g.player.alive) return;
      var ctx = g.ctx, pl = g.player;
      ctx.save(); ctx.setTransform(g.dpr || 1, 0, 0, g.dpr || 1, 0, 0);
      if (pl.__novaFocus > 0.01) {
        var q0 = clamp(pl.__novaFocus, 0, 1), cx = w * 0.5, cy = h * 0.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(196,147,255,' + (0.28 + q0 * 0.64) + ')';
        ctx.lineWidth = 1.5 + q0; ctx.shadowBlur = 10 + q0 * 12; ctx.shadowColor = '#b06bff';
        ctx.beginPath(); ctx.arc(cx, cy, 31 + q0 * 4, -Math.PI * 0.75, -Math.PI * 0.75 + TAU * q0); ctx.stroke();
      }
      for (var i = 0; i < g.tanks.length; i++) {
        var t = g.tanks[i];
        if (!t || !t.alive || t.isPlayer) continue;
        var q = t.__novaFocus || 0, revealing = !!(t.__novaRevealUntil && t.__novaRevealUntil > g.time);
        if (q < 0.48 && !revealing) continue;
        var screen = worldToScreen(g, t.x, t.y);
        var off = screen.x < 30 || screen.x > w - 30 || screen.y < 30 || screen.y > h - 30;
        if (!off || (!revealing && !isThreateningPlayer(g, t, 0.25))) continue;
        var ang = Math.atan2(screen.y - h * 0.5, screen.x - w * 0.5), ep = edgePoint(w, h, ang, 18);
        drawGlint(ctx, ep.x, ep.y, ang, Math.max(q, revealing ? 0.72 : 0), revealing, !!t.supercharge);
        if (revealing) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(176,107,255,0.20)'; ctx.lineWidth = 1; ctx.setLineDash([7, 12]);
          ctx.beginPath(); ctx.moveTo(ep.x, ep.y); ctx.lineTo(w * 0.5 + Math.cos(ang) * Math.min(w, h) * 0.16, h * 0.5 + Math.sin(ang) * Math.min(w, h) * 0.16); ctx.stroke(); ctx.restore();
        }
      }
      ctx.restore();
    }
    patchedRender.__novaSilentHorizon = true;
    renderMod.render = patchedRender;
  });

  console.info('[NOVA TANKS] v' + VERSION + ' ' + CODENAME + ' sniper systems armed');
})();
