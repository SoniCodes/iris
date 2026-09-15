#!/usr/bin/env node
// asks a model the same questions against real dumps and checks the answers
// against the tree they came from.
//   npm run build:main && node tools/eval-answers.mjs research/safari-*.json
// flags: --model X --endpoint X --show

import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { listMenuPaths } = await import(join(ROOT, 'dist', 'tree', 'filter.js'));
const { buildPrompt } = await import(join(ROOT, 'dist', 'tree', 'prompt.js'));
const { verifiedMenuAnswer } = await import(join(ROOT, 'dist', 'tree', 'retrieve.js'));

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
};
const model = arg('--model', process.env.IRIS_MODEL ?? 'qwen3:4b');
const endpoint = arg('--endpoint', process.env.IRIS_ENDPOINT ?? 'http://127.0.0.1:11434');
const show = process.argv.includes('--show');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--') && a.endsWith('.json'));

const CASES = {
  Safari: [
    ['How do I open a new tab?', /new tab/i],
    ['How do I make the text bigger?', /bigger|zoom/i],
    ['How do I browse privately?', /private/i],
    ['How do I clear my history?', /clear history/i],
    ['What is on my screen right now?', null],
  ],
  Code: [
    ['How do I make the text bigger?', /zoom in/i],
    ['How do I open a folder?', /open folder/i],
    ['How do I split the editor?', /split/i],
    ['How do I toggle the terminal?', /terminal/i],
    ['What is on my screen right now?', null],
  ],
};

// the answer names a path in prose, so anchor on a real top level menu name and
// read forward from there rather than guessing where the claim starts
function invented(answer, realPaths) {
  const menus = new Set(realPaths.map((path) => path.split(' > ')[0]));
  const claims = [];

  for (const match of answer.replace(/[*`_]/g, '').matchAll(/([^\n>]+?)((?: > [^\n>]+)+)/g)) {
    const words = match[1].trim().split(/\s+/);
    const head = words.map((_, i) => words.slice(i).join(' ')).find((name) => menus.has(name));
    if (!head) continue;

    const tail = match[2]
      .split(' > ')
      .slice(1)
      .map((segment) => segment.replace(/\s*[([].*$/, '').replace(/[.,;:]+$/, '').trim())
      .filter(Boolean);

    claims.push([head, ...tail].join(' > '));
  }

  return [...new Set(claims)].filter(
    (claim) =>
      !realPaths.some(
        (real) => claim === real || claim.startsWith(`${real} `) || real.startsWith(`${claim} > `),
      ),
  );
}

async function ask(prompt) {
  const started = Date.now();
  const response = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      // must match app/providers/inference.ts or this measures a path we do not ship
      think: false,
      keep_alive: '30m',
      options: { num_ctx: 16384, temperature: 0.2, num_predict: 300 },
    }),
  });
  if (!response.ok) throw new Error(`ollama ${response.status}: ${await response.text()}`);
  const body = await response.json();
  return { text: (body.response ?? '').trim(), ms: Date.now() - started };
}

const rows = [];

for (const file of files) {
  const dump = JSON.parse(readFileSync(file, 'utf8'));
  const app = dump.app?.name ?? basename(file);
  const cases = CASES[app];
  if (!cases) {
    console.log(`${app}: no cases defined, skipping`);
    continue;
  }

  const realPaths = listMenuPaths(dump.menuBar).map((line) => line.replace(/\s{2}\S+$/, ''));
  console.log(`\n===== ${app} — ${model} =====`);

  for (const [question, expect] of cases) {
    const short = verifiedMenuAnswer(question, dump.menuBar);
    const prompt = buildPrompt({
      appName: app,
      root: dump.root,
      windows: dump.windows,
      menuBar: dump.menuBar,
      question,
    });

    const size = Math.round(prompt.length / 4);
    const result = short ? { text: short, ms: 0 } : await ask(prompt);
    const bad = invented(result.text, realPaths);
    const grounded = expect ? expect.test(result.text) : bad.length === 0;

    rows.push({ app, question, grounded, invented: bad, ms: result.ms, size, verified: Boolean(short) });
    const mark = grounded ? 'ok  ' : 'MISS';
    const tag = short ? '  verified' : `${String(result.ms).padStart(5)}ms`;
    console.log(`${mark} ${tag} ${String(size).padStart(6)} tok  ${question}`);
    if (bad.length) console.log(`      invented: ${bad.join(' | ')}`);
    if (show) console.log(`      ${result.text.replace(/\n/g, '\n      ')}`);
  }
}

const modelled = rows.filter((row) => !row.verified);
const times = modelled.map((row) => row.ms).sort((a, b) => a - b);
console.log(`\n--- ${model} ------------------------------------------`);
console.log(`grounded           ${rows.filter((r) => r.grounded).length} of ${rows.length}`);
console.log(`answered verified  ${rows.length - modelled.length} of ${rows.length}, no model, 0ms`);
console.log(`invented a path    ${rows.filter((r) => r.invented.length).length} of ${rows.length}`);
if (times.length) {
  console.log(`model latency      median ${times[Math.floor(times.length / 2)]}ms, slowest ${times.at(-1)}ms`);
  console.log('\nprompt size against latency, model answers only');
  for (const row of modelled.sort((a, b) => a.size - b.size)) {
    console.log(`  ${String(row.size).padStart(6)} tok  ${String(row.ms).padStart(6)}ms  ${row.question}`);
  }
}
