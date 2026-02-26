# ff-effect/for/ai

Effect wrappers for AI SDK's `generateText`, `streamText`, and `tool`.

## Basic `generateText`

```ts
import { generateText } from "ff-effect/for/ai"
import { openai } from "@ai-sdk/openai"
import { Effect } from "effect"

const program = generateText({
  model: openai("gpt-4o"),
  prompt: "What is the capital of France?",
})

const result = await Effect.runPromise(program)
console.log(result.text)
```

## `generateText` with `onFinish` callback

```ts
import { generateText } from "ff-effect/for/ai"
import { openai } from "@ai-sdk/openai"
import { Effect } from "effect"

const program = generateText({
  model: openai("gpt-4o"),
  prompt: "Summarize the water cycle.",
  onFinish: (result) =>
    Effect.sync(() => {
      console.log("Finished, tokens used:", result.usage.totalTokens)
    }),
})

const result = await Effect.runPromise(program)
console.log(result.text)
```

## Basic `streamText`

Requires `Effect.scoped` because streaming outlives the initial call.

```ts
import { streamText } from "ff-effect/for/ai"
import { openai } from "@ai-sdk/openai"
import { Effect } from "effect"

const program = Effect.scoped(
  Effect.gen(function* () {
    const result = yield* streamText({
      model: openai("gpt-4o"),
      prompt: "Tell me a short story.",
    })

    for await (const chunk of result.textStream) {
      process.stdout.write(chunk)
    }
  })
)

await Effect.runPromise(program)
```

## `tool` with an Effect service

`tool()` returns an `Effect.Effect<Ai.Tool, never, R | Scope.Scope>`, so it must be yielded inside `Effect.gen` with `Effect.scoped`.

```ts
import { generateText, tool } from "ff-effect/for/ai"
import { openai } from "@ai-sdk/openai"
import { Effect } from "effect"
import { z } from "zod"

class WeatherService extends Effect.Service<WeatherService>()("WeatherService", {
  succeed: {
    getTemperature: (city: string) => Effect.succeed(22),
  },
}) {}

const program = Effect.scoped(
  Effect.gen(function* () {
    const weatherTool = yield* tool({
      description: "Get the current temperature for a city",
      parameters: z.object({ city: z.string() }),
      execute: ({ city }) =>
        Effect.gen(function* () {
          const weather = yield* WeatherService
          const temperature = yield* weather.getTemperature(city)
          return { city, temperature }
        }),
    })

    const result = yield* generateText({
      model: openai("gpt-4o"),
      prompt: "What is the temperature in Paris?",
      tools: { weather: weatherTool },
    })

    return result.text
  })
)

const text = await Effect.runPromise(program.pipe(Effect.provide(WeatherService.Default)))
console.log(text)
```

## Error handling with `AiError`

```ts
import { generateText, AiError } from "ff-effect/for/ai"
import { openai } from "@ai-sdk/openai"
import { Effect } from "effect"

const program = generateText({
  model: openai("gpt-4o"),
  prompt: "Hello!",
}).pipe(
  Effect.catchTag("ff-effect/AiError", (error) =>
    Effect.sync(() => {
      console.error("AI SDK error:", error.cause)
      return { text: "Fallback response" }
    })
  )
)

const result = await Effect.runPromise(program)
console.log(result.text)
```
