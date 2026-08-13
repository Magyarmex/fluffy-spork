/* NOVA TANKS v1.3.0 — Second Body
 * Controller lineage skill-expression rework.
 * Twin-stick Swarm Vectoring, command depth, designation, formation geometry,
 * readable attack runs, recall, momentum, and AI parity.
 */
(function () {
  'use strict';

  var mods = window.__novaModules;
  if (!mods) {
    console.error('[NOVA v1.3.0] module registry unavailable; controller update not installed');
    return;
  }

  var VERSION = '1.3.0';
  var CODENAME = 'Second Body';
  var TAU = Math.PI * 2;
  var MAP_LIMIT = 2250;
  var GREEN = '#75f0a3';
  var GREEN2 = '#54e38a';

  var CONTROLLER_IDS = {
    carrier: 1, overlord: 1, warden: 1,
    hivemind: 1, broodmother: 1, citadel: 1, valkyrie: 1
  };

  var PROFILES = {
    carrier: {
      formation: 'wedge', response: 8.2, engage: 155, ready: 88,
      cadence: 0.40, windup: 0.30, lock: 0.105, dash: 0.34,
      diveSpeed: 1.78, diveDamage: 1.48, recover: 0.66, formationRadius: 76
    },
    overlord: {
      formation: 'crescent', response: 6.5, engage: 185, ready: 96,
      cadence: 0.245, windup: 0.31, lock: 0.105, dash: 0.36,
      diveSpeed: 1.86, diveDamage: 1.40, recover: 0.67, formationRadius: 104
    },
    warden: {
      formation: 'wall', response: 6.9, engage: 165, ready: 82,
      cadence: 0.36, windup: 0.34, lock: 0.12, dash: 0.36,
      diveSpeed: 1.60, diveDamage: 1.44, recover: 0.76, formationRadius: 68
    },
    hivemind: {
      formation: 'ring', response: 5.9, engage: 205, ready: 105,
      cadence: 0.17, windup: 0.27, lock: 0.09, dash: 0.36,
      diveSpeed: 1.78, diveDamage: 1.27, recover: 0.58, formationRadius: 112
    },
    broodmother: {
      formation: 'claw', response: 6.6, engage: 190, ready: 98,
      cadence: 0.22, windup: 0.27, lock: 0.09, dash: 0.37,
      diveSpeed: 1.98, diveDamage: 1.58, recover: 0.62, formationRadius: 98
    },
    citadel: {
      formation: 'wall', response: 5.8, engage: 180, ready: 84,
      cadence: 0.32, windup: 0.37, lock: 0.13, dash: 0.38,
      diveSpeed: 1.48, diveDamage: 1.42, recover: 0.82, formationRadius: 78
    },
    valkyrie: {
      formation: 'wing', response: 9.0, engage: 205, ready: 92,
      cadence: 0.18, windup: 0.215, lock: 0.07, dash: 0.32,
      diveSpeed: 2.30, diveDamage: 1.38, recover: 0.47, formationRadius: 86
    }
  };

  window.__NOVA_CONTROLLER_RELEASE__ = {
    version: VERSION,
    codename: CODENAME,
    date: '2026-08-07',
    headline: 'Controllers stop being pets and become a second body.',
    highlights: [
      'Right-stick direction commands the swarm; stick depth controls deployment range; release recalls it.',
      'Controller drones farm shapes autonomously, but serious PvP pressure must be actively commanded.',
      'Command Nodes create spatial formations instead of nearest-target chasing.',
      'Direct gun hits designate targets for coordinated pressure without becoming a hard lock.',
      'Drones attack through telegraphed wind-up, committed dive, overshoot and recovery phases.',
      'Dive trajectories lock before impact, allowing movement feints, dodges and counter-baits.',
      'Shooting a winding-up drone interrupts its run; drones retain real HP and can be destroyed.',
      'Carrier, Overlord, Warden, Hivemind, Broodmother, Citadel and Valkyrie use distinct formation geometries.',
      'AI Controllers obey the same command, commitment and recovery rules rather than receiving autonomous perfect swarms.',
      'New procedural command, designation, wind-up, launch and recall SFX make swarm intent readable.'
    ]
  };

  function wrapModule(id, after) {
    var original = mods[id];
    if (!original) {
      console.warn('[NOVA v1.3.0] module not found:', id);
      return;
    }
    mods[id] = function (module, exports, require) {
      original(module, exports, require);
      after(module.exports, require);
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var x = bx - ax, y = by - ay; return x * x + y * y; }
  function validEntity(e) {
    return !!e && (e.kind === 'tank' ? !!e.alive : (e.hp == null || e.hp > 0));
  }
  function pointSegmentDist2(px, py, ax, ay, bx, by) {
    var abx = bx - ax, aby = by - ay;
    var den = abx * abx + aby * aby;
    if (den < 1e-8) return dist2(px, py, ax, ay);
    var t = clamp(((px - ax) * abx + (py - ay) * aby) / den, 0, 1);
    return dist2(px, py, ax + abx * t, ay + aby * t);
  }
  function worldToScreen(g, x, y) {
    var z = g.cam && g.cam.zoom ? g.cam.zoom : 1;
    return { x: (x - g.cam.x) * z + g.w * 0.5, y: (y - g.cam.y) * z + g.h * 0.5 };
  }
  function edgePoint(w, h, ang, pad) {
    var cx = w * 0.5, cy = h * 0.5, dx = Math.cos(ang), dy = Math.sin(ang);
    var rx = Math.max(1, cx - pad), ry = Math.max(1, cy - pad);
    var s = 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry);
    return { x: cx + dx * s, y: cy + dy * s };
  }
  function panFrom(g, x) {
    if (!g.player) return 0;
    var scale = Math.max(420, g.w / Math.max(0.55, g.cam.zoom || 1));
    return clamp((x - g.player.x) / scale, -1, 1);
  }

  function isController(t) { return !!(t && CONTROLLER_IDS[t.cls]); }
  function profileFor(t) { return PROFILES[t.cls] || PROFILES.carrier; }
  function controllerState(t) {
    if (!t.__novaSwarm) {
      t.__novaSwarm = {
        active: false, wasActive: false,
        nodeX: t.x, nodeY: t.y, angle: t.angle || 0, power: 0,
        target: null, targetId: -1,
        markId: -1, markUntil: 0,
        strikeAt: 0, strikeSide: 1,
        recallUntil: 0, aiRetargetAt: 0,
        tutorialUntil: 0, lastCommandCue: -99, lastRecallCue: -99,
        lastMarkCue: -99
      };
    }
    return t.__novaSwarm;
  }

  function maxCommandRange(t, def) {
    var leash = (def && def.droneLeash) || 650;
    var bonus = t.swarmT > 0 ? 1.12 : 1;
    return Math.max(170, leash * 0.88 * bonus);
  }

  function clampNode(owner, x, y, maxRange) {
    var dx = x - owner.x, dy = y - owner.y, d = Math.hypot(dx, dy);
    if (d > maxRange && d > 0) {
      x = owner.x + dx / d * maxRange;
      y = owner.y + dy / d * maxRange;
    }
    return {
      x: clamp(x, -MAP_LIMIT + 40, MAP_LIMIT - 40),
      y: clamp(y, -MAP_LIMIT + 40, MAP_LIMIT - 40)
    };
  }

  wrapModule('game/audio', function (audio) {
    var Sfx = audio.Sfx;
    if (!Sfx || Sfx.prototype.__novaSecondBody) return;
    Sfx.prototype.__novaSecondBody = true;

    function route(self, node, pan) {
      if (!self.ctx || !self.master) return;
      if (self.ctx.createStereoPanner) {
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
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.018, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); route(self, g, pan); o.start(t0); o.stop(t0 + dur + 0.025);
    }
    function noise(self, dur, gain, pan, hp, lp, delay) {
      self.resume();
      if (!self.ctx || !self.master || self.muted) return;
      var c = self.ctx;
      if (!self.__novaControllerNoise) {
        var n = Math.max(1, Math.floor(c.sampleRate * 0.35));
        var buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
        for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
        self.__novaControllerNoise = buf;
      }
      var t0 = c.currentTime + (delay || 0), src = c.createBufferSource();
      var high = c.createBiquadFilter(), low = c.createBiquadFilter(), g = c.createGain();
      src.buffer = self.__novaControllerNoise;
      high.type = 'highpass'; high.frequency.value = hp || 500;
      low.type = 'lowpass'; low.frequency.value = lp || 8000;
      g.gain.setValueAtTime(Math.max(0.0002, gain), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(high); high.connect(low); low.connect(g); route(self, g, pan);
      src.start(t0); src.stop(t0 + dur + 0.025);
    }

    Sfx.prototype.novaSwarmCommand = function () {
      var now = performance.now();
      if (this.__novaLastCommand && now - this.__novaLastCommand < 180) return;
      this.__novaLastCommand = now;
      voice(this, 520, 920, 0.10, 0.028, 0, 'triangle', 0);
      voice(this, 780, 1250, 0.08, 0.014, 0, 'sine', 0.045);
    };
    Sfx.prototype.novaSwarmRecall = function () {
      var now = performance.now();
      if (this.__novaLastRecall && now - this.__novaLastRecall < 220) return;
      this.__novaLastRecall = now;
      voice(this, 820, 360, 0.14, 0.026, 0, 'triangle', 0);
      voice(this, 540, 280, 0.11, 0.012, 0, 'sine', 0.035);
    };
    Sfx.prototype.novaDesignate = function () {
      var now = performance.now();
      if (this.__novaLastMark && now - this.__novaLastMark < 160) return;
      this.__novaLastMark = now;
      voice(this, 1120, 1580, 0.07, 0.026, 0, 'sine', 0);
      voice(this, 1580, 1180, 0.08, 0.017, 0, 'square', 0.05);
    };
    Sfx.prototype.novaDroneWindup = function (pan, hostile, fast) {
      var now = performance.now();
      if (this.__novaLastDroneWind && now - this.__novaLastDroneWind < (hostile ? 85 : 115)) return;
      this.__novaLastDroneWind = now;
      voice(this, fast ? 980 : 720, fast ? 1900 : 1500, fast ? 0.10 : 0.15, hostile ? 0.026 : 0.018, pan, 'triangle', 0);
      if (hostile) voice(this, 1800, 980, 0.10, 0.011, pan, 'sine', 0.035);
    };
    Sfx.prototype.novaDroneLaunch = function (pan, hostile, fast) {
      var now = performance.now();
      if (this.__novaLastDroneLaunch && now - this.__novaLastDroneLaunch < 75) return;
      this.__novaLastDroneLaunch = now;
      noise(this, fast ? 0.075 : 0.10, hostile ? 0.026 : 0.018, pan, 1000, 9000, 0);
      voice(this, fast ? 1350 : 1050, 260, fast ? 0.09 : 0.12, hostile ? 0.022 : 0.015, pan, 'sawtooth', 0);
    };
  });

  wrapModule('game/engine', function (engine, require) {
    var Game = engine.Game;
    if (!Game || Game.prototype.__novaSecondBody) return;
    Game.prototype.__novaSecondBody = true;

    var classMod = require('./classes');
    var CLASSES = classMod.CLASSES;
    var ABILITIES = classMod.ABILITIES;

    if (CLASSES.carrier) CLASSES.carrier.desc = '3 command-vector hunters. Aim to place the swarm; stick depth sets range; release recalls.';
    if (CLASSES.overlord) CLASSES.overlord.desc = '6 hunters form a far-side crescent for encirclement and staggered attack runs.';
    if (CLASSES.warden) CLASSES.warden.desc = '4 armored hunters form a movable phalanx: point the stick to place your shield line.';
    if (CLASSES.hivemind) CLASSES.hivemind.desc = 'Nine hunters form a living ring. Master spacing, crossfire timing and recall.';
    if (CLASSES.broodmother) CLASSES.broodmother.desc = 'Six brutal hunters attack from twin claws; fast respawns reward calculated sacrifice.';
    if (CLASSES.citadel) CLASSES.citadel.desc = 'Six armored hunters become a slow, movable wall that can screen lanes and counter-dive.';
    if (CLASSES.valkyrie) CLASSES.valkyrie.desc = 'Five lightning hunters fly a cavalry wing with very fast, highly committed attack runs.';
    if (ABILITIES && ABILITIES.swarm) ABILITIES.swarm.desc = 'Overclock the commanded swarm: +2 hunters, faster repositioning and tighter attack cadence.';

    var oldTryFire = Game.prototype.tryFire;
    Game.prototype.tryFire = function (t) {
      var before = this.bullets ? this.bullets.length : 0;
      var result = oldTryFire.call(this, t);
      if (isController(t) && this.bullets) {
        for (var i = before; i < this.bullets.length; i++) {
          var b = this.bullets[i];
          if (b && b.ownerId === t.id) b.__novaDesignator = true;
        }
      }
      return result;
    };

    function findDesignatorAt(g, killerId, victim) {
      if (!g.bullets || !victim) return false;
      var vr = ((CLASSES[victim.cls] && CLASSES[victim.cls].size) || 15) + 12;
      for (var i = 0; i < g.bullets.length; i++) {
        var b = g.bullets[i];
        if (!b || b.dead || b.ownerId !== killerId || !b.__novaDesignator) continue;
        var rr = vr + (b.r || 0);
        if (dist2(b.x, b.y, victim.x, victim.y) <= rr * rr) return true;
      }
      return false;
    }

    var oldDamageTank = Game.prototype.damageTank;
    Game.prototype.damageTank = function (victim, dmg, killerId, kx, ky) {
      var killer = killerId >= 0 && this.tankById ? this.tankById.get(killerId) : null;
      var designate = !!(killer && isController(killer) && this.__novaDroneDamageOwner !== killerId && victim && victim.spawnShieldT <= 0 && findDesignatorAt(this, killerId, victim));
      var out = oldDamageTank.call(this, victim, dmg, killerId, kx, ky);
      if (designate && victim && victim.alive && killer && killer.alive) {
        var s = controllerState(killer);
        s.markId = victim.id;
        s.markUntil = this.time + 2.35;
        if (killer.isPlayer && this.time - s.lastMarkCue > 0.18) {
          s.lastMarkCue = this.time;
          if (this.sfx.novaDesignate) this.sfx.novaDesignate();
          if (this.addRing) this.addRing(victim.x, victim.y, '#9dffc0', 28);
          if (this.addText) this.addText(victim.x, victim.y - 28, 'DESIGNATED', '#9dffc0', 10);
        }
      }
      return out;
    };

    var oldSetClass = Game.prototype.setClass;
    Game.prototype.setClass = function (t, id) {
      var was = isController(t);
      var out = oldSetClass.call(this, t, id);
      if (isController(t)) {
        var s = controllerState(t);
        if (!was && t.isPlayer) {
          s.tutorialUntil = this.time + 11;
          s.recallUntil = this.time + 0.6;
          if (this.toast) this.toast('❖ SWARM LINKED — AIM TO COMMAND · DEPTH = RANGE · RELEASE = RECALL', 'info');
          if (this.sfx.novaSwarmCommand) this.sfx.novaSwarmCommand();
        }
      }
      return out;
    };

    function updatePlayerCommand(g, owner, state, def, dt) {
      var input = g.input;
      var maxR = maxCommandRange(owner, def);
      var active = false, x = owner.x, y = owner.y, power = 0, ang = state.angle;
      if (input && input.aim && input.aim.active) {
        var dx = input.aim.dx || 0, dy = input.aim.dy || 0;
        var m = Math.hypot(dx, dy);
        if (m > 4) {
          active = true;
          ang = Math.atan2(dy, dx);
          power = clamp((m - 4) / 47, 0.04, 1);
          var r = 58 + power * (maxR - 58);
          x = owner.x + Math.cos(ang) * r;
          y = owner.y + Math.sin(ang) * r;
        }
      } else if (input && input.mouseActive && input.firing) {
        var rect = g.canvas.getBoundingClientRect();
        var wx = g.cam.x + (input.mouseX - rect.left - g.w * 0.5) / (g.zoom || 1);
        var wy = g.cam.y + (input.mouseY - rect.top - g.h * 0.5) / (g.zoom || 1);
        var mdx = wx - owner.x, mdy = wy - owner.y, md = Math.hypot(mdx, mdy);
        if (md > 5) {
          active = true;
          ang = Math.atan2(mdy, mdx);
          power = clamp(md / maxR, 0.04, 1);
          x = wx; y = wy;
        }
      }
      if (active) {
        var p = clampNode(owner, x, y, maxR);
        state.nodeX = p.x; state.nodeY = p.y; state.angle = ang; state.power = power;
        if (!state.wasActive) {
          state.strikeAt = Math.min(state.strikeAt || g.time, g.time + 0.08);
          if (g.time - state.lastCommandCue > 0.2 && g.sfx.novaSwarmCommand) {
            state.lastCommandCue = g.time; g.sfx.novaSwarmCommand();
          }
        }
      } else {
        state.nodeX = owner.x; state.nodeY = owner.y; state.power = 0;
        if (state.wasActive) {
          state.recallUntil = g.time + 0.78;
          if (g.time - state.lastRecallCue > 0.25 && g.sfx.novaSwarmRecall) {
            state.lastRecallCue = g.time; g.sfx.novaSwarmRecall();
          }
        }
      }
      state.active = active;
      state.wasActive = active;
    }

    function updateAICommand(g, owner, state, def, dt) {
      var ai = owner.ai;
      var maxR = maxCommandRange(owner, def);
      var target = ai && ai.targetId >= 0 ? g.getTank(ai.targetId) : null;
      var active = false, tx = owner.x, ty = owner.y;
      if (target && target.alive && ai.state === 'hunt') {
        active = true;
        var dx = target.x - owner.x, dy = target.y - owner.y, d = Math.hypot(dx, dy) || 1;
        var ux = dx / d, uy = dy / d, px = -uy, py = ux;
        var lead = ai.isElite ? 0.22 : 0.11;
        var flank = Math.min(130, 48 + d * (ai.isElite ? 0.10 : 0.06));
        var side = ai.strafe || 1;
        tx = target.x + target.vx * lead + px * flank * side;
        ty = target.y + target.vy * lead + py * flank * side;
      } else if (ai && ai.state === 'flee') {
        var threat = g.nearestTank(owner.x, owner.y, 700, owner.id);
        if (threat) {
          active = true;
          var a = Math.atan2(threat.y - owner.y, threat.x - owner.x);
          tx = owner.x + Math.cos(a) * Math.min(155, maxR * 0.32);
          ty = owner.y + Math.sin(a) * Math.min(155, maxR * 0.32);
        }
      }
      if (active) {
        var p = clampNode(owner, tx, ty, maxR);
        var k = 1 - Math.exp(-(ai && ai.isElite ? 8.5 : 5.2) * dt);
        state.nodeX = lerp(state.nodeX == null ? owner.x : state.nodeX, p.x, k);
        state.nodeY = lerp(state.nodeY == null ? owner.y : state.nodeY, p.y, k);
        state.angle = Math.atan2(state.nodeY - owner.y, state.nodeX - owner.x);
        state.power = clamp(Math.hypot(state.nodeX - owner.x, state.nodeY - owner.y) / maxR, 0, 1);
      } else {
        state.nodeX = owner.x; state.nodeY = owner.y; state.power = 0;
        if (state.wasActive) state.recallUntil = g.time + 0.55;
      }
      state.active = active;
      state.wasActive = active;
    }

    function updateCommand(g, owner, dt) {
      var state = controllerState(owner), def = CLASSES[owner.cls];
      if (owner.isPlayer) updatePlayerCommand(g, owner, state, def, dt);
      else updateAICommand(g, owner, state, def, dt);
      if (state.markUntil <= g.time) { state.markId = -1; state.markUntil = 0; }
      return state;
    }

    function controllerTarget(g, owner, state, profile) {
      if (!state.active) return null;
      var def = CLASSES[owner.cls], leash = ((def && def.droneLeash) || 650) * (owner.swarmT > 0 ? 1.25 : 1);
      var marked = state.markId >= 0 && state.markUntil > g.time ? g.getTank(state.markId) : null;
      if (marked && marked.alive && dist2(owner.x, owner.y, marked.x, marked.y) <= leash * leash) {
        var mr = profile.engage * 1.85;
        if (dist2(state.nodeX, state.nodeY, marked.x, marked.y) <= mr * mr) return marked;
      }
      var best = null, bestScore = Infinity, r = profile.engage * (owner.swarmT > 0 ? 1.15 : 1), r2 = r * r;
      for (var i = 0; i < g.tanks.length; i++) {
        var t = g.tanks[i];
        if (!t || !t.alive || t.id === owner.id || t.spawnShieldT > 0) continue;
        var nd = dist2(state.nodeX, state.nodeY, t.x, t.y);
        if (nd > r2 || dist2(owner.x, owner.y, t.x, t.y) > leash * leash) continue;
        var score = nd;
        if (t.id === state.markId && state.markUntil > g.time) score *= 0.25;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      if (best) return best;
      var dr = r * 0.78, dr2 = dr * dr;
      for (var j = 0; j < g.drones.length; j++) {
        var d = g.drones[j];
        if (!d || d.hp <= 0 || d.ownerId === owner.id) continue;
        var dd = dist2(state.nodeX, state.nodeY, d.x, d.y);
        if (dd < dr2 && dd < bestScore) { bestScore = dd; best = d; }
      }
      return best;
    }

    function squadFor(map, ownerId) {
      var a = map[ownerId];
      if (!a) a = map[ownerId] = [];
      return a;
    }

    function formationPoint(g, owner, d, squad, target, state, profile) {
      var n = Math.max(1, squad.length), idx = Math.max(0, squad.indexOf(d));
      var dir = state.angle || owner.angle || 0, ux = Math.cos(dir), uy = Math.sin(dir), px = -uy, py = ux;
      var cx = state.nodeX, cy = state.nodeY, mid = (n - 1) * 0.5;
      var slot = idx - mid;
      if (profile.formation === 'wall') {
        var spacing = owner.cls === 'citadel' ? 39 : 35;
        var tight = owner.bulwarkT > 0 ? 0.78 : 1;
        return { x: cx + px * slot * spacing * tight - ux * Math.abs(slot) * 2.5,
                 y: cy + py * slot * spacing * tight - uy * Math.abs(slot) * 2.5 };
      }
      if (profile.formation === 'crescent' && target && target.kind === 'tank') {
        var towardOwner = Math.atan2(owner.y - target.y, owner.x - target.x);
        var far = towardOwner + Math.PI;
        var spread = 1.62;
        var off = n <= 1 ? 0 : (idx / (n - 1) - 0.5) * spread;
        var rr = profile.formationRadius + Math.abs(slot) * 2;
        return { x: target.x + Math.cos(far + off) * rr, y: target.y + Math.sin(far + off) * rr };
      }
      if (profile.formation === 'ring' && target && target.kind === 'tank') {
        var rot = g.time * 0.33;
        var aa = rot + idx / n * TAU;
        var rr2 = profile.formationRadius + (idx % 2 ? 7 : -4);
        return { x: target.x + Math.cos(aa) * rr2, y: target.y + Math.sin(aa) * rr2 };
      }
      if (profile.formation === 'claw' && target && target.kind === 'tank') {
        var away = Math.atan2(owner.y - target.y, owner.x - target.x) + Math.PI;
        var side = idx % 2 === 0 ? -1 : 1;
        var rank = Math.floor(idx / 2);
        var off2 = side * (0.42 + rank * 0.18);
        var rr3 = profile.formationRadius + rank * 9;
        return { x: target.x + Math.cos(away + off2) * rr3, y: target.y + Math.sin(away + off2) * rr3 };
      }
      if (profile.formation === 'wing') {
        var lateral = slot * 33;
        var back = Math.abs(slot) * 20;
        return { x: cx + px * lateral - ux * back, y: cy + py * lateral - uy * back };
      }
      var lateral2 = slot * 36;
      var back2 = Math.abs(slot) * 19;
      return { x: cx + px * lateral2 - ux * back2, y: cy + py * lateral2 - uy * back2 };
    }

    function steerDrone(d, tx, ty, speed, response, dt) {
      var dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy) || 1;
      if (d.__novaVX == null) { d.__novaVX = 0; d.__novaVY = 0; }
      var desired = Math.min(speed, dist * 5.2);
      var dvx = dx / dist * desired, dvy = dy / dist * desired;
      var k = 1 - Math.exp(-Math.max(1.5, response) * dt);
      d.__novaVX = lerp(d.__novaVX, dvx, k);
      d.__novaVY = lerp(d.__novaVY, dvy, k);
      d.__novaPrevX = d.x; d.__novaPrevY = d.y;
      d.x += d.__novaVX * dt;
      d.y += d.__novaVY * dt;
      if (Math.abs(d.__novaVX) + Math.abs(d.__novaVY) > 2) d.angle = Math.atan2(d.__novaVY, d.__novaVX);
    }

    function orbitOwner(g, owner, d, squad, profile, dt) {
      var n = Math.max(1, squad.length), idx = Math.max(0, squad.indexOf(d));
      var rr = 54 + Math.min(36, n * 3.5);
      var a = idx / n * TAU + g.time * (owner.cls === 'hivemind' ? 0.55 : 0.8);
      steerDrone(d, owner.x + Math.cos(a) * rr, owner.y + Math.sin(a) * rr,
        d.speed * 1.18, profile.response + 1.2, dt);
    }

    function acquireFarmShape(g, d, owner) {
      var best = null, bd = Math.min(520, d.leash || 520); bd *= bd;
      for (var i = 0; i < g.shapes.length; i++) {
        var s = g.shapes[i];
        if (!s || s.hp <= 0) continue;
        if (dist2(owner.x, owner.y, s.x, s.y) > (d.leash || 600) * (d.leash || 600)) continue;
        var dd = dist2(d.x, d.y, s.x, s.y);
        if (dd < bd) { bd = dd; best = s; }
      }
      return best;
    }

    function simulateFarm(g, owner, d, squad, profile, dt, recalling) {
      if (d.__novaPhase === 'dash') return false;
      if (d.__novaPhase === 'windup') {
        d.__novaPhase = 'recover'; d.__novaPhaseT = Math.max(0.24, profile.recover * 0.55); d.__novaCommitted = false;
      }
      var farFromHull = dist2(d.x, d.y, owner.x, owner.y) > 150 * 150;
      if (recalling || farFromHull || d.__novaPhase === 'recover') {
        orbitOwner(g, owner, d, squad, profile, dt);
        if (d.__novaPhase === 'recover') {
          d.__novaPhaseT -= dt;
          if (d.__novaPhaseT <= 0) d.__novaPhase = 'form';
        }
        return true;
      }
      d.retargetT = (d.retargetT == null ? 0 : d.retargetT) - dt;
      var target = d.__novaFarmTarget;
      if (!validEntity(target) || target.kind !== 'shape' || dist2(owner.x, owner.y, target.x, target.y) > (d.leash || 600) * (d.leash || 600)) target = null;
      if (!target || d.retargetT <= 0) {
        d.retargetT = 0.24 + (d.slot % 4) * 0.035;
        target = acquireFarmShape(g, d, owner);
        d.__novaFarmTarget = target;
      }
      if (!target) {
        orbitOwner(g, owner, d, squad, profile, dt);
        return true;
      }
      steerDrone(d, target.x, target.y, d.speed * (owner.swarmT > 0 ? 1.35 : 1), profile.response, dt);
      var rr = target.r + d.r + 5;
      if (d.attackCd <= 0 && dist2(d.x, d.y, target.x, target.y) <= rr * rr) {
        d.attackCd = 0.36;
        var dmg = d.dmg * (owner.swarmT > 0 ? 1.3 : 1);
        g.damageShape(target, dmg, target.x - d.x, target.y - d.y);
        if (g.addImpactDebris) g.addImpactDebris(target.x, target.y, target.x - d.x, target.y - d.y, d.color, 3);
      }
      return true;
    }

    function entityRadius(e) {
      if (!e) return 12;
      if (e.kind === 'drone') return (e.r || 8) + 1;
      if (e.kind === 'tank') return ((CLASSES[e.cls] && CLASSES[e.cls].size) || 15) + 3;
      return e.r || 12;
    }

    function findDashHit(g, owner, d, ax, ay, bx, by) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < g.tanks.length; i++) {
        var t = g.tanks[i];
        if (!t || !t.alive || t.id === owner.id || t.spawnShieldT > 0) continue;
        var rr = d.r + entityRadius(t);
        if (pointSegmentDist2(t.x, t.y, ax, ay, bx, by) <= rr * rr) {
          var dd = dist2(ax, ay, t.x, t.y);
          if (dd < bestD) { bestD = dd; best = t; }
        }
      }
      if (best) return best;
      for (var j = 0; j < g.drones.length; j++) {
        var od = g.drones[j];
        if (!od || od === d || od.hp <= 0 || od.ownerId === owner.id) continue;
        var rr2 = d.r + entityRadius(od);
        if (pointSegmentDist2(od.x, od.y, ax, ay, bx, by) <= rr2 * rr2) {
          var d2v = dist2(ax, ay, od.x, od.y);
          if (d2v < bestD) { bestD = d2v; best = od; }
        }
      }
      return best;
    }

    function abortWindup(g, d, profile) {
      d.__novaPhase = 'recover';
      d.__novaPhaseT = Math.max(0.30, profile.recover * 0.62);
      d.__novaCommitted = false;
      d.__novaTarget = null;
      if (g.addParticles) g.addParticles(d.x, d.y, '#c8ffe0', 3, 45, 'glow');
    }

    function lockDive(d, target, profile) {
      var dx = target.x - d.x, dy = target.y - d.y, dist = Math.hypot(dx, dy) || 1;
      var dashSpeed = Math.max(120, d.speed * profile.diveSpeed);
      var lead = clamp(dist / dashSpeed * 0.42, 0.035, 0.20);
      var px = target.x + (target.vx || 0) * lead;
      var py = target.y + (target.vy || 0) * lead;
      var vx = px - d.x, vy = py - d.y, l = Math.hypot(vx, vy) || 1;
      d.__novaDiveDX = vx / l; d.__novaDiveDY = vy / l;
      d.__novaAimX = px; d.__novaAimY = py; d.__novaCommitted = true;
    }

    function beginWindup(g, owner, d, target, profile, state) {
      d.__novaPhase = 'windup';
      d.__novaPhaseT = profile.windup;
      d.__novaCommitted = false;
      d.__novaTarget = target;
      d.__novaTargetId = target.id;
      d.__novaHitRun = false;
      d.__novaWindupMax = profile.windup;
      var mark = state.markId === target.id && state.markUntil > g.time;
      var cadence = profile.cadence * (owner.swarmT > 0 ? 0.66 : 1) * (mark ? 0.84 : 1);
      state.strikeAt = g.time + cadence;
      state.strikeSide *= -1;
      if (g.sfx.novaDroneWindup) {
        var hostile = !!(g.player && target.id === g.player.id && !owner.isPlayer);
        g.sfx.novaDroneWindup(panFrom(g, d.x), hostile, owner.cls === 'valkyrie');
      }
    }

    function chooseStrike(g, owner, squad, target, state, profile) {
      if (!target || state.strikeAt > g.time) return;
      var best = null, bestScore = Infinity;
      var dir = Math.atan2(target.y - owner.y, target.x - owner.x), ux = Math.cos(dir), uy = Math.sin(dir);
      for (var i = 0; i < squad.length; i++) {
        var d = squad[i];
        if (!d || d.hp <= 0 || (d.__novaPhase && d.__novaPhase !== 'form')) continue;
        var fp = formationPoint(g, owner, d, squad, target, state, profile);
        var fd = Math.sqrt(dist2(d.x, d.y, fp.x, fp.y));
        var td = Math.sqrt(dist2(d.x, d.y, target.x, target.y));
        if (fd > profile.ready || td > profile.engage + profile.formationRadius + 120) continue;
        var cross = ux * (d.y - target.y) - uy * (d.x - target.x);
        var side = cross >= 0 ? 1 : -1;
        var sidePenalty = side === state.strikeSide ? 0 : 72;
        var hpBias = owner.cls === 'broodmother' ? (d.hp / Math.max(1, d.maxHp)) * 28 : 0;
        var tempBias = d.temp ? -38 : 0;
        var score = fd * 0.75 + td * 0.12 + sidePenalty + hpBias + tempBias;
        if (score < bestScore) { bestScore = score; best = d; }
      }
      if (best) beginWindup(g, owner, best, target, profile, state);
    }

    function simulateControllerDrone(g, owner, d, squad, target, state, profile, dt, wasHit) {
      if (!d.__novaPhase) d.__novaPhase = 'form';
      var swarming = owner.swarmT > 0;
      var baseSpeed = d.speed * (swarming ? 1.34 : 1);
      if (!state.active && d.__novaPhase !== 'dash') {
        var recalling = state.recallUntil > g.time;
        return simulateFarm(g, owner, d, squad, profile, dt, recalling);
      }
      if (d.__novaPhase === 'windup') {
        if (wasHit) { abortWindup(g, d, profile); return true; }
        var wt = d.__novaTarget;
        if (!validEntity(wt) || !state.active) { abortWindup(g, d, profile); return true; }
        d.__novaPhaseT -= dt;
        var fpw = formationPoint(g, owner, d, squad, wt, state, profile);
        steerDrone(d, fpw.x, fpw.y, baseSpeed * 0.58, profile.response * 0.72, dt);
        if (!d.__novaCommitted && d.__novaPhaseT <= profile.lock) lockDive(d, wt, profile);
        if (d.__novaPhaseT <= 0) {
          if (!d.__novaCommitted) lockDive(d, wt, profile);
          d.__novaPhase = 'dash'; d.__novaPhaseT = profile.dash; d.__novaHitRun = false;
          var speed = d.speed * profile.diveSpeed * (swarming ? 1.18 : 1);
          d.__novaVX = d.__novaDiveDX * speed; d.__novaVY = d.__novaDiveDY * speed;
          if (g.sfx.novaDroneLaunch) {
            var hostile = !!(g.player && wt.id === g.player.id && !owner.isPlayer);
            g.sfx.novaDroneLaunch(panFrom(g, d.x), hostile, owner.cls === 'valkyrie');
          }
        }
        return true;
      }
      if (d.__novaPhase === 'dash') {
        var ax = d.x, ay = d.y;
        d.__novaPrevX = ax; d.__novaPrevY = ay;
        d.x += (d.__novaVX || 0) * dt; d.y += (d.__novaVY || 0) * dt;
        d.angle = Math.atan2(d.__novaVY || 0, d.__novaVX || 1);
        d.__novaPhaseT -= dt;
        var hit = !d.__novaHitRun ? findDashHit(g, owner, d, ax, ay, d.x, d.y) : null;
        if (hit) {
          d.__novaHitRun = true;
          var dmg = d.dmg * profile.diveDamage * (swarming ? 1.28 : 1);
          g.__novaDroneDamageOwner = owner.id;
          try {
            if (hit.kind === 'tank') g.damageTank(hit, dmg, owner.id);
            else if (hit.kind === 'drone') g.damageDrone(hit, dmg, owner.id);
          } finally { g.__novaDroneDamageOwner = null; }
          if (g.addImpactDebris) g.addImpactDebris(hit.x, hit.y, d.__novaVX || 0, d.__novaVY || 0, d.color, 4);
          if (g.addRing) g.addRing(hit.x, hit.y, d.color, 20);
          d.__novaVX *= 0.55; d.__novaVY *= 0.55;
          d.__novaPhaseT = Math.min(d.__novaPhaseT, 0.08);
        }
        if (d.__novaPhaseT <= 0) {
          d.__novaPhase = 'recover'; d.__novaPhaseT = profile.recover; d.__novaCommitted = false;
          d.__novaTarget = null;
        }
        return true;
      }
      if (d.__novaPhase === 'recover') {
        d.__novaPhaseT -= dt;
        var fpr = formationPoint(g, owner, d, squad, target, state, profile);
        steerDrone(d, fpr.x, fpr.y, baseSpeed * 0.82, profile.response * 0.78, dt);
        if (d.__novaPhaseT <= 0) d.__novaPhase = 'form';
        return true;
      }
      var fp = formationPoint(g, owner, d, squad, target, state, profile);
      var response = profile.response * (owner.bulwarkT > 0 && profile.formation === 'wall' ? 1.20 : 1);
      steerDrone(d, fp.x, fp.y, baseSpeed * (owner.cls === 'valkyrie' ? 1.12 : 1), response, dt);
      return true;
    }

    function simulateLegacyDrone(g, owner, d, dt) {
      var swarming = owner.swarmT > 0;
      var leash = d.leash * (swarming ? 1.35 : 1);
      d.retargetT -= dt;
      var target = d.targetRef;
      if (target && (target.hp <= 0 || (target.kind === 'tank' && !target.alive))) target = null;
      if (target && dist2(owner.x, owner.y, target.x, target.y) > leash * leash) target = null;
      if (!target) d.targetRef = null;
      if (d.retargetT <= 0) {
        d.retargetT = 0.22 + (d.slot % 4) * 0.03;
        target = g.acquireDroneTarget(d, owner, leash);
        d.targetRef = target; d.targetId = target ? target.id : -1;
      }
      if (target) {
        var dx = target.x - d.x, dy = target.y - d.y, dd = Math.hypot(dx, dy) || 1;
        var sp = d.speed * (swarming ? 1.45 : 1);
        if (dd > 12) { d.x += dx / dd * sp * dt; d.y += dy / dd * sp * dt; }
        if (d.attackCd <= 0 && target.hp > 0) {
          var tr = target.kind === 'shape' ? target.r : target.kind === 'drone' ? target.r + 2 : ((CLASSES[target.cls] && CLASSES[target.cls].size) || 15) + 4;
          if (dd < tr + d.r + 5) {
            d.attackCd = d.role === 'hunter' ? 0.36 : 0.5;
            var dmg = d.dmg * (swarming ? 1.3 : 1);
            if (target.kind === 'shape') g.damageShape(target, dmg, dx, dy);
            else if (target.kind === 'drone') g.damageDrone(target, dmg, owner.id);
            else g.damageTank(target, dmg, owner.id);
            if (g.addImpactDebris) g.addImpactDebris(target.x, target.y, dx, dy, d.color, 3);
          }
        }
      } else {
        d.orbitA += dt * (d.role === 'hunter' ? 1.7 : 2.1);
        var ox = owner.x + Math.cos(d.orbitA) * d.orbitR, oy = owner.y + Math.sin(d.orbitA) * d.orbitR;
        var dx2 = ox - d.x, dy2 = oy - d.y, dist = Math.hypot(dx2, dy2);
        if (dist > 4) {
          var sp2 = Math.min(dist * 5, d.speed * 1.25);
          d.x += dx2 / dist * sp2 * dt; d.y += dy2 / dist * sp2 * dt;
        }
      }
    }

    Game.prototype.updateDrones = function (dt) {
      var counts = this.droneCounts;
      counts.clear();
      for (var i = 0; i < this.drones.length; i++) {
        var oid = this.drones[i].ownerId;
        counts.set(oid, (counts.get(oid) || 0) + 1);
      }
      var globalCap = this.quality === 'high' ? 52 : 34;
      for (var ti = 0; ti < this.tanks.length; ti++) {
        var t = this.tanks[ti];
        if (!t.alive) continue;
        var def = CLASSES[t.cls];
        var baseDrones = def.droneCount + (t.gene === 'controller' ? 2 : 0);
        var maxDrones = baseDrones + (t.swarmT > 0 ? 2 : 0);
        if ((counts.get(t.id) || 0) >= maxDrones) continue;
        if (this.drones.length >= globalCap && !t.isPlayer) continue;
        t.droneRespawnT -= dt;
        if (t.droneRespawnT <= 0) {
          var respawnBase = def.droneRole === 'hunter' || t.gene === 'controller' ? 3.2 : 4.4;
          t.droneRespawnT = respawnBase * (def.droneRespawnMult == null ? 1 : def.droneRespawnMult);
          this.spawnDrone(t, counts.get(t.id) || 0);
          counts.set(t.id, (counts.get(t.id) || 0) + 1);
        }
      }
      var squads = Object.create(null);
      for (var si = 0; si < this.drones.length; si++) {
        var sd = this.drones[si], so = this.tankById.get(sd.ownerId);
        if (so && so.alive && isController(so)) squadFor(squads, so.id).push(sd);
      }
      for (var key in squads) squads[key].sort(function (a, b) { return (a.slot || 0) - (b.slot || 0); });
      for (var oi = 0; oi < this.tanks.length; oi++) {
        var owner0 = this.tanks[oi];
        if (!owner0.alive || !isController(owner0)) continue;
        var st = updateCommand(this, owner0, dt), pr = profileFor(owner0);
        st.target = controllerTarget(this, owner0, st, pr);
        st.targetId = st.target ? st.target.id : -1;
        if (st.active && st.target) chooseStrike(this, owner0, squads[owner0.id] || [], st.target, st, pr);
      }
      for (var di = this.drones.length - 1; di >= 0; di--) {
        var d = this.drones[di], owner = this.tankById.get(d.ownerId);
        if (d.hp <= 0 || !owner || !owner.alive || (d.temp && owner.swarmT <= 0)) {
          if (owner && d.hp > 0 && d.temp && this.addParticles) this.addParticles(d.x, d.y, d.color, 4, 100, 'spark');
          this.removeDroneAt(di); continue;
        }
        var wasHit = d.hitFlash > 0.08;
        if (d.hitFlash > 0) d.hitFlash = Math.max(0, d.hitFlash - dt);
        d.attackCd -= dt;
        if (isController(owner)) {
          var st2 = controllerState(owner), pr2 = profileFor(owner), sq = squads[owner.id] || [d];
          simulateControllerDrone(this, owner, d, sq, st2.target, st2, pr2, dt, wasHit);
        } else {
          simulateLegacyDrone(this, owner, d, dt);
        }
        d.x = clamp(d.x, -MAP_LIMIT + 24, MAP_LIMIT - 24);
        d.y = clamp(d.y, -MAP_LIMIT + 24, MAP_LIMIT - 24);
      }
    };
  });

  wrapModule('game/render', function (renderMod) {
    var oldRender = renderMod.render;
    if (!oldRender || oldRender.__novaSecondBody) return;

    function drawDiamond(ctx, x, y, r, col, alpha) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.globalAlpha = alpha;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.shadowBlur = 12; ctx.shadowColor = col;
      ctx.strokeRect(-r, -r, r * 2, r * 2); ctx.restore();
    }
    function drawCommand(g, ctx, w, h, pl, state, profile) {
      if (!state.active) return;
      var p = worldToScreen(g, state.nodeX, state.nodeY), cx = w * 0.5, cy = h * 0.5;
      var off = p.x < 24 || p.x > w - 24 || p.y < 24 || p.y > h - 24;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(117,240,163,0.24)'; ctx.lineWidth = 1; ctx.setLineDash([4, 8]);
      if (!off) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.setLineDash([]);
        var zone = Math.min(86, profile.engage * (g.cam.zoom || 1));
        ctx.strokeStyle = 'rgba(117,240,163,0.16)'; ctx.beginPath(); ctx.arc(p.x, p.y, zone, 0, TAU); ctx.stroke();
        drawDiamond(ctx, p.x, p.y, 8 + state.power * 3, '#75f0a3', 0.82);
        ctx.fillStyle = 'rgba(181,255,207,0.80)'; ctx.font = '700 8px Orbitron,system-ui'; ctx.textAlign = 'center';
        ctx.fillText('COMMAND', p.x, p.y - 15);
      } else {
        var ang = Math.atan2(p.y - cy, p.x - cx), ep = edgePoint(w, h, ang, 17);
        ctx.setLineDash([]); drawDiamond(ctx, ep.x, ep.y, 7, '#75f0a3', 0.82);
        ctx.strokeStyle = 'rgba(117,240,163,0.20)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ep.x, ep.y); ctx.stroke();
      }
      ctx.restore();
    }
    function drawDroneState(g, ctx, d, owner, w, h) {
      if (!d.__novaPhase || !isController(owner)) return;
      var p = worldToScreen(g, d.x, d.y);
      if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) return;
      if (d.__novaPhase === 'windup') {
        var q = 1 - clamp(d.__novaPhaseT / Math.max(0.01, d.__novaWindupMax || 0.3), 0, 1);
        var pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.035);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(186,255,211,' + (0.35 + q * 0.55) * pulse + ')';
        ctx.lineWidth = 1.2 + q; ctx.shadowBlur = 10 + q * 10; ctx.shadowColor = GREEN;
        ctx.beginPath(); ctx.arc(p.x, p.y, 13 + q * 6, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * q); ctx.stroke();
        if (d.__novaCommitted) {
          ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + d.__novaDiveDX * 38, p.y + d.__novaDiveDY * 38); ctx.stroke();
        }
        ctx.restore();
      } else if (d.__novaPhase === 'dash') {
        var prev = worldToScreen(g, d.__novaPrevX == null ? d.x : d.__novaPrevX, d.__novaPrevY == null ? d.y : d.__novaPrevY);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var grad = ctx.createLinearGradient(prev.x, prev.y, p.x, p.y);
        grad.addColorStop(0, 'rgba(84,227,138,0)'); grad.addColorStop(1, 'rgba(180,255,207,0.85)');
        ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.shadowBlur = 12; ctx.shadowColor = GREEN;
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.restore();
      }
    }
    function drawMark(g, ctx, w, h, owner, state) {
      if (state.markId < 0 || state.markUntil <= g.time) return;
      var target = g.getTank ? g.getTank(state.markId) : null;
      if (!target || !target.alive) return;
      if (owner.isPlayer) {
        var p = worldToScreen(g, target.x, target.y);
        if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) return;
        ctx.save(); ctx.translate(p.x, p.y); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(157,255,192,0.72)'; ctx.lineWidth = 1.2; ctx.shadowBlur = 12; ctx.shadowColor = GREEN;
        ctx.rotate(g.time * 0.9); ctx.beginPath();
        for (var i = 0; i < 6; i++) {
          var a = i / 6 * TAU, x = Math.cos(a) * 24, y = Math.sin(a) * 24;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke(); ctx.restore();
      } else if (g.player && target.id === g.player.id) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,210,115,0.55)'; ctx.lineWidth = 1.3; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, 36, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,220,145,0.78)'; ctx.font = '800 8px Orbitron,system-ui'; ctx.textAlign = 'center';
        ctx.fillText('DESIGNATED', w * 0.5, h * 0.5 - 44); ctx.restore();
      }
    }
    function drawWallLinks(g, ctx, pl, squad) {
      if (!(pl.cls === 'warden' || pl.cls === 'citadel') || squad.length < 2) return;
      var state = controllerState(pl);
      if (!state.active) return;
      var px = -Math.sin(state.angle), py = Math.cos(state.angle);
      var sorted = squad.slice().sort(function (a, b) {
        return (a.x * px + a.y * py) - (b.x * px + b.y * py);
      });
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(117,240,163,0.18)'; ctx.lineWidth = pl.bulwarkT > 0 ? 2 : 1;
      ctx.beginPath();
      for (var i = 0; i < sorted.length; i++) {
        var p = worldToScreen(g, sorted[i].x, sorted[i].y);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke(); ctx.restore();
    }

    function patchedRender(g, w, h) {
      oldRender(g, w, h);
      if (!g || !g.ctx || !g.player || !g.player.alive) return;
      var ctx = g.ctx, pl = g.player;
      ctx.save(); ctx.setTransform(g.dpr || 1, 0, 0, g.dpr || 1, 0, 0);
      if (isController(pl)) {
        var st = controllerState(pl), pr = profileFor(pl);
        drawCommand(g, ctx, w, h, pl, st, pr);
        var own = [];
        for (var i = 0; i < g.drones.length; i++) if (g.drones[i].ownerId === pl.id) own.push(g.drones[i]);
        drawWallLinks(g, ctx, pl, own);
        if (st.tutorialUntil > g.time) {
          var touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
          ctx.save(); ctx.textAlign = 'center'; ctx.font = '800 9px Orbitron,system-ui';
          ctx.fillStyle = 'rgba(207,255,224,0.88)'; ctx.shadowBlur = 10; ctx.shadowColor = GREEN;
          ctx.fillText(touch ? 'RIGHT STICK: COMMAND · DEPTH: RANGE · RELEASE: RECALL' : 'HOLD FIRE: COMMAND · CURSOR DISTANCE: RANGE · RELEASE: RECALL', w * 0.5, h * 0.72);
          ctx.font = '700 10px Rajdhani,system-ui'; ctx.fillStyle = 'rgba(170,210,185,0.78)'; ctx.shadowBlur = 0;
          ctx.fillText('Land your gunshot to DESIGNATE · attack runs lock before impact and can be dodged', w * 0.5, h * 0.72 + 15);
          ctx.restore();
        }
      }
      for (var di = 0; di < g.drones.length; di++) {
        var d = g.drones[di], o = g.tankById && g.tankById.get(d.ownerId);
        if (o && isController(o)) drawDroneState(g, ctx, d, o, w, h);
      }
      for (var ti = 0; ti < g.tanks.length; ti++) {
        var t = g.tanks[ti];
        if (t && t.alive && isController(t) && t.__novaSwarm) drawMark(g, ctx, w, h, t, t.__novaSwarm);
      }
      ctx.restore();
    }
    patchedRender.__novaSecondBody = true;
    renderMod.render = patchedRender;
  });

  console.info('[NOVA TANKS] v' + VERSION + ' ' + CODENAME + ' Controller systems linked');
})();
