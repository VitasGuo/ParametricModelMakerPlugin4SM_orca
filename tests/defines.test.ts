import { describe, expect, it } from 'vitest';
import { parseCustomizer } from '../src/core/scad-parser.js';
import {
  buildDefineArgs,
  coerceParamValue,
  defaultParamValues,
  mergeParamValues,
  serializeDefineValue,
} from '../src/engine/defines.js';

const SOURCE = `/* [Box] */
width = 10; // [5:50]
color = "red"; // [red,green,blue]
flag = true;
vec = [1,2,3];
label = "box";
mode = 2 * PI;
`;

const params = parseCustomizer(SOURCE).params;
const byName = (name: string) => params.find((p) => p.name === name)!;

describe('defaultParamValues / mergeParamValues', () => {
  it('默认值覆盖所有参数（含表达式/向量）', () => {
    const values = defaultParamValues(SOURCE);
    expect(values).toEqual({
      width: 10,
      color: 'red',
      flag: true,
      vec: '[1,2,3]',
      label: 'box',
      mode: '2 * PI',
    });
  });

  it('源码变化后同名参数保留用户值，新参数用默认值，旧参数丢弃', () => {
    const merged = mergeParamValues(parseCustomizer('width = 20;\nheight = 5;\n').params, {
      width: '30',
      removed: 1,
    });
    expect(merged).toEqual({ width: 30, height: 5 });
  });

  it('AI 返回字符串数字时按参数类型转换', () => {
    expect(coerceParamValue(byName('width'), '25')).toBe(25);
    expect(coerceParamValue(byName('flag'), 'false')).toBe(false);
    expect(coerceParamValue(byName('flag'), '1')).toBe(true);
    expect(coerceParamValue(byName('color'), 'blue')).toBe('blue');
  });
});

describe('serializeDefineValue（traps #5）', () => {
  it('数字/布尔原样', () => {
    expect(serializeDefineValue(20, byName('width'))).toBe('20');
    expect(serializeDefineValue(false, byName('flag'))).toBe('false');
  });

  it('字符串枚举加引号', () => {
    expect(serializeDefineValue('green', byName('color'))).toBe('"green"');
    expect(serializeDefineValue('box"x', byName('label'))).toBe('"box\\"x"');
  });

  it('向量原样传入', () => {
    expect(serializeDefineValue('[4, 5, 6]', byName('vec'))).toBe('[4, 5, 6]');
  });

  it('表达式原样传入', () => {
    expect(serializeDefineValue('3 * PI', byName('mode'))).toBe('3 * PI');
  });

  it('已经带引号的值不再重复加引号', () => {
    expect(serializeDefineValue('"blue"', byName('color'))).toBe('"blue"');
  });
});

describe('buildDefineArgs', () => {
  it('生成扁平的 -D 参数对', () => {
    const args = buildDefineArgs(params, {
      width: 30,
      color: 'blue',
      flag: false,
      vec: '[4,5,6]',
      label: 'my box',
      mode: 'PI',
    });
    expect(args).toEqual([
      '-D',
      'width=30',
      '-D',
      'color="blue"',
      '-D',
      'flag=false',
      '-D',
      'vec=[4,5,6]',
      '-D',
      'label="my box"',
      '-D',
      'mode=PI',
    ]);
  });
});

describe('serializeDefineValue：单引号（beta.9）', () => {
  it('单引号字符串剥引号后按双引号输出（OpenSCAD 不支持单引号）', () => {
    expect(serializeDefineValue("'green'")).toBe('"green"');
    expect(serializeDefineValue("'it\\'s'")).toBe('"it\'s"');
  });

  it('已带双引号的原样透传', () => {
    expect(serializeDefineValue('"green"')).toBe('"green"');
  });
});
