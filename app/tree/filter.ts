export interface AxNode {
  id?: number;
  role?: string;
  subrole?: string;
  title?: string;
  desc?: string;
  value?: unknown;
  frame?: { x: number; y: number; w: number; h: number };
  actions?: string[];
  attrs?: string[];
  children?: AxNode[];
  cmdChar?: string;
  cmdModifiers?: number;
  cmdVirtualKey?: number;
  walkedSeparately?: boolean;
}

// AXScrollToVisible sits on nearly every node, so it tells us nothing
const REAL_ACTIONS = new Set([
  'AXPress',
  'AXConfirm',
  'AXPick',
  'AXOpen',
  'AXIncrement',
  'AXDecrement',
  'AXShowMenu',
]);

const MENU_ROLES = new Set(['AXMenuBar', 'AXMenu', 'AXMenuItem', 'AXMenuBarItem']);

const MAX_VALUE_CHARS = 240;

export function shortRole(role: string | undefined): string {
  if (!role) return 'node';
  return role.replace(/^AX/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function textOf(node: AxNode): string {
  const value = typeof node.value === 'string' ? node.value : '';
  const parts = [node.title, node.desc, value].filter((part): part is string => Boolean(part?.trim()));
  const text = parts[0] ?? '';
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

function realActions(node: AxNode): string[] {
  return (node.actions ?? []).filter((action) => REAL_ACTIONS.has(action));
}

function isInteresting(node: AxNode): boolean {
  return Boolean(textOf(node)) || realActions(node).length > 0;
}

export interface PrunedNode {
  id: number | undefined;
  role: string;
  text: string;
  actions: string[];
  children: PrunedNode[];
}

export function prune(nodes: AxNode[]): PrunedNode[] {
  const output: PrunedNode[] = [];

  for (const node of nodes) {
    if (!node || node.walkedSeparately || MENU_ROLES.has(node.role ?? '')) continue;

    const children = prune(node.children ?? []);

    // an empty wrapper is replaced by its children, which collapses the
    // AXGroup chains that make up most of a Chromium tree
    if (!isInteresting(node)) {
      output.push(...children);
      continue;
    }

    output.push({
      id: node.id,
      role: shortRole(node.role),
      text: textOf(node),
      actions: realActions(node).map((action) => action.replace(/^AX/, '').toLowerCase()),
      children,
    });
  }

  return output;
}

export function renderOutline(nodes: PrunedNode[], depth = 0): string {
  const lines: string[] = [];

  for (const node of nodes) {
    const indent = '  '.repeat(depth);
    const text = node.text ? ` "${node.text.replace(/\s+/g, ' ')}"` : '';
    const pressable = node.actions.includes('press') ? ' [pressable]' : '';
    lines.push(`${indent}${node.role}${text}${pressable}`);
    if (node.children.length) lines.push(renderOutline(node.children, depth + 1));
  }

  return lines.filter(Boolean).join('\n');
}

const MOD_SHIFT = 1;
const MOD_OPTION = 2;
const MOD_CONTROL = 4;
const MOD_NO_COMMAND = 8;
const MOD_KNOWN = MOD_SHIFT | MOD_OPTION | MOD_CONTROL | MOD_NO_COMMAND;

// the bitmask is undocumented and not fully worked out, see docs/ax-findings.md.
// bail out rather than emit a wrong shortcut.
export function formatShortcut(node: AxNode): string {
  const character = node.cmdChar;
  if (!character) return '';

  const modifiers = node.cmdModifiers ?? 0;
  if (modifiers & ~MOD_KNOWN) return '';

  let prefix = '';
  if (modifiers & MOD_CONTROL) prefix += '⌃';
  if (modifiers & MOD_OPTION) prefix += '⌥';
  if (modifiers & MOD_SHIFT) prefix += '⇧';
  if (!(modifiers & MOD_NO_COMMAND)) prefix += '⌘';

  return `${prefix}${character.toUpperCase()}`;
}

export function renderMenuPaths(menuBar: AxNode | null | undefined, maxPerMenu = 40): string {
  if (!menuBar) return '';
  const lines: string[] = [];

  const emit = (node: AxNode, trail: string[]): void => {
    const title = node.title?.trim();
    if (!title) return;

    const path = [...trail, title];
    const submenu = (node.children ?? []).find((child) => child.role === 'AXMenu');

    if (submenu) {
      const items = submenu.children ?? [];
      const shown = items.slice(0, maxPerMenu);
      for (const item of shown) emit(item, path);
      if (items.length > shown.length) {
        lines.push(`${path.join(' > ')} > … ${items.length - shown.length} more`);
      }
      return;
    }

    const shortcut = formatShortcut(node);
    lines.push(shortcut ? `${path.join(' > ')}  ${shortcut}` : path.join(' > '));
  };

  for (const barItem of menuBar.children ?? []) emit(barItem, []);
  return lines.join('\n');
}
