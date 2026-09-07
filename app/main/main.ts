import { app, ipcMain } from 'electron';
import { Ask } from './ask';
import { Helper } from './helper';
import { DEFAULT_HOTKEY, registerHotkey, unregisterAllHotkeys } from './hotkey';
import { Panel } from './panel';
import { Channels } from '../shared/channels';
import { config, warm as warmModel } from '../providers/inference';
import { EyeTray } from './tray';

if (process.platform !== 'darwin') {
  console.error('[iris] macOS only.');
  app.exit(1);
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

const helper = new Helper();
const ask = new Ask(helper);

let panel: Panel | null = null;
let tray: EyeTray | null = null;

app.whenReady().then(() => {
  app.dock?.hide();

  panel = new Panel({
    onVisibilityChange: (visible) => {
      tray?.setEye(visible ? 'open' : 'closed');
      if (visible) {
        helper.warm();
        void warmModel(config());
      }
      else ask.cancel();
    },
  });

  tray = new EyeTray({
    onToggle: toggle,
    onQuit: () => app.quit(),
    hotkeyLabel: '⌘⇧Space',
  });

  ipcMain.on(Channels.AskSubmit, (event, question: unknown) => {
    if (typeof question !== 'string' || !question.trim()) return;
    tray?.setEye('thinking');
    void ask.run(question.trim(), event.sender).finally(() => {
      if (panel?.isVisible) tray?.setEye('open');
    });
  });

  ipcMain.on(Channels.AskCancel, () => {
    ask.cancel();
    if (panel?.isVisible) tray?.setEye('open');
  });

  registerHotkey(DEFAULT_HOTKEY, toggle);
});

function toggle(): void {
  if (!panel || !tray) return;
  panel.toggle(tray.bounds());
}

app.on('window-all-closed', () => {});

app.on('will-quit', () => {
  unregisterAllHotkeys();
  ask.cancel();
  helper.stop();
  tray?.destroy();
});
