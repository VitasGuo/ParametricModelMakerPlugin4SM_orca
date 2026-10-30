/** AI 对话面板（支持文字 + 最多 3 张参考图）。 */

import type { ChatEntry, AppState, Store } from '../state/store.js';
import { button, clear, el, input, textArea } from './dom.js';
import { toast } from './toast.js';

export interface ChatPanelOptions {
  container: HTMLElement;
  store: Store;
  /** 返回 false 表示未接受（例如未配置模型），输入框与附件保留。 */
  onSend: (text: string, images: string[], thumbs: string[]) => boolean;
  onReroll: (entry: ChatEntry) => void;
  onExamples: () => void;
  onSettings: () => void;
}

const MAX_IMAGES = 3;
const MAX_SIDE = 1024;
const IMAGE_ONLY_PROMPT = '请参考我上传的图片生成模型';

interface PendingImage {
  /** 发给模型的压缩图（dataURL）。 */
  full: string;
  /** 聊天记录里显示的缩略图（dataURL）。 */
  thumb: string;
}

export class ChatPanel {
  private readonly store: Store;
  private readonly onSend: (text: string, images: string[], thumbs: string[]) => boolean;
  private readonly onReroll: (entry: ChatEntry) => void;
  private readonly messagesEl: HTMLElement;
  private readonly composer: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly attachButton: HTMLButtonElement;
  private readonly attachInput: HTMLInputElement;
  private readonly attachRow: HTMLElement;
  private pending: PendingImage[] = [];
  private signature = '';

  constructor(options: ChatPanelOptions) {
    this.store = options.store;
    this.onSend = options.onSend;
    this.onReroll = options.onReroll;

    const head = el('div', 'panel-head', [
      el('span', 'panel-title', ['AI 建模助手']),
      el('span', 'spacer'),
      button('范例', 'btn btn-sm btn-ghost', options.onExamples),
      button('设置', 'btn btn-sm btn-ghost', options.onSettings),
      button('清空', 'btn btn-sm btn-ghost', () => this.store.clearChat()),
    ]);

    this.messagesEl = el('div', 'chat-messages');
    this.composer = textArea('描述你想要的模型，或说「再大一点」「碗口做成花瓣形」…');
    this.sendButton = button('发送', 'btn btn-accent', () => this.send());

    this.attachInput = input('file');
    this.attachInput.type = 'file';
    this.attachInput.accept = 'image/*';
    this.attachInput.multiple = true;
    this.attachInput.style.display = 'none';
    this.attachInput.addEventListener('change', () => {
      if (this.attachInput.files) this.addFiles(this.attachInput.files);
      this.attachInput.value = '';
    });

    this.attachButton = button('图片', 'btn btn-sm btn-ghost', () => this.attachInput.click());
    this.attachButton.title = `添加参考图（最多 ${MAX_IMAGES} 张）`;

    this.attachRow = el('div', 'chat-attachments');
    this.attachRow.style.display = 'none';

    this.composer.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.send();
      }
    });
    this.composer.addEventListener('paste', (event) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => !!file);
      if (files.length > 0) {
        event.preventDefault();
        this.addFiles(files);
      }
    });

    const composerBox = el('div', 'chat-composer', [
      this.attachRow,
      this.composer,
      el('div', 'composer-row', [
        this.attachButton,
        this.attachInput,
        el('span', 'composer-hint', ['Enter 发送 · Shift+Enter 换行']),
        this.sendButton,
      ]),
    ]);
    composerBox.addEventListener('dragover', (event) => {
      event.preventDefault();
      composerBox.classList.add('dragging');
    });
    composerBox.addEventListener('dragleave', () => composerBox.classList.remove('dragging'));
    composerBox.addEventListener('drop', (event) => {
      event.preventDefault();
      composerBox.classList.remove('dragging');
      if (event.dataTransfer?.files) this.addFiles(event.dataTransfer.files);
    });

    options.container.append(head, this.messagesEl, composerBox);
  }

  render(state: AppState): void {
    const signature = state.project.chat
      .map(
        (m) =>
          `${m.id}:${m.text.length}:${m.images?.length ?? 0}:${m.verification?.status ?? ''}:${m.error ?? ''}`
      )
      .join('|');
    if (signature !== this.signature) {
      this.signature = signature;
      this.renderMessages(state.project.chat);
      this.scrollToBottom();
    }
    this.sendButton.disabled = state.aiBusy;
    this.composer.disabled = state.aiBusy;
    this.attachButton.disabled = state.aiBusy;
    this.sendButton.textContent = state.aiBusy ? '思考中…' : '发送';
  }

  focusComposer(): void {
    this.composer.focus();
  }

  private addFiles(files: FileList | File[]): void {
    if (this.store.state.aiBusy) return;
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (list.length === 0) return;
    const room = MAX_IMAGES - this.pending.length;
    if (room <= 0) {
      toast(`最多 ${MAX_IMAGES} 张参考图`, 'error');
      return;
    }
    if (list.length > room) toast(`最多 ${MAX_IMAGES} 张参考图，已取前 ${room} 张`, 'error');
    for (const file of list.slice(0, room)) {
      void compressImage(file)
        .then((image) => {
          this.pending.push(image);
          this.renderAttachments();
        })
        .catch(() => toast(`图片「${file.name}」读取失败`, 'error'));
    }
  }

  private renderAttachments(): void {
    clear(this.attachRow);
    this.attachRow.style.display = this.pending.length > 0 ? '' : 'none';
    this.pending.forEach((image, index) => {
      const thumb = el('img', 'chat-attach-img');
      thumb.src = image.thumb;
      const remove = button('×', 'chat-attach-x', () => {
        this.pending.splice(index, 1);
        this.renderAttachments();
      });
      remove.title = '移除这张参考图';
      this.attachRow.appendChild(el('div', 'chat-attach', [thumb, remove]));
    });
  }

  private send(): void {
    const text = this.composer.value.trim();
    if (!text && this.pending.length === 0) return;
    const images = this.pending.map((image) => image.full);
    const thumbs = this.pending.map((image) => image.thumb);
    if (!this.onSend(text || IMAGE_ONLY_PROMPT, images, thumbs)) return;
    this.composer.value = '';
    this.pending = [];
    this.renderAttachments();
  }

  private renderMessages(chat: ChatEntry[]): void {
    clear(this.messagesEl);
    for (const entry of chat) {
      this.messagesEl.appendChild(this.renderEntry(entry));
    }
    if (chat.length === 0) {
      this.messagesEl.appendChild(
        el('div', 'msg system', [
          '告诉我你想要什么，例如「做一个仿瓷器的高足碗」，或先从范例库挑一个改。',
        ])
      );
    }
  }

  private renderEntry(entry: ChatEntry): HTMLElement {
    const classes = ['msg', entry.role];
    if (entry.error) classes.push('error');
    const box = el('div', classes.join(' '));

    if (entry.images?.length) {
      const row = el('div', 'msg-images');
      for (const src of entry.images) {
        const image = el('img', 'msg-image');
        image.src = src;
        row.appendChild(image);
      }
      box.appendChild(row);
    }

    if (entry.text) box.appendChild(el('div', '', [entry.text]));
    if (entry.error) box.appendChild(el('div', '', [entry.error]));

    if (entry.verification) {
      const { status, notes } = entry.verification;
      const label =
        status === 'passed' ? '验证通过' : status === 'failed' ? '验证未通过' : '未验证（跳过）';
      const shown = notes.slice(0, 4);
      const badge = el('div', `verify ${status}`, [
        `${label}${shown.length ? `\n${shown.map((n) => `· ${n}`).join('\n')}` : ''}`,
      ]);
      box.appendChild(badge);
    }

    if (entry.rerollContext && entry.role === 'assistant') {
      const tools = el('div', 'msg-tools', [
        button('重抽', 'btn btn-sm', () => this.onReroll(entry)),
      ]);
      box.appendChild(tools);
    }

    return box;
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }
}

/** 压缩成 JPEG dataURL：限制最长边，并把透明背景铺白（视觉模型不需要 alpha）。 */
async function compressImage(file: File): Promise<PendingImage> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      full: drawJpeg(bitmap, MAX_SIDE, 0.82),
      thumb: drawJpeg(bitmap, 160, 0.7),
    };
  } finally {
    bitmap.close();
  }
}

function drawJpeg(bitmap: ImageBitmap, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}
