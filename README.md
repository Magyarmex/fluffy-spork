# Aquascape Lab

Aquascape Lab is a professional 3D substrate modeling workbench for designing aquariums in centimeter-accurate space. The MVP focuses on a deterministic heightfield terrain editor with material-aware settling, scaffolded Simulate/Analyze navigation, and GitHub Pages hosting.

## Features
- **Model tab** with orbit/pan/zoom 3D viewport, tank wireframe, waterline toggle, grid and axis helpers.
- **Terrain**: 256×256 heightfield, real-world units (cm), precise world↔grid mapping, vertex-normal recompute on edits.
- **Tools**: Raise, Lower, Smooth, Flatten-to-sampled, Flatten-to-absolute, Ramp, and Paint Material with brush radius/strength and linear/smoothstep falloff.
- **Materials**: Fine Sand, Coarse Sand, Gravel, Soil with repose/cohesion presets and optional tint overlay.
- **Slump solver**: Deterministic, incremental relaxation with cancel + progress indicator and auto-settle toggle.
- **Undo/Redo**: Stroke-based history with hotkeys and capped depth.
- **Projects**: Create, duplicate, rename, delete, select, autosave (IndexedDB), export/import full snapshot, camera persistence.
- **Navigation**: View presets (Top/Front/Isometric), help overlay (`?`), status HUD with slope/position/height and terrain diagnostics.
- **Scaffolding** for future Simulate (water flow, sediment) and Analyze (slope maps, volume, lighting) modules.

## Getting started
```bash
npm install
npm run dev
```
Open the printed local URL (Vite dev server). The app targets modern browsers over HTTPS and is optimized for GitHub Pages hosting.

### Scripts
- `npm run dev` – Vite dev server
- `npm run build` – Type-check + production build
- `npm run test` – Node built-in tests (mapping, serialization roundtrip, slump invariants)

## Controls & keybinds
- Orbit/pan/zoom via mouse/trackpad (OrbitControls).
- Tool hotkeys: `[1]` Raise, `[2]` Lower, `[3]` Smooth, `[4]` Flatten sampled, `[5]` Flatten absolute, `[6]` Ramp.
- Undo: `Ctrl/Cmd+Z`; Redo: `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y`.
- `?` toggles the help overlay with quick references.
- View presets on the right panel: Top, Front, Isometric.

## Tank sizing
Use the **Tank** sliders/inputs (width, depth, tank height, waterline). Click **Reset to default tank** to restore 78×33×44cm with a 22cm waterline. Geometry, waterline, and world↔grid mapping update immediately.

## Sculpting workflow
1. Pick a tool in the left palette.
2. Set brush radius (cm), strength (mm/s), falloff (linear/smoothstep), and absolute flatten height if needed.
3. Click-drag on the terrain; strokes are dt-based and saved atomically. Brush preview shows radius; HUD shows X/Z/height/slope.
4. Use **Settle terrain** to relax unstable slopes; toggle **Auto-settle after strokes** for continuous relaxation.

## Materials
Select a substrate preset (Fine Sand, Coarse Sand, Gravel, Soil) and use **Paint Material**. Enable **Debug tint overlay** to view subtle material coloration with a legend. Material strokes are undoable and captured per stroke.

## Substrate settling
- Deterministic neighbor relaxation uses repose angle and cohesion per material.
- Runs incrementally per frame with a progress indicator and cancel control.
- Auto-saves on completion; auto-settle can run after each stroke.

## Projects, autosave, persistence
- Projects store tank dimensions, terrain, materials, camera, settings, and resolution.
- Autosaves after strokes and after settling. Manual **Save now** is available.
- IndexedDB schema with last-project pointer; the last session restores automatically.
- **Projects** panel: new, duplicate, delete, rename, picker dropdown.
- **Export/Import**: saves a portable JSON bundle (versioned); importing creates/loads a new project.

## Export/Import format
Exports include metadata plus base64-encoded height/material grids. Imports validate the version and recreate arrays byte-for-byte.

## Architecture overview
```
src/
  core/    # project model, materials, grid mapping, serialization, persistence
  render/  # three.js setup, terrain mesh, overlays, waterline/tank outline
  sim/     # slump solver (deterministic), future simulation stubs
  tools/   # tool interfaces, brush math, sculpt/material/ramp tools
  ui/      # React UI, store (Zustand), navigation, panels, help overlay
```
- React + Vite + TypeScript + three.js, Zustand for app state.
- Separation between simulation/modeling logic and UI rendering; tools mutate terrain via shared project model; renderer reads model.

## GitHub Pages deployment
- Workflow `.github/workflows/deploy.yml` builds with `GITHUB_PAGES=true` base and deploys to GitHub Pages on pushes to `main`.
- Enable Pages in repository settings using the **GitHub Actions** source; the published URL will be `https://<user>.github.io/fluffy-spork/`.

## CI
- `.github/workflows/ci.yml` runs install, build, and vitest on pushes/PRs.

## Manual QA checklist
- ✅ Hosted on GitHub Pages URL loads with no console errors (after enabling Pages).
- ✅ Sculpt 10 strokes → undo all → redo all restores terrain.
- ✅ Material paint strokes undo/redo correctly.
- ✅ Create extreme cliff → Settle → collapses into stable terrain.
- ✅ FineSand settles more aggressively than Gravel/Soil (material-dependent).
- ✅ Autosave restores work after refresh; last project restored on return.
- ✅ Export project → import as new project → identical terrain/materials.
- ✅ Sculpting at N=256 remains responsive (dt-based brush updates and incremental settling).
