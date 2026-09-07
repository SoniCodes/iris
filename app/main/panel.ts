import { BrowserWindow, ipcMain, screen, type Rectangle } from 'electron';
import { Channels } from '../shared/channels';
import { panelHtml, preloadScript } from './paths';

const WIDTH = 520;
const HEIGHT = 268;
const ANCHOR_GAP = 6;
const SCREEN_MARGIN = 8;

interface PanelOptions {
  onVisibilityChange: (visible: boolean) => void;
}

export class Panel {
  private readonly window: BrowserWindow;
  private readonly onVisibilityChange: (visible: boolean) => void;

  constructor(options: PanelOptions) {
    this.onVisibilityChange = options.onVisibilityChange;

    this.window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      roundedCorners: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      acceptFirstMouse: true,
      // non-activating NSPanel: takes keys without becoming the frontmost app
      type: 'panel',
      vibrancy: 'popover',
      visualEffectState: 'active',
      webPreferences: {
        preload: preloadScript,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    void this.window.loadFile(panelHtml);

    this.window.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') this.hide();
    });

    ipcMain.on(Channels.PanelClose, (event) => {
      if (event.sender === this.window.webContents) this.hide();
    });

    if (process.env['IRIS_STAY_OPEN'] !== '1') {
      this.window.on('blur', () => this.hide());
    }

    this.window.on('close', (event) => {
      event.preventDefault();
      this.hide();
    });
  }

  get isVisible(): boolean {
    return this.window.isVisible();
  }

  toggle(anchor: Rectangle): void {
    if (this.isVisible) this.hide();
    else this.show(anchor);
  }

  show(anchor: Rectangle): void {
    this.window.setBounds(this.boundsBelow(anchor));
    this.window.show();
    this.window.webContents.send(Channels.PanelShown);
    this.onVisibilityChange(true);
  }

  hide(): void {
    if (!this.isVisible) return;
    this.window.webContents.send(Channels.PanelHidden);
    this.window.hide();
    this.onVisibilityChange(false);
  }

  get webContents() {
    return this.window.webContents;
  }

  private boundsBelow(anchor: Rectangle): Rectangle {
    const usable =
      anchor.width > 0 || anchor.height > 0
        ? anchor
        : topCentreOf(screen.getPrimaryDisplay().workArea);

    const area = screen.getDisplayNearestPoint({ x: usable.x, y: usable.y }).workArea;
    const centred = Math.round(usable.x + usable.width / 2 - WIDTH / 2);

    return {
      x: clamp(centred, area.x + SCREEN_MARGIN, area.x + area.width - WIDTH - SCREEN_MARGIN),
      y: Math.round(usable.y + usable.height + ANCHOR_GAP),
      width: WIDTH,
      height: HEIGHT,
    };
  }
}

function topCentreOf(area: Rectangle): Rectangle {
  return { x: area.x + Math.round(area.width / 2), y: area.y, width: 0, height: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
