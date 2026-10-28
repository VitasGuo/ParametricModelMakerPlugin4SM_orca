/**
 * 主线程编译服务：每次编译新建一个 Worker，结束/超时后销毁。
 *
 * 为什么不用常驻 Worker：OpenSCAD WASM 实例只能安全 execute 一次 callMain
 * （traps #2），复用实例会触发 C++ abort。Worker 启动成本 ~100-300ms，
 * 对交互式编译可以接受；批量变体用并发池隐藏延迟。
 */

import type { CompileRequest, CompileResult, WorkerRequest, WorkerResponse } from './types.js';

export class CompileTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`编译超时（>${Math.round(timeoutMs / 1000)}s）。模型可能过于复杂或存在无限递归。`);
    this.name = 'CompileTimeoutError';
  }
}

export class CompileCrashError extends Error {
  constructor(message: string) {
    super(`OpenSCAD 引擎异常：${message}`);
    this.name = 'CompileCrashError';
  }
}

let requestSeq = 0;

/** 编译一次；编译失败也 resolve（用 ok=false 表示），仅超时/崩溃 reject。 */
export function compile(req: CompileRequest): Promise<CompileResult> {
  const id = ++requestSeq;
  const timeoutMs = req.timeoutMs ?? 20_000;
  const worker = new Worker(new URL('./openscad.worker.ts', import.meta.url), { type: 'module' });

  return new Promise<CompileResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new CompileTimeoutError(timeoutMs)));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      if (res.id !== id) return;
      finish(() => {
        if (res.crash) {
          reject(new CompileCrashError(res.crash));
          return;
        }
        resolve({
          ok: res.ok,
          empty: res.empty,
          format: res.format,
          output: res.output,
          summary: res.summary,
          messages: res.messages,
          durationMs: res.durationMs,
        });
      });
    };

    worker.onerror = (event) => {
      finish(() => reject(new CompileCrashError(event.message || 'Worker 加载失败')));
    };
    worker.onmessageerror = () => {
      finish(() => reject(new CompileCrashError('Worker 返回数据无法反序列化')));
    };

    const message: WorkerRequest = {
      id,
      source: req.source,
      defines: req.defines,
      format: req.format,
      fonts: req.fonts,
    };
    worker.postMessage(message);
  });
}

/** 批量编译（用于变体画廊），默认并发 2。 */
export async function compileBatch(
  requests: CompileRequest[],
  concurrency = 2
): Promise<Array<CompileResult | Error>> {
  const results: Array<CompileResult | Error> = new Array(requests.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < requests.length) {
      const index = next++;
      const req = requests[index]!;
      try {
        results[index] = await compile(req);
      } catch (e) {
        results[index] = e instanceof Error ? e : new Error(String(e));
      }
    }
  }

  const workers = Math.max(1, Math.min(concurrency, requests.length));
  await Promise.all(Array.from({ length: workers }, run));
  return results;
}
