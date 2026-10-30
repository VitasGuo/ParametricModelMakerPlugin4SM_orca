/** 项目列表 / 导入导出侧栏。 */

import type { ProjectState } from '../state/store.js';
import {
  deleteProject,
  downloadProjectJson,
  listProjects,
  readProjectFile,
  saveProject,
} from '../storage/projects.js';
import { button, clear, drawer, el } from './dom.js';
import { toast, confirmBar } from './toast.js';

export function openProjectsPanel(
  getCurrent: () => ProjectState,
  onLoad: (project: ProjectState) => void
): void {
  const list = el('div', 'project-list');
  const fileInput = el('input', '');
  fileInput.type = 'file';
  fileInput.accept = '.json,.modellab.json,application/json';
  fileInput.style.display = 'none';

  const body = el('div', 'drawer-body', [
    el('div', 'example-toolbar', [
      button('保存当前项目', 'btn btn-accent', () => {
        // 抽屉打开期间用户可能继续编辑，保存/导出必须取实时项目
        saveProject(getCurrent());
        toast('项目已保存到本机');
        render();
      }),
      button('导出项目 JSON', 'btn', () => downloadProjectJson(getCurrent())),
      button('导入项目 JSON', 'btn', () => fileInput.click()),
    ]),
    list,
    fileInput,
  ]);

  const dialog = drawer('项目', body, () => {}, { side: 'left', width: 460 });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const project = await readProjectFile(file);
      dialog.close();
      onLoad(project);
      toast(`已导入「${project.name}」`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '导入失败', 'error');
    } finally {
      fileInput.value = '';
    }
  });

  function render(): void {
    clear(list);
    const projects = listProjects();
    if (projects.length === 0) {
      list.appendChild(el('div', 'param-empty', ['还没有保存的项目。点上方"保存当前项目"即可。']));
      return;
    }
    for (const project of projects) {
      const row = el('div', 'project-row', [
        el('div', 'info', [
          el('strong', '', [project.name]),
          el('small', '', [
            `${new Date(project.updatedAt).toLocaleString()} · ${project.source.length} 字符`,
          ]),
        ]),
        button('打开', 'btn btn-sm', () => {
          dialog.close();
          onLoad(project);
        }),
        button('删除', 'btn btn-sm btn-ghost', () => {
          confirmBar(`删除项目「${project.name}」？`, () => {
            deleteProject(project.id);
            render();
          });
        }),
      ]);
      list.appendChild(row);
    }
  }

  render();
}
