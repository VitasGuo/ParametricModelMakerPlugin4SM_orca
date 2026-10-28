/** Node 环境下的真实 OpenSCAD WASM 编译，供测试使用。 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import createOpenSCAD from '@lofcz/openscad-wasm';

const wasmBytes = readFileSync(join(process.cwd(), 'node_modules/@lofcz/openscad-wasm/openscad.wasm'));

export interface NodeCompileResult {
  exit: number;
  stl: Uint8Array | null;
  logs: string[];
}

export async function compileScadInNode(code: string, extraArgs: string[] = []): Promise<NodeCompileResult> {
  const logs: string[] = [];
  const instance = await createOpenSCAD({
    noInitialRun: true,
    print: (text) => logs.push(text),
    printErr: (text) => logs.push(`ERR ${text}`),
    instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) {
      WebAssembly.instantiate(wasmBytes, imports).then((result) => done(result.instance));
      return {};
    },
  });

  if (/\btext\s*\(/.test(code)) {
    const { addFonts } = await import('@lofcz/openscad-wasm/fonts');
    addFonts(instance);
  }

  instance.FS.writeFile('/input.scad', code);
  const exit = instance.callMain([
    '/input.scad',
    '--backend',
    'Manifold',
    '--export-format',
    extraArgs.includes('3mf') ? '3mf' : 'binstl',
    ...extraArgs.filter((arg) => arg !== '3mf'),
    '-o',
    extraArgs.includes('3mf') ? '/out.3mf' : '/out.stl',
  ]);

  let stl: Uint8Array | null = null;
  try {
    stl = instance.FS.readFile(extraArgs.includes('3mf') ? '/out.3mf' : '/out.stl') as Uint8Array;
  } catch {
    stl = null;
  }
  return { exit, stl, logs };
}
