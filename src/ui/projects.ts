/** 项目列表 / 导入导出弹窗。 */

import type { ProjectState } from '../state/store.js';
import {
  deleteProject,
  downloadProjectJson,
  listProjects,
  readProjectFile,
  saveProject,
} from '../storage/projects.js';
import { button, clear, el, modal } from './dom.js';
import { toast } from './toast.js';

export function openProjectsModal(
  current: ProjectState,
  onLoad: (project: ProjectState) => void
): void {
  const list = el('div', 'project-list');
  const fileInput = el('input', '');
  fileInput.type = 'file';
  fileInput.accept = '.json,.modellab.json,application/json';
  fileInput.style.display = 'none';

  const body = el('div', 'modal-body', [
    el('div', 'example-toolbar', [
      button('保存当前项目', 'btn btn-accent', () => {
        saveProject(current);
        toast('项目已保存到本机');
        render();
      }),
      button('导出项目 JSON', 'btn', () => downloadProjectJson(current)),
      button('导入项目 JSON', 'btn', () => fileInput.click()),
    ]),
    list,
    fileInput,
  ]);

  const dialog = modal('项目', body, () => {});

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
          if (!window.confirm(`删除项目「${project.name}」？`)) return;
          deleteProject(project.id);
          render();
        }),
      ]);
      list.appendChild(row);
    }
  }

  render();
}
