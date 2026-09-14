#!/usr/bin/env node
// runs the filter over a dump and reports what it costs a model.
//   npm run build:main && node tools/filter-preview.mjs research/*.json

import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { prune, renderOutline, formatShortcut } = await import(join(ROOT, 'dist', 'tree', 'filter.js'));
const { fallbackMenuEvidence } = await import(join(ROOT, 'dist', 'tree', 'retrieve.js'));

const show = process.argv.includes('--show');
const files = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

const tokens = (text) => Math.round(text.length / 4);

for (const file of files) {
  const dump = JSON.parse(readFileSync(file, 'utf8'));
  const roots = [dump.root, ...(dump.windows ?? [])];

  const rawJson = JSON.stringify(roots);
  const rawAll = JSON.stringify([...roots, dump.menuBar]);
  const pruned = prune(roots);
  const outline = renderOutline(pruned);
  const menus = fallbackMenuEvidence('', dump.menuBar).join('\n');

  const countNodes = (nodes) => nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);

  console.log(`\n===== ${basename(file)} — ${dump.app.name} =====`);
  console.log(`raw window JSON   ${String(tokens(rawJson)).padStart(7)} tokens`);
  console.log(`raw window+menus  ${String(tokens(rawAll)).padStart(7)} tokens`);
  console.log(`pruned outline    ${String(tokens(outline)).padStart(7)} tokens   ${countNodes(pruned)} nodes, ${outline.split('\n').length} lines`);
  console.log(`menu paths        ${String(tokens(menus)).padStart(7)} tokens   ${menus.split('\n').filter(Boolean).length} paths`);
  console.log(`total to model    ${String(tokens(outline) + tokens(menus)).padStart(7)} tokens   (${Math.round((1 - (tokens(outline) + tokens(menus)) / tokens(rawAll)) * 100)}% smaller)`);

  let menuItems = 0;
  let decoded = 0;
  const countShortcuts = (node) => {
    if (!node?.role) return;
    if (node.role === 'AXMenuItem') {
      menuItems++;
      if (formatShortcut(node)) decoded++;
    }
    for (const child of node.children ?? []) countShortcuts(child);
  };
  countShortcuts(dump.menuBar);
  console.log(`shortcuts decoded ${String(decoded).padStart(7)} of ${menuItems} menu items`);

  if (show) {
    console.log('\n--- first 25 outline lines ---');
    console.log(outline.split('\n').slice(0, 25).join('\n'));
    console.log('\n--- 15 menu paths with shortcuts ---');
    console.log(menus.split('\n').filter((line) => /[⌘⌃⌥⇧]/.test(line)).slice(0, 15).join('\n'));
  }
}
