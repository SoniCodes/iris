import { contextBridge, ipcRenderer } from 'electron';

const PANEL_CLOSE = 'panel:close';
const PANEL_SHOWN = 'panel:shown';
const PANEL_HIDDEN = 'panel:hidden';
const ASK_SUBMIT = 'ask:submit';
const ASK_CANCEL = 'ask:cancel';
const ASK_STATUS = 'ask:status';
const ASK_CHUNK = 'ask:chunk';
const ASK_DONE = 'ask:done';
const ASK_ERROR = 'ask:error';

contextBridge.exposeInMainWorld('iris', {
  close(): void {
    ipcRenderer.send(PANEL_CLOSE);
  },
  onShown(handler: () => void): void {
    ipcRenderer.on(PANEL_SHOWN, () => handler());
  },
  onHidden(handler: () => void): void {
    ipcRenderer.on(PANEL_HIDDEN, () => handler());
  },
  ask(question: string): void {
    ipcRenderer.send(ASK_SUBMIT, question);
  },
  cancel(): void {
    ipcRenderer.send(ASK_CANCEL);
  },
  onStatus(handler: (text: string) => void): void {
    ipcRenderer.on(ASK_STATUS, (_event, text: string) => handler(text));
  },
  onChunk(handler: (text: string) => void): void {
    ipcRenderer.on(ASK_CHUNK, (_event, text: string) => handler(text));
  },
  onDone(handler: () => void): void {
    ipcRenderer.on(ASK_DONE, () => handler());
  },
  onError(handler: (message: string) => void): void {
    ipcRenderer.on(ASK_ERROR, (_event, message: string) => handler(message));
  },
});
