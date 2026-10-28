/**
 * 二进制 STL 解析 + 网格摘要。
 *
 * OpenSCAD 用 `--export-format binstl` 输出二进制 STL：
 *   80 字节 header | uint32 三角形数 | 每个三角形 50 字节
 * 每个三角形：3 个法向量 float32 + 9 个顶点 float32 + uint16 属性。
 *
 * 这里只做摘要（bbox / 尺寸 / 体积 / 表面积），几何渲染交给 three.js STLLoader。
 * 不保留逐顶点数组：验证阶段只需要摘要，避免为大模型复制几 MB 的 Float32Array。
 */

import type { MeshSummary } from './types.js';

export interface ParsedStl {
  summary: MeshSummary;
}

/** 解析二进制 STL；格式不符时返回 null。 */
export function parseBinaryStl(buffer: ArrayBuffer): ParsedStl | null {
  if (buffer.byteLength < 84) return null;
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const expected = 84 + count * 50;
  // 允许尾部有少量对齐填充，但不接受明显截断
  if (buffer.byteLength < expected) return null;

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let volume = 0;
  let area = 0;

  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50;
    const v0x = view.getFloat32(base + 12, true);
    const v0y = view.getFloat32(base + 16, true);
    const v0z = view.getFloat32(base + 20, true);
    const v1x = view.getFloat32(base + 24, true);
    const v1y = view.getFloat32(base + 28, true);
    const v1z = view.getFloat32(base + 32, true);
    const v2x = view.getFloat32(base + 36, true);
    const v2y = view.getFloat32(base + 40, true);
    const v2z = view.getFloat32(base + 44, true);

    for (const v of [
      [v0x, v0y, v0z],
      [v1x, v1y, v1z],
      [v2x, v2y, v2z],
    ] as const) {
      for (let k = 0; k < 3; k++) {
        if (v[k]! < min[k]!) min[k] = v[k]!;
        if (v[k]! > max[k]!) max[k] = v[k]!;
      }
    }

    // 有符号四面体体积：sum(v0 · (v1 × v2)) / 6
    const ax = v1x - v0x;
    const ay = v1y - v0y;
    const az = v1z - v0z;
    const bx = v2x - v0x;
    const by = v2y - v0y;
    const bz = v2z - v0z;
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    area += 0.5 * Math.hypot(cx, cy, cz);
    volume += (v0x * (v1y * v2z - v1z * v2y) + v0y * (v1z * v2x - v1x * v2z) + v0z * (v1x * v2y - v1y * v2x)) / 6;
  }

  const summary: MeshSummary =
    count === 0
      ? {
          triangles: 0,
          bbox: { min: [0, 0, 0], max: [0, 0, 0] },
          size: [0, 0, 0],
          volumeMm3: 0,
          surfaceAreaMm2: 0,
        }
      : {
          triangles: count,
          bbox: { min, max },
          size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
          volumeMm3: Math.abs(volume),
          surfaceAreaMm2: area,
        };

  return { summary };
}
