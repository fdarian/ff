# Inngest

Effect wrapper for the [Inngest TypeScript SDK](https://www.inngest.com/docs). Provides type-safe, Effect-native usage of Inngest functions with step memoization, event schemas, and an HTTP handler.

## Quick Start

```ts
import { Effect } from 'effect'
import { Inngest, EventSchemas } from 'inngest'
import { createInngest } from 'ff-effect/for/inngest'

const client = new Inngest({
  id: 'my-app',
  schemas: new EventSchemas().fromZod({
    'user.signup': { data: z.object({ email: z.string() }) },
  }),
})

const ig = createInngest(client)

const program = Effect.gen(function* () {
  const fn = yield* ig.createFunction(
    { id: 'on-signup' },
    { event: 'user.signup' },
    ({ event, step }) => Effect.gen(function* () {
      yield* step.run('send-email', () =>
        Effect.tryPromise(() => sendEmail(event.data.email))
      )
    })
  )

  const handler = ig.httpHandler({ functions: [fn] })
  Bun.serve({ fetch: handler })
})

await Effect.runPromise(program.pipe(Effect.provide(ig.layer)))
```

## `createInngest`

Creates an Effect-based wrapper around an Inngest client.

```ts
const ig = createInngest(client)
const ig = createInngest(client, { tagId: 'MyInngest' })
```

Returns:
- `Tag` — `Context.Tag` for the Inngest client
- `client` — the original Inngest client
- `layer` — `Layer.succeed(Tag, client)` for providing via context
- `send(payload)` — send events (see [Sending Events](#sending-events))
- `createFunction(config, trigger, handler)` — create functions (see [Creating Functions](#creating-functions))
- `httpHandler(opts)` — create HTTP handler (see [HTTP Handler](#http-handler))

## Creating Functions

```ts
const fn = yield* ig.createFunction(
  { id: 'process-order', retries: 5 },
  { event: 'order.created' },
  ({ event, step, runId, attempt }) => Effect.gen(function* () {
    const result = yield* step.run('validate', () =>
      Effect.tryPromise(() => validateOrder(event.data.orderId))
    )
    yield* step.sleep('cooldown', Duration.minutes(5))
    yield* step.run('fulfill', () => Effect.succeed(result))
  })
)
```

Config supports all Inngest options: `id`, `name`, `retries`, `concurrency`, `throttle`, `idempotency`, `rateLimit`, `debounce`, `priority`, `batchEvents`, `cancelOn`, `timeouts`, `onFailure`.

`createFunction` returns an `Effect` — use `yield*` to extract the function. The handler receives services from the surrounding Effect context via `extract()`.

## Steps

Each Inngest step method is wrapped to return `Effect` instead of `Promise`.

### `step.run`

Run an Effect as a durable, memoized step. The callback must return `Effect<A, E, never>` (no service requirements — capture services in the outer handler scope).

```ts
yield* step.run('my-step', () =>
  Effect.tryPromise(() => fetchData())
)
```

### `step.sleep`

Sleep for a duration. Accepts Effect's `Duration` input.

```ts
yield* step.sleep('wait', Duration.hours(1))
yield* step.sleep('short', Duration.seconds(30))
```

### `step.sleepUntil`

Sleep until a specific date or ISO string.

```ts
yield* step.sleepUntil('until', new Date('2024-12-31'))
yield* step.sleepUntil('until', '2024-12-31T00:00:00Z')
```

### `step.invoke`

Invoke another Inngest function.

```ts
yield* step.invoke('call-other', {
  function: otherFunctionRef,
  data: { key: 'value' },
})
```

### `step.waitForEvent`

Wait for a matching event with a timeout. Returns the event or `null`.

```ts
const approval = yield* step.waitForEvent('wait-approval', {
  event: 'order.approved',
  timeout: '1h',
  match: 'data.orderId',
})
```

### `step.sendEvent`

Send events from within a step (memoized).

```ts
yield* step.sendEvent('notify', {
  name: 'notification.send',
  data: { message: 'Order processed' },
})
```

## Triggers

### Event trigger

```ts
ig.createFunction(config, { event: 'user.signup' }, handler)
ig.createFunction(config, { event: 'user.signup', if: 'event.data.premium == true' }, handler)
```

### Cron trigger (string)

```ts
ig.createFunction(config, { cron: '0 9 * * *' }, handler)
```

### Cron trigger (Effect `Cron.Cron`)

```ts
import { Cron } from 'effect'

ig.createFunction(config, { cron: Cron.unsafeParse('0 9 * * *') }, handler)
```

## Event Schemas

Event types flow automatically through Inngest SDK's generics:

```ts
const client = new Inngest({
  id: 'my-app',
  schemas: new EventSchemas().fromZod({
    'user.signup': { data: z.object({ email: z.string() }) },
    'order.created': { data: z.object({ orderId: z.string(), amount: z.number() }) },
  }),
})

const ig = createInngest(client)

ig.createFunction(
  { id: 'on-signup' },
  { event: 'user.signup' },
  ({ event }) => Effect.gen(function* () {
    // event.data.email is typed as string
    console.log(event.data.email)
  })
)
```

## HTTP Handler

Returns an Effect `HttpApp.Default` (from `@effect/platform`) for serving Inngest functions. Use this when composing with Effect's HTTP server stack.

```ts
const app = ig.httpHandler({
  functions: [fn1, fn2],
  servePath: '/api/inngest',  // optional, default: /api/inngest
})
```

### With `@effect/platform` HTTP server

```ts
import { HttpRouter, HttpServer } from '@effect/platform'

HttpRouter.empty.pipe(
  HttpRouter.mountApp('/api/inngest', app),
)
```

## Fetch Handler

Returns a raw fetch handler `(Request) => Promise<Response>` for direct use with `Bun.serve` or ff-serv.

```ts
const handler = ig.fetchHandler({
  functions: [fn1, fn2],
  servePath: '/api/inngest',
})
```

### With `Bun.serve`

```ts
Bun.serve({ fetch: handler })
```

### With ff-serv

```ts
import { basicHandler } from 'ff-serv/http/basic'

basicHandler(
  (url) => url.pathname.startsWith('/api/inngest'),
  handler,
)
```

## Sending Events

Send events outside of functions using `send()`. Requires the Inngest Tag in the Effect context.

```ts
yield* ig.send({ name: 'user.signup', data: { email: 'user@example.com' } })
```

Provide the client via `ig.layer`:

```ts
Effect.gen(function* () {
  yield* ig.send({ name: 'user.signup', data: { email: 'user@example.com' } })
}).pipe(Effect.provide(ig.layer))
```
