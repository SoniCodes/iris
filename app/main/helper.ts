import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface, type Interface } from 'node:readline';
import { helperBinary } from './paths';
import type { AxNode } from '../tree/filter';

const PING_TIMEOUT_MS = 3000;
const WARM_TIMEOUT_MS = 8000;
const DUMP_TIMEOUT_MS = 25000;
const PERMISSION_TIMEOUT_MS = 180000;

export interface AppInfo {
  pid: number;
  name: string;
  bundleId: string;
  active?: boolean;
}

export interface DumpResult {
  ok: boolean;
  error?: string;
  trusted?: boolean;
  path?: string;
  app?: AppInfo;
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
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: Reply) => void; timer: ReturnType<typeof setTimeout> }>();
  private startError: string | null = null;

  send(command: Record<string, unknown>, timeoutMs = PING_TIMEOUT_MS): Promise<Reply> {
    const child = this.start();
    if (!child) {
      return Promise.resolve({ ok: false, error: this.startError ?? 'could not start axhelper' });
    }

    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'axhelper timed out' });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      const ok = child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
      if (!ok) {
        child.stdin.once('error', (error) => {
          const waiter = this.pending.get(id);
          if (!waiter) return;
          this.pending.delete(id);
          clearTimeout(waiter.timer);
          waiter.resolve({ ok: false, error: error.message });
        });
      }
    });
  }

  ping(): Promise<DumpResult> {
    return this.send({ cmd: 'ping' }, PING_TIMEOUT_MS) as Promise<unknown> as Promise<DumpResult>;
  }

  permission(prompt: boolean): Promise<DumpResult> {
    return this.send({ cmd: 'permission', prompt }, PERMISSION_TIMEOUT_MS) as Promise<unknown> as Promise<DumpResult>;
  }

  frontmost(): Promise<DumpResult> {
    return this.send({ cmd: 'frontmost' }, PING_TIMEOUT_MS) as Promise<unknown> as Promise<DumpResult>;
  }

  async dump(pid?: number): Promise<DumpResult> {
    const command: Record<string, unknown> = { cmd: 'dump' };
    if (pid != null) command['pid'] = pid;
    return (await this.send(command, DUMP_TIMEOUT_MS)) as unknown as DumpResult;
  }

  // one throwaway query makes Chromium build its tree, see docs/ax-findings.md
  warm(pid?: number): void {
    const command: Record<string, unknown> = { cmd: 'dump', maxDepth: 4 };
    if (pid != null) command['pid'] = pid;
    void this.send(command, WARM_TIMEOUT_MS);
  }

  async isTrusted(): Promise<boolean> {
    const reply = await this.ping();
    return reply.trusted === true;
  }

  stop(): void {
    this.child?.kill();
    this.reset('axhelper exited');
  }

  private start(): ChildProcessWithoutNullStreams | null {
    if (this.child) return this.child;

    if (!existsSync(helperBinary)) {
      this.startError = 'axhelper is missing. Run npm run helper, then restart Iris.';
      return null;
    }

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(helperBinary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      this.startError = error instanceof Error ? error.message : 'could not start axhelper';
      return null;
    }

    child.on('exit', () => this.reset('axhelper exited'));
    child.on('error', (error) => {
      this.startError = error.message;
      this.reset(error.message);
    });
    child.stderr.on('data', (data) => {
      try {
        console.error('[axhelper]', String(data).trim());
      } catch {}
    });

    const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
    reader.on('line', (line) => {
      let reply: Reply;
      try {
        reply = JSON.parse(line) as Reply;
      } catch {
        return;
      }

      const id = reply['id'];
      if (typeof id !== 'number') return;
      const waiter = this.pending.get(id);
      if (!waiter) return;
      this.pending.delete(id);
      clearTimeout(waiter.timer);
      waiter.resolve(reply);
    });

    this.child = child;
    this.reader = reader;
    this.startError = null;
    return child;
  }

  private reset(reason: string): void {
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.resolve({ ok: false, error: reason });
      this.pending.delete(id);
    }
    this.reader?.close();
    this.reader = null;
    this.child = null;
  }
}
