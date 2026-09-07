# What the accessibility tree actually gives us

Measured against the dumps in `research/` on 2026-09-07, macOS 26.4.1. Numbers,
not recollection. Redo these if the OS version changes.

## Menu bars work everywhere

Every toolkit tested hands over a full, titled menu tree from a cold dump of a
**backgrounded** app, with no menu ever opened.

| App | Toolkit | Menu items | Titled |
|---|---|---|---|
| Safari | native | 1,615 | 94% |
| VS Code | Electron | 439 | 82% |
| Studio by Spotify Labs | CEF | 180 | 82% |
| Burp Suite | Java | 81 | 85% |

This is the most reliable thing in the whole system. Navigation answers come
from here.

## Window content depends on the toolkit, and on warmth

| App | Toolkit | Window nodes | Has text | Real frames | Web roles |
|---|---|---|---|---|---|
| Cursor (warm) | Electron | 632, depth 38 | 47% | 97% | AXWebArea, AXTextArea |
| VS Code (cold) | Electron | 10, depth 7 | 30% | 90% | none |
| Safari | native | 38, depth 4 | 61% | 97% | **none** |
| Studio by Spotify Labs | CEF | 18, depth 9 | 17% | 83% | none |

Two things to take from this:

**Electron is the best case, not the worst.** It exposes a full web-content tree
with usable geometry. Safari — the native app — exposes its chrome and not one
node of the page.

**Chromium builds its tree lazily.** A cold app answers the first query with a
stub and fills in within ~2.4s. Measured with `--repeat 10 --interval 2`:

```
t1     13 nodes   ← stub
t2    841 nodes   ← full
t3-10 841-849     ← stable
```

One throwaway query is enough to warm it. Warming on **hotkey-down** rather than
on app-switch keeps the eye honest: pre-warming in the background would mean
reading apps the user never asked about, while the eye is closed.

## Geometry

99% of window nodes carry real frames, so pointing at on-screen controls is
viable. **Menu items are the exception**: they expose `AXPosition`, `AXSize` and
`AXFrame`, and all three are zero while the menu is closed. Code that reads them
gets a value and points at (0,0).

Coordinates are top-left origin, unlike Cocoa.

## Attributes seen on real menu items

Recorded here so they can be used without guessing. From Safari, 1,609 of 1,610
items:

```
AXMenuItemCmdChar        AXMenuItemCmdModifiers   AXMenuItemCmdVirtualKey
AXMenuItemCmdGlyph       AXMenuItemMarkChar       AXMenuItemPrimaryUIElement
AXIdentifier (1,524)     AXServesAsTitleForUIElements
```

## Open: the modifier bitmask is not solved

`AXMenuItemCmdModifiers` is undocumented and our decoding is **wrong or
incomplete**. Evidence:

- Safari reports `mods=2` for both `New Window` (really ⌘N) and `New Tab at End`
  (really ⌥⌘T). One encoding, two different shortcuts.
- Observed values across items holding a shortcut:
  `{0:31, 1:18, 2:25, 3:6, 4:8, 8:2, 12:1, 13:1, 24:1, 28:3}`.
  24 and 28 carry a bit (16) we cannot account for.

`formatShortcut` in `app/tree/filter.ts` currently returns nothing for any value
it does not recognise, rather than emitting a confident wrong answer.

Unresolved, and needed before shortcuts ship.

## Open: alternate menu items are indistinguishable

Safari has **149 duplicate menu paths** — hidden variants that swap in on a
modifier or on window state. `Close Window` appears with both ⌘W and ⇧⌘W.

`AXEnabled` does not separate them: only 1% of duplicate paths have exactly one
enabled variant. `AXMenuItemPrimaryUIElement` is present on every item and is
the next thing to try — an alternate should reference a different primary
element than itself.

Until this is solved, any shortcut answer risks naming the hidden variant.

## Cost

The filter in `app/tree/filter.ts` takes a raw dump down to something a small
model can read:

| | raw JSON | to model | reduction |
|---|---|---|---|
| VS Code | 240,589 tok | 14,812 | 94% |
| Safari | 209,794 tok | 7,813 | 96% |

Most of the saving is dropping `attrs` (research scaffolding, roughly half the
payload) and splicing out structural wrappers — 480 of VS Code's 849 nodes were
empty `AXGroup`s.

`AXScrollToVisible` is on nearly every node and means nothing; only `AXPress`
and friends indicate a real control.

## Latency

Warm dumps run 345–393ms including the menu bar. Safari is the outlier at
~760ms, entirely because of 1,615 menu items from History and Bookmarks.
