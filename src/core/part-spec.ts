/**
 * 特征级尺寸核验（part_spec）。
 *
 * AI 在 replaceSource 里可以声明几条"关键尺寸"，这里用真实编译出的网格做射线测量，
 * 把偏差回灌给重抽，避免"说要 M8，孔画成 9mm""说 12 齿，实际 10 齿"这类问题。
 *
 * 只验证可测的东西：整体尺寸、孔径、螺纹牙距、齿轮齿数、双轴中心距、独立实体数。
 * 表面质量、装配手感不在这里判定（那是视觉审核与实物打印的事）。
 */

import { analyzeMeshParts } from './mesh-parts.js';

export type SpecAxis = 'x' | 'y' | 'z';
type Vec3 = [number, number, number];

/** AI 可以声明的一条尺寸检查。都允许一个 tol（毫米），缺省见 DEFAULT_TOL。 */
export type PartCheck =
  /** 整体包围盒尺寸（拆解件按全范围算）。 */
  | { kind: 'size'; expect: [number, number, number]; tol?: number }
  /** 孔：在孔的轴线中点对准孔心，测量径向第一个实体面 → 孔径。 */
  | { kind: 'hole'; at: Vec3; axis?: SpecAxis; diameter: number; tol?: number }
  /** 螺纹牙距：从轴心点沿 +Z 打一条射线，穿过牙型区的实体间隔即牙距。 */
  | { kind: 'pitch'; at: Vec3; radius: number; pitch: number; tol?: number }
  /** 齿数：在分度圆半径上绕一圈采样，数"实体区"的连通段数。 */
  | { kind: 'teeth'; at: Vec3; radius: number; count: number }
  /** 双轴中心距：两轴距离 + 两处都必须是通透轴孔。 */
  | { kind: 'center'; a: Vec3; b: Vec3; distance: number; tol?: number }
  /** 独立实体数：按共享顶点分件，装配体用来核对"应该有几件"。 */
  | { kind: 'parts'; count: number };

export interface SpecCheckResult {
  label: string;
  expected: number;
  measured: number | null;
  tol: number;
  ok: boolean;
  note?: string;
}

export interface SpecReport {
  total: number;
  passed: number;
  /** 未通过项的中文描述，可直接拼进重抽问题清单。 */
  failures: string[];
  results: SpecCheckResult[];
}

/** 缺省公差（mm）。螺纹孔放大一点：牙型本身会吃掉 0.5~1mm。 */
const DEFAULT_TOL: Record<PartCheck['kind'], number> = {
  size: 1.0,
  hole: 1.0,
  pitch: 0.15,
  teeth: 0,
  center: 0.5,
  parts: 0,
};

/** 单次核验最多接受的检查条数，防止模型刷屏。 */
const MAX_CHECKS = 12;

/**
 * 清洗 AI 返回的 part_spec：只保留结构合法、数值有限的条目。
 * 解析失败不是硬错误——没有规格声明照样能编译，只是少了特征级校验。
 */
export function normalizePartSpecs(input: unknown): PartCheck[] {
  if (!Array.isArray(input)) return [];
  const out: PartCheck[] = [];
  for (const raw of input) {
    if (out.length >= MAX_CHECKS) break;
    const check = normalizeOne(raw);
    if (check) out.push(check);
  }
  return out;
}

function normalizeOne(raw: unknown): PartCheck | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const tol = positive(o.tol);

  switch (o.kind) {
    case 'size': {
      const expect = vec3(o.expect);
      if (!expect) return null;
      return { kind: 'size', expect, ...(tol ? { tol } : {}) };
    }
    case 'hole': {
      const at = vec3(o.at);
      const diameter = positive(o.diameter);
      if (!at || !diameter) return null;
      const axis = o.axis === 'x' || o.axis === 'y' || o.axis === 'z' ? o.axis : undefined;
      return { kind: 'hole', at, ...(axis ? { axis } : {}), diameter, ...(tol ? { tol } : {}) };
    }
    case 'pitch': {
      const at = vec3(o.at);
      const radius = positive(o.radius);
      const pitch = positive(o.pitch);
      if (!at || !radius || !pitch) return null;
      return { kind: 'pitch', at, radius, pitch, ...(tol ? { tol } : {}) };
    }
    case 'teeth': {
      const at = vec3(o.at);
      const radius = positive(o.radius);
      const count = Math.round(Number(o.count));
      if (!at || !radius || !Number.isFinite(count) || count <= 0) return null;
      return { kind: 'teeth', at, radius, count };
    }
    case 'center': {
      const a = vec3(o.a);
      const b = vec3(o.b);
      const distance = positive(o.distance);
      if (!a || !b || !distance) return null;
      return { kind: 'center', a, b, distance, ...(tol ? { tol } : {}) };
    }
    case 'parts': {
      const count = Math.round(Number(o.count));
      if (!Number.isFinite(count) || count <= 0 || count > 500) return null;
      return { kind: 'parts', count };
    }
    default:
      return null;
  }
}

function positive(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 3000 ? n : undefined;
}

function vec3(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const nums = value.map((v) => Number(v));
  if (!nums.every((n) => Number.isFinite(n) && Math.abs(n) < 3000)) return null;
  return nums as Vec3;
}

/** 对编译产物执行全部检查。网格不是二进制 STL 或损坏时返回空报告。 */
export function measurePartSpecs(buffer: ArrayBuffer, checks: PartCheck[]): SpecReport {
  const mesh = loadMesh(buffer);
  const results: SpecCheckResult[] = [];
  // 分件统计要建顶点索引，只在声明了 parts 检查时才做
  let partCount: number | null | undefined;
  const resolvePartCount = (): number | null => {
    if (partCount === undefined) partCount = analyzeMeshParts(buffer)?.length ?? null;
    return partCount;
  };
  for (const check of checks) {
    try {
      results.push(...measureOne(mesh, check, resolvePartCount));
    } catch {
      // 单条检查出错不影响其余条目
    }
  }
  return buildReport(results);
}

/** 把报告渲染成一行摘要（供 notes / 重抽上下文）。 */
export function describeSpecReport(report: SpecReport): string {
  if (report.total === 0) return '';
  if (report.failures.length === 0) return `[尺寸核验] ${report.passed}/${report.total} 项通过`;
  return `[尺寸核验] ${report.passed}/${report.total} 项通过；偏差见问题清单`;
}

function buildReport(results: SpecCheckResult[]): SpecReport {
  const failures = results
    .filter((r) => !r.ok)
    .map((r) =>
      r.measured === null
        ? `${r.label}：期望 ${fmt(r.expected)}，无法测得${r.note ? `（${r.note}）` : ''}`
        : `${r.label}：期望 ${fmt(r.expected)} ±${fmt(r.tol)}，实测 ${fmt(r.measured)}${r.note ? `（${r.note}）` : ''}`
    );
  return {
    total: results.length,
    passed: results.length - failures.length,
    failures,
    results,
  };
}

function fmt(n: number): string {
  return Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
}

// ───────────────────────── 单条检查 ─────────────────────────

function measureOne(
  mesh: TriangleSoup,
  check: PartCheck,
  partCount: () => number | null
): SpecCheckResult[] {
  switch (check.kind) {
    case 'size': {
      const tol = check.tol ?? DEFAULT_TOL.size;
      const expected = [check.expect[0]!, check.expect[1]!, check.expect[2]!];
      return (['x', 'y', 'z'] as const).map((axis, i) => {
        const measured = mesh.max[i]! - mesh.min[i]!;
        return {
          label: `整体尺寸 ${axis.toUpperCase()}`,
          expected: expected[i]!,
          measured,
          tol,
          ok: Math.abs(measured - expected[i]!) <= tol,
        };
      });
    }
    case 'hole': {
      const tol = check.tol ?? DEFAULT_TOL.hole;
      const measured = measureHole(mesh, check.at, check.axis ?? 'z');
      return [
        {
          label: `孔径 @${pointLabel(check.at)}`,
          expected: check.diameter,
          measured,
          tol,
          ok: measured !== null && Math.abs(measured - check.diameter) <= tol,
          ...(measured === null ? { note: '射线没有打到孔壁：检查孔心坐标/轴孔是否通透' } : {}),
        },
      ];
    }
    case 'pitch': {
      const tol = check.tol ?? DEFAULT_TOL.pitch;
      const probe = measurePitch(mesh, check.at, check.radius);
      const ok = probe.value !== null && Math.abs(probe.value - check.pitch) <= tol;
      return [
        {
          label: `牙距 @${pointLabel(check.at)} r=${fmt(check.radius)}`,
          expected: check.pitch,
          measured: probe.value,
          tol,
          ok,
          ...(probe.note ? { note: probe.note } : {}),
        },
      ];
    }
    case 'teeth': {
      const measured = measureTeeth(mesh, check.at, check.radius);
      return [
        {
          label: `齿数 @${pointLabel(check.at)} r=${fmt(check.radius)}`,
          expected: check.count,
          measured,
          tol: 0,
          ok: measured !== null && Math.round(measured) === check.count,
          ...(measured === null || measured === 0
            ? { note: '分度圆半径处没有扫到齿：检查 radius 或该处是否真有齿轮' }
            : {}),
        },
      ];
    }
    case 'center': {
      const tol = check.tol ?? DEFAULT_TOL.center;
      const measured = dist(check.a, check.b);
      // 两个轴点必须落在网格包围盒内，防止声明坐标本身就在模型外
      const inBox = (p: Vec3): boolean =>
        [0, 1, 2].every((i) => p[i]! >= mesh.min[i]! - 1 && p[i]! <= mesh.max[i]! + 1);
      const boreA = castRay(mesh, check.a, Z_UP, 400).length === 0;
      const boreB = castRay(mesh, check.b, Z_UP, 400).length === 0;
      const notes: string[] = [];
      if (!inBox(check.a) || !inBox(check.b)) notes.push('轴点坐标在模型包围盒之外');
      else if (!boreA || !boreB)
        notes.push(`A 轴孔${boreA ? '通透' : '被挡'}、B 轴孔${boreB ? '通透' : '被挡'}`);
      return [
        {
          label: `中心距 ${pointLabel(check.a)}↔${pointLabel(check.b)}`,
          expected: check.distance,
          measured,
          tol,
          ok: Math.abs(measured - check.distance) <= tol && boreA && boreB && inBox(check.a) && inBox(check.b),
          ...(notes.length ? { note: notes.join('；') } : {}),
        },
      ];
    }
    case 'parts': {
      const measured = partCount();
      const mismatch = measured !== null && measured !== check.count;
      return [
        {
          label: '独立实体数',
          expected: check.count,
          measured,
          tol: 0,
          ok: measured === check.count,
          ...(measured === null
            ? { note: '网格超过 30 万三角形或无法解析，未做分件统计' }
            : mismatch
              ? { note: '相互穿插的零件会被布尔并集烘成一件；零件间要留 ≥0.5mm 间隙' }
              : {}),
        },
      ];
    }
  }
}

// ───────────────────────── 测量原语 ─────────────────────────

const Z_UP: Vec3 = [0, 0, 1];

function measureHole(mesh: TriangleSoup, at: Vec3, axis: SpecAxis): number | null {
  const axisVec = axisVector(axis);
  const [u, v] = basisOf(axis);
  const dirs = 16;
  const offsets = [-0.5, 0, 0.5];
  let best = Infinity;
  for (const off of offsets) {
    const origin: Vec3 = [
      at[0] + axisVec[0] * off,
      at[1] + axisVec[1] * off,
      at[2] + axisVec[2] * off,
    ];
    for (let k = 0; k < dirs; k += 1) {
      const ang = (2 * Math.PI * k) / dirs;
      const dir: Vec3 = [
        u[0] * Math.cos(ang) + v[0] * Math.sin(ang),
        u[1] * Math.cos(ang) + v[1] * Math.sin(ang),
        u[2] * Math.cos(ang) + v[2] * Math.sin(ang),
      ];
      const first = castRay(mesh, origin, dir, 300).find((h) => h.entering);
      if (first && first.t < best) best = first.t;
    }
  }
  return best === Infinity ? null : best * 2;
}

/** 沿 +Z 打射线，取相邻"进入实体"间距的中位数 = 牙距。 */
function measurePitch(
  mesh: TriangleSoup,
  at: Vec3,
  radius: number
): { value: number | null; note?: string } {
  const origin: Vec3 = [at[0] + radius, at[1], at[2]];
  const hits = castRay(mesh, origin, Z_UP, 400).filter((h) => h.entering);
  if (hits.length < 3) {
    return { value: null, note: '射线在牙型区少于 3 次进入：探针半径不在牙高范围内' };
  }
  const gaps = hits.slice(1).map((h, i) => h.t - hits[i]!.t);
  const sorted = [...gaps].sort((a, b) => a - b);
  // 偶数个间距取中间两数的均值，避免系统性偏大（pitch 公差只有 0.15mm）
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  // 间距离散度太大说明探针扫到了别的东西（倒角、台阶、顶面）
  const maxGap = sorted[sorted.length - 1]!;
  if (maxGap > median * 1.8) {
    return { value: median, note: `间距不均匀（最大 ${fmt(maxGap)}），可能扫到非螺纹结构` };
  }
  return { value: median };
}

/** 在给定半径绕一圈采样，统计实体连通段数 = 齿数。 */
function measureTeeth(mesh: TriangleSoup, at: Vec3, radius: number): number | null {
  const samples = 720;
  let teeth = 0;
  let inside = false;
  for (let k = 0; k <= samples; k += 1) {
    const ang = (2 * Math.PI * k) / samples;
    const p: Vec3 = [
      at[0] + radius * Math.cos(ang),
      at[1] + radius * Math.sin(ang),
      at[2],
    ];
    const now = isInside(mesh, p);
    if (k > 0 && now && !inside) teeth += 1;
    inside = now;
  }
  return teeth;
}

function isInside(mesh: TriangleSoup, p: Vec3): boolean {
  return castRay(mesh, p, Z_UP, 400).length % 2 === 1;
}

function axisVector(axis: SpecAxis): Vec3 {
  return axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
}

/** 垂直于轴的二维基。 */
function basisOf(axis: SpecAxis): [Vec3, Vec3] {
  if (axis === 'x') return [[0, 1, 0], [0, 0, 1]];
  if (axis === 'y') return [[0, 0, 1], [1, 0, 0]];
  return [[1, 0, 0], [0, 1, 0]];
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function pointLabel(p: Vec3): string {
  return `(${p.map((n) => n.toFixed(1)).join(', ')})`;
}

// ───────────────────────── 网格射线 ─────────────────────────

interface TriangleSoup {
  /** 每 9 个浮点一个三角形：ax ay az bx by bz cx cy cz。 */
  data: Float64Array;
  /** 每个三角形 6 个浮点的 AABB（minx miny minz maxx maxy maxz），射线预筛用。 */
  bounds: Float32Array;
  min: Vec3;
  max: Vec3;
}

interface Hit {
  /** 沿射线的距离（mm）。 */
  t: number;
  /** 是否从空气中进入实体（用三角形外法线的朝向判定）。 */
  entering: boolean;
}

const DET_EPS = 1e-9;

function loadMesh(buffer: ArrayBuffer): TriangleSoup {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const data = new Float64Array(count * 9);
  const bounds = new Float32Array(count * 6);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < count; i += 1) {
    const base = 84 + i * 50 + 12;
    const bbase = i * 6;
    for (let k = 0; k < 9; k += 1) {
      const value = view.getFloat32(base + k * 4, true);
      data[i * 9 + k] = value;
      const axis = k % 3;
      if (value < min[axis]!) min[axis] = value;
      if (value > max[axis]!) max[axis] = value;
    }
    // 每三角形 AABB：先在加载时算好，castRay 用它做 slab 预筛
    const ax = data[i * 9]!, ay = data[i * 9 + 1]!, az = data[i * 9 + 2]!;
    const bx = data[i * 9 + 3]!, by = data[i * 9 + 4]!, bz = data[i * 9 + 5]!;
    const cx = data[i * 9 + 6]!, cy = data[i * 9 + 7]!, cz = data[i * 9 + 8]!;
    bounds[bbase] = Math.min(ax, bx, cx);
    bounds[bbase + 1] = Math.min(ay, by, cy);
    bounds[bbase + 2] = Math.min(az, bz, cz);
    bounds[bbase + 3] = Math.max(ax, bx, cx);
    bounds[bbase + 4] = Math.max(ay, by, cy);
    bounds[bbase + 5] = Math.max(az, bz, cz);
  }
  return { data, bounds, min, max };
}

/** Möller–Trumbore 求交，返回按距离排序、去重后的命中列表。 */
function castRay(mesh: TriangleSoup, origin: Vec3, dir: Vec3, maxT: number): Hit[] {
  const hits: Hit[] = [];
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = dir;
  const t = mesh.data;
  const b = mesh.bounds;

  for (let i = 0; i < t.length; i += 9) {
    // slab 预筛：三角形 AABB 与射线不相交就跳过，省掉大半 Möller–Trumbore 全量计算
    const bi = (i / 9) * 6;
    let tmin = 0;
    let tmax = maxT;
    let hit = true;
    for (let axis = 0; axis < 3; axis += 1) {
      const o = axis === 0 ? ox : axis === 1 ? oy : oz;
      const d = axis === 0 ? dx : axis === 1 ? dy : dz;
      const lo = b[bi + axis]!;
      const hi = b[bi + axis + 3]!;
      if (Math.abs(d) < 1e-12) {
        if (o < lo || o > hi) {
          hit = false;
          break;
        }
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) {
          hit = false;
          break;
        }
      }
    }
    if (!hit) continue;

    const ax = t[i]!;
    const ay = t[i + 1]!;
    const az = t[i + 2]!;
    const e1x = t[i + 3]! - ax;
    const e1y = t[i + 4]! - ay;
    const e1z = t[i + 5]! - az;
    const e2x = t[i + 6]! - ax;
    const e2y = t[i + 7]! - ay;
    const e2z = t[i + 8]! - az;

    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < DET_EPS) continue;
    const inv = 1 / det;

    const tx = ox - ax;
    const ty = oy - ay;
    const tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-9 || u > 1 + 1e-9) continue;

    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;

    const distance = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (distance <= 1e-5 || distance > maxT) continue;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    hits.push({ t: distance, entering: nx * dx + ny * dy + nz * dz < 0 });
  }

  hits.sort((a, b) => a.t - b.t);
  const merged: Hit[] = [];
  for (const hit of hits) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.t - hit.t) < 2e-3) continue;
    merged.push(hit);
  }
  return merged;
}
