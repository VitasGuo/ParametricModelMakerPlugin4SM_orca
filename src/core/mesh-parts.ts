/**
 * 网格分件（装配体支持）。
 *
 * OpenSCAD 一次只输出一个网格；装配体在源码里是"多件并列摆放"，
 * 打印准备时需要按连通实体拆开、分别导出。
 * 这里按共享顶点做并查集，把二进制 STL 拆成互不相连的实体，
 * 同时重算每件的包围盒/体积，并按需写出独立的二进制 STL。
 *
 * 注意：相互穿插的零件在 OpenSCAD 布尔并集阶段已经被烘成一个实体，
 * 分件也救不回来——装配示意图必须留间隙（见提示词「装配体与分件」）。
 */

export type Vec3 = [number, number, number];

export interface MeshPart {
  /** 0 起的序号（按 STL 中首次出现的三角形顺序）。 */
  index: number;
  triangles: number;
  bbox: { min: Vec3; max: Vec3 };
  size: Vec3;
  /** 有符号四面体体积求和（mm³），非水密实体会失真，仅作参考。 */
  volumeMm3: number;
}

export interface SplitMeshResult {
  parts: MeshPart[];
  /** 与 parts 等长、下标对齐的二进制 STL（供分件下载）。 */
  stls: ArrayBuffer[];
}

/** 超过这个三角形数就不拆：并查集要建几十万字符串键，会明显卡住 UI。 */
const MAX_PART_TRIANGLES = 300_000;

/** 顶点焊接精度（mm）。Manifold 输出的共享顶点是逐位相同的，1e-3 足够。 */
const WELD_DIGITS = 3;

/**
 * 只统计分件信息，不生成 STL。供 part_spec 的 parts 检查与摘要使用。
 * 网格过大/损坏时返回 null。
 */
export function analyzeMeshParts(buffer: ArrayBuffer): MeshPart[] | null {
  const core = partition(buffer);
  return core ? measureParts(core) : null;
}

/** 拆分并同时生成每件的 STL。网格过大/损坏时返回 null。 */
export function splitMeshParts(buffer: ArrayBuffer): SplitMeshResult | null {
  const core = partition(buffer);
  if (!core) return null;
  const parts = measureParts(core);
  return { parts, stls: parts.map((part) => buildPartStl(core, part.index)) };
}

/** 一行式摘要，供日志与验证备注。 */
export function describeMeshParts(parts: MeshPart[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return '[分件] 1 个独立实体';
  const units = parts
    .slice(0, 6)
    .map((p) => `${p.size.map((n) => n.toFixed(1)).join('×')}mm`)
    .join(', ');
  const tail = parts.length > 6 ? ' …' : '';
  return `[分件] ${parts.length} 个独立实体：${units}${tail}`;
}

// ───────────────────────── 连通分量 ─────────────────────────

interface PartitionCore {
  view: DataView;
  count: number;
  /** 每个三角形所属的分件序号（0 起）。 */
  labels: Int32Array;
  partCount: number;
}

function partition(buffer: ArrayBuffer): PartitionCore | null {
  if (buffer.byteLength < 84) return null;
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  if (count === 0) return null;
  if (count > MAX_PART_TRIANGLES) return null;
  if (buffer.byteLength < 84 + count * 50) return null;

  // 顶点焊接：同一坐标 → 同一顶点 id
  const vertexIds = new Map<string, number>();
  const triVerts = new Int32Array(count * 3);
  const parent = new Uint32Array(count);
  const rank = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) parent[i] = i;

  for (let i = 0; i < count; i += 1) {
    const base = 84 + i * 50 + 12;
    for (let k = 0; k < 3; k += 1) {
      const offset = base + k * 12;
      const key =
        view.getFloat32(offset, true).toFixed(WELD_DIGITS) +
        ',' +
        view.getFloat32(offset + 4, true).toFixed(WELD_DIGITS) +
        ',' +
        view.getFloat32(offset + 8, true).toFixed(WELD_DIGITS);
      let id = vertexIds.get(key);
      if (id === undefined) {
        id = vertexIds.size;
        vertexIds.set(key, id);
      }
      triVerts[i * 3 + k] = id;
    }
  }

  // 共享任一顶点（一条边或一个点接触）即视为同一实体
  const firstTri = new Map<number, number>();
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      const vertex = triVerts[i * 3 + k] as number;
      const prev = firstTri.get(vertex);
      if (prev === undefined) firstTri.set(vertex, i);
      else union(parent, rank, prev, i);
    }
  }

  // 根 → 分件序号：按三角形出现顺序编号，保证输出稳定
  const labels = new Int32Array(count);
  const rootIds = new Map<number, number>();
  for (let i = 0; i < count; i += 1) {
    const root = find(parent, i);
    let id = rootIds.get(root);
    if (id === undefined) {
      id = rootIds.size;
      rootIds.set(root, id);
    }
    labels[i] = id;
  }

  return { view, count, labels, partCount: rootIds.size };
}

function find(parent: Uint32Array, i: number): number {
  let root = i;
  while (parent[root] !== root) root = parent[root] as number;
  while (parent[i] !== root) {
    const next = parent[i] as number;
    parent[i] = root;
    i = next;
  }
  return root;
}

function union(parent: Uint32Array, rank: Uint8Array, a: number, b: number): void {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra === rb) return;
  if (rank[ra]! < rank[rb]!) {
    parent[ra] = rb;
  } else if (rank[ra]! > rank[rb]!) {
    parent[rb] = ra;
  } else {
    parent[rb] = ra;
    rank[ra] = rank[ra]! + 1;
  }
}

// ───────────────────────── 每件统计 ─────────────────────────

function measureParts(core: PartitionCore): MeshPart[] {
  const { view, count, labels, partCount } = core;
  const mins = new Float64Array(partCount * 3).fill(Infinity);
  const maxs = new Float64Array(partCount * 3).fill(-Infinity);
  const volumes = new Float64Array(partCount);
  const triCounts = new Int32Array(partCount);

  for (let i = 0; i < count; i += 1) {
    const part = labels[i] as number;
    triCounts[part] = triCounts[part]! + 1;
    const base = 84 + i * 50 + 12;
    const ax = view.getFloat32(base, true);
    const ay = view.getFloat32(base + 4, true);
    const az = view.getFloat32(base + 8, true);
    const bx = view.getFloat32(base + 12, true);
    const by = view.getFloat32(base + 16, true);
    const bz = view.getFloat32(base + 20, true);
    const cx = view.getFloat32(base + 24, true);
    const cy = view.getFloat32(base + 28, true);
    const cz = view.getFloat32(base + 32, true);

    const slot = part * 3;
    mins[slot] = Math.min(mins[slot]!, ax, bx, cx);
    mins[slot + 1] = Math.min(mins[slot + 1]!, ay, by, cy);
    mins[slot + 2] = Math.min(mins[slot + 2]!, az, bz, cz);
    maxs[slot] = Math.max(maxs[slot]!, ax, bx, cx);
    maxs[slot + 1] = Math.max(maxs[slot + 1]!, ay, by, cy);
    maxs[slot + 2] = Math.max(maxs[slot + 2]!, az, bz, cz);

    volumes[part] =
      volumes[part]! +
      (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }

  const parts: MeshPart[] = [];
  for (let part = 0; part < partCount; part += 1) {
    const slot = part * 3;
    const min: Vec3 = [mins[slot]!, mins[slot + 1]!, mins[slot + 2]!];
    const max: Vec3 = [maxs[slot]!, maxs[slot + 1]!, maxs[slot + 2]!];
    parts.push({
      index: part,
      triangles: triCounts[part]!,
      bbox: { min, max },
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      volumeMm3: Math.abs(volumes[part]!),
    });
  }
  return parts;
}

// ───────────────────────── 分件 STL ─────────────────────────

function buildPartStl(core: PartitionCore, partIndex: number): ArrayBuffer {
  const { view, count, labels } = core;
  const picks: number[] = [];
  for (let i = 0; i < count; i += 1) if (labels[i] === partIndex) picks.push(i);

  const out = new ArrayBuffer(84 + picks.length * 50);
  const target = new DataView(out);
  const header = `Model Lab part ${partIndex + 1}`;
  for (let i = 0; i < header.length && i < 80; i += 1) {
    target.setUint8(i, header.charCodeAt(i));
  }
  target.setUint32(80, picks.length, true);

  picks.forEach((tri, n) => {
    const source = 84 + tri * 50 + 12;
    const base = 84 + n * 50;
    const ax = view.getFloat32(source, true);
    const ay = view.getFloat32(source + 4, true);
    const az = view.getFloat32(source + 8, true);
    const bx = view.getFloat32(source + 12, true);
    const by = view.getFloat32(source + 16, true);
    const bz = view.getFloat32(source + 20, true);
    const cx = view.getFloat32(source + 24, true);
    const cy = view.getFloat32(source + 28, true);
    const cz = view.getFloat32(source + 32, true);

    // 法线 = (v1-v0) × (v2-v0)，归一化后写入（切片器多数会重算，但格式要合法）
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const length = Math.hypot(nx, ny, nz);
    if (length > 0) {
      nx /= length;
      ny /= length;
      nz /= length;
    }
    target.setFloat32(base, nx, true);
    target.setFloat32(base + 4, ny, true);
    target.setFloat32(base + 8, nz, true);
    target.setFloat32(base + 12, ax, true);
    target.setFloat32(base + 16, ay, true);
    target.setFloat32(base + 20, az, true);
    target.setFloat32(base + 24, bx, true);
    target.setFloat32(base + 28, by, true);
    target.setFloat32(base + 32, bz, true);
    target.setFloat32(base + 36, cx, true);
    target.setFloat32(base + 40, cy, true);
    target.setFloat32(base + 44, cz, true);
    target.setUint16(base + 48, 0, true);
  });

  return out;
}
