import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ProjectModel, ensureTerrainVolumetric } from '@core/project';
import { recordDebug } from '@core/debug';
import { TerrainMesh } from './terrain';
import { ToolOverlay } from '@tools/types';

export class ViewportRenderer {
  onCameraChange?: (pos: [number, number, number], target: [number, number, number]) => void;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private terrain: TerrainMesh;
  private overlayGroup: THREE.Group;
  private waterPlane: THREE.Mesh;
  private tankLines: THREE.LineSegments;
  private defaultLeftAction: THREE.MOUSE | undefined;
  private defaultEnableRotate = true;
  private hoveringGuard = false;

  constructor(private canvas: HTMLCanvasElement, private project: ProjectModel) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a0c12');

    this.camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 2000);
    this.camera.position.set(...project.camera.position);

    this.controls = new OrbitControls(this.camera, canvas);
    this.defaultLeftAction = this.controls.mouseButtons?.LEFT ?? THREE.MOUSE.ROTATE;
    this.defaultEnableRotate = this.controls.enableRotate;
    this.controls.target.set(...project.camera.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.addEventListener('change', () => {
      this.onCameraChange?.(
        [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        [this.controls.target.x, this.controls.target.y, this.controls.target.z]
      );
    });

    const ambient = new THREE.AmbientLight('#cfd9ff', 0.6);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight('#eef2ff', 0.8);
    dir.position.set(40, 80, 60);
    this.scene.add(dir);

    const grid = new THREE.GridHelper(200, 20, '#2a3346', '#1a2131');
    grid.position.set(project.tank.widthCm / 2, -0.001, project.tank.depthCm / 2);
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(25);
    this.scene.add(axes);

    this.terrain = new TerrainMesh(project);
    this.scene.add(this.terrain.mesh);

    this.tankLines = this.buildTankOutline();
    this.scene.add(this.tankLines);

    this.waterPlane = this.buildWaterPlane();
    this.scene.add(this.waterPlane);

    this.overlayGroup = new THREE.Group();
    this.scene.add(this.overlayGroup);
  }

  private buildTankOutline() {
    const g = new THREE.BufferGeometry();
    const { widthCm, depthCm, tankHeightCm } = this.project.tank;
    const pts: number[] = [];
    const corners = [
      [0, 0, 0],
      [widthCm, 0, 0],
      [widthCm, 0, depthCm],
      [0, 0, depthCm],
      [0, tankHeightCm, 0],
      [widthCm, tankHeightCm, 0],
      [widthCm, tankHeightCm, depthCm],
      [0, tankHeightCm, depthCm]
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7]
    ];
    for (const [a, b] of edges) {
      pts.push(...corners[a], ...corners[b]);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#1f9ed9', opacity: 0.6, transparent: true });
    return new THREE.LineSegments(g, mat);
  }

  private buildWaterPlane() {
    const { widthCm, depthCm, waterlineCm } = this.project.tank;
    const geo = new THREE.PlaneGeometry(widthCm, depthCm, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#4db5ff',
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(widthCm / 2, waterlineCm, depthCm / 2);
    return mesh;
  }

  updateProject(project: ProjectModel) {
    const normalized = { ...project, terrain: ensureTerrainVolumetric(project.terrain) };
    this.project = normalized;
    this.terrain.update(this.project);
    this.scene.remove(this.tankLines);
    this.scene.remove(this.waterPlane);
    this.tankLines = this.buildTankOutline();
    this.scene.add(this.tankLines);
    this.waterPlane = this.buildWaterPlane();
    if (project.settings.showWater) {
      this.scene.add(this.waterPlane);
    }
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  updateTerrain(project: ProjectModel) {
    this.project = project;
    this.terrain.update(project);
  }

  setHoveringTerrain(active: boolean) {
    if (!this.controls.mouseButtons) {
      recordDebug('warn', 'OrbitControls mouseButtons unavailable; cannot toggle hover mode');
      return;
    }
    if (this.hoveringGuard === active) return;
    this.hoveringGuard = active;
    if (active) {
      this.controls.enableRotate = false;
      this.controls.mouseButtons.LEFT = undefined as unknown as THREE.MOUSE;
      recordDebug('info', 'Disabled left-button camera controls while hovering terrain');
    } else {
      this.controls.enableRotate = this.defaultEnableRotate;
      this.controls.mouseButtons.LEFT = this.defaultLeftAction ?? THREE.MOUSE.ROTATE;
      recordDebug('info', 'Restored left-button camera controls after leaving terrain hover');
    }
  }

  updateOverlay(overlay: ToolOverlay | null) {
    this.overlayGroup.clear();
    if (!overlay) return;
    if (overlay.type === 'brush' && overlay.center && overlay.radius) {
      const circleGeo = new THREE.RingGeometry(overlay.radius - 0.1, overlay.radius + 0.1, 64);
      circleGeo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: '#5af2c4', transparent: true, opacity: 0.8, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(circleGeo, mat);
      mesh.position.set(overlay.center[0], 0.05, overlay.center[1]);
      this.overlayGroup.add(mesh);
    }
    if (overlay.type === 'ramp' && overlay.rampPoints) {
      const [a, b] = overlay.rampPoints;
      const pts = [new THREE.Vector3(a[0], 0.05, a[1]), new THREE.Vector3(b[0], 0.05, b[1])];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f2d95a' }));
      this.overlayGroup.add(line);
    }
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera;
  }

  getTerrainMesh() {
    return this.terrain.mesh;
  }

  dispose() {
    this.renderer.dispose();
  }
}
