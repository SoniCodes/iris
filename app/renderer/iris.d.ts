interface IrisBridge {
  close(): void;
  onShown(handler: () => void): void;
  onHidden(handler: () => void): void;
  ask(question: string): void;
  cancel(): void;
  onStatus(handler: (text: string) => void): void;
  onChunk(handler: (text: string) => void): void;
  onDone(handler: () => void): void;
  onError(handler: (message: string) => void): void;
}

interface Window {
  readonly iris: IrisBridge;
}
