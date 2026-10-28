/** 关于弹窗：版本、作者、许可证与仓库地址。 */

import { APP_AUTHOR, APP_VERSION, REPO_URL } from '../version.js';
import { el, modal } from './dom.js';

export function openAboutModal(): void {
  const repo = el('a', 'about-link', [REPO_URL]);
  repo.href = REPO_URL;
  repo.target = '_blank';
  repo.rel = 'noreferrer noopener';

  const body = el('div', 'modal-body about-body', [
    el('div', 'about-head', [
      el('img', 'about-icon', []),
      el('div', '', [
        el('h3', '', ['AI 参数化模型']),
        el('div', 'about-sub', ['Parametric Model Maker for Snapmaker Orca']),
      ]),
    ]),
    el('div', 'about-grid', [
      el('span', '', ['版本']),
      el('strong', '', [`v${APP_VERSION}`]),
      el('span', '', ['开发者']),
      el('strong', '', [APP_AUTHOR]),
      el('span', '', ['许可证']),
      el('strong', '', ['GPL-2.0-only']),
      el('span', '', ['仓库']),
      repo,
    ]),
    el('p', 'about-note', [
      '用自然语言生成可打印的 OpenSCAD 参数化模型：浏览器内真实编译、3D 预览、调参、导出 STL / 3MF。',
    ]),
  ]);

  const icon = body.querySelector<HTMLImageElement>('.about-icon');
  if (icon) icon.src = './icon.svg';

  modal('关于', body, () => {});
}
