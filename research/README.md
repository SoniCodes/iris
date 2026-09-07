# research

Accessibility tree dumps from real applications, written here by
`tools/collect-dumps.mjs`.

Filtering heuristics get developed against these files, not from memory. If an
AX attribute does not appear in a dump in this directory, we do not write code
against it — confidently wrong AX code compiles and silently returns nothing.

Conclusions drawn so far live in `docs/ax-findings.md`.

`*.json` is gitignored. A dump contains whatever was on screen when it was
taken: names, email subjects, ticket contents. Scrub one and save it as
`*.scrubbed.json` before committing it.
