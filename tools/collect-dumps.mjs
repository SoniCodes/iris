#!/usr/bin/env node
// dumps AX trees into research/ and prints the numbers that matter.
// flags: --frontmost --delay N --ab --enable --enable-wait N --repeat N
//        --interval N --all-attributes --max-nodes N
// needs Accessibility granted to whatever launches it.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = join(ROOT, 'helper', 'axhelper');
const RESEARCH = join(ROOT, 'research');

const DEFAULT_TARGETS = [
  { label: 'safari', bundleId: 'com.apple.Safari', toolkit: 'native' },
  { label: 'docker', bundleId: 'com.docker.docker', toolkit: 'native?' },
  { label: 'spotify-studio', bundleId: 'com.spotify.studio', toolkit: 'CEF' },
  { label: 'burp-suite', bundleId: 'com.install4j.6592-1155-2163-3973.70', toolkit: 'Java' },
];

const options = { frontmost: false, allAttributes: false, enable: false, ab: false, enableWait: 3, repeat: 1, interval: 2, delay: 0, maxNodes: null, bundleIds: [] };
for (let i = 0; i < process.argv.length - 2; i++) {
  const arg = process.argv[i + 2];
  if (arg === '--frontmost') options.frontmost = true;
  else if (arg === '--enable') options.enable = true;
  else if (arg === '--ab') options.ab = true;
  else if (arg === '--repeat') options.repeat = Number(process.argv[i++ + 3]);
  else if (arg === '--interval') options.interval = Number(process.argv[i++ + 3]);
  else if (arg === '--enable-wait') options.enableWait = Number(process.argv[i++ + 3]);
  else if (arg === '--all-attributes') options.allAttributes = true;
  else if (arg === '--delay') options.delay = Number(process.argv[i++ + 3]);
  else if (arg === '--max-nodes') options.maxNodes = Number(process.argv[i++ + 3]);
  else options.bundleIds.push(arg);
}

const targets = options.frontmost
  ? [{ label: 'frontmost', bundleId: null, toolkit: '?' }]
  : options.bundleIds.length
    ? options.bundleIds.map((bundleId) => ({ label: bundleId, bundleId, toolkit: '?' }))
    : DEFAULT_TARGETS;

const helper = spawn(HELPER, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: helper.stdout });
const pending = [];

lines.on('line', (line) => {
  const resolve = pending.shift();
  if (!resolve) return;
  try {
    resolve(JSON.parse(line));
  } catch {
    resolve({ ok: false, error: `unparseable response: ${line.slice(0, 120)}` });
  }
});

function send(command) {
  return new Promise((resolve) => {
    pending.push(resolve);
    helper.stdin.write(`${JSON.stringify(command)}\n`);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function emptyStats() {
  return { nodes: 0, maxDepth: 0, labeled: 0, framed: 0, zeroFramed: 0, roles: {} };
}

const MENUISH = new Set(['AXMenuBar', 'AXMenu', 'AXMenuItem', 'AXMenuBarItem']);

function analyse(node, stats, depth = 0) {
  if (!node || typeof node !== 'object' || !node.role) return;
  if (node.walkedSeparately) return;

  stats.nodes++;
  stats.maxDepth = Math.max(stats.maxDepth, depth);
  const text = [node.title, node.desc, typeof node.value === 'string' ? node.value : '']
    .some((field) => typeof field === 'string' && field.trim());
  if (text) stats.labeled++;
  if (node.frame && node.frame.w > 0 && node.frame.h > 0) stats.framed++;
  else if (node.frame) stats.zeroFramed++;
  stats.roles[node.role] = (stats.roles[node.role] ?? 0) + 1;

  for (const child of node.children ?? []) analyse(child, stats, depth + 1);
}

function menuStats(menuBar) {
  const stats = { items: 0, titled: 0, withShortcutAttr: 0, withSubmenu: 0, realFrames: 0 };
  const walk = (node) => {
    if (!node || !node.role) return;
    if (node.role === 'AXMenuItem') {
      stats.items++;
      if (node.title) stats.titled++;
      if (node.attrs?.includes('AXMenuItemCmdChar')) stats.withShortcutAttr++;
      if (node.children?.length) stats.withSubmenu++;
      if (node.frame && node.frame.w > 0 && node.frame.h > 0) stats.realFrames++;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(menuBar);
  return stats;
}

const percent = (part, whole) => (whole === 0 ? ' n/a' : `${String(Math.round((part / whole) * 100)).padStart(3)}%`);

const ping = await send({ cmd: 'ping' });
if (!ping.trusted) {
  console.error('Accessibility permission is not granted to this process.\n');
  console.error('  System Settings > Privacy & Security > Accessibility');
  console.error('  Add the app running this script (Terminal, iTerm, your editor),');
  console.error('  then fully quit and reopen it — a reload is not enough.\n');
  helper.kill();
  process.exit(1);
}

if (options.delay > 0) {
  console.log(`waiting ${options.delay}s — click into the app you want dumped`);
  for (let i = options.delay; i > 0; i--) {
    process.stdout.write(`\r  ${i}... `);
    await sleep(1000);
  }
  console.log('\r  dumping now');
}

mkdirSync(RESEARCH, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const rows = [];

async function dumpOnce(target, phase) {
  const command = { cmd: 'dump' };
  if (target.bundleId) command.bundleId = target.bundleId;
  if (options.allAttributes) command.allAttributes = true;
  if (options.maxNodes) command.maxNodes = options.maxNodes;

  const result = await send(command);
  if (!result.ok) return { error: result.error };

  const name = target.bundleId ? target.label : (result.app.name ?? 'frontmost').toLowerCase().replace(/\s+/g, '-');
  const label = phase ? `${name} (${phase})` : name;
  const suffix = `${options.allAttributes ? '-allattrs' : ''}${phase ? `-${phase}` : ''}`;
  const file = join(RESEARCH, `${name}-${stamp}${suffix}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));

  const windows = emptyStats();
  analyse(result.root, windows);
  for (const window of result.windows ?? []) analyse(window, windows);
  const menus = menuStats(result.menuBar);

  console.log(
    `${label.padEnd(24)} ${String(result.nodeCount).padStart(6)} nodes  ${String(result.elapsedMs).padStart(5)}ms  -> ${file.replace(`${ROOT}/`, '')}`,
  );
  return { result, windows, menus, file, label };
}

async function sendEnable(target) {
  const request = { cmd: 'enable' };
  if (target.bundleId) request.bundleId = target.bundleId;
  const response = await send(request);
  console.log(`${target.label.padEnd(24)} enable -> ${JSON.stringify(response.results ?? response.error)}`);
  await sleep(options.enableWait * 1000);
}

for (const target of targets) {
  if (options.repeat > 1) {
    for (let attempt = 1; attempt <= options.repeat; attempt++) {
      const pass = await dumpOnce(target, `t${attempt}`);
      if (pass.error) {
        console.log(`${target.label.padEnd(24)} skipped — ${pass.error}`);
        break;
      }
      rows.push({ target: { ...target, label: pass.label }, ...pass });
      if (attempt < options.repeat) await sleep(options.interval * 1000);
    }
    continue;
  }

  if (options.ab) {
    const before = await dumpOnce(target, 'before');
    if (before.error) {
      rows.push({ target, error: before.error });
      console.log(`${target.label.padEnd(24)} skipped — ${before.error}`);
      continue;
    }
    rows.push({ target: { ...target, label: before.label }, ...before });

    await sendEnable(target);

    const after = await dumpOnce(target, 'after');
    if (!after.error) rows.push({ target: { ...target, label: after.label }, ...after });
    continue;
  }

  if (options.enable) await sendEnable(target);

  const single = await dumpOnce(target, null);
  if (single.error) {
    rows.push({ target, error: single.error });
    console.log(`${target.label.padEnd(24)} skipped — ${single.error}`);
    continue;
  }
  rows.push({ target: { ...target, label: single.label }, ...single });
}

console.log('\n--- window tree (menu bar excluded) -------------------------------');
console.log('app                      toolkit  nodes  depth  has text  real frames  truncated');
for (const row of rows) {
  if (row.error) continue;
  const { target, windows: w, result } = row;
  console.log(
    `${target.label.padEnd(24)} ${target.toolkit.padEnd(7)} ${String(w.nodes).padStart(6)} ${String(w.maxDepth).padStart(6)}    ${percent(w.labeled, w.nodes)}        ${percent(w.framed, w.nodes)}  ${result.truncated ? 'YES' : 'no'}`,
  );
}

console.log('\n--- menu bar (navigation answers live here) -----------------------');
console.log('app                      items  titled  cmdChar attr  submenu  real frames');
for (const row of rows) {
  if (row.error) continue;
  const m = row.menus;
  console.log(
    `${row.target.label.padEnd(24)} ${String(m.items).padStart(5)}   ${percent(m.titled, m.items)}          ${percent(m.withShortcutAttr, m.items)}     ${percent(m.withSubmenu, m.items)}        ${percent(m.realFrames, m.items)}`,
  );
}

console.log('\n--- most common roles, window tree --------------------------------');
for (const row of rows) {
  if (row.error) continue;
  const top = Object.entries(row.windows.roles)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([role, count]) => `${role}:${count}`)
    .join('  ');
  console.log(`${row.target.label.padEnd(24)} ${top || '(nothing)'}`);
}

console.log('\nDumps contain whatever was on screen. Scrub before committing.');

helper.kill();
