/**
 * What this client cannot do yet, and why — in one place, so a control that is
 * off can say so in the same words everywhere it appears.
 *
 * Every entry here is a SERVER gap, not a decision. There is no route to rename,
 * delete or page a thread, and `@hanzo/ai` binds no method for any of it. The
 * alternative to this file was inventing routes and watching them 404 in the
 * reader's face, or leaving controls that quietly do nothing.
 *
 * Writing is no longer among them, and the entry claiming otherwise was the
 * costliest thing in this file: `POST /v1/agents/chat/conversations` answers
 * 200, `threads.record` binds it, and every conversation carried a footnote
 * saying it was not being saved while the route to save it sat unused. A gap
 * that outlives its cause reads as a measurement and is a memory.
 *
 * A gap closes by a route appearing and the SDK binding it. When one does, the
 * entry is deleted and the control it disabled becomes live — which is why each
 * names the method it is waiting for rather than describing a feeling.
 */

export type Gap = 'rename' | 'delete' | 'upload' | 'share' | 'tools' | 'dictate' | 'anonymous'

/** What a reader is told. One sentence, plain, and never an apology. */
export const why: Record<Gap, string> = {
  rename: 'Renaming a conversation is not available yet.',
  delete: 'Deleting a conversation is not available yet.',
  upload: 'Attaching files is not available yet.',
  share: 'Sharing a conversation is not available yet.',
  tools: 'Choosing tools for a turn is not available yet.',
  dictate: 'Dictation is not available yet.',
  anonymous: 'Sign in to chat. There is no signed-out preview yet.',
}

/**
 * Which SDK method each gap waits on. Documentation with a compiler behind it:
 * the day one of these exists, the name is what a reader greps for.
 */
export const awaiting: Record<Gap, string> = {
  rename: 'threads.update',
  delete: 'threads.delete',
  upload: 'files.create',
  share: 'threads.share',
  tools: 'chat.completions.create({ tools })',
  /** The verb exists; `/v1/models` publishes no transcription model to name. */
  dictate: 'a transcription model in models.list()',
  /**
   * NOT the SDK's to close. `createAiClient` takes a `publishableKey` at 0.6.16
   * and `origin.ts` passes the brand's, so the client side of this is done. The
   * gateway is what refuses: a `pk-` reaches `/v1/models`, `/v1/embeddings` and
   * `/health`, and answers 403 on `/v1/chat/completions` — *"Use a secret key
   * (sk-)"* — while no bearer at all answers 401. A secret key in a browser is
   * not the fix, so this waits on the gateway serving anonymous turns on a
   * publishable key, or on this machine's engine answering instead.
   */
  anonymous: 'the gateway admitting pk- on /v1/chat/completions',
}
