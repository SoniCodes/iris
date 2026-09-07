# Iris

A local-first macOS assistant that answers questions about **the app in front of
you**, by reading its live accessibility tree rather than relying on what a model
remembers about that software.

Everything runs on your machine. No account, no server, no cloud by default.
It should work on a plane.

## Status: stage 3 of 6 — text in, text out

The eye, the accessibility reader, and a local model are wired up. You ask a
question about the app in front of you; Iris dumps that app's UI tree and
answers from what it can actually see. Voice, screenshots, and clicking things
are still later.

**What works**

- A menu bar eye. Closed at rest, open while the panel is up, blinking while
  it thinks.
- `⌘⇧Space` opens a panel under the menu bar icon, and closes it again.
  So does clicking the eye.
- `esc` closes the panel. Clicking away closes it too, except while an
  answer is in flight.
- No Dock icon, no app switcher entry, and opening the panel does not take
  the frontmost app away from whatever you were using.
- On submit, Iris reads the accessibility tree of the app you were in and
  streams an answer from Ollama.

**What does not work**

Voice, vision fallback, and acting on the UI. The tree is also only as good
as the app: Safari's page content, canvas editors, and some Java/CEF apps
come back thin. See `docs/ax-findings.md`.

## Requirements

- macOS 14 or newer
- Node 20 or newer
- [Ollama](https://ollama.com) running locally, with a model pulled
- Accessibility permission (see below)

The default model is `huihui_ai/qwen3-coder-abliterated:30b-a3b-instruct-q4_K_M`.
Override with `IRIS_MODEL` if you use something else.

## Run it

```bash
npm install
npm start
```

`npm start` builds the Swift helper if needed, then the Electron app. The eye
appears in the menu bar. There is no window and no Dock icon. A left-click
opens the panel. To quit, **control-click or right-click the eye** and choose
Quit Iris, or Ctrl+C / close the terminal you started it from. Closing that
terminal should take the eye and the panel with it.

To keep the panel up while poking at it with the devtools:

```bash
IRIS_STAY_OPEN=1 npm start
```

## Permissions

**Stage 1 needed none.** From stage 2, Accessibility is required.

- **Accessibility** — required, to read the UI tree of the app in front of
  you. This is the one that makes Iris work on software no model has ever
  seen.

  In development there is no Iris.app yet. macOS grants the permission to
  **Electron** (from `node_modules`, launched by `npm start`), and sometimes
  to `axhelper` as well. Add those in System Settings > Privacy & Security >
  Accessibility, then **fully quit Iris from the eye menu and start it
  again**. Reloading the panel is not enough.

  If you run `npm run dump` from a terminal, the permission belongs to
  Terminal or your editor, not to Electron. Dumps working in a shell does
  not mean the menu bar app can read.

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
