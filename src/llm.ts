import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai'
import { config } from './config'
import { log } from './log'

// Talks to Gemini. One function: send a prompt, get back JSON in the shape of `schema`.

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) throw new Error('GEMINI_API_KEY is missing. Put it in .env as GEMINI_API_KEY=...')
const MAX_TRIES = 5
const CALL_TIMEOUT = 20 // seconds. A normal call takes ~1 s. Any network call can hang, so we cancel and retry.

// The library has no time limit by default. It doesn't retry by default either: we retry ourselves, below.
const gemini = new GoogleGenAI({ apiKey, httpOptions: { timeout: CALL_TIMEOUT * 1000 } })

export async function ask(agent: string, systemPrompt: string, message: string, schema: object): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const started = Date.now()
    try {
      const response = await gemini.models.generateContent({
        model: config.model,
        contents: message,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseJsonSchema: schema, // Gemini must answer in exactly this shape
          temperature: 0.2, // low = more predictable answers
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, // fast and cheap
        },
      })
      const reply = response.text ?? ''
      log(agent, 'llm', {
        tokensIn: response.usageMetadata?.promptTokenCount ?? 0,
        tokensOut: response.usageMetadata?.candidatesTokenCount ?? 0,
        ms: Date.now() - started,
        message, // exactly what was sent (the system prompt is logged once, by the agent)
        reply, // exactly what came back
      })
      return JSON.parse(reply)
    } catch (err) {
      if (attempt >= MAX_TRIES) throw err
      const seconds = waitBeforeRetry(err, attempt)
      log(agent, 'llm-retry', { attempt, waitSeconds: seconds, problem: shortError(err) })
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
    }
  }
}

// "Too many requests" (429): wait as long as Gemini asks. Other problems: wait a little longer each time.
function waitBeforeRetry(err: unknown, attempt: number): number {
  if (!isRateLimit(err)) return attempt * 2
  const asked = String(err).match(/retry in ([\d.]+)s/) // Gemini says e.g. "Please retry in 12.3s."
  return asked ? Math.ceil(Number(asked[1])) + 1 : 30
}

function shortError(err: unknown): string {
  if (isRateLimit(err)) return 'rate limit (too many requests per minute)'
  if (err instanceof Error && err.name === 'AbortError') return `no answer within ${CALL_TIMEOUT} seconds`
  return String(err).slice(0, 200)
}

function isRateLimit(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429
}
