/**
 * 二进制 STL 结构分析：连通分量、开放边、Z 范围。
 *
 * 用于范例回归：编译成功不代表结构正确——要能发现断成两截、
 * 埋到热床下、破面等"看起来能编译但打印会出问题"的模型。
 */

export interface MeshStructure {
  triangles: number;
  /** 相互不相连的实体数量。 */
  components: number;
  /** 每个实体的三角形数（从大到小）。 */
  sizes: number[];
  /** 不是恰好被两个三角形共享的边数量（>0 表示破面/非流形）。 */
  openEdges: number;
  minZ: number;
  maxZ: number;
}

export function analyzeMesh(buffer: ArrayBuffer): MeshStructure {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const vertexIds = new Map<string, number>();
  const triVerts: number[][] = [];
  const parent: number[] = [];
  let minZ = Infinity;
  let maxZ = -Infinity;

  const vertexId = (x: number, y: number, z: number): number => {
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let id = vertexIds.get(key);
    if (id === undefined) {
      id = vertexIds.size;
      vertexIds.set(key, id);
    }
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    return id;
  };

  for (let i = 0; i < count; i += 1) {
    const base = 84 + i * 50;
    const ids = [0, 1, 2].map((k) => {
      const offset = base + 12 + k * 12;
      return vertexId(
        view.getFloat32(offset, true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true)
      );
    });
    triVerts.push(ids);
    parent.push(i);
  }

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const byVertex = new Map<number, number>();
  triVerts.forEach((ids, tri) => {
    for (const id of ids) {
      const prev = byVertex.get(id);
      if (prev === undefined) byVertex.set(id, tri);
      else union(prev, tri);
    }
  });

  const rootSizes = new Map<number, number>();
  for (let i = 0; i < count; i += 1) {
    const root = find(i);
    rootSizes.set(root, (rootSizes.get(root) ?? 0) + 1);
  }
  const sizes = [...rootSizes.values()].sort((a, b) => b - a);

  const edges = new Map<string, number>();
  for (const ids of triVerts) {
    for (let k = 0; k < 3; k += 1) {
      const a = ids[k]!;
      const b = ids[(k + 1) % 3]!;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let openEdges = 0;
  for (const n of edges.values()) if (n !== 2) openEdges += 1;

  return { triangles: count, components: sizes.length, sizes, openEdges, minZ, maxZ };
}

/** 有符号四面体体积求和（取绝对值），用于装配间隙/碰撞量测试。 */
export function meshVolumeMm3(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  let volume = 0;
  for (let i = 0; i < count; i += 1) {
    const base = 84 + i * 50;
    const p: number[][] = [0, 1, 2].map((k) => {
      const o = base + 12 + k * 12;
      return [view.getFloat32(o, true), view.getFloat32(o + 4, true), view.getFloat32(o + 8, true)];
    });
    const [a, b, c] = p as [number[], number[], number[]];
    volume +=
      (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
        a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
        a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) /
      6;
  }
  return Math.abs(volume);
}
