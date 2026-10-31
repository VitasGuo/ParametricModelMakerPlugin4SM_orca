/**
 * 测试辅助：网格结构分析。实现已提升到 src/engine/mesh-structure.ts
 * （运行时验证与测试共用同一份审计代码），这里只做再导出。
 */

export { analyzeMesh, meshVolumeMm3, toArrayBuffer } from '../../src/engine/mesh-structure.js';
export type { MeshStructure } from '../../src/engine/mesh-structure.js';