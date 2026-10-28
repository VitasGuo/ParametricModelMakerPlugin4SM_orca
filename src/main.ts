import { App } from './ui/app.js';
import { setupI18n } from './i18n.js';

setupI18n();

const root = document.getElementById('app');
if (!root) throw new Error('#app 不存在');

new App(root);
