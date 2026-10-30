import { describe, expect, it } from 'vitest';
import { classifyLogs } from '../src/engine/logs.js';

describe('classifyLogs', () => {
  it('把 Status: NoError 当作噪声，不误判为 error（traps #19）', () => {
    const messages = classifyLogs(['Status: NoError', 'ERROR: Parser error in line 3']);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.level).toBe('error');
  });

  it('真实错误与警告分级正确', () => {
    const messages = classifyLogs([
      'WARNING: Ignoring unknown module in line 7',
      'ERROR: Abort: something failed',
      "ERROR: Can't parse file",
      'ECHO: hello',
    ]);
    expect(messages.map((m) => m.level)).toEqual(['warn', 'error', 'error', 'info']);
    expect(messages[0]?.line).toBe(7);
  });

  it('过滤渲染统计噪声', () => {
    const messages = classifyLogs([
      'Geometries in cache: 12',
      'Total rendering time: 0:00:00.123',
      'Volumes: 1',
      'Vertices: 120',
    ]);
    expect(messages).toHaveLength(0);
  });
});

describe('classifyLogs：CGAL（beta.9）', () => {
  it('CGAL ERROR 是真实错误，不再被当噪声吞掉', () => {
    const messages = classifyLogs(['CGAL ERROR: assertion violation!']);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.level).toBe('error');
  });

  it('CGAL 统计行仍是噪声', () => {
    expect(classifyLogs(['CGAL Polyhedron_3<std::allocator<int>>'])).toHaveLength(0);
  });
});
