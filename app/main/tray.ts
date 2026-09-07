import { Menu, Tray, nativeImage, type NativeImage, type Rectangle } from 'electron';
import { trayAsset } from './paths';

export type EyeState = 'closed' | 'open';

interface EyeTrayOptions {
  onToggle: () => void;
  onQuit: () => void;
  hotkeyLabel: string;
}

export class EyeTray {
  private readonly tray: Tray;
  private readonly icons: Record<EyeState, NativeImage>;
  private state: EyeState = 'closed';

  constructor(options: EyeTrayOptions) {
    this.icons = {
      closed: loadTemplateIcon('eye-closedTemplate.png'),
      open: loadTemplateIcon('eye-openTemplate.png'),
    };

    this.tray = new Tray(this.icons.closed);
    this.tray.setToolTip('Iris');

    this.tray.on('click', () => options.onToggle());

    const menu = Menu.buildFromTemplate([
      { label: `Toggle Iris   ${options.hotkeyLabel}`, click: () => options.onToggle() },
      { type: 'separator' },
      { label: 'Quit Iris', click: () => options.onQuit() },
    ]);
    this.tray.on('right-click', () => this.tray.popUpContextMenu(menu));
  }

  setEye(state: EyeState): void {
    if (state === this.state) return;
    this.state = state;
    this.tray.setImage(this.icons[state]);
  }

  bounds(): Rectangle {
    return this.tray.getBounds();
  }

  destroy(): void {
    this.tray.destroy();
  }
}

function loadTemplateIcon(filename: string): NativeImage {
  const image = nativeImage.createFromPath(trayAsset(filename));
  if (image.isEmpty()) {
    throw new Error(`[iris] tray icon missing: ${trayAsset(filename)} — run \`npm run icons\``);
  }
  image.setTemplateImage(true);
  return image;
}
