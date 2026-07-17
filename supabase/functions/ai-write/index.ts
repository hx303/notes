import { createAiWriteHandler, createAiWriteRuntimeFromEnv } from "./handler.ts"

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const runtime = createAiWriteRuntimeFromEnv(
  (name) => Deno.env.get(name),
  globalThis.fetch.bind(globalThis),
)

Deno.serve(createAiWriteHandler(runtime))
