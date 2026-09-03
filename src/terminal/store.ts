/**
 * A leased computer, and the lines it actually printed.
 *
 * Two questions, and they are not the same one:
 *
 *   WHERE it runs   an origin — this machine, or the estate. The same axis a
 *                   model is chosen on (`~/data/origin`), so there is one answer
 *                   to "local or cloud" in this app rather than one per panel.
 *   WHAT isolates   a runtime — `runc`, `gvisor`, or a microVM (`kata-clh`,
 *                   `kata-fc`). A microVM is a KIND of sandbox, not a place to
 *                   put one, so it belongs here and not beside the origin.
 *
 * EVERYTHING HERE IS AN ATOM AND NONE OF IT IS A CACHED READ, which is the one
 * place this app's two primitives are not enough on their own. A LEASE IS A
 * HANDLE THIS WINDOW HOLDS, not a value it fetched: re-reading it would lease a
 * second computer, and dropping it from a cache would strand the first. The
 * output is the same shape one level down — an append-only log this window
 * accumulated, which no key can be invalidated to recover.
 *
 * The RUNS are ordinary writes and go through `useSend`.
 */
import type { Leased, Ran, SandboxRuntime } from '@hanzo/ai'

import { atom, useAtom } from '@hanzo/chat/data/store'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { useSend } from '@hanzo/chat/data/query'

/** What a line came from, so the view can render it without parsing it back. */
export type Kind = 'command' | 'out' | 'err' | 'note'

export interface Line {
  kind: Kind
  text: string
}

/** Whether the panel is showing. */
export const open = atom(false)
/** The origin the sandbox is leased from. */
export const where = atom<string>(ESTATE)
/** The isolation ASKED for. What was granted is on the lease. */
export const runtime = atom<SandboxRuntime>('gvisor')
/** The live lease, or nothing. Absence is the honest empty state. */
export const box = atom<Leased | null>(null)
/** What was printed, in order. */
export const lines = atom<Line[]>([])

/**
 * How many lines the terminal keeps.
 *
 * The log was appended to for the life of the window with nothing ever removed,
 * so a session that ran one chatty command — a build, a `find /` — held every
 * line of it in memory and in the DOM until the app was closed. A terminal is a
 * SCROLLBACK, so it has a depth; this is that depth said once.
 */
const scrollback = 2000

const say = (kind: Kind, text: string) =>
  lines.set((held) => {
    const next = [...held, ...text.split('\n').map((line) => ({ kind, text: line }))]
    // The OLDEST go, because a terminal is read from the bottom.
    return next.length > scrollback ? next.slice(next.length - scrollback) : next
  })

export const terminalStore = {
  open: () => open.set(true),
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),

  /**
   * Moves to another origin.
   *
   * A lease belongs to the place that granted it, so it is dropped rather than
   * carried — an id from the estate names nothing on this machine.
   */
  setWhere: (next: string) => {
    if (next === where.get()) return
    where.set(next)
    box.set(null)
    say('note', `origin: ${next}`)
  },

  setRuntime: (next: SandboxRuntime) => {
    if (next === runtime.get()) return
    runtime.set(next)
    say('note', `runtime: ${next} (takes effect on the next lease)`)
  },

  clear: () => lines.set([]),
}

/**
 * Leases a computer if none is held, runs one line, and prints what it printed.
 *
 * `exec` keeps nothing and needs no project, which is what makes it the class a
 * terminal can lease without asking anybody anything first.
 */
export const useRun = () =>
  useSend(async (command: string) => {
    const line = command.trim()
    if (!line) return
    say('command', line)

    const sandboxes = client(where.get()).sandboxes
    let held = box.get()
    if (!held) {
      held = await sandboxes.lease({ class: 'exec', runtime: runtime.get() })
      box.set(held)
      const asked =
        held.runtime && held.runtime !== runtime.get() ? ` (asked ${runtime.get()})` : ''
      say('note', `leased ${held.id} · ${held.runtime ?? 'runtime unstated'}${asked}`)
    }

    const ran: Ran = await sandboxes.run({ id: held.id, command: line })
    if (ran.stdout) say('out', ran.stdout.replace(/\n$/, ''))
    if (ran.stderr) say('err', ran.stderr.replace(/\n$/, ''))
    // A command that printed nothing still ended, and a non-zero end is the
    // whole result when there is no output to read it from.
    if (!ran.stdout && !ran.stderr) say('note', `exit ${ran.exitCode ?? 0}`)
    else if (ran.exitCode) say('note', `exit ${ran.exitCode}`)
  })

/** Ends the lease. A sandbox nobody is watching still costs the org. */
export const useEnd = () =>
  useSend(async () => {
    const held = box.get()
    if (!held) return
    await client(where.get()).sandboxes.end({ id: held.id })
    box.set(null)
    say('note', `ended ${held.id}`)
  })

export const useTerminal = () => ({
  isOpen: useAtom(open),
  where: useAtom(where),
  runtime: useAtom(runtime),
  box: useAtom(box),
  lines: useAtom(lines),
})
