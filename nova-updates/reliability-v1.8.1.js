/* NOVA TANKS v1.8.1 — Integrity Pass
 * Cross-system reliability hardening and tactical camera framing.
 * Keeps long-range command/recon play visible without changing shot physics,
 * damage, range, AI privileges, or the existing control budget.
 */
(function () {
  'use strict';

  var mods = window.__novaModules;
  if (!mods) {
    console.error('[NOVA v1.8.1] module registry unavailable');
    return;
  }

  var VERSION = '1.8.1';
  var CODENAME = 'Integrity Pass';
  var MIN_TACTICAL_ZOOM = 0.24;
  var EDGE_PAD = 54;
  var WORLD_PAD = 92;

  var CONTROLLER_IDS = {
    carrier:1, overlord:1, warden:1,
    hivemind:1, broodmother:1, citadel:1, valkyrie:1
  };
  var SNIPER_IDS = {
    marksman:1, railgun:1, ghost:1,
    singularity:1, prism:1, specter:1, assassin:1
  };

  window.__NOVA_RELIABILITY_RELEASE__ = {
    version: VERSION,
    codename: CODENAME,
    date: '2026-08-08',
    headline: 'Long-range control stays visible, cursor projection stays exact, and tactical state heals instead of poisoning a run.',
    guarantees: [
      'Controller Command Nodes automatically widen the camera only when the commanded position would escape useful view.',
      'Purple Forward Observers and active remote contacts receive the same tactical framing behavior.',
      'Desktop pointer-to-world conversion uses the camera zoom actually being rendered, so zooming out never changes where a shot is aimed.',
      'Tactical zoom is presentation only: weapon range, projectile physics, damage and AI rules are untouched.',
      'Invalid camera, Controller command and sniper-contact state is repaired to a safe live value instead of propagating NaN or stale references.',
      'Returning to ordinary combat smoothly restores the native class/device camera framing.'
    ]
  };

  function wrapModule(id, after) {
    var original = mods[id];
    if (!original) {
      console.warn('[NOVA v1.8.1] module not found:', id);
      return;
    }
    mods[id] = function (module, exports, require) {
      original(module, exports, require);
      after(module.exports, require);
    };
  }

  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sane(v, fallback) { return finite(v) ? v : fallback; }
  function saneZoom(v, fallback) {
    var f = finite(fallback) && fallback > 0 ? fallback : 1;
    return finite(v) && v > 0 ? clamp(v, MIN_TACTICAL_ZOOM, 1.4) : f;
  }
  function isController(t) { return !!(t && CONTROLLER_IDS[t.cls]); }
  function isSniper(t) { return !!(t && SNIPER_IDS[t.cls]); }
  function liveEntity(e) {
    if (!e) return false;
    if (e.kind === 'tank' || e.alive != null) return e.alive !== false && !(finite(e.hp) && e.hp <= 0);
    return !(finite(e.hp) && e.hp <= 0);
  }
  function getTank(g, id) {
    if (id == null || id < 0) return null;
    if (typeof g.getTank === 'function') return g.getTank(id);
    if (g.tankById && typeof g.tankById.get === 'function') return g.tankById.get(id) || null;
    var list = g.tanks || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function findSpotter(g, pl) {
    var drones = g.drones || [];
    var wanted = pl && pl.__novaSpotterDroneId;
    if (wanted != null && wanted >= 0) {
      for (var i = 0; i < drones.length; i++) {
        var d = drones[i];
        if (d && d.id === wanted && d.ownerId === pl.id && d.__novaSpotter && liveEntity(d)) return d;
      }
    }
    for (var j = 0; j < drones.length; j++) {
      var dr = drones[j];
      if (dr && dr.ownerId === pl.id && dr.__novaSpotter && liveEntity(dr)) return dr;
    }
    return null;
  }

  function repairTacticalState(g, pl) {
    if (!g.cam) g.cam = { x:pl ? pl.x : 0, y:pl ? pl.y : 0, zoom:1, shake:0 };
    var px = pl && finite(pl.x) ? pl.x : 0;
    var py = pl && finite(pl.y) ? pl.y : 0;
    if (!finite(g.cam.x)) g.cam.x = px;
    if (!finite(g.cam.y)) g.cam.y = py;

    var base = saneZoom(g.__novaBaseZoom, saneZoom(g.zoom, 1));
    g.cam.zoom = saneZoom(g.cam.zoom, base);

    if (!pl) return;

    if (isController(pl) && pl.__novaSwarm) {
      var st = pl.__novaSwarm;
      if (!finite(st.nodeX) || !finite(st.nodeY)) {
        st.nodeX = px;
        st.nodeY = py;
        st.active = false;
        st.wasActive = false;
        st.power = 0;
      }
      if (st.target && !liveEntity(st.target)) {
        st.target = null;
        st.targetId = -1;
      }
      if (!finite(st.power)) st.power = 0;
    }

    if (isSniper(pl)) {
      if (!finite(pl.__novaSpotterContactUntil)) pl.__novaSpotterContactUntil = 0;
      if (pl.__novaSpotterContactId == null || !finite(pl.__novaSpotterContactId)) pl.__novaSpotterContactId = -1;
      if (pl.__novaSpotterContactId >= 0) {
        var contact = getTank(g, pl.__novaSpotterContactId);
        if (!liveEntity(contact) || pl.__novaSpotterContactUntil <= sane(g.time, 0)) {
          pl.__novaSpotterContactId = -1;
          pl.__novaSpotterContactUntil = 0;
        }
      }
      var spot = findSpotter(g, pl);
      if (!spot && pl.__novaSpotterDroneId != null) pl.__novaSpotterDroneId = -1;
    }
  }

  function tacticalFocus(g, pl) {
    if (!pl || !pl.alive) return null;

    if (isController(pl) && pl.__novaSwarm) {
      var st = pl.__novaSwarm;
      if (st.active && finite(st.nodeX) && finite(st.nodeY)) {
        return { x:st.nodeX, y:st.nodeY, kind:'command' };
      }
    }

    if (isSniper(pl)) {
      if (pl.__novaSpotterContactId >= 0 && pl.__novaSpotterContactUntil > sane(g.time, 0)) {
        var target = getTank(g, pl.__novaSpotterContactId);
        if (liveEntity(target) && finite(target.x) && finite(target.y)) {
          return { x:target.x, y:target.y, kind:'contact' };
        }
      }
      var spotter = findSpotter(g, pl);
      if (spotter && finite(spotter.x) && finite(spotter.y)) {
        return { x:spotter.x, y:spotter.y, kind:'spotter' };
      }
    }
    return null;
  }

  function frameFor(g, pl, baseZoom) {
    var base = saneZoom(baseZoom, 1);
    if (!pl || !pl.alive || !finite(pl.x) || !finite(pl.y)) {
      return { active:false, x:0, y:0, zoom:base, kind:'none' };
    }
    var focus = tacticalFocus(g, pl);
    if (!focus) {
      return {
        active:false,
        x:pl.x + sane(pl.vx, 0) * 0.16,
        y:pl.y + sane(pl.vy, 0) * 0.16,
        zoom:base,
        kind:'none'
      };
    }

    var spanX = Math.abs(focus.x - pl.x);
    var spanY = Math.abs(focus.y - pl.y);
    var w = Math.max(240, sane(g.w, 640));
    var h = Math.max(240, sane(g.h, 520));
    var availW = Math.max(120, w - EDGE_PAD * 2);
    var availH = Math.max(120, h - EDGE_PAD * 2);
    var fitX = availW / Math.max(1, spanX + WORLD_PAD * 2);
    var fitY = availH / Math.max(1, spanY + WORLD_PAD * 2);
    var desired = clamp(Math.min(base, fitX, fitY), MIN_TACTICAL_ZOOM, base);
    var releaseThreshold = g.__novaTacticalCameraActive ? 0.985 : 0.955;
    var active = desired < base * releaseThreshold;

    if (!active) {
      return {
        active:false,
        x:pl.x + sane(pl.vx, 0) * 0.16,
        y:pl.y + sane(pl.vy, 0) * 0.16,
        zoom:base,
        kind:'none'
      };
    }

    return {
      active:true,
      x:(pl.x + focus.x) * 0.5,
      y:(pl.y + focus.y) * 0.5,
      zoom:desired,
      kind:focus.kind,
      focusX:focus.x,
      focusY:focus.y
    };
  }

  window.__NOVA_RELIABILITY_TEST__ = {
    frameFor: frameFor,
    repairTacticalState: repairTacticalState,
    tacticalFocus: tacticalFocus,
    minZoom: MIN_TACTICAL_ZOOM
  };

  wrapModule('game/engine', function (engine) {
    var Game = engine.Game;
    if (!Game || Game.prototype.__novaIntegrityPass) return;
    Game.prototype.__novaIntegrityPass = true;

    var oldResize = Game.prototype.resize;
    if (oldResize) {
      Game.prototype.resize = function () {
        var out = oldResize.apply(this, arguments);
        this.__novaBaseZoom = saneZoom(this.zoom, this.__novaBaseZoom || 1);
        if (this.cam) this.cam.zoom = saneZoom(this.cam.zoom, this.__novaBaseZoom);
        return out;
      };
    }

    var oldUpdate = Game.prototype.update;
    if (!oldUpdate) return;
    Game.prototype.update = function (dt) {
      var pl0 = this.player;
      if (!finite(this.__novaBaseZoom) || this.__novaBaseZoom <= 0) {
        this.__novaBaseZoom = saneZoom(this.zoom, this.cam && this.cam.zoom);
      }
      var baseZoom = saneZoom(this.__novaBaseZoom, 1);
      repairTacticalState(this, pl0);

      var actualZoom = saneZoom(this.cam && this.cam.zoom, baseZoom);
      var startX = this.cam ? sane(this.cam.x, pl0 && sane(pl0.x, 0)) : 0;
      var startY = this.cam ? sane(this.cam.y, pl0 && sane(pl0.y, 0)) : 0;

      /* The base game converts desktop pointer coordinates with `this.zoom`.
       * During tactical framing that value must equal the zoom actually visible
       * this frame, otherwise the cursor and the world ray diverge. Keep the
       * native device/class zoom separately and restore it immediately after
       * simulation so no weapon/stat code inherits a presentation override. */
      this.zoom = actualZoom;
      var out;
      try {
        out = oldUpdate.call(this, dt);
      } finally {
        this.zoom = baseZoom;
      }

      var pl = this.player;
      repairTacticalState(this, pl);
      if (!this.cam) return out;

      var safeDt = finite(dt) ? clamp(dt, 0, 0.05) : 0;
      var frame = frameFor(this, pl, baseZoom);
      var playable = !!(pl && pl.alive && this.status === 'playing');

      if (playable && frame.active) {
        var panK = 1 - Math.exp(-9.5 * safeDt);
        var zoomK = 1 - Math.exp(-12.0 * safeDt);
        this.cam.x = lerp(startX, frame.x, panK);
        this.cam.y = lerp(startY, frame.y, panK);
        this.cam.zoom = lerp(actualZoom, frame.zoom, zoomK);
        this.__novaTacticalCameraActive = true;
        this.__novaTacticalCameraKind = frame.kind;
        this.__novaTacticalCameraFocusX = frame.focusX;
        this.__novaTacticalCameraFocusY = frame.focusY;
      } else {
        var restoreK = 1 - Math.exp(-4.8 * safeDt);
        this.cam.zoom = lerp(actualZoom, baseZoom, restoreK);
        this.__novaTacticalCameraActive = false;
        this.__novaTacticalCameraKind = 'none';
        this.__novaTacticalCameraFocusX = null;
        this.__novaTacticalCameraFocusY = null;
      }

      this.cam.zoom = saneZoom(this.cam.zoom, baseZoom);
      if (!finite(this.cam.x)) this.cam.x = pl && finite(pl.x) ? pl.x : 0;
      if (!finite(this.cam.y)) this.cam.y = pl && finite(pl.y) ? pl.y : 0;
      return out;
    };
  });

  console.info('[NOVA TANKS] v' + VERSION + ' ' + CODENAME + ' reliability layer online');
})();
