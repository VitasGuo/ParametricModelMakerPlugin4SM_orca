/**
 * CodeMirror 6 编辑器封装。
 *
 * 目标：比 Monaco 轻量（不引入 language worker），保留行号、括号匹配、
 * 自动缩进、历史、语法高亮与主题。
 */

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { openscadLanguage } from './scad-language.js';

const lightTheme = EditorView.theme(
  {
    '&': {
      color: '#1f2329',
      backgroundColor: 'transparent',
      height: '100%',
      fontSize: '13px',
    },
    '.cm-scroller': {
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      lineHeight: '1.6',
    },
    '.cm-content': {
      caretColor: '#4379fc',
      padding: '10px 0',
    },
    '.cm-gutters': {
      backgroundColor: '#f7f8fa',
      color: '#86909c',
      border: 'none',
      paddingRight: '6px',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(67, 121, 252, 0.06)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(67, 121, 252, 0.08)', color: '#4e5969' },
    '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(67, 121, 252, 0.18)' },
    '.cm-cursor': { borderLeftColor: '#4379fc' },
    '&.cm-focused': { outline: 'none' },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(67, 121, 252, 0.18)',
      outline: '1px solid rgba(67, 121, 252, 0.35)',
    },
  },
  { dark: false }
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: '#86909c', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#af00db' },
  { tag: tags.typeName, color: '#267f99' },
  { tag: tags.string, color: '#a31515' },
  { tag: tags.number, color: '#098658' },
  { tag: tags.operator, color: '#b35900' },
  { tag: tags.bracket, color: '#86909c' },
  { tag: tags.variableName, color: '#1f2329' },
  { tag: tags.special(tags.variableName), color: '#d97706' },
]);

export interface CodeEditorOptions {
  parent: HTMLElement;
  initialSource: string;
  onChange: (source: string) => void;
}

export class CodeEditor {
  private readonly view: EditorView;
  private readonly onChange: (source: string) => void;
  private suppressChange = false;

  constructor(options: CodeEditorOptions) {
    this.onChange = options.onChange;
    this.view = new EditorView({
      parent: options.parent,
      state: EditorState.create({
        doc: options.initialSource,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          openscadLanguage,
          syntaxHighlighting(highlightStyle),
          lightTheme,
          EditorView.lineWrapping,
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || this.suppressChange) return;
            this.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
  }

  getSource(): string {
    return this.view.state.doc.toString();
  }

  /** 外部替换源码（不触发 onChange，避免循环）。 */
  setSource(source: string): void {
    if (source === this.getSource()) return;
    this.suppressChange = true;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: source },
    });
    this.suppressChange = false;
  }

  focus(): void {
    this.view.focus();
  }

  /** 容器从隐藏变为显示后调用，让 CodeMirror 重新测量尺寸。 */
  requestMeasure(): void {
    this.view.requestMeasure();
  }

  dispose(): void {
    this.view.destroy();
  }
}
