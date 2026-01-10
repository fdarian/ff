import * as BunNS from 'bun';

// If Bun is already global (when running under Bun), keep it.
// Otherwise, attach a minimal shim (or the full namespace) so code that expects `globalThis.Bun` works.
globalThis.Bun ??= BunNS;
