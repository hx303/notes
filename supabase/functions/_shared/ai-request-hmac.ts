import type { AiProviderRequest } from "./ai-provider"
import type { AiInputHasher } from "./ai-runtime-safety"

const serializeRequest = (ownerId: string, request: AiProviderRequest) =>
  JSON.stringify({
    schema: "wouldkeep-ai-input-hmac-v1",
    ownerId,
    messages: request.messages,
    maxTokens: request.maxTokens ?? null,
    temperature: request.temperature ?? null,
  })

export class WebCryptoHmacAiInputHasher implements AiInputHasher {
  private readonly key: Promise<CryptoKey>

  constructor(secret: string) {
    if (new TextEncoder().encode(secret).byteLength < 32) {
      throw new Error("AI input hash secret must contain at least 32 UTF-8 bytes.")
    }
    const keyBytes = new TextEncoder().encode(secret)
    this.key = crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ])
  }

  async hash(ownerId: string, request: AiProviderRequest): Promise<string> {
    const signature = await crypto.subtle.sign(
      "HMAC",
      await this.key,
      new TextEncoder().encode(serializeRequest(ownerId, request)),
    )
    return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    )
  }
}
