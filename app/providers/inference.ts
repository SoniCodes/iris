const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
// small on purpose: the model reads a short list and quotes from it, and the
// exact menu questions never reach it at all. see docs/model-choice.md
const DEFAULT_MODEL = 'qwen3:4b';

// ollama defaults to 4096, which silently truncates a filtered tree
const DEFAULT_CONTEXT = 16384;
// ollama unloads after 5m by default, and a reload is dead time on the next ask
const DEFAULT_KEEP_ALIVE = '30m';
// generation, not prompt size, is what costs here: a 816 token prompt drew 2,195
// tokens of thinking out loud. an answer past this length is wrong anyway
const DEFAULT_MAX_TOKENS = 300;
const MODEL_CACHE_MS = 30000;

let modelCache: { endpoint: string; expiresAt: number; models: string[] } | null = null;
let modelRequest: { endpoint: string; promise: Promise<string[]> } | null = null;

export interface InferenceConfig {
  endpoint: string;
  model: string;
  context: number;
  keepAlive: string;
  maxTokens: number;
}

export function config(): InferenceConfig {
  return {
    endpoint: process.env['IRIS_ENDPOINT'] ?? DEFAULT_ENDPOINT,
    model: process.env['IRIS_MODEL'] ?? DEFAULT_MODEL,
    context: Number(process.env['IRIS_CONTEXT'] ?? DEFAULT_CONTEXT),
    keepAlive: process.env['IRIS_KEEP_ALIVE'] ?? DEFAULT_KEEP_ALIVE,
    maxTokens: Number(process.env['IRIS_MAX_TOKENS'] ?? DEFAULT_MAX_TOKENS),
  };
}

export async function listModels(settings: InferenceConfig): Promise<string[]> {
  if (modelCache?.endpoint === settings.endpoint && modelCache.expiresAt > Date.now()) {
    return modelCache.models;
  }
  if (modelRequest?.endpoint === settings.endpoint) return modelRequest.promise;

  const endpoint = settings.endpoint;
  const promise = fetch(`${endpoint}/api/tags`)
    .then(async (response) => {
      if (!response.ok) return [];
      const body = (await response.json()) as { models?: Array<{ name?: string }> };
      const models = (body.models ?? []).map((entry) => entry.name ?? '').filter(Boolean);
      modelCache = {
        endpoint,
        expiresAt: Date.now() + MODEL_CACHE_MS,
        models,
      };
      return models;
    })
    .finally(() => {
      if (modelRequest?.endpoint === endpoint) modelRequest = null;
    });

  modelRequest = { endpoint, promise };
  return promise;
}

export async function* stream(
  prompt: string,
  settings: InferenceConfig,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(`${settings.endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: settings.model,
      prompt,
      stream: true,
      // qwen3 and friends reason before answering, which costs 5x here for an
      // answer that is quoted off a list. models without it ignore the flag
      think: false,
      keep_alive: settings.keepAlive,
      options: { num_ctx: settings.context, temperature: 0.2, num_predict: settings.maxTokens },
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`ollama ${response.status}: ${detail.slice(0, 200)}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed: { response?: string; done?: boolean; error?: string };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.response) yield parsed.response;
      if (parsed.done) return;
    }
  }
}

export async function warm(settings: InferenceConfig): Promise<void> {
  try {
    await fetch(`${settings.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        prompt: '',
        stream: false,
        think: false,
        keep_alive: settings.keepAlive,
        options: { num_ctx: settings.context },
      }),
    });
  } catch {
    // ollama not running yet; the real request will report it
  }
}
