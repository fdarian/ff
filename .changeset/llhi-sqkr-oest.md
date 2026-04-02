---
"ff-effect": patch
---

Fix memory leak in Inngest handler: scope step FiberSets per invocation instead of leaking finalizers into the long-lived app scope
