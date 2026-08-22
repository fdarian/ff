## Overview

- This is the root of a monorepo

## Package manager & runtime

- **Managing packages**: `pnpm install` — pnpm resolves dependencies and owns the lockfile (`pnpm-lock.yaml`)
- **Runtime/Executing code**: Bun instead of Node.js — `bun <file>`, `bun run <script>`, or `bun -e "<code>"`
- For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
