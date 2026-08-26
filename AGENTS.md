<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Moneva interface rules

Before changing any rendered interface, read and follow both project contracts in full:

- `.interface-design/system.md`
- `docs/motion-system.md`

Before creating or changing any form, field, filter, import flow, or dialog that captures data, also read and follow:

- `docs/form-system.md`

Do not add one-off animation durations, easing curves, press scales, overlay lifecycles, or gesture behavior outside the documented motion tokens and patterns. Any deliberate system extension must update `docs/motion-system.md` in the same change.
