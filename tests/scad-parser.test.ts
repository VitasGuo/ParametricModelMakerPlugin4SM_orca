import { describe, expect, it } from 'vitest';
import { formatValue, injectParams, parseCustomizer } from '../src/core/scad-parser.js';

describe('parseCustomizer', () => {
  it('解析数值 slider (min:max)', () => {
    const src = `/* [Box] */
length = 100; // [10:200]
`;
    const r = parseCustomizer(src);
    expect(r.params).toHaveLength(1);
    const p = r.params[0]!;
    expect(p.name).toBe('length');
    expect(p.default).toBe(100);
    expect(p.type).toBe('number');
    expect(p.group).toBe('Box');
    expect(p.control).toEqual({ kind: 'slider', min: 10, max: 200 });
  });

  it('记录 valueKind（-D 序列化需要区分字符串/向量/表达式）', () => {
    const r = parseCustomizer(`a = 10;\nb = "red";\nc = true;\nd = [1,2,3];\ne = 2 * PI;\n`);
    expect(r.params.map((p) => p.valueKind)).toEqual(['number', 'string', 'boolean', 'vector', 'expression']);
  });

  it('解析带步进 slider (min:step:max)', () => {
    const src = `width = 50; // [10:5:200]\n`;
    const r = parseCustomizer(src);
    expect(r.params[0]!.control).toEqual({ kind: 'slider', min: 10, max: 200, step: 5 });
  });

  it('解析字符串 enum', () => {
    const src = `color = "red"; // [red,green,blue]\n`;
    const r = parseCustomizer(src);
    expect(r.params[0]).toMatchObject({
      name: 'color',
      default: 'red',
      type: 'string',
      control: { kind: 'enum', options: ['red', 'green', 'blue'] },
    });
  });

  it('解析数字 enum', () => {
    const src = `count = 4; // [0,2,4,8]\n`;
    const r = parseCustomizer(src);
    expect(r.params[0]!.control).toEqual({ kind: 'enumNum', options: [0, 2, 4, 8] });
  });

  it('解析 boolean checkbox', () => {
    const src = `rounded = true;\n`;
    const r = parseCustomizer(src);
    expect(r.params[0]).toMatchObject({
      name: 'rounded',
      default: true,
      type: 'boolean',
      control: { kind: 'checkbox' },
    });
  });

  it('解析 plain text（无控件注释）', () => {
    const src = `label = "box";\n`;
    const r = parseCustomizer(src);
    expect(r.params[0]!.control).toEqual({ kind: 'plain' });
  });

  it('解析 color/font 特殊标记（v0.5.2）', () => {
    const r = parseCustomizer(`bodyColor = "#FF0000"; // color\nfont = "Arial"; // font\n`);
    expect(r.params[0]!.control).toEqual({ kind: 'color' });
    expect(r.params[1]!.control).toEqual({ kind: 'font' });
  });

  it('解析行前注释作为 description（v0.5.2，行尾描述优先）', () => {
    const r = parseCustomizer(`// 盒子总长
length = 100; // [10:200]
// 宽度说明
width = 50; // [10:200] 行尾优先
`);
    expect(r.params[0]!.description).toBe('盒子总长');
    expect(r.params[1]!.description).toBe('行尾优先');
  });

  it('解析带标签枚举 [10:S,20:M,30:L]（v0.5.2）', () => {
    const r = parseCustomizer(`size = 10; // [10:S,20:M,30:L]\n`);
    expect(r.params[0]!.control).toEqual({ kind: 'enumNum', options: [10, 20, 30] });
    const r2 = parseCustomizer(`mode = "a"; // [a:自动,m:手动]\n`);
    expect(r2.params[0]!.control).toEqual({ kind: 'enum', options: ['a', 'm'] });
  });

  it('解析 description（方括号外文案）', () => {
    const src = `length = 100; // [10:200] box length\n`;
    const r = parseCustomizer(src);
    expect(r.params[0]!.description).toBe('box length');
  });

  it('识别 Hidden 分组', () => {
    const src = `/* [Hidden] */
$fn = 64;
/* [Visible] */
size = 10;
`;
    const r = parseCustomizer(src);
    expect(r.hiddenGroups).toContain('Hidden');
    // Hidden 组的参数仍然被收集（只是 UI 隐藏），group 字段为 "Hidden"
    const fn = r.params.find((p) => p.name === '$fn');
    expect(fn?.group).toBe('Hidden');
  });

  it('支持 $fn 等特殊变量', () => {
    const src = `$fn = 64;\n$fa = 12;\n`;
    const r = parseCustomizer(src);
    expect(r.params.map((p) => p.name)).toEqual(['$fn', '$fa']);
  });

  it('不收集函数/模块体内的局部变量', () => {
    const src = `/* [Top] */
size = 10;
module box(x) {
  inner = x * 2;
  cube(inner);
}
`;
    const r = parseCustomizer(src);
    const names = r.params.map((p) => p.name);
    expect(names).toContain('size');
    expect(names).not.toContain('inner');
  });

  it('多分组按顺序归属', () => {
    const src = `/* [A] */
a = 1;
/* [B] */
b = 2;
`;
    const r = parseCustomizer(src);
    expect(r.params.find((p) => p.name === 'a')?.group).toBe('A');
    expect(r.params.find((p) => p.name === 'b')?.group).toBe('B');
  });

  it('分组注释与变量写在同一行时也收集变量', () => {
    const r = parseCustomizer('/* [Box] */ size = 30; // [10:50]\n/* [Hidden] */ $fn = 32;\ncube(size);');
    expect(r.params.map((p) => p.name)).toEqual(['size', '$fn']);
    expect(r.params[0]!.group).toBe('Box');
    expect(r.hiddenGroups).toContain('Hidden');
  });

  it('字符串里的 // 不被当作行注释', () => {
    const r = parseCustomizer('/* [Link] */\nurl = "http://example.com/a"; // 网址\ncube(10);');
    expect(r.params.find((p) => p.name === 'url')?.default).toBe('http://example.com/a');
  });
});

describe('injectParams / formatValue', () => {
  it('formatValue 字符串加引号并转义', () => {
    expect(formatValue('red')).toBe('"red"');
    expect(formatValue('a"b')).toBe('"a\\"b"');
  });

  it('formatValue 数字与布尔原样', () => {
    expect(formatValue(42)).toBe('42');
    expect(formatValue(true)).toBe('true');
  });

  it('injectParams 在尾部追加覆盖块（OpenSCAD last-wins）', () => {
    const out = injectParams('length = 100;\ncube(length);', { length: 150, color: 'blue' });
    // v0.5.2：注入块必须在源码【之后】——OpenSCAD 后定义覆盖先定义，
    // 放头部会被原源码默认值反覆盖（traps.md #16）
    const marker = '// === Model Lab injected params (last-wins overrides) ===';
    expect(out.indexOf(marker)).toBeGreaterThan(out.indexOf('cube(length);'));
    expect(out).toContain('length = 150;');
    expect(out).toContain('color = "blue";');
    // 原源码保留在前面
    expect(out.startsWith('length = 100;')).toBe(true);
  });
});
