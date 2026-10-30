/// <reference lib="webworker" />

/**
 * OpenSCAD WASM 编译 Worker。
 *
 * 每次编译由主线程新建一个 Worker（traps #2：同一 WASM 实例只能 callMain 一次）。
 * Worker 内只做一件事：把 .scad 源码 + -D 覆盖编译成 STL/3MF，返回字节和日志。
 */

import createOpenSCAD from '@lofcz/openscad-wasm';
import { parseCustomizer } from '../core/scad-parser.js';
import { buildDefineArgs } from './defines.js';
import { classifyLogs } from './logs.js';
import { parseBinaryStl } from './stl.js';
import type { WorkerRequest, WorkerResponse } from './types.js';

type OpenSCADInstance = Awaited<ReturnType<typeof createOpenSCAD>>;

const ctx = self as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  const started = performance.now();
  const logs: string[] = [];
  let instance: OpenSCADInstance | null = null;

  try {
    instance = await createOpenSCAD({
      noInitialRun: true,
      print: (text) => logs.push(text),
      printErr: (text) => logs.push(text),
    });

    // text() 才需要字体；fonts 模块内嵌 7.79MB 字体数据，按需加载（traps #4）
    if (/\btext\s*\(/.test(req.source)) {
      const { addFonts } = await import('@lofcz/openscad-wasm/fonts');
      addFonts(instance);
      // 中文字体名只把 ASCII 词字符以外的字符替换掉会互相坍缩，改为只过滤路径/控制字符并去重
      const usedNames = new Set<string>();
      for (const font of req.fonts ?? []) {
        let name = sanitizeFileName(font.name);
        let suffix = 1;
        while (usedNames.has(name.toLowerCase())) {
          const dot = name.lastIndexOf('.');
          name = dot > 0 ? `${name.slice(0, dot)}_${suffix}${name.slice(dot)}` : `${name}_${suffix}`;
          suffix += 1;
        }
        usedNames.add(name.toLowerCase());
        instance.FS.writeFile(`/fonts/${name}`, new Uint8Array(font.data));
      }
    }

    const params = parseCustomizer(req.source).params;
    const defineArgs = buildDefineArgs(params, req.defines);
    const outputPath = req.format === '3mf' ? '/out.3mf' : '/out.stl';

    instance.FS.writeFile('/input.scad', req.source);
    const exit = instance.callMain([
      '/input.scad',
      '--backend',
      'Manifold',
      '--export-format',
      req.format === '3mf' ? '3mf' : 'binstl',
      ...defineArgs,
      '-o',
      outputPath,
    ]);

    const messages = classifyLogs(logs);
    let output: ArrayBuffer | undefined;
    try {
      const bytes = instance.FS.readFile(outputPath) as Uint8Array;
      output = bytes.slice().buffer;
    } catch {
      output = undefined;
    }

    let summary;
    if (output && req.format === 'stl') {
      const parsed = parseBinaryStl(output);
      if (parsed) summary = parsed.summary;
    }

    const empty =
      !output ||
      output.byteLength === 0 ||
      (req.format === 'stl' && (summary?.triangles ?? 0) === 0);
    const response: WorkerResponse = {
      id: req.id,
      ok: exit === 0 && !empty,
      empty,
      format: req.format,
      output,
      summary,
      messages,
      durationMs: Math.round(performance.now() - started),
    };
    ctx.postMessage(response, output ? [output] : []);
  } catch (e) {
    const response: WorkerResponse = {
      id: req.id,
      ok: false,
      empty: true,
      format: req.format,
      messages: classifyLogs(logs),
      durationMs: Math.round(performance.now() - started),
      crash: e instanceof Error ? e.message : String(e),
    };
    ctx.postMessage(response);
  } finally {
    instance = null;
  }
};

/** 只过滤路径分隔符与控制字符：中文字体名必须原样保留，否则多个中文字体坍缩成同名互相覆盖。 */
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim();
  return cleaned || 'font.ttf';
}
