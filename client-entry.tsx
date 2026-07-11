import { createWordCounter } from './src/wordCounter';

const wordCounter = createWordCounter();

const activate = (): void => {
  wordCounter.mount();
};

const deactivate = (): void => {
  wordCounter.unmount();
};

window.pluginActivators = window.pluginActivators ?? {};
window.pluginActivators['growi-plugin-word-counter'] = { activate, deactivate };
