# Iris

A local-first macOS assistant that answers questions about **the app in front of
you**, by reading its live accessibility tree rather than relying on what a model
remembers about that software.

Everything runs on your machine. No account, no server, no cloud by default.
It should work on a plane.

## Status: stage 1 of 6 — the eye, no intelligence

This is the shell and nothing else. It is deliberately not smart yet.

**What works**

- A menu bar eye. Closed at rest, open while the panel is up.
- `⌘⇧Space` opens a panel under the menu bar icon, and closes it again.
  So does clicking the eye.
- `esc` closes the panel. So does clicking away.
- No Dock icon, no app switcher entry, and opening the panel does not take
  the frontmost app away from whatever you were using.

**What does not work**

Everything else. The text field accepts a question and does nothing with it.
There is no model, no accessibility reading, no network. See `CLAUDE.md` for
the build order.

## Requirements

- macOS 14 or newer
- Node 20 or newer

## Run it

```bash
npm install
npm start
```

The eye appears in the menu bar. There is no window and no Dock icon — if you
want it gone, right-click the eye and choose Quit.

To keep the panel up while poking at it with the devtools:

```bash
IRIS_STAY_OPEN=1 npm start
```

## Permissions

**Stage 1 needs none.** It does not read your screen, listen to anything, or
open a network connection. The eye stays closed because there is nothing to
look at yet.

Later stages ask for these, and each one is optional except the first:

- **Accessibility** — required from stage 2, to read the UI tree of the app in
  front of you. This is the one that makes Iris work on software no model has
  ever seen. In development macOS grants it to whatever launched the process
  (your terminal or editor), not to Iris, and it needs a full quit and reopen
  to take effect.
- **Screen Recording** — optional, stage 5 only, and only for apps whose
  accessibility tree comes back too thin to be useful. Stays optional.
- **Microphone** — optional, stage 4 only, for hold-to-talk. Nothing is ever
  recorded without you holding the key.

## Layout

```
app/main/       window, tray, hotkey, IPC
app/preload/    the only bridge between main and renderer
app/renderer/   panel UI
app/shared/     constants both sides need
assets/tray/    generated menu bar icons
helper/         Swift accessibility helper (stage 2)
research/       accessibility dumps from real apps
tools/          build-time scripts
```

## Icons

The two menu bar eyes are generated, not drawn by hand:

```bash
npm run icons
```

`tools/make-icons.mjs` rasterises them from the same 32×32 geometry the panel's
SVG uses, so the two eyes cannot drift apart. Pass
`--preview <dir>` to also write large versions you can actually look at.

## Licence

MIT.
