import { prune, renderMenuPaths, renderOutline, type AxNode } from './filter';

const MAX_MENU_CHARS = 18000;
const MAX_OUTLINE_CHARS = 24000;

export interface PromptInput {
  appName: string;
  root?: AxNode | undefined;
  windows?: AxNode[] | undefined;
  menuBar?: AxNode | null | undefined;
  question: string;
}

function cap(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const kept = text.slice(0, limit);
  const cut = kept.slice(0, kept.lastIndexOf('\n'));
  return `${cut}\n(list truncated)`;
}

export function buildPrompt(input: PromptInput): string {
  const roots = [input.root, ...(input.windows ?? [])].filter(Boolean) as AxNode[];
  const onScreen = cap(renderOutline(prune(roots)), MAX_OUTLINE_CHARS);
  const menus = cap(renderMenuPaths(input.menuBar), MAX_MENU_CHARS);

  return `You answer questions about ${input.appName}, the macOS app the user is looking at right now.

Everything below was read from that app a moment ago. It is its actual current state, not documentation and not something you remember about this software.

Rules:
- Answer only from what is listed below.
- Never invent a menu path, control name or keyboard shortcut. If it is not listed, say you cannot see it.
- Quote names exactly as they appear.
- Where a keyboard shortcut is listed, give it.
- Be brief. Two or three sentences, or short numbered steps.

## Menus
${menus || '(none read)'}

## On screen
${onScreen || '(nothing readable)'}

## Question
${input.question}
`;
}
