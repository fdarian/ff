---
'ff-effect': patch
---

`generateText`/`streamText` now correctly infer the result type from `output`, `tools`, and `runtimeContext` instead of falling back to their defaults. `tool`'s type parameters are reordered back to `<INPUT, OUTPUT, R, CONTEXT>`, and `CONTEXT` now infers from `contextSchema`.
