/**
 * 构建时由 vite.config.ts 注入版本与作者（来自 package.json）。
 * 单测等非 Vite 环境回退到 dev / VitasGuo。
 */

declare const __APP_VERSION__: string | undefined;
declare const __APP_AUTHOR__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_AUTHOR = typeof __APP_AUTHOR__ === 'string' ? __APP_AUTHOR__ : 'VitasGuo';
