(() => {
  'use strict';

  const VERSION = '1.7.4';
  window.__NOVA_VERSION = VERSION;

  function mountUpdateBadge() {
    if (!document.body || document.getElementById('nova-auto-update-test-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'nova-auto-update-test-badge';
    badge.setAttribute('aria-label', `NOVA TANKS version ${VERSION} automatic update test`);
    badge.textContent = `v${VERSION} · AUTO-UPDATE TEST`;
    Object.assign(badge.style, {
      position: 'fixed',
      left: '10px',
      bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      zIndex: '2147483647',
      padding: '5px 8px',
      border: '1px solid rgba(77, 227, 255, 0.55)',
      borderRadius: '999px',
      background: 'rgba(4, 6, 13, 0.82)',
      boxShadow: '0 0 14px rgba(77, 227, 255, 0.22)',
      color: '#7df3ff',
      fontFamily: 'Orbitron, ui-sans-serif, system-ui, sans-serif',
      fontSize: '9px',
      fontWeight: '700',
      letterSpacing: '0.08em',
      lineHeight: '1.2',
      pointerEvents: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      opacity: '0.94',
    });

    document.body.appendChild(badge);
    document.documentElement.dataset.novaVersion = VERSION;
    document.title = `NOVA TANKS · v${VERSION}`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountUpdateBadge, { once: true });
  } else {
    mountUpdateBadge();
  }
})();
