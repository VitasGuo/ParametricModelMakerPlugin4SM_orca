/**
 * OpenSCAD 编译管线的共享类型。
 *
 * 主线程与 Worker 之间只传纯数据：源码、参数覆盖、输出格式、字体文件；
 * Worker 返回 STL/3MF 字节、编译日志和网格摘要。
 */

/** 参数值（与 Customizer 参数同名）。 */
export type ParamValue = string | number | boolean;

/** 参数值字典。 */
export type ParamValues = Record<string, ParamValue>;

export type ExportFormat = 'stl' | '3mf';

/** 一条编译输出（stderr/stdout 拆成结构化消息）。 */
export interface CompileMessage {
  level: 'error' | 'warn' | 'info';
  text: string;
  /** 从 `line N` 提取的行号（1-based），无法提取时为空。 */
  line?: number;
}

/** 网格摘要：用于 AI 验证和 UI 尺寸显示，不参与渲染。 */
export interface MeshSummary {
  triangles: number;
  /** 包围盒（mm）。 */
  bbox: { min: [number, number, number]; max: [number, number, number] };
  /** 尺寸 = max - min（mm）。 */
  size: [number, number, number];
  /** 体积（mm³），非水密网格会失真，仅作参考。 */
  volumeMm3: number;
  /** 表面积（mm²）。 */
  surfaceAreaMm2: number;
}

/** 一次编译的结果。 */
export interface CompileResult {
  ok: boolean;
  /** 空模型（真实引擎 exit=0 也可能输出空 STL）。 */
  empty: boolean;
  format: ExportFormat;
  /** 仅 ok && !empty 时存在。 */
  output?: ArrayBuffer;
  summary?: MeshSummary;
  messages: CompileMessage[];
  durationMs: number;
}

/** 编译请求（主线程 → Worker）。 */
export interface CompileRequest {
  source: string;
  defines: ParamValues;
  format: ExportFormat;
  timeoutMs?: number;
  /** 可选中文字体文件（写入 WASM 虚拟文件系统 /fonts）。 */
  fonts?: Array<{ name: string; data: ArrayBuffer }>;
}

/** Worker 内部消息（带 id）。 */
export interface WorkerRequest extends CompileRequest {
  id: number;
}

/** Worker 响应（带 id）。 */
export interface WorkerResponse {
  id: number;
  ok: boolean;
  empty: boolean;
  format: ExportFormat;
  output?: ArrayBuffer;
  summary?: MeshSummary;
  messages: CompileMessage[];
  durationMs: number;
  /** 未捕获异常（如 WASM abort）。 */
  crash?: string;
}
