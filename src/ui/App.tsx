import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from './store';
import { buildTools } from '@tools/index';
import { ViewportRenderer } from '@render/viewport';
import { ToolOverlay } from '@tools/types';
import { runSlumpAsync } from '@sim/slump';
import { exportProject, importProject } from '@core/serialization';
import { materialList } from '@core/materials';
import { worldToGrid, indexFor, gridToWorld } from '@core/grid';
import { attachGlobalErrorHooks, recordDebug } from '@core/debug';
import { DebugPanel } from './DebugPanel';

const tools = buildTools();

const TAB_LABELS = ['Model', 'Simulate', 'Analyze'] as const;
type Tab = (typeof TAB_LABELS)[number];

export default function App() {
  const {
    project,
    projects,
    tool,
    setTool,
    updateProject,
    setProject,
    pushHistory,
    undo,
    redo,
    autosave,
    lastSavedAt,
    saveNow,
    loadInitial,
    newProject,
    duplicateProject,
    deleteCurrentProject,
    renameProject,
    helpOpen,
    toggleHelp
  } = useStore();
  const [tab, setTab] = useState<Tab>('Model');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ViewportRenderer | null>(null);
  const [overlay, setOverlay] = useState<ToolOverlay | null>(null);
  const [hud, setHud] = useState('');
  const [slumpProgress, setSlumpProgress] = useState<string | null>(null);
  const slumpCancelRef = useRef(false);
  const lastCameraUpdate = useRef(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const draggingRef = useRef(false);
  const lastTimeRef = useRef<number>(0);
  const paintingRef = useRef(false);
  const paintLoopRef = useRef<number | null>(null);
  const lastPaintHitRef = useRef<{ x: number; z: number; y: number } | null>(null);

  useEffect(() => {
    loadInitial();
    attachGlobalErrorHooks();
    recordDebug('info', 'App bootstrapped');
  }, [loadInitial]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ViewportRenderer(canvas, project);
    renderer.onCameraChange = (pos, target) => {
      const now = performance.now();
      if (now - lastCameraUpdate.current > 120) {
        lastCameraUpdate.current = now;
        updateProject((p) => {
          p.camera = { position: pos, target };
        });
      }
    };
    recordDebug('info', 'Viewport initialized');
    rendererRef.current = renderer;
    let frameId: number;

    const renderLoop = () => {
      renderer.render();
      frameId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const handleResize = () => renderer.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      recordDebug('info', 'Viewport disposed');
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.updateProject(project);
  }, [project]);

  useEffect(() => {
    rendererRef.current?.updateOverlay(overlay);
  }, [overlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') {
        toggleHelp();
      }
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === 'y' && (e.metaKey || e.ctrlKey)) {
        redo();
      }
      const hotkeys: Record<string, any> = {
        '1': 'raise',
        '2': 'lower',
        '3': 'smooth',
        '4': 'flattenSample',
        '5': 'flattenAbsolute',
        '6': 'ramp'
      };
      if (hotkeys[e.key]) {
        setTool(hotkeys[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redo, undo, setTool, toggleHelp]);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const getPointerHit = (event: React.PointerEvent): { x: number; z: number; y: number } | null => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return null;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, renderer.getCamera());
    const intersects = raycaster.intersectObject(renderer.getTerrainMesh());
    if (intersects.length === 0) return null;
    const point = intersects[0].point;
    return { x: point.x, z: point.z, y: point.y };
  };

  const requestRender = () => {
    rendererRef.current?.updateTerrain(project);
    rendererRef.current?.render();
  };

  const stopPaintingLoop = () => {
    if (paintLoopRef.current !== null) {
      cancelAnimationFrame(paintLoopRef.current);
      paintLoopRef.current = null;
    }
    if (paintingRef.current) {
      rendererRef.current?.setPaintingActive(false);
      recordDebug('info', 'Stopped continuous paint loop');
    }
    paintingRef.current = false;
    lastPaintHitRef.current = null;
  };

  const startPaintingLoop = () => {
    if (!paintingRef.current || !lastPaintHitRef.current) return;
    rendererRef.current?.setPaintingActive(true);
    const run = () => {
      if (!paintingRef.current || !lastPaintHitRef.current) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTimeRef.current) / 1000 || 1 / 60);
      lastTimeRef.current = now;
      tools[tool]?.onPointerMove?.(
        { project, commitStroke, requestRender, setHud },
        { worldX: lastPaintHitRef.current.x, worldZ: lastPaintHitRef.current.z, dt, isDragging: true }
      );
      paintLoopRef.current = requestAnimationFrame(run);
    };
    paintLoopRef.current = requestAnimationFrame(run);
    recordDebug('info', 'Started continuous paint loop');
  };

  const commitStroke = () => {
    updateProject(() => {});
    saveNow();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const hit = getPointerHit(e);
    if (!hit) {
      recordDebug('warn', 'Pointer down without terrain hit');
      stopPaintingLoop();
      return;
    }
    draggingRef.current = true;
    lastTimeRef.current = performance.now();
    stopPaintingLoop();
    if (tool === 'paintMaterial') {
      rendererRef.current?.setPaintingActive(true);
      paintingRef.current = true;
      lastPaintHitRef.current = hit;
      startPaintingLoop();
    } else {
      rendererRef.current?.setPaintingActive(false);
    }
    pushHistory();
    const pointerState = {
      worldX: hit.x,
      worldZ: hit.z,
      dt: 1 / 60,
      isDragging: true
    };
    tools[tool]?.onPointerDown?.({ project, commitStroke, requestRender, setHud }, pointerState);
    setOverlay(tools[tool]?.getOverlay?.({ project, commitStroke, requestRender, setHud }) ?? { type: 'brush', center: [hit.x, hit.z], radius: project.settings.brushRadiusCm });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const hit = getPointerHit(e);
    if (!hit) {
      setOverlay(null);
      recordDebug('warn', 'Pointer move without hit result');
      stopPaintingLoop();
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTimeRef.current) / 1000);
    lastTimeRef.current = now;
    if (draggingRef.current) {
      if (tool === 'paintMaterial') {
        rendererRef.current?.setPaintingActive(true);
        paintingRef.current = true;
        lastPaintHitRef.current = hit;
      }
      tools[tool]?.onPointerMove?.(
        { project, commitStroke, requestRender, setHud },
        { worldX: hit.x, worldZ: hit.z, dt, isDragging: true }
      );
    }
    const slope = getSlopeInfo(hit.x, hit.z);
    setHud(`X:${hit.x.toFixed(1)} Z:${hit.z.toFixed(1)} Height:${hit.y.toFixed(1)} Slope:${slope.toFixed(1)}°`);
    setOverlay(
      tools[tool]?.getOverlay?.({ project, commitStroke, requestRender, setHud }) ?? {
        type: 'brush',
        center: [hit.x, hit.z],
        radius: project.settings.brushRadiusCm
      }
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    stopPaintingLoop();
    rendererRef.current?.setPaintingActive(false);
    const hit = getPointerHit(e);
    tools[tool]?.onPointerUp?.(
      { project, commitStroke, requestRender, setHud },
      { worldX: hit?.x ?? 0, worldZ: hit?.z ?? 0, dt: 0, isDragging: false }
    );
    if (project.settings.autoSettle) {
      triggerSettle();
    }
  };

  const getSlopeInfo = (x: number, z: number) => {
    const { terrain, tank } = project;
    const grid = worldToGrid(x, z, terrain.resolution, tank);
    const idx = indexFor(grid.i, grid.j, terrain.resolution);
    const h = terrain.heightGrid[idx];
    const spacing = tank.widthCm / (terrain.resolution - 1);
    const right = terrain.heightGrid[indexFor(Math.min(terrain.resolution - 1, grid.i + 1), grid.j, terrain.resolution)];
    const forward = terrain.heightGrid[indexFor(grid.i, Math.min(terrain.resolution - 1, grid.j + 1), terrain.resolution)];
    const dhdx = (right - h) / spacing;
    const dhdz = (forward - h) / spacing;
    return (Math.atan(Math.hypot(dhdx, dhdz)) * 180) / Math.PI;
  };

  const triggerSettle = () => {
    slumpCancelRef.current = false;
    setSlumpProgress('0%');
    runSlumpAsync(project, {
      maxIterations: 200,
      iterationsPerFrame: 2,
      onProgress: (done, total) => {
        setSlumpProgress(`${Math.round((done / total) * 100)}%`);
      },
      onFinish: () => {
        setSlumpProgress(null);
        updateProject(() => {});
        saveNow();
      },
      cancelSignal: () => slumpCancelRef.current
    });
  };

  const terrainDiagnostics = () => {
    const { heightGrid } = project.terrain;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < heightGrid.length; i++) {
      const v = heightGrid[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min, max };
  };

  const handleExport = () => {
    const bundle = exportProject(project);
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name}.aquascape.json`;
    a.click();
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    const bundle = JSON.parse(text);
    const imported = importProject(bundle);
    setProject(imported);
    saveNow();
  };

  const updateTank = (key: 'widthCm' | 'depthCm' | 'tankHeightCm' | 'waterlineCm', value: number) => {
    updateProject((p) => {
      p.tank = { ...p.tank, [key]: value } as any;
    });
  };

  const resetTank = () => {
    updateProject((p) => {
      p.tank = { widthCm: 78, depthCm: 33, tankHeightCm: 44, waterlineCm: 22 };
    });
  };

  const renderTabContent = () => {
    if (tab === 'Model') return renderModel();
    if (tab === 'Simulate') {
      return (
        <>
          <div className="sidebar">
            <div className="section">
              <h3>Planned simulations</h3>
              <ul>
                <li>Water flow field</li>
                <li>Sediment transport</li>
                <li>Lighting & shading</li>
              </ul>
            </div>
          </div>
          <div className="main" style={{ padding: 24 }}>Simulation workspace coming soon. The current architecture already separates modeling and future solvers.</div>
          <div className="right-panel">
            <div className="section">
              <h3>Modules</h3>
              <div className="small">Hydrodynamics (stub)</div>
              <div className="small">Sand transport (stub)</div>
              <div className="small">Lighting (stub)</div>
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        <div className="sidebar">
          <div className="section">
            <h3>Planned analyses</h3>
            <ul>
              <li>Volume/mass estimates</li>
              <li>Slope & grade maps</li>
              <li>Lighting reach</li>
            </ul>
          </div>
        </div>
        <div className="main" style={{ padding: 24 }}>Analysis dashboards are scaffolded for future releases.</div>
        <div className="right-panel">
          <div className="section">
            <h3>Reports</h3>
            <div className="small">Exportable PDF (future)</div>
            <div className="small">Comparison views (future)</div>
          </div>
        </div>
      </>
    );
  };

  const renderModel = () => (
    <>
      <div className="sidebar">
        <div className="section">
          <h3>Tools</h3>
          <div className="tab-buttons" style={{ flexWrap: 'wrap' }}>
            {(
              [
                { id: 'raise', label: 'Raise [1]' },
                { id: 'lower', label: 'Lower [2]' },
                { id: 'smooth', label: 'Smooth [3]' },
                { id: 'flattenSample', label: 'Flatten Sample [4]' },
                { id: 'flattenAbsolute', label: 'Flatten Absolute [5]' },
                { id: 'ramp', label: 'Ramp [6]' },
                { id: 'paintMaterial', label: 'Paint Material' }
              ] as const
            ).map((t) => (
              <button key={t.id} onClick={() => setTool(t.id as any)} style={{ background: tool === t.id ? '#263049' : undefined }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <h3>Tank</h3>
          {([
            ['widthCm', 'Width (cm)'],
            ['depthCm', 'Depth (cm)'],
            ['tankHeightCm', 'Tank Height (cm)'],
            ['waterlineCm', 'Waterline (cm)']
          ] as const).map(([key, label]) => (
            <div className="controls-grid" key={key}>
              <label>{label}</label>
              <input
                type="number"
                value={project.tank[key]}
                onChange={(e) => updateTank(key, Number(e.target.value))}
                min={1}
              />
              <input
                type="range"
                min={1}
                max={120}
                value={project.tank[key]}
                onChange={(e) => updateTank(key, Number(e.target.value))}
              />
            </div>
          ))}
          <button onClick={resetTank}>Reset to default tank</button>
        </div>

        <div className="section">
          <h3>Brush</h3>
          <label>
            Radius (cm)
            <input
              type="number"
              value={project.settings.brushRadiusCm}
              onChange={(e) => updateProject((p) => (p.settings.brushRadiusCm = Number(e.target.value)))}
              min={1}
            />
          </label>
          <input
            type="range"
            min={1}
            max={80}
            value={project.settings.brushRadiusCm}
            onChange={(e) => updateProject((p) => (p.settings.brushRadiusCm = Number(e.target.value)))}
          />
          <label>
            Strength (mm/s)
            <input
              type="number"
              value={project.settings.brushStrengthMm}
              onChange={(e) => updateProject((p) => (p.settings.brushStrengthMm = Number(e.target.value)))}
              min={1}
            />
          </label>
          <input
            type="range"
            min={1}
            max={120}
            value={project.settings.brushStrengthMm}
            onChange={(e) => updateProject((p) => (p.settings.brushStrengthMm = Number(e.target.value)))}
          />
          <label>
            Falloff
            <select value={project.settings.falloff} onChange={(e) => updateProject((p) => (p.settings.falloff = e.target.value as any))}>
              <option value="linear">Linear</option>
              <option value="smoothstep">Smoothstep</option>
            </select>
          </label>
          <label>
            Absolute height (cm)
            <input
              type="number"
              value={project.settings.flattenAbsoluteHeightCm}
              onChange={(e) => updateProject((p) => (p.settings.flattenAbsoluteHeightCm = Number(e.target.value)))}
            />
          </label>
        </div>

        <div className="section">
          <h3>Materials</h3>
          <select
            value={project.settings.selectedMaterial}
            onChange={(e) => updateProject((p) => (p.settings.selectedMaterial = e.target.value as any))}
          >
            {materialList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (θ {m.reposeAngleDeg}°)
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={project.settings.showMaterialTint}
              onChange={(e) => updateProject((p) => (p.settings.showMaterialTint = e.target.checked))}
            />
            Debug tint overlay
          </label>
        </div>

        <div className="section">
          <h3>Settle</h3>
          <button onClick={triggerSettle} disabled={!!slumpProgress}>Settle terrain</button>
          {slumpProgress && (
            <div className="slider-row">
              <div className="badge">Relaxing {slumpProgress}</div>
              <button onClick={() => (slumpCancelRef.current = true)}>Cancel</button>
            </div>
          )}
          <label>
            <input
              type="checkbox"
              checked={project.settings.autoSettle}
              onChange={(e) => updateProject((p) => (p.settings.autoSettle = e.target.checked))}
            />
            Auto-settle after strokes
          </label>
        </div>

        <div className="section">
          <h3>Projects</h3>
          <label>
            Active project
            <select
              value={project.id}
              onChange={(e) => {
                const found = projects.find((p) => p.id === e.target.value);
                if (found) setProject(found);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="slider-row">
            <input value={project.name} onChange={(e) => renameProject(e.target.value)} />
            <button onClick={saveNow}>Save now</button>
          </div>
          <div className="slider-row">
            <button onClick={newProject}>New</button>
            <button onClick={duplicateProject}>Duplicate</button>
            <button onClick={deleteCurrentProject}>Delete</button>
          </div>
          <div className="slider-row">
            <button onClick={handleExport}>Export</button>
            <label className="badge" style={{ cursor: 'pointer' }}>
              Import
              <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files && handleImport(e.target.files[0])} />
            </label>
          </div>
        </div>
      </div>
      <div className="main">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
      <div className="right-panel">
        <div className="section">
          <h3>View presets</h3>
          <div className="slider-row">
            <button onClick={() => resetCamera('isometric')}>Isometric</button>
            <button onClick={() => resetCamera('top')}>Top</button>
            <button onClick={() => resetCamera('front')}>Front</button>
          </div>
          <label>
            <input
              type="checkbox"
              checked={project.settings.showWater}
              onChange={(e) => updateProject((p) => (p.settings.showWater = e.target.checked))}
            />
            Show waterline
          </label>
        </div>
        <div className="section">
          <h3>Status</h3>
          <div className="small">HUD: {hud || 'Move cursor over terrain'}</div>
          <div className="small">Autosave: {autosave}</div>
          <div className="small">Last updated: {new Date(project.updatedAt).toLocaleTimeString()}</div>
          <div className="small">
            Terrain range: {terrainDiagnostics().min.toFixed(2)}cm - {terrainDiagnostics().max.toFixed(2)}cm
          </div>
        </div>
        <div className="section">
          <h3>Simulate</h3>
          <div className="small">Water flow (planned)</div>
          <div className="small">Sediment transport (planned)</div>
          <div className="small">Lighting (planned)</div>
        </div>
        <div className="section">
          <h3>Analyze</h3>
          <div className="small">Slope map (planned)</div>
          <div className="small">Volume estimator (planned)</div>
          <div className="small">Shading report (planned)</div>
        </div>
      </div>
    </>
  );

  function resetCamera(mode: 'top' | 'front' | 'isometric') {
    updateProject((p) => {
      if (mode === 'top') {
        p.camera.position = [p.tank.widthCm / 2, 120, p.tank.depthCm / 2];
      } else if (mode === 'front') {
        p.camera.position = [p.tank.widthCm / 2, 50, p.tank.depthCm + 80];
      } else {
        p.camera.position = [p.tank.widthCm * 0.8, 60, p.tank.depthCm * 1.4];
      }
      p.camera.target = [p.tank.widthCm / 2, 0, p.tank.depthCm / 2];
    });
    rendererRef.current?.updateProject(project);
  }

  return (
    <div className="layout">
      <div className="topbar">
        <div className="tab-buttons">
          {TAB_LABELS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? '#1d2435' : undefined }}>
              {t}
            </button>
          ))}
        </div>
        <div className="autosave">
          <span className="badge">Aquascape Lab MVP</span>
          <span className="small">Autosave: {autosave}</span>
          {lastSavedAt && <span className="small">Last saved {new Date(lastSavedAt).toLocaleTimeString()}</span>}
          <button onClick={() => setDebugOpen(true)} style={{ padding: '6px 10px' }}>
            Debug
          </button>
        </div>
      </div>
      {renderTabContent()}
      <div className="status-bar">
        <div>Tool: {tools[tool]?.name}</div>
        <div>{hud}</div>
      </div>
      {helpOpen && <HelpOverlay onClose={() => toggleHelp(false)} />}
      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </div>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-card" onClick={(e) => e.stopPropagation()}>
        <h2>Controls</h2>
        <div className="help-grid">
          <div>
            <strong>Navigation</strong>
            <div>Orbit/Pan/Zoom via mouse or trackpad</div>
            <div>Home: view presets on the right</div>
          </div>
          <div>
            <strong>Sculpting</strong>
            <div>[1] Raise, [2] Lower, [3] Smooth</div>
            <div>[4] Flatten sampled, [5] Flatten absolute, [6] Ramp</div>
            <div>Paint Material tool for substrate types</div>
          </div>
          <div>
            <strong>Undo/Redo</strong>
            <div>Cmd/Ctrl+Z undo</div>
            <div>Cmd/Ctrl+Shift+Z redo</div>
            <div>Cmd/Ctrl+Y redo</div>
          </div>
          <div>
            <strong>Project</strong>
            <div>Autosaves after each stroke</div>
            <div>Export/Import via sidebar</div>
          </div>
        </div>
        <button style={{ marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
