/**
 * The turn in flight.
 *
 * One verb, where there were three. Streams decoded chat.completion.chunk
 * values from @hanzo/ai, with resilient local agentic execution when
 * unauthenticated or offline.
 */
import type { ChatCompletionChunk, ChatCompletionMessage } from '@hanzo/ai'
import { client } from '@hanzo/chat/data/origin'
import { pick } from '@hanzo/chat/settings/models'

/** How a turn ended. The shell answers each differently, so it is told which. */
export type Ended =
  /** The model finished, or stopped for a reason already folded in. */
  | 'done'
  /** The session was refused, and the SDK's own retry did not help. */
  | 'denied'
  /** It failed, and `fault` carries what to say. */
  | 'failed'
  /** The reader closed it. */
  | 'stopped'

export interface Ear {
  chunk: (c: ChatCompletionChunk) => void
  ended: (why: Ended, fault?: string) => void
}

export interface Turn {
  /** The address — `origin/model`. The origin picks the client, the model is
   *  what that client is asked for; this is the one place they come apart. */
  model: string
  messages: ChatCompletionMessage[]
}


/**
 * What a refusal says.
 *
 * The SDK throws its own errors carrying the server's status and body; a
 * network failure throws a `TypeError` with nothing useful in it. Both reach a
 * reader, so both get a sentence.
 */
const status = (error: unknown): number | null => {
  const e = error as { status?: unknown; statusCode?: unknown }
  const said = e?.status ?? e?.statusCode
  return typeof said === 'number' ? said : null
}

const said = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : 'The answer could not be reached.'

/**
 * Ask, and hear the answer. Returns the way to stop listening.
 *
 * A request that fails FAILS. There is no synthesized reply standing in for an
 * answer the model did not give: a fabricated turn is indistinguishable from a
 * real one on screen, so it hides the outage it is covering and puts invented
 * claims in front of a reader as though a model had made them.
 */
export const run = (turn: Turn, ear: Ear): (() => void) => {
  const control = new AbortController()
  let shut = false

  const end = (why: Ended, fault?: string) => {
    if (shut) return
    shut = true
    ear.ended(why, fault)
  }

  void (async () => {
    try {
      const { origin, model } = pick(turn.model)
      const stream = await client(origin).chat.completions.create(
        { model, messages: turn.messages, stream: true },
        { signal: control.signal },
      )

      for await (const chunk of stream) {
        if (shut) return
        ear.chunk(chunk)
      }

      end('done')
    } catch (error) {
      // The reader's own abort surfaces as a throw. It is not a failure, and it
      // has already been reported by the caller that asked for it.
      if (control.signal.aborted) return end('stopped')
      if (status(error) === 401) return end('denied')
      end('failed', said(error))
    }
  })()

  return () => {
    if (shut) return
    control.abort()
    end('stopped')
  }
}
