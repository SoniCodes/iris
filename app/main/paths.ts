import path from 'node:path';
import { app } from 'electron';

function fromAppRoot(...segments: string[]): string {
  return path.join(app.getAppPath(), ...segments);
}

export const preloadScript = fromAppRoot('dist', 'preload', 'preload.js');
export const panelHtml = fromAppRoot('dist', 'renderer', 'index.html');

export function trayAsset(filename: string): string {
  return fromAppRoot('assets', 'tray', filename);
}

export const helperBinary = fromAppRoot('helper', 'axhelper');
