/* NOVA TANKS v1.11.1 — Owner Operations
 * Private work queue for the registered owner-phone bridge.
 * No bridge means no DOM, no queue, and no operation data.
 */
(function () {
  'use strict';
  if (window.__NOVA_OWNER_OPERATIONS_RUNTIME__) return;
  window.__NOVA_OWNER_OPERATIONS_RUNTIME__ = true;

  const VERSION = '1.11.1';
  const BRIDGE = 'NOVAOwnerPhone';
  const MAX_ITEMS = 12;
  const labels = { codex: 'CODEX', chatgpt: 'CHATGPT', claude: 'CLAUDE', jarvis: 'JARVIS', telegram: 'JARVIS' };
  const stateLabels = { attention: 'ACTION', failed: 'FAILED', working: 'WORKING', completed: 'DONE' };
  const priority = { attention: 0, failed: 1, working: 2, completed: 3 };

  let bridge = null;
  let bindingId = '';
  let items = [];
  let root = null;
  let list = null;
  let counts = null;
  let empty = null;
  let toastHost = null;
  let unsubscribe = null;

  function clean(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function sourceOf(value) {
    const source = clean(value, 20).toLowerCase();
    if (source === 'telegram') return 'jarvis';
    return labels[source] ? source : 'other';
  }
  function statusOf(value, actionRequired) {
    const status = clean(value, 24).toLowerCase();
    if (actionRequired === true || ['attention', 'action', 'needs_input', 'input_required'].includes(status)) return 'attention';
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return 'failed';
    if (['completed', 'complete', 'done', 'finished', 'deployed'].includes(status)) return 'completed';
    return 'working';
  }
  function validOwner(owner) {
    return Boolean(owner && owner.owner === true && owner.phoneBound === true && clean(owner.bindingId, 160).length >= 16);
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (clean(raw.bindingId, 160) !== bindingId) return null;
    const id = clean(raw.id || raw.taskId || raw.task_id, 120);
    const title = clean(raw.title || raw.name, 84);
    if (!id || !title) return null;
    const time = Number(raw.updatedAt ?? raw.timestamp ?? raw.completedAt ?? Date.now());
    return { id, bindingId, source: sourceOf(raw.source || raw.agent), status: statusOf(raw.status || raw.kind || raw.event, raw.actionRequired), title, summary: clean(raw.summary || raw.detail || raw.message, 120), timestamp: Number.isFinite(time) && time > 0 ? time : Date.now() };
  }
  function sorted(values) {
    return values.slice().sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || b.timestamp - a.timestamp);
  }

  window.__NOVA_OWNER_OPERATIONS_RELEASE__ = Object.freeze({ version: VERSION, codename: 'Owner Operations', date: '2026-08-13', ownerOnly: true, phoneBound: true, sources: ['codex', 'chatgpt', 'claude', 'jarvis'] });
  window.__NOVA_OWNER_OPERATIONS_TEST__ = Object.freeze({ validOwner, sourceOf, statusOf, sorted });

  function installStyle() {
    if (document.getElementById('nova-owner-ops-css')) return;
    const style = document.createElement('style');
    style.id = 'nova-owner-ops-css';
    style.textContent = `
#nova-owner-ops{position:fixed;z-index:2147483000;top:max(58px,calc(env(safe-area-inset-top) + 48px));right:max(8px,env(safe-area-inset-right));width:min(264px,44vw);pointer-events:none;font-family:"Rajdhani",system-ui,sans-serif;color:#edfaff}
.nvo-panel{overflow:hidden;border:1px solid rgba(77,227,255,.25);border-radius:10px;background:rgba(4,9,19,.9);box-shadow:0 10px 28px rgba(0,0,0,.3);backdrop-filter:blur(9px)}
.nvo-head{display:flex;align-items:center;gap:7px;min-height:30px;padding:6px 8px;border-bottom:1px solid rgba(125,220,255,.12)}
.nvo-kicker{font:700 9px/1 "Orbitron",system-ui,sans-serif;letter-spacing:.16em;color:#89edff}.nvo-link{font-size:9px;letter-spacing:.1em;color:#7598a8}.nvo-counts{margin-left:auto;display:flex;gap:5px;font:700 8px/1 "Orbitron",system-ui,sans-serif}.nvo-count{min-width:22px;padding:4px 5px;border:1px solid rgba(128,190,214,.2);border-radius:999px;text-align:center}.nvo-count[data-hot="1"]{border-color:rgba(255,77,109,.55);color:#ff91a7}.nvo-done[data-hot="1"]{border-color:rgba(93,236,193,.4);color:#8cf4d3}
.nvo-list{display:flex;flex-direction:column}.nvo-item{position:relative;display:grid;grid-template-columns:7px minmax(0,1fr) auto;gap:7px;align-items:center;min-height:42px;padding:6px 8px;border-bottom:1px solid rgba(119,180,205,.08)}.nvo-item:last-child{border-bottom:0}.nvo-dot{width:6px;height:6px;border-radius:50%;background:#58c9e5}.nvo-item[data-status="attention"] .nvo-dot{background:#ff4d6d;box-shadow:0 0 9px rgba(255,77,109,.55);animation:nvoPulse 1.25s ease-in-out infinite}.nvo-item[data-status="failed"] .nvo-dot{background:#ff9b63}.nvo-item[data-status="completed"] .nvo-dot{background:#5decc1}.nvo-main{min-width:0}.nvo-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700}.nvo-meta{margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;letter-spacing:.06em;color:#789aaa;text-transform:uppercase}.nvo-state{font:700 8px/1 "Orbitron",system-ui,sans-serif;color:#75cbe1}.nvo-item[data-status="attention"] .nvo-state{color:#ff91a7}.nvo-item[data-status="failed"] .nvo-state{color:#ffb186}.nvo-item[data-status="completed"] .nvo-state{color:#8cf4d3}
.nvo-open{position:absolute;inset:0;pointer-events:auto;border:0;background:transparent;cursor:pointer}.nvo-open:focus-visible{outline:2px solid #4de3ff;outline-offset:-2px;border-radius:8px}.nvo-empty{padding:8px 9px;font-size:10px;letter-spacing:.08em;color:#7895a2;text-transform:uppercase}.nvo-toast{margin-top:6px;border:1px solid rgba(77,227,255,.25);border-left:3px solid #4de3ff;border-radius:8px;padding:7px 9px;background:rgba(4,9,19,.94);font-size:11px;font-weight:700;box-shadow:0 8px 22px rgba(0,0,0,.28)}.nvo-toast[data-status="attention"]{border-left-color:#ff4d6d}.nvo-toast[data-status="failed"]{border-left-color:#ff9b63}.nvo-toast[data-status="completed"]{border-left-color:#5decc1}@keyframes nvoPulse{50%{opacity:.45;transform:scale(.8)}}@media(max-width:600px){#nova-owner-ops{top:max(54px,calc(env(safe-area-inset-top) + 44px));right:max(6px,env(safe-area-inset-right));width:min(242px,68vw)}.nvo-item:nth-child(n+5){display:none}}@media(prefers-reduced-motion:reduce){.nvo-item[data-status="attention"] .nvo-dot{animation:none}}`;
    document.head.appendChild(style);
  }

  function mount() {
    if (root && root.isConnected) return;
    installStyle();
    root = document.createElement('aside'); root.id = 'nova-owner-ops'; root.setAttribute('aria-label', 'Owner work queue');
    const panel = document.createElement('section'); panel.className = 'nvo-panel';
    const head = document.createElement('div'); head.className = 'nvo-head';
    const kicker = document.createElement('span'); kicker.className = 'nvo-kicker'; kicker.textContent = 'OPS';
    const link = document.createElement('span'); link.className = 'nvo-link'; link.textContent = 'PHONE LINK';
    counts = document.createElement('div'); counts.className = 'nvo-counts';
    const attention = document.createElement('span'); attention.className = 'nvo-count'; attention.dataset.kind = 'attention';
    const completed = document.createElement('span'); completed.className = 'nvo-count nvo-done'; completed.dataset.kind = 'completed';
    counts.append(attention, completed); head.append(kicker, link, counts);
    list = document.createElement('div'); list.className = 'nvo-list'; list.setAttribute('aria-live', 'polite');
    empty = document.createElement('div'); empty.className = 'nvo-empty'; empty.textContent = 'Linked · waiting for agent work';
    toastHost = document.createElement('div'); panel.append(head, list, empty); root.append(panel, toastHost); document.body.appendChild(root);
  }

  function formatTime(value) {
    try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)); } catch (_) { return ''; }
  }
  function render() {
    if (!root) return;
    items = sorted(items).slice(0, MAX_ITEMS); list.replaceChildren();
    for (const item of items.slice(0, 6)) {
      const row = document.createElement('div'); row.className = 'nvo-item'; row.dataset.status = item.status;
      const dot = document.createElement('span'); dot.className = 'nvo-dot';
      const main = document.createElement('div'); main.className = 'nvo-main';
      const title = document.createElement('div'); title.className = 'nvo-title'; title.textContent = item.title;
      const meta = document.createElement('div'); meta.className = 'nvo-meta'; const source = labels[item.source] || 'AGENT'; meta.textContent = `${source} · ${formatTime(item.timestamp)}${item.summary ? ` · ${item.summary}` : ''}`;
      const status = document.createElement('span'); status.className = 'nvo-state'; status.textContent = stateLabels[item.status] || 'WORKING';
      main.append(title, meta); row.append(dot, main, status);
      if (bridge && typeof bridge.openWorkItem === 'function') {
        const open = document.createElement('button'); open.type = 'button'; open.className = 'nvo-open'; open.setAttribute('aria-label', `Open ${item.title}`); open.addEventListener('click', () => Promise.resolve(bridge.openWorkItem(item.id, item.source)).catch(() => {})); row.appendChild(open);
      }
      list.appendChild(row);
    }
    const urgent = items.filter((item) => item.status === 'attention' || item.status === 'failed').length;
    const done = items.filter((item) => item.status === 'completed').length;
    const a = counts.querySelector('[data-kind="attention"]'); const d = counts.querySelector('[data-kind="completed"]');
    a.textContent = `! ${urgent}`; a.dataset.hot = urgent ? '1' : '0'; d.textContent = `✓ ${done}`; d.dataset.hot = done ? '1' : '0'; empty.style.display = items.length ? 'none' : 'block';
  }
  function toast(item) {
    if (!toastHost || item.status === 'working') return;
    const node = document.createElement('div'); node.className = 'nvo-toast'; node.dataset.status = item.status; node.textContent = `${labels[item.source] || 'AGENT'} · ${stateLabels[item.status] || 'UPDATE'} — ${item.title}`; toastHost.prepend(node); while (toastHost.children.length > 2) toastHost.lastElementChild.remove(); window.setTimeout(() => node.remove(), item.status === 'attention' ? 10000 : 6500);
  }
  function upsert(raw, notify) {
    const item = normalize(raw); if (!item) return;
    const index = items.findIndex((current) => current.id === item.id && current.source === item.source); const previous = index >= 0 ? items[index] : null;
    if (index >= 0) items[index] = item; else items.push(item); render(); if (notify && (!previous || previous.status !== item.status || previous.title !== item.title)) toast(item);
  }
  function snapshot(values) { if (Array.isArray(values)) values.forEach((value) => upsert(value, false)); }
  function disconnect() {
    if (typeof unsubscribe === 'function') { try { unsubscribe(); } catch (_) {} } unsubscribe = null; bridge = null; bindingId = ''; items = []; if (root) root.remove(); root = list = counts = empty = toastHost = null; delete window.__NOVA_OWNER_OPERATIONS__;
  }
  async function connect() {
    const candidate = window[BRIDGE]; if (!candidate || typeof candidate.getOwnerState !== 'function') return false;
    let owner; try { owner = await Promise.resolve(candidate.getOwnerState()); } catch (_) { return false; }
    if (!validOwner(owner)) { disconnect(); return false; }
    const nextBinding = clean(owner.bindingId, 160); if (bindingId && bindingId !== nextBinding) disconnect(); bridge = candidate; bindingId = nextBinding; mount();
    if (typeof unsubscribe === 'function') { try { unsubscribe(); } catch (_) {} } unsubscribe = null;
    if (typeof bridge.subscribe === 'function') { try { const stop = bridge.subscribe((event) => upsert(event, true)); if (typeof stop === 'function') unsubscribe = stop; } catch (_) {} }
    if (typeof bridge.getWorkItems === 'function') { try { snapshot(await Promise.resolve(bridge.getWorkItems())); } catch (_) {} }
    render();
    window.__NOVA_OWNER_OPERATIONS__ = Object.freeze({ version: VERSION, isLinked: () => Boolean(bridge && bindingId), refresh: async () => { if (!bridge || typeof bridge.getWorkItems !== 'function') return false; try { snapshot(await Promise.resolve(bridge.getWorkItems())); return true; } catch (_) { return false; } } });
    return true;
  }
  function boot() {
    void connect(); window.addEventListener('NOVA_OWNER_PHONE_READY', () => void connect()); window.addEventListener('pageshow', () => void connect()); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void connect(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
