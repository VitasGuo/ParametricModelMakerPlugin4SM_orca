/**
 * OpenSCAD 的 CodeMirror 6 StreamLanguage。
 *
 * 只做语法高亮与注释/字符串识别，不做语义分析；编译错误由 OpenSCAD WASM 提供。
 */

import { StreamLanguage, type StreamParser } from '@codemirror/language';

const KEYWORDS = new Set([
  'module',
  'function',
  'if',
  'else',
  'for',
  'let',
  'include',
  'use',
  'true',
  'false',
  'undef',
  'echo',
  'assert',
  'children',
]);

const BUILTINS = new Set([
  'cube',
  'sphere',
  'cylinder',
  'polyhedron',
  'circle',
  'square',
  'polygon',
  'text',
  'import',
  'surface',
  'translate',
  'rotate',
  'scale',
  'resize',
  'mirror',
  'color',
  'offset',
  'hull',
  'minkowski',
  'linear_extrude',
  'rotate_extrude',
  'projection',
  'union',
  'difference',
  'intersection',
  'intersection_for',
  'render',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'abs',
  'sign',
  'floor',
  'ceil',
  'round',
  'sqrt',
  'pow',
  'exp',
  'ln',
  'log',
  'min',
  'max',
  'norm',
  'cross',
  'concat',
  'len',
  'search',
  'lookup',
  'str',
  'chr',
  'ord',
]);

interface ScadState {
  inBlockComment: boolean;
}

const parser: StreamParser<ScadState> = {
  startState: () => ({ inBlockComment: false }),

  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    if (stream.eatSpace()) return null;

    // 行注释
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    // 块注释
    if (stream.match('/*')) {
      state.inBlockComment = true;
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    // Customizer 分组注释内容（已在 comment 中，这里只保证字符串优先）
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^'(?:[^'\\]|\\.)*'/)) return 'string';

    if (stream.match(/^\$[A-Za-z_]\w*/)) return 'variableName.special';
    if (stream.match(/^\d*\.?\d+(?:[eE][-+]?\d+)?/)) return 'number';

    if (stream.match(/^[A-Za-z_]\w*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return 'keyword';
      if (BUILTINS.has(word)) return 'typeName';
      return 'variableName';
    }

    if (stream.match(/^(<=|>=|==|!=|&&|\|\||[+\-*/%^=<>!?:;,.])/)) return 'operator';
    if (stream.match(/^[{}[\]()]/)) return 'bracket';

    stream.next();
    return null;
  },
};

export const openscadLanguage = StreamLanguage.define(parser);
