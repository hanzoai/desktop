/**
 * Turning a value into something a person reads.
 *
 * Two pure functions, no state and no I/O. They are here rather than in each
 * panel because there were THREE copies of `ago` and TWO of `tint`, and a
 * duplicated formatter drifts the way a duplicated fact does: one panel called
 * the last hour "45m ago" and another "1h ago" for the same instant.
 *
 * TIME IS UNIX MILLISECONDS INSIDE THIS APP, and nothing else. The estate sends
 * three spellings — RFC 3339 on a session, unix SECONDS on a board issue, unix
 * MILLISECONDS on a flow — so the conversion happens once, where a store folds
 * the wire, and every clock past that boundary is the same number. `ago` taking
 * all three would move that decision into a formatter, which cannot see which
 * it was handed: 1_700_000_000 is a plausible answer in either unit and is
 * fifty-four years apart between them.
 */

/** A wire clock in seconds becomes the one representation. */
export const fromSeconds = (at?: number): number => (at ? at * 1000 : 0)

/** A wire clock as RFC 3339 becomes the one representation. 0 when unparseable. */
export const fromStamp = (at?: string): number => {
  if (!at) return 0
  const ms = Date.parse(at)
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * How long ago, as a phrase. Empty for a clock nobody set.
 *
 * Empty rather than "never" or "just now": zero means the wire carried no
 * time, and both of those words are claims about when something happened.
 */
export const ago = (at: number): string => {
  if (!at) return ''
  const mins = Math.floor((Date.now() - at) / 60_000)
  if (mins < 0) return 'just now'
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * A stable colour for an id.
 *
 * Derived from the id, so it is consistent across panels and across restarts
 * and is not a claim about anything — an agent is not green because it is
 * healthy, it is green because of its name.
 */
export const tint = (id: string): string => {
  const hues = ['#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fbbf24', '#f87171']
  let sum = 0
  for (let i = 0; i < id.length; i += 1) sum = (sum + id.charCodeAt(i)) % 997
  return hues[sum % hues.length]
}
