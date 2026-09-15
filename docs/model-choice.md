# Choosing the local model

Measured 2026-09-15 against the dumps in `research/`, with
`tools/eval-answers.mjs`. Redo these if the default changes.

## The model does less work than it looks

Ten questions across Safari and VS Code. Four of them never reach a model at
all: `verifiedMenuAnswer` finds the path in the tree and answers from it, in
0ms, with nothing to invent. So the model only has to handle the questions that
are vague, descriptive, or spread across several menu items.

That is the whole argument for a small default. The job is not recall. It is
reading a short list and quoting from it.

## Generation is the cost, not the prompt

The obvious guess was that a filtered tree is still a big prompt, so prefill
dominates. It does not. Prompt size and latency do not correlate at all:

```
  775 tok prompt   41,411ms
5,350 tok prompt   10,361ms
```

Measuring token counts rather than wall clock showed why. One Safari question
sent 816 prompt tokens and drew **2,195 generated tokens** back, because the
model reasons out loud before answering. The prompt is not the problem; the
answer is.

Two levers came out of that, both in `app/providers/inference.ts`:

**`think: false`** on every request. Reasoning models otherwise spend seconds
deliberating about a menu list. Measured on one question: 11.9s with thinking,
2.3s without. Models that do not reason ignore the flag, so it is safe to send
unconditionally — checked against gemma and qwen3.5 locally, both return 200.

**`num_predict: 300`.** An answer longer than that is wrong for this product
anyway, and it bounds the worst case rather than trusting the prompt to be
obeyed. `IRIS_MAX_TOKENS` overrides it.

## Reasoning models are the wrong shape here

`qwen3:4b` is small and grounds well, but it is a reasoning model, and it shows
even with thinking disabled. Answers open with "Okay, the user is asking how to
browse privately in Safari. Let me check the menus..." before reaching the
point. The panel renders that text directly, so the preamble is not a
cosmetic problem.

Moving the format constraint to after the question rather than before the data
helped, 3,048 generated tokens down to 781, and qwen3's own `/no_think` switch
took it to 198. Neither removed the preamble.

## Numbers

Grounded means the answer contained the correct menu item. Invented means it
named a path that does not exist anywhere in that app's tree, checked against
the full uncapped path list rather than the filtered evidence.

| | grounded | invented a path | median | slowest |
|---|---|---|---|---|
| qwen3:4b | 10 of 10 | 1 | 4,741ms | 7,733ms |
| llama3.2:3b | 8 of 10 | 0 | 1,066ms | 3,162ms |

Both numbers need reading with care, and in opposite directions.

llama's two misses are not both misses. Asked how to toggle the terminal it
answered `⌃\``, which is correct; the harness scored it wrong because the
expected pattern looked for the word terminal and the answer was a bare
shortcut. The real score is 9 of 10. The genuine failure is VS Code's "make the
text bigger", answered `⌘K ⌘Z`, which is Zen Mode.

qwen3's single invented path is the harness again, reading a sentence that
continues past the end of a real path as part of it.

Latency also moves a lot with warmth. llama's median across a warm run was
closer to 250ms, against 4.7s for qwen3 warm.

## What this says about the retrieval

Both of llama's failures were VS Code, on the two largest prompts, including the
5,350 token one produced by widening when a question word appears nowhere. The
wider evidence that helps a stronger model find the answer is the same evidence
a 3B model gets lost in. Retrieval breadth and model capability are not
independent knobs, and the widening rule in `app/tree/retrieve.ts` assumes a
model that can scan a long list.

## Open: the harness does not check shortcuts

`invented()` validates menu paths against the tree and ignores keyboard
shortcuts entirely, which is how `⌘K ⌘Z` passed as not-invented. Shortcuts are
the thing the README promises not to make up, so this is the wrong half to be
checking. Fixing it means resolving a claimed shortcut back to the item it
belongs to, which is the same problem as the alternate menu items in
`ax-findings.md`.
