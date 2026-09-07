import type { WebContents } from 'electron';
import { Channels } from '../shared/channels';
import { buildPrompt } from '../tree/prompt';
import { config, stream } from '../providers/inference';
import type { Helper } from './helper';

export class Ask {
  private running: AbortController | null = null;

  constructor(private readonly helper: Helper) {}

  cancel(): void {
    this.running?.abort();
    this.running = null;
  }

  async run(question: string, target: WebContents): Promise<void> {
    this.cancel();
    const controller = new AbortController();
    this.running = controller;

    const say = (channel: string, payload?: unknown) => {
      if (!target.isDestroyed()) target.send(channel, payload);
    };

    try {
      say(Channels.AskStatus, 'reading the screen');
      const dump = await this.helper.dump();

      if (controller.signal.aborted) return;

      if (!dump.ok) {
        say(
          Channels.AskError,
          dump.trusted === false
            ? 'Iris needs Accessibility permission. System Settings > Privacy & Security > Accessibility, then quit and reopen Iris.'
            : (dump.error ?? 'could not read the app in front'),
        );
        return;
      }

      const appName = dump.app?.name ?? 'this app';
      say(Channels.AskStatus, `thinking about ${appName}`);

      const prompt = buildPrompt({
        appName,
        root: dump.root,
        windows: dump.windows,
        menuBar: dump.menuBar,
        question,
      });

      for await (const chunk of stream(prompt, config(), controller.signal)) {
        if (controller.signal.aborted) return;
        say(Channels.AskChunk, chunk);
      }

      say(Channels.AskDone);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      say(
        Channels.AskError,
        message.includes('fetch') || message.includes('ECONNREFUSED')
          ? `Cannot reach Ollama at ${config().endpoint}. Is it running?`
          : message,
      );
    } finally {
      if (this.running === controller) this.running = null;
    }
  }
}
