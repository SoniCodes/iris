import type { WebContents } from 'electron';
import { Channels } from '../shared/channels';
import { buildPrompt } from '../tree/prompt';
import { config, listModels, stream } from '../providers/inference';
import type { Helper } from './helper';

export class Ask {
  private running: AbortController | null = null;
  targetPid: number | undefined;

  constructor(private readonly helper: Helper) {}

  setTarget(pid: number | undefined): void {
    this.targetPid = pid;
  }

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
      const dump = await this.helper.dump(this.targetPid);

      if (controller.signal.aborted) return;

      if (!dump.ok) {
        say(Channels.AskError, dumpError(dump));
        return;
      }

      const appName = dump.app?.name ?? 'this app';
      say(Channels.AskStatus, `thinking about ${appName}`);

      const settings = config();
      const models = await listModels(settings);
      if (controller.signal.aborted) return;
      if (models.length > 0 && !models.includes(settings.model)) {
        say(
          Channels.AskError,
          `Ollama does not have ${settings.model}. Pull it, or set IRIS_MODEL. Installed: ${models.slice(0, 6).join(', ')}`,
        );
        return;
      }

      const prompt = buildPrompt({
        appName,
        root: dump.root,
        windows: dump.windows,
        menuBar: dump.menuBar,
        question,
      });

      for await (const chunk of stream(prompt, settings, controller.signal)) {
        if (controller.signal.aborted) return;
        say(Channels.AskChunk, chunk);
      }

      say(Channels.AskDone);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      say(Channels.AskError, inferenceError(message));
    } finally {
      if (this.running === controller) this.running = null;
    }
  }
}

function dumpError(dump: { trusted?: boolean; error?: string; path?: string }): string {
  if (dump.trusted === false) return permissionMessage(dump.path);
  if (dump.error === 'could not resolve a target application') {
    return 'Click the app you want to ask about, then open Iris again.';
  }
  return dump.error ?? 'could not read the app in front';
}

function inferenceError(message: string): string {
  const settings = config();
  if (message.includes('fetch') || message.includes('ECONNREFUSED')) {
    return `Cannot reach Ollama at ${settings.endpoint}. Is it running?`;
  }
  if (/not found/i.test(message)) {
    return `Ollama does not have ${settings.model}. Pull it, or set IRIS_MODEL.`;
  }
  return message;
}

export function permissionMessage(helperPath?: string): string {
  const lines = [
    'Iris needs Accessibility permission, then a full quit and reopen.',
    '',
    'System Settings > Privacy & Security > Accessibility',
    'Add this app and turn it on:',
    process.execPath,
  ];
  if (helperPath) {
    lines.push('', 'If a helper named axhelper appears, add that too:', helperPath);
  }
  lines.push('', 'Quit from the eye menu. A reload is not enough.');
  return lines.join('\n');
}
