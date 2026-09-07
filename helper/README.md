# helper

`axhelper` — a Swift binary that reads the macOS Accessibility API and speaks
JSON over stdio to the Electron app.

It exists as a separate process because Node has no usable AX bindings. The
boundary is deliberate: JSON commands in, JSON out, no business logic here and
no AX logic anywhere else.

```bash
./helper/build.sh
echo '{"cmd":"ping"}' | ./helper/axhelper
```

Commands: `ping`, `permission`, `apps`, `enable`, `dump`. See the header of
`axhelper.swift` for arguments, and `docs/ax-findings.md` for what the dumps
actually contain.

Needs Accessibility permission, granted to whatever launches it.
