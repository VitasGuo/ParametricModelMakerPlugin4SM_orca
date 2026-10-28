/**
 * 可选 CJK 字体存储（IndexedDB）。
 *
 * OpenSCAD WASM 内置字体只含 Liberation（无中文）。用户上传 .ttf/.ttc 后，
 * Worker 会写入虚拟文件系统 /fonts，源码里用 `text(..., font="SimHei")` 即可渲染中文。
 *
 * 字体文件通常 5~20MB，不适合 localStorage，所以用 IndexedDB；模块级 cache
 * 让编译时同步取用。
 */

export interface CjkFont {
  name: string;
  data: ArrayBuffer;
}

const DB_NAME = 'model-lab-web';
const STORE = 'fonts';
const KEY = 'cjk';

let cache: CjkFont | null = null;

export async function initCjkFont(): Promise<CjkFont | null> {
  try {
    const db = await openDb();
    const stored = await requestToPromise<CjkFont | undefined>(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    );
    db.close();
    cache = stored ?? null;
  } catch {
    cache = null;
  }
  return cache;
}

/** 编译时同步取字体（initCjkFont / saveCjkFont 之后有效）。 */
export function getCjkFont(): CjkFont | null {
  return cache;
}

export async function saveCjkFont(file: File): Promise<CjkFont> {
  const font: CjkFont = { name: file.name, data: await file.arrayBuffer() };
  cache = font;
  try {
    const db = await openDb();
    await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(font, KEY));
    db.close();
  } catch {
    // IndexedDB 不可用时仅本次会话有效
  }
  return font;
}

export async function clearCjkFont(): Promise<void> {
  cache = null;
  try {
    const db = await openDb();
    await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY));
    db.close();
  } catch {
    // ignore
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}
