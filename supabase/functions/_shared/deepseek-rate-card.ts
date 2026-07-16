import type { AiProviderRequest, AiProviderResult, AiProviderUsage } from "./ai-provider"
import type { DeepSeekModel } from "./deepseek-provider"
import type { AiRateCard } from "./ai-runtime-safety"

export const DEEPSEEK_CNY_RATE_CARD_VERSION = "deepseek-cny-2026-07-17"
const PROMPT_TOKEN_OVERHEAD = 1024n
const PER_MESSAGE_TOKEN_OVERHEAD = 64n
const TEN_MILLION = 10_000_000n

// Official prices can change. DB active_rate_card_version must match this version before reserve.
// Units are tenths of one CNY fen per one million tokens to represent ¥0.025 exactly.
const prices: Record<
  DeepSeekModel,
  { cacheHitTenthsFen: bigint; cacheMissTenthsFen: bigint; outputTenthsFen: bigint }
> = {
  "deepseek-v4-flash": {
    cacheHitTenthsFen: 20n,
    cacheMissTenthsFen: 1000n,
    outputTenthsFen: 2000n,
  },
  "deepseek-v4-pro": {
    cacheHitTenthsFen: 25n,
    cacheMissTenthsFen: 3000n,
    outputTenthsFen: 6000n,
  },
}

const ceilDivide = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator - 1n) / denominator

const checkedTokenCount = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name} token count.`)
  return BigInt(value)
}

const asSafeFen = (value: bigint) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Calculated AI cost is too large.")
  return Number(value)
}

const wireUtf8Bytes = (model: DeepSeekModel, request: AiProviderRequest) => {
  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    stream: false,
    thinking: { type: "disabled" },
  }
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens
  if (request.temperature !== undefined) body.temperature = request.temperature
  return BigInt(new TextEncoder().encode(JSON.stringify(body)).byteLength)
}

export const estimateDeepSeekCostCents = (options: {
  model: DeepSeekModel
  providerRequest: AiProviderRequest
}) => {
  const maxTokens = options.providerRequest.maxTokens
  if (!Number.isSafeInteger(maxTokens) || (maxTokens ?? 0) <= 0) {
    throw new Error("DeepSeek reservation requires a positive maxTokens ceiling.")
  }
  const price = prices[options.model]
  const promptUpperBound =
    wireUtf8Bytes(options.model, options.providerRequest) +
    PROMPT_TOKEN_OVERHEAD +
    BigInt(options.providerRequest.messages.length) * PER_MESSAGE_TOKEN_OVERHEAD
  const numerator =
    promptUpperBound * price.cacheMissTenthsFen +
    BigInt(maxTokens as number) * price.outputTenthsFen
  return asSafeFen(ceilDivide(numerator, TEN_MILLION))
}

const validateUsage = (usage: AiProviderUsage) => {
  const prompt = checkedTokenCount(usage.promptTokens, "prompt")
  const completion = checkedTokenCount(usage.completionTokens, "completion")
  const total = checkedTokenCount(usage.totalTokens, "total")
  if (usage.cacheHitTokens === null || usage.cacheMissTokens === null) {
    throw new Error("DeepSeek cache usage is required for actual cost.")
  }
  const hit = checkedTokenCount(usage.cacheHitTokens, "cache-hit")
  const miss = checkedTokenCount(usage.cacheMissTokens, "cache-miss")
  if (prompt <= 0n || completion <= 0n || hit + miss !== prompt || prompt + completion !== total) {
    throw new Error("DeepSeek token usage is inconsistent.")
  }
  return { completion, hit, miss }
}

export const calculateDeepSeekCostCents = (model: DeepSeekModel, result: AiProviderResult) => {
  if (!result.usage) throw new Error("DeepSeek usage is required for actual cost.")
  if (result.model !== model) throw new Error("DeepSeek response model does not match reservation.")
  const usage = validateUsage(result.usage)
  const price = prices[model]
  const numerator =
    usage.hit * price.cacheHitTenthsFen +
    usage.miss * price.cacheMissTenthsFen +
    usage.completion * price.outputTenthsFen
  return asSafeFen(ceilDivide(numerator, TEN_MILLION))
}

export const createDeepSeekCnyRateCard = (model: DeepSeekModel): AiRateCard =>
  Object.freeze({
    provider: "deepseek",
    model,
    version: DEEPSEEK_CNY_RATE_CARD_VERSION,
    estimateCostCents: (request: AiProviderRequest) =>
      estimateDeepSeekCostCents({ model, providerRequest: request }),
    calculateCostCents: (result: AiProviderResult) => calculateDeepSeekCostCents(model, result),
  })
