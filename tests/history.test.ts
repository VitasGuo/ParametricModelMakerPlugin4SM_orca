import { describe, expect, it } from 'vitest';
import { autoNameSource } from '../src/storage/history.js';

describe('autoNameSource', () => {
  const timestamp = new Date('2026-10-29T14:03:00').getTime();

  it('优先使用 AI 设计计划 / 说明', () => {
    expect(autoNameSource('// 注释', '带圆角的立方体收纳盒，内部有分隔', timestamp)).toBe(
      '带圆角的立方体收纳盒，内部有分隔'
    );
  });

  it('过长说明截断并加省略号', () => {
    const name = autoNameSource('', '这是一个非常非常长的模型说明'.repeat(4), timestamp);
    expect(name.length).toBeLessThanOrEqual(28);
    expect(name.endsWith('…')).toBe(true);
  });

  it('没有说明时取首个中文注释', () => {
    const source = '/* [尺寸] */\n// 六角笔筒\nsize = 60;\n';
    expect(autoNameSource(source, undefined, timestamp)).toBe('六角笔筒');
  });

  it('没有注释时退化到分组名', () => {
    const source = '/* [杯身] */\nheight = 80;\n';
    expect(autoNameSource(source, undefined, timestamp)).toBe('杯身 参数模型');
  });

  it('都没有时使用时间戳', () => {
    expect(autoNameSource('cube(10);', undefined, timestamp)).toBe('代码 10-29 14:03');
  });
});
