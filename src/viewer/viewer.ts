/**
 * Three.js 3D 预览。
 *
 * 采用 OpenSCAD 的 Z-up 坐标：网格在 XY 平面，Z 轴朝上，和切片软件一致。
 * 模型加载后自动居中、适配相机；支持等轴/前/顶/右四个标准视角和三视图拼图截图。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export type ViewName = 'iso' | 'front' | 'top' | 'right';

export class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly loader = new STLLoader();
  private mesh: THREE.Mesh | null = null;
  private grid: THREE.GridHelper | null = null;
  private readonly resizeObserver: ResizeObserver;
  private wireframe = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0d1117, 0);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100_000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(180, -220, 160);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    const ambient = new THREE.AmbientLight(0xffffff, 1.6);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(200, -300, 400);
    const fill = new THREE.DirectionalLight(0x88bbff, 0.9);
    fill.position.set(-300, 250, 120);
    this.scene.add(ambient, key, fill);

    this.setGrid(200);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  /** 加载二进制 STL。 */
  loadStl(buffer: ArrayBuffer): void {
    this.clearMesh();
    const geometry = this.loader.parse(buffer);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: 0x5b8def,
      roughness: 0.72,
      metalness: 0.04,
      flatShading: false,
      wireframe: this.wireframe,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'model';
    this.mesh = mesh;
    this.scene.add(mesh);

    this.frameObject();
    const size = new THREE.Vector3();
    geometry.boundingBox?.getSize(size);
    this.setGrid(Math.max(100, Math.ceil(Math.max(size.x, size.y) * 2 / 50) * 50));
  }

  clearModel(): void {
    this.clearMesh();
  }

  hasModel(): boolean {
    return this.mesh !== null;
  }

  setWireframe(on: boolean): void {
    this.wireframe = on;
    const material = this.mesh?.material;
    if (material instanceof THREE.MeshStandardMaterial) material.wireframe = on;
  }

  /** 切到标准视角。 */
  setView(name: ViewName): void {
    if (!this.mesh) return;
    const box = new THREE.Box3().setFromObject(this.mesh);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = Math.max(sphere.radius, 1);
    const dir = viewDirection(name);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.35;
    this.camera.position.copy(center.clone().add(dir.multiplyScalar(distance)));
    this.controls.target.copy(center);
    this.camera.near = Math.max(0.1, radius / 200);
    this.camera.far = Math.max(10_000, radius * 200);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** 当前视图截图（PNG dataURL）。 */
  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /**
   * 三视图拼图：等轴 / 正面 / 顶部，横向排列并带标签。
   * 用于喂给视觉模型，单张图比多张图省 token。
   */
  captureContactSheet(): string {
    if (!this.mesh) return '';
    const panelWidth = 512;
    const panelHeight = 384;
    const views: Array<{ name: ViewName; label: string }> = [
      { name: 'iso', label: 'ISO' },
      { name: 'front', label: 'FRONT' },
      { name: 'top', label: 'TOP' },
    ];
    const canvas = document.createElement('canvas');
    canvas.width = panelWidth * views.length;
    canvas.height = panelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const originalPosition = this.camera.position.clone();
    const originalTarget = this.controls.target.clone();

    views.forEach((view, index) => {
      this.setView(view.name);
      this.renderer.render(this.scene, this.camera);
      const img = this.renderer.domElement;
      ctx.drawImage(img, index * panelWidth, 0, panelWidth, panelHeight);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(index * panelWidth, panelHeight - 28, panelWidth, 28);
      ctx.fillStyle = '#e6edf3';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillText(view.label, index * panelWidth + 12, panelHeight - 9);
    });

    this.camera.position.copy(originalPosition);
    this.controls.target.copy(originalTarget);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    return canvas.toDataURL('image/jpeg', 0.86);
  }

  private frameObject(): void {
    if (!this.mesh) return;
    const box = new THREE.Box3().setFromObject(this.mesh);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 1);
    const dir = viewDirection('iso');
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.4;
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center.clone().add(dir.multiplyScalar(distance)));
    this.camera.near = Math.max(0.1, radius / 200);
    this.camera.far = Math.max(10_000, radius * 200);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private setGrid(size: number): void {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
    }
    const grid = new THREE.GridHelper(size, Math.max(4, Math.round(size / 25)), 0xd9dce3, 0xe9ebef);
    grid.rotation.x = Math.PI / 2;
    this.grid = grid;
    this.scene.add(grid);
  }

  private clearMesh(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const material = this.mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
    this.mesh = null;
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.resizeObserver.disconnect();
    this.clearMesh();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function viewDirection(name: ViewName): THREE.Vector3 {
  switch (name) {
    case 'front':
      return new THREE.Vector3(0, -1, 0.12).normalize();
    case 'top':
      return new THREE.Vector3(0.001, -0.001, 1).normalize();
    case 'right':
      return new THREE.Vector3(1, -0.001, 0.12).normalize();
    case 'iso':
    default:
      return new THREE.Vector3(1, -1.25, 0.9).normalize();
  }
}
