import {
  prune,
  renderOutline,
  type AxNode,
} from './filter';
import { fallbackMenuEvidence, menuEvidence, outlineEvidence } from './retrieve';

const MAX_MENU_CHARS = 12000;
const MAX_OUTLINE_CHARS = 12000;

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
  const pruned = prune(roots);

  const matchedMenus = menuEvidence(input.question, input.menuBar);
  const menus = cap(
    (matchedMenus.length
      ? matchedMenus
      : fallbackMenuEvidence(input.question, input.menuBar)
    ).join('\n'),
    MAX_MENU_CHARS,
  );

  const outlineNodes = outlineEvidence(pruned, input.question);
  const onScreen = cap(renderOutline(outlineNodes), MAX_OUTLINE_CHARS);

  return `You answer questions about ${input.appName}. The lists below were read from that app just now.

Answer the question only. Do not describe the rest of the screen.
Use a name or shortcut only if it appears below, on the same line as the thing it belongs to. If no shortcut is written next to a path, do not invent one.
If you cannot see how to do it, say so. Two or three sentences, or short numbered steps.

## Menus
${menus || '(none read)'}

## On screen
${onScreen || '(nothing readable)'}

## Question
${input.question}
`;
}
