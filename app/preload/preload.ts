import { contextBridge, ipcRenderer } from 'electron';

const PANEL_CLOSE = 'panel:close';
const PANEL_SHOWN = 'panel:shown';
const PANEL_HIDDEN = 'panel:hidden';

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
});
