---
"ff-ai": minor
---

Remove the `ff-ai/providers/drizzle` conversation store provider (`createDrizzleStoreLayer`, schema, and related exports). drizzle-orm now ships native Effect integration — see https://orm.drizzle.team/docs/connect-effect-postgres — so implement your own `ConversationStore` layer against that instead.
