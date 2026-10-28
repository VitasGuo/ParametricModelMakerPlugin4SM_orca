/** AI 对话面板。 */

import type { ChatEntry, AppState, Store } from '../state/store.js';
import { button, clear, el, textArea } from './dom.js';

export interface ChatPanelOptions {
  container: HTMLElement;
  store: Store;
  /** 返回 false 表示未接受（例如未配置模型），输入框内容保留。 */
  onSend: (text: string) => boolean;
  onReroll: (entry: ChatEntry) => void;
  onExamples: () => void;
  onSettings: () => void;
}

export class ChatPanel {
  private readonly store: Store;
  private readonly onSend: (text: string) => boolean;
  private readonly onReroll: (entry: ChatEntry) => void;
  private readonly messagesEl: HTMLElement;
  private readonly composer: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
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

    this.composer.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.send();
      }
    });

    const composerBox = el('div', 'chat-composer', [
      this.composer,
      el('div', 'composer-row', [
        el('span', 'composer-hint', ['Enter 发送 · Shift+Enter 换行']),
        this.sendButton,
      ]),
    ]);

    options.container.append(head, this.messagesEl, composerBox);
  }

  render(state: AppState): void {
    const signature = state.project.chat
      .map((m) => `${m.id}:${m.text.length}:${m.verification?.status ?? ''}:${m.error ?? ''}`)
      .join('|');
    if (signature !== this.signature) {
      this.signature = signature;
      this.renderMessages(state.project.chat);
      this.scrollToBottom();
    }
    this.sendButton.disabled = state.aiBusy;
    this.composer.disabled = state.aiBusy;
    this.sendButton.textContent = state.aiBusy ? '思考中…' : '发送';
  }

  focusComposer(): void {
    this.composer.focus();
  }

  private send(): void {
    const text = this.composer.value.trim();
    if (!text) return;
    if (!this.onSend(text)) return;
    this.composer.value = '';
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
