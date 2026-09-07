import { app } from 'electron';
import { DEFAULT_HOTKEY, registerHotkey, unregisterAllHotkeys } from './hotkey';
import { Panel } from './panel';
import { EyeTray } from './tray';

if (process.platform !== 'darwin') {
  console.error('[iris] macOS only.');
  app.exit(1);
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

let panel: Panel | null = null;
let tray: EyeTray | null = null;

app.whenReady().then(() => {
  app.dock?.hide();

  panel = new Panel({
    onVisibilityChange: (visible) => tray?.setEye(visible ? 'open' : 'closed'),
  });

  tray = new EyeTray({
    onToggle: toggle,
    onQuit: () => app.quit(),
    hotkeyLabel: '⌘⇧Space',
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
  tray?.destroy();
});
