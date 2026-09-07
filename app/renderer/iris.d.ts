interface IrisBridge {
  close(): void;
  onShown(handler: () => void): void;
  onHidden(handler: () => void): void;
}

interface Window {
  readonly iris: IrisBridge;
}
