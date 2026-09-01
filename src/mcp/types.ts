/**
 * The MCP servers an org has connected, and what they expose.
 *
 * This was a table of five literals — fixed versions, fixed tool counts, and
 * `status: 'connected'` written into the source — so the modal reported a fleet
 * that did not exist and the composer offered names nothing could dispatch.
 *
 * What the API actually answers is thinner and truer. A server has an id, a
 * name, the URL it was connected at, and whether a credential is stored — never
 * the credential itself. There is no version, no category and no per-server
 * on/off, because the estate does not keep those: **activation is per TOOL**
 * (`tools.activation` / `tools.activate`), which is the switch this modal owns.
 */

/** One tool a connected server exposes. */
export interface Exposed {
  name: string
  description?: string
  /** Whether an agent may dispatch it today. */
  activated: boolean
}

/** A server this org has connected. Every field here is one the API answers. */
export interface Connected {
  id: string
  /** The server's name, or its id when it has never been given one. */
  name: string
  url?: string
  /** That a credential is held, never what it is. */
  hasSecret?: boolean
  tools: Exposed[]
}
