import { listMenuPaths, type AxNode, type PrunedNode } from './filter';

const MAX_DIRECT_MENU_MATCHES = 30;
const MAX_MENU_LINES = 100;
const HISTORY_TERMS = new Set(['back', 'closed', 'forward', 'history', 'recent', 'reopen']);
const BOOKMARK_TERMS = new Set(['bookmark', 'favorite']);

const ACTION_TERMS = new Set([
  'add',
  'clear',
  'close',
  'create',
  'delete',
  'disable',
  'edit',
  'enable',
  'find',
  'hide',
  'make',
  'move',
  'open',
  'quit',
  'reopen',
  'remove',
  'run',
  'save',
  'show',
  'start',
  'stop',
  'switch',
  'turn',
]);

const STOP = new Set([
  'a',
  'an',
  'and',
  'app',
  'are',
  'be',
  'but',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'have',
  'how',
  'i',
  'in',
  'is',
  'it',
  'just',
  'key',
  'keyboard',
  'me',
  'my',
  'of',
  'on',
  'or',
  'please',
  'screen',
  'should',
  'so',
  'shortcut',
  'that',
  'the',
  'these',
  'this',
  'those',
  'to',
  'up',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'will',
  'with',
  'would',
  'you',
]);

interface RankedMenuLine {
  line: string;
  hits: number;
  density: number;
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

function forms(word: string): Set<string> {
  const output = new Set([word]);
  if (word.length > 5 && word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    output.add(stem);
    output.add(`${stem}e`);
    if (stem.at(-1) === stem.at(-2)) output.add(stem.slice(0, -1));
  }
  return output;
}

export function questionTerms(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const terms = words.map(singular).filter((word) => word.length > 1 && !STOP.has(word));
  return [...new Set(terms)];
}

function score(text: string, terms: string[]): number {
  if (!terms.length) return 0;
  const words: string[] = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(singular);
  let hits = 0;
  for (const term of terms) {
    if (words.includes(term)) {
      hits += ACTION_TERMS.has(term) ? 1 : 2;
      continue;
    }
    const termForms = forms(term);
    if (words.some((word) => [...forms(word)].some((form) => termForms.has(form)))) {
      hits++;
      continue;
    }
    if (
      term.length >= 4 &&
      words.some((word) => word.length >= 4 && word.slice(0, 4) === term.slice(0, 4))
    ) {
      hits++;
    }
  }
  return hits;
}

function pathOf(line: string): string {
  return line.replace(/\s{2}\S+$/, '');
}

function menuOf(line: string): string {
  return pathOf(line).split(' > ')[0] ?? '';
}

function leafOf(line: string): string {
  return pathOf(line).split(' > ').at(-1) ?? '';
}

function filterMenuLines(lines: string[], terms: string[]): string[] {
  const allowsHistory = terms.some((term) => HISTORY_TERMS.has(term));
  const allowsBookmarks = terms.some((term) => BOOKMARK_TERMS.has(term));

  return lines.filter((line) => {
    const path = pathOf(line);
    const segments = path.split(' > ');
    const menu = segments[0];
    if (menu === 'History' && !allowsHistory) return false;
    if (menu === 'Bookmarks' && !allowsBookmarks) return false;
    if (
      !allowsHistory &&
      (segments.includes('Recent Items') || segments.includes('Open Recent'))
    ) {
      return false;
    }
    return true;
  });
}

function rankedMenuLines(lines: string[], terms: string[]): RankedMenuLine[] {
  return lines
    .map((line) => {
      const leaf = leafOf(line);
      const hits = score(leaf, terms);
      const words = questionTerms(leaf).length || 1;
      return { line, hits, density: hits / words };
    })
    .filter((entry) => entry.hits > 0)
    .sort(
      (a, b) =>
        b.density - a.density || b.hits - a.hits || a.line.length - b.line.length,
    );
}

export function menuEvidence(
  question: string,
  menuBar: AxNode | null | undefined,
): string[] {
  const terms = questionTerms(question);
  const lines = filterMenuLines(listMenuPaths(menuBar), terms);
  const ranked = rankedMenuLines(lines, terms).slice(0, MAX_DIRECT_MENU_MATCHES);

  let neighborhood = ranked[0] ? menuOf(ranked[0].line) : '';
  if (!neighborhood) {
    neighborhood =
      [...new Set(lines.map(menuOf))].find((menu) => score(menu, terms) > 0) ?? '';
  }
  if (!ranked.length && !neighborhood) return [];

  const output = new Set(ranked.map((entry) => entry.line));
  for (const line of lines) {
    if (menuOf(line) === neighborhood) output.add(line);
    if (output.size >= MAX_MENU_LINES) break;
  }
  return [...output];
}

export function fallbackMenuEvidence(
  question: string,
  menuBar: AxNode | null | undefined,
): string[] {
  return filterMenuLines(listMenuPaths(menuBar, 40), questionTerms(question));
}

export function outlineEvidence(nodes: PrunedNode[], question: string): PrunedNode[] {
  const terms = questionTerms(question);
  if (!terms.length) return nodes;

  const walk = (list: PrunedNode[]): PrunedNode[] => {
    const output: PrunedNode[] = [];
    for (const node of list) {
      const hit = score(`${node.role} ${node.text}`, terms) > 0;
      const children = hit ? node.children : walk(node.children);
      if (hit || children.length) output.push({ ...node, children });
    }
    return output;
  };

  const matched = walk(nodes);
  return matched.length ? matched : nodes;
}
