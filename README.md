# Iris

A local-first macOS assistant that answers questions about **the app in front of
you**, by reading its live accessibility tree rather than relying on what a model
remembers about that software.

Everything runs on your machine. No account, no server, no cloud by default.
It should work on a plane.

## It will not make up a menu path

A tree is not just cheaper to read than a screenshot. It is addressable, so an
answer can be looked up rather than generated. When a question names something
the tree already holds, Iris does exactly that:

```
how do I create a new private window?
Use File > New Private Window (⇧⌘N).
```

That path and that shortcut were read out of the running app a moment earlier.
No model is asked, so there is nothing to invent, and the answer costs the dump
and nothing more. It works with no model pulled at all.

The check has to stay narrow or it would confidently answer the wrong question,
so every word that is not an action verb has to appear in the item it matched.
Ask Safari how to stop an annoying noise and it will not hand you `View > Stop`;
that question goes to the model like any other. Anything Iris cannot verify, it
does not claim.

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
- On submit, Iris reads the accessibility tree of the app you were in. A
  question it can answer from a verified menu path is answered directly;
  everything else is ranked down to the relevant part of the tree and streamed
  through Ollama.

**What does not work**

Voice, vision fallback, and acting on the UI. The tree is also only as good
as the app: Safari's page content, canvas editors, and some Java/CEF apps
come back thin. See `docs/ax-findings.md`.

## Requirements

- macOS 14 or newer
- Node 20 or newer
- [Ollama](https://ollama.com) running locally, with a model pulled
- Accessibility permission (see below)

The default model is `qwen3:4b`, about 2.6GB:

```bash
ollama pull qwen3:4b
```

It is deliberately small. Exact menu questions never reach a model at all, and
what is left is reading a short list and quoting from it rather than recalling
anything. A bigger model is a `IRIS_MODEL` away if you want one, along with
`IRIS_ENDPOINT`, `IRIS_CONTEXT` and `IRIS_KEEP_ALIVE`.

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
