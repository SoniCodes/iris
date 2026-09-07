import { app, ipcMain } from 'electron';
import { Ask, permissionMessage } from './ask';
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
let quitting = false;

function quit(): void {
  if (quitting) return;
  quitting = true;
  try {
    panel?.destroy();
    tray?.destroy();
    unregisterAllHotkeys();
    ask.cancel();
    helper.stop();
  } finally {
    panel = null;
    tray = null;
    app.exit(0);
  }
}

function isDeadPipe(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  return code === 'EIO' || code === 'EPIPE';
}

function watchTerminal(): void {
  const die = () => quit();
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'] as const) {
    process.on(signal, die);
  }
  if (process.stdin.isTTY) {
    process.stdin.resume();
    process.stdin.on('end', die);
    process.stdin.on('close', die);
  }
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (error) => {
      if (isDeadPipe(error)) die();
    });
  }
  process.on('uncaughtException', (error) => {
    if (!isDeadPipe(error)) {
      try {
        console.error(error);
      } catch {}
    }
    die();
  });
}

watchTerminal();
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quit();
});

app.whenReady().then(() => {
  app.setActivationPolicy('accessory');
  app.dock?.hide();

  panel = new Panel({
    onVisibilityChange: (visible) => {
      tray?.setEye(visible ? 'open' : 'closed');
      if (visible) void onPanelShown();
      else {
        panel?.setIgnoreBlur(false);
        ask.cancel();
      }
    },
  });

  tray = new EyeTray({
    onToggle: toggle,
    onQuit: quit,
    hotkeyLabel: '⌘⇧Space',
  });

  ipcMain.on(Channels.AskSubmit, (event, question: unknown) => {
    if (typeof question !== 'string' || !question.trim()) return;
    panel?.setIgnoreBlur(true);
    tray?.setEye('thinking');
    void ask.run(question.trim(), event.sender).finally(() => {
      panel?.setIgnoreBlur(false);
      if (panel?.isVisible) tray?.setEye('open');
    });
  });

  ipcMain.on(Channels.AskCancel, () => {
    ask.cancel();
    panel?.setIgnoreBlur(false);
    if (panel?.isVisible) tray?.setEye('open');
  });

  registerHotkey(DEFAULT_HOTKEY, toggle);
  void helper.ping();
});

function toggle(): void {
  if (!panel || !tray) return;
  if (panel.isVisible) panel.hide();
  else void openPanel();
}

async function openPanel(): Promise<void> {
  if (!panel || !tray) return;
  const front = await helper.frontmost();
  const pid = typeof front.app?.pid === 'number' ? front.app.pid : undefined;
  ask.setTarget(pid);
  panel.show(tray.bounds());
}

let permissionPrompted = false;

async function onPanelShown(): Promise<void> {
  const ping = await helper.ping();
  if (ping.trusted !== true) {
    let path = ping.path;
    if (!permissionPrompted) {
      permissionPrompted = true;
      panel?.setIgnoreBlur(true);
      const after = await helper.permission(true);
      panel?.setIgnoreBlur(false);
      if (typeof after.path === 'string') path = after.path;
      if (after.trusted !== true) {
        if (panel?.isVisible && !panel.webContents.isDestroyed()) {
          panel.webContents.send(Channels.AskError, permissionMessage(path));
        }
        return;
      }
    } else {
      if (panel?.isVisible && !panel.webContents.isDestroyed()) {
        panel.webContents.send(Channels.AskError, permissionMessage(path));
      }
      return;
    }
  }

  if (ask.targetPid != null) helper.warm(ask.targetPid);
  void warmModel(config());
}

app.on('window-all-closed', () => {});
