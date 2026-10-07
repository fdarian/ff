---
'ff-effect': minor
'ff-serv': minor
'ff-ai': minor
---

Upgrade to stable Effect `4.0.0` (peer range updated) and Drizzle `1.0.0-rc.5`.

`ff-ai`: the Drizzle provider now builds its client with `drizzle({ client })`, and the `store.casing` option is removed because Drizzle v1 no longer supports casing at the client level.
