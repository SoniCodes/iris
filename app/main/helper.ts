import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { helperBinary } from './paths';
import type { AxNode } from '../tree/filter';

const REQUEST_TIMEOUT_MS = 8000;

export interface DumpResult {
  ok: boolean;
  error?: string;
  trusted?: boolean;
  app?: { name: string; bundleId: string; pid: number };
  nodeCount?: number;
  elapsedMs?: number;
  truncated?: boolean;
  root?: AxNode;
  windows?: AxNode[];
  menuBar?: AxNode | null;
}

type Reply = Record<string, unknown>;

export class Helper {
  private child: ChildProcessWithoutNullStreams | null = null;
  private reader: Interface | null = null;
  private waiting: Array<(value: Reply) => void> = [];

  send(command: Record<string, unknown>): Promise<Reply> {
    const child = this.start();
    if (!child) return Promise.resolve({ ok: false, error: 'could not start axhelper' });

    return new Promise((resolve) => {
      const settle = (value: Reply) => {
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        const index = this.waiting.indexOf(settle);
        if (index >= 0) this.waiting.splice(index, 1);
        resolve({ ok: false, error: 'axhelper timed out' });
      }, REQUEST_TIMEOUT_MS);

      this.waiting.push(settle);
      child.stdin.write(`${JSON.stringify(command)}\n`);
    });
  }

  async dump(): Promise<DumpResult> {
    return (await this.send({ cmd: 'dump' })) as unknown as DumpResult;
  }

  // one throwaway query makes Chromium build its tree, see docs/ax-findings.md
  warm(): void {
    void this.send({ cmd: 'dump', maxDepth: 4 });
  }

  async isTrusted(): Promise<boolean> {
    const reply = await this.send({ cmd: 'ping' });
    return reply['trusted'] === true;
  }

  stop(): void {
    this.child?.kill();
    this.reset();
  }

  private start(): ChildProcessWithoutNullStreams | null {
    if (this.child) return this.child;

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(helperBinary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      return null;
    }

    child.on('exit', () => this.reset());
    child.on('error', () => this.reset());
    child.stderr.on('data', (data) => console.error('[axhelper]', String(data).trim()));

    const reader = createInterface({ input: child.stdout });
    reader.on('line', (line) => {
      const resolve = this.waiting.shift();
      if (!resolve) return;
      try {
        resolve(JSON.parse(line) as Reply);
      } catch {
        resolve({ ok: false, error: 'unreadable reply from axhelper' });
      }
    });

    this.child = child;
    this.reader = reader;
    return child;
  }

  private reset(): void {
    for (const resolve of this.waiting) resolve({ ok: false, error: 'axhelper exited' });
    this.waiting = [];
    this.reader?.close();
    this.reader = null;
    this.child = null;
  }
}
