# Production lock: real NOVA TANKS only

`main` and GitHub Pages must serve the real pre-NOVASTAR NOVA TANKS game.

Required shipping identity: `index.html` contains `__bootModule` and the versioned `nova-updates/` chain.
Forbidden production identity: Vite/Foundation shells booting `/src/main.ts`, `/src/main.tsx`, `%BASE_URL%`, or equivalent NOVASTAR reconstruction entrypoints.

Never merge or reconcile `NOVASTAR-INITIATIVE`, `novastar/*`, or Foundation-only fixes into `main`. Use `production/REAL-NOVA-TANKS` as the emergency recovery reference.
