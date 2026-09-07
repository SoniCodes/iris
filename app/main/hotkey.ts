import { globalShortcut } from 'electron';

export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';

export function registerHotkey(accelerator: string, handler: () => void): boolean {
  if (globalShortcut.isRegistered(accelerator)) {
    console.error(`[iris] hotkey ${accelerator} is already taken`);
    return false;
  }

  if (!globalShortcut.register(accelerator, handler)) {
    console.error(`[iris] could not register hotkey ${accelerator}`);
    return false;
  }

  return true;
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll();
}
