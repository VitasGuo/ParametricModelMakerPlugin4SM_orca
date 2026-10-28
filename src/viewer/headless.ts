/**
 * 离屏三视图截图：用于 AI 生成阶段的几何审核，不污染主预览。
 *
 * 输入二进制 STL，输出一张横向拼图（ISO / FRONT / TOP）。
 */

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export interface ContactSheetOptions {
  panelWidth?: number;
  panelHeight?: number;
}

export function renderContactSheet(stl: ArrayBuffer, options: ContactSheetOptions = {}): string {
  const panelWidth = options.panelWidth ?? 512;
  const panelHeight = options.panelHeight ?? 384;

  let renderer: THREE.WebGLRenderer | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  let grid: THREE.GridHelper | null = null;

  try {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(panelWidth, panelHeight, false);
    renderer.setClearColor(0x0d1117, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(1, -1.4, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x88bbff, 1);
    fill.position.set(-1.5, 1.2, 0.6);
    scene.add(fill);

    geometry = new STLLoader().parse(stl);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    material = new THREE.MeshStandardMaterial({ color: 0x9ec5ff, roughness: 0.8, metalness: 0.05 });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const box = geometry.boundingBox ?? new THREE.Box3();
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = Math.max(sphere.radius, 1);

    const gridSize = Math.max(100, Math.ceil(Math.max(sphere.radius * 2.5, 100) / 50) * 50);
    grid = new THREE.GridHelper(gridSize, Math.max(4, Math.round(gridSize / 25)), 0x30363d, 0x21262d);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(center.x, center.y, box.min.z - 0.01);
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(38, panelWidth / panelHeight, 0.1, 100_000);
    camera.up.set(0, 0, 1);

    const out = document.createElement('canvas');
    out.width = panelWidth * 3;
    out.height = panelHeight;
    const ctx = out.getContext('2d');
    if (!ctx) return '';

    const views: Array<{ dir: THREE.Vector3; label: string }> = [
      { dir: new THREE.Vector3(1, -1.25, 0.9).normalize(), label: 'ISO' },
      { dir: new THREE.Vector3(0, -1, 0.12).normalize(), label: 'FRONT' },
      { dir: new THREE.Vector3(0.001, -0.001, 1).normalize(), label: 'TOP' },
    ];

    views.forEach((view, index) => {
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.35;
      camera.position.copy(center.clone().add(view.dir.clone().multiplyScalar(distance)));
      camera.near = Math.max(0.1, radius / 200);
      camera.far = Math.max(10_000, radius * 200);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      renderer!.render(scene, camera);
      ctx.drawImage(renderer!.domElement, index * panelWidth, 0, panelWidth, panelHeight);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(index * panelWidth, panelHeight - 28, panelWidth, 28);
      ctx.fillStyle = '#e6edf3';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillText(view.label, index * panelWidth + 12, panelHeight - 9);
    });

    return out.toDataURL('image/jpeg', 0.86);
  } catch {
    return '';
  } finally {
    geometry?.dispose();
    material?.dispose();
    grid?.geometry.dispose();
    (grid?.material as THREE.Material | undefined)?.dispose();
    renderer?.forceContextLoss();
    renderer?.dispose();
  }
}
