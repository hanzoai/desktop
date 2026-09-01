/**
 * A leased computer, and the lines it actually printed.
 *
 * Two questions, and they are not the same one:
 *
 *   WHERE it runs   an origin — this machine, or the estate. The same axis a
 *                   model is chosen on (`~/data/origin`), so there is one answer
 *                   to "local or cloud" in this app rather than one per panel.
 *   WHAT isolates    a runtime — `runc`, `gvisor`, or a microVM (`kata-clh`,
 *                   `kata-fc`). A microVM is a KIND of sandbox, not a place to
 *                   put one, so it belongs here and not beside the origin.
 *
 * The panel that stood here answered both with three sibling tabs — "Local k3s",
 * "Cloud MicroVM", "Tabs" — which crossed a location, an isolation and a product
 * surface, and then printed a fixed script no matter what anybody typed. Nothing
 * below prints a line it was not given.
 */
import { useEffect, useState } from 'react'

import type { Leased, Ran, SandboxRuntime } from '@hanzo/ai'

import { client, ESTATE, type Origin } from '~/data/origin'

/** What a line came from, so the view can render it without parsing it back. */
export type Kind = 'command' | 'out' | 'err' | 'note'

export interface Line {
  kind: Kind
  text: string
}

export interface TerminalState {
  isOpen: boolean
  /** The origin id the sandbox is leased from. */
  where: string
  /** The isolation asked for. What was GRANTED is `box.runtime`. */
  runtime: SandboxRuntime
  /** The live lease, or nothing. Absence is the honest empty state. */
  box: Leased | null
  /** Leasing or running — the two waits worth showing. */
  busy: boolean
  /** Why the last attempt failed, in the words it failed with. */
  fault: string | null
  lines: Line[]
}

const start = (): TerminalState => ({
  isOpen: false,
  where: ESTATE,
  runtime: 'gvisor',
  box: null,
  busy: false,
  fault: null,
  lines: [],
})

let state: TerminalState = start()
const listeners = new Set<(s: TerminalState) => void>()

const put = (next: Partial<TerminalState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const say = (kind: Kind, text: string) =>
  put({ lines: [...state.lines, ...text.split('\n').map((line) => ({ kind, text: line }))] })

/** The message an error carries, never the object's own spelling of itself. */
const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

export const terminalStore = {
  get: (): TerminalState => state,

  open: () => put({ isOpen: true }),
  close: () => put({ isOpen: false }),
  toggle: () => put({ isOpen: !state.isOpen }),

  /**
   * Moves to another origin.
   *
   * A lease belongs to the place that granted it, so it is dropped rather than
   * carried — an id from the estate names nothing on this machine.
   */
  setWhere: (where: string) => {
    if (where === state.where) return
    put({ where, box: null, fault: null })
    say('note', `origin: ${where}`)
  },

  setRuntime: (runtime: SandboxRuntime) => {
    if (runtime === state.runtime) return
    put({ runtime, fault: null })
    say('note', `runtime: ${runtime} (takes effect on the next lease)`)
  },

  /**
   * Leases a computer, or resumes the one already held.
   *
   * `exec` keeps nothing and needs no project, which is what makes it the class
   * a terminal can lease without asking anybody anything first.
   */
  lease: async (): Promise<Leased | null> => {
    if (state.box) return state.box
    put({ busy: true, fault: null })
    try {
      const box = await client(state.where).sandboxes.lease({
        class: 'exec',
        runtime: state.runtime,
      })
      put({ box, busy: false })
      const granted = box.runtime && box.runtime !== state.runtime ? ` (asked ${state.runtime})` : ''
      say('note', `leased ${box.id} · ${box.runtime ?? 'runtime unstated'}${granted}`)
      return box
    } catch (e) {
      put({ busy: false, fault: because(e) })
      say('err', because(e))
      return null
    }
  },

  /** Runs one line and prints what it printed. Leases first if nothing is held. */
  run: async (command: string) => {
    const line = command.trim()
    if (!line || state.busy) return

    say('command', line)
    const box = state.box ?? (await terminalStore.lease())
    if (!box) return

    put({ busy: true, fault: null })
    try {
      const ran: Ran = await client(state.where).sandboxes.run({ id: box.id, command: line })
      if (ran.stdout) say('out', ran.stdout.replace(/\n$/, ''))
      if (ran.stderr) say('err', ran.stderr.replace(/\n$/, ''))
      // A command that printed nothing still ended, and a non-zero end is the
      // whole result when there is no output to read it from.
      if (!ran.stdout && !ran.stderr) say('note', `exit ${ran.exitCode ?? 0}`)
      else if (ran.exitCode) say('note', `exit ${ran.exitCode}`)
      put({ busy: false })
    } catch (e) {
      put({ busy: false, fault: because(e) })
      say('err', because(e))
    }
  },

  /** Ends the lease. The computer is borrowed; nothing on it survives. */
  end: async () => {
    const box = state.box
    if (!box) return
    put({ busy: true })
    try {
      await client(state.where).sandboxes.end({ id: box.id })
      say('note', `ended ${box.id}`)
    } catch (e) {
      say('err', because(e))
    }
    put({ box: null, busy: false })
  },

  clear: () => put({ lines: [], fault: null }),
}

export const useTerminal = (): TerminalState => {
  const [current, setCurrent] = useState<TerminalState>(state)
  useEffect(() => {
    const handler = (next: TerminalState) => setCurrent(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])
  return current
}

export type { Origin }
