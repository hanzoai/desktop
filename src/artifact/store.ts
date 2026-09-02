/**
 * An artifact, and the sandbox that actually runs it.
 *
 * Same shape as `~/terminal` and for the same reason: a LEASE IS A HANDLE THIS
 * WINDOW HOLDS, not a value it fetched, so it is an atom rather than a cached
 * read — re-reading would lease a second computer and dropping it from a cache
 * would strand the first. The RUNS are ordinary writes and go through
 * `useSend`.
 *
 * It composes `~/terminal`'s two axes rather than restating them: WHERE it runs
 * is an origin, WHAT isolates it is a runtime, and the three sibling
 * "environments" that stood here — "Local k3s", "Hanzo Cloud", "gVisor Enclave"
 * — crossed a place with an isolation and offered the cross as one choice.
 */
import type { Leased, SandboxRuntime } from '@hanzo/ai'

import { atom, useAtom } from '~/data/store'
import { client, ESTATE } from '~/data/origin'
import { useSend } from '~/data/query'

export type ArtifactTab = 'code' | 'preview' | 'terminal'

/** How a language is run, and the file it is written to. */
const runners: Record<string, { file: string; argv: string[] }> = {
  python: { file: 'main.py', argv: ['python3', 'main.py'] },
  javascript: { file: 'main.js', argv: ['node', 'main.js'] },
  typescript: { file: 'main.ts', argv: ['node', '--experimental-strip-types', 'main.ts'] },
  bash: { file: 'main.sh', argv: ['bash', 'main.sh'] },
  sh: { file: 'main.sh', argv: ['sh', 'main.sh'] },
  go: { file: 'main.go', argv: ['go', 'run', 'main.go'] },
  ruby: { file: 'main.rb', argv: ['ruby', 'main.rb'] },
}

export interface ArtifactData {
  id: string
  title: string
  language: string
  code: string
  /** Where it runs — an origin id, the same axis a model is chosen on. */
  where: string
  /** What isolates it. A microVM is a runtime, not a place. */
  runtime: SandboxRuntime
  activeTab: ArtifactTab
  /** The live lease, or nothing. Nothing is leased until something is run. */
  box: Leased | null
  /** Only what the sandbox printed, plus this app's own notes, marked. */
  logs: string[]
}

/** The artifact on screen, or nothing. */
export const current = atom<ArtifactData | null>(null)

const put = (next: Partial<ArtifactData>) => {
  const held = current.get()
  if (held) current.set({ ...held, ...next })
}

/** The same scrollback the terminal keeps, and for the same reason. */
const scrollback = 2000

const say = (text: string) => {
  const held = current.get()
  if (!held) return
  const next = [...held.logs, ...text.split('\n')]
  put({ logs: next.length > scrollback ? next.slice(next.length - scrollback) : next })
}

export const artifactStore = {
  /**
   * Opens an artifact.
   *
   * NOTHING IS LEASED HERE. Opening a file is not renting a computer, and the
   * six-line boot sequence this used to print described one that did not exist.
   */
  open: (data: Partial<ArtifactData> & { title: string; code: string; language?: string }) =>
    current.set({
      where: ESTATE,
      runtime: 'gvisor',
      activeTab: 'code',
      box: null,
      logs: [],
      ...data,
      id: data.id || `art_${Date.now().toString(36)}`,
      language: data.language || 'typescript',
    }),

  updateCode: (code: string) => put({ code }),
  setTab: (activeTab: ArtifactTab) => put({ activeTab }),

  /** A lease belongs to the place that granted it, so moving drops it. */
  setWhere: (where: string) => {
    const held = current.get()
    if (!held || where === held.where) return
    put({ where, box: null })
    say(`# origin: ${where}`)
  },

  setRuntime: (runtime: SandboxRuntime) => {
    const held = current.get()
    if (!held || runtime === held.runtime) return
    put({ runtime, box: null })
    say(`# runtime: ${runtime} (takes effect on the next lease)`)
  },

  clearLogs: () => put({ logs: [] }),

  /** Closing ends the lease, because a sandbox nobody is watching still bills. */
  close: () => {
    const held = current.get()
    current.set(null)
    if (held?.box) void client(held.where).sandboxes.end({ id: held.box.id }).catch(() => {})
  },
}

/**
 * Writes the code into a leased sandbox and runs it.
 *
 * `exec` keeps nothing and needs no project, which is what makes it the class
 * this can lease without asking anybody anything first. A language with no
 * runner is REFUSED rather than run as something else — guessing would execute
 * one language's file with another's interpreter and report the resulting
 * syntax error as the program's own.
 */
export const useRunCode = () =>
  useSend(async () => {
    const held = current.get()
    if (!held) return
    const runner = runners[held.language.toLowerCase()]
    if (!runner) {
      say(`# no runner for ${held.language}`)
      return
    }

    const sandboxes = client(held.where).sandboxes
    put({ activeTab: 'terminal' })

    let leased = held.box
    if (!leased) {
      leased = await sandboxes.lease({ class: 'exec', runtime: held.runtime })
      put({ box: leased })
      const asked = leased.runtime && leased.runtime !== held.runtime ? ` (asked ${held.runtime})` : ''
      say(`# leased ${leased.id} · ${leased.runtime ?? 'runtime unstated'}${asked}`)
    }

    await sandboxes.write({ id: leased.id, path: runner.file, data: held.code })
    say(`$ ${runner.argv.join(' ')}`)

    const ran = await sandboxes.run({ id: leased.id, argv: runner.argv })
    if (ran.stdout) say(ran.stdout.replace(/\n$/, ''))
    if (ran.stderr) say(ran.stderr.replace(/\n$/, ''))
    if (!ran.stdout && !ran.stderr) say(`# exit ${ran.exitCode ?? 0}`)
    else if (ran.exitCode) say(`# exit ${ran.exitCode}`)
  })

/**
 * Interrupts what is running. The LEASE SURVIVES — this stops a runaway
 * program, it does not release the computer.
 */
export const useStopCode = () =>
  useSend(async () => {
    const held = current.get()
    if (!held?.box) return
    await client(held.where).sandboxes.stop({ id: held.box.id })
    say('# interrupted')
  })

export const useArtifact = (): ArtifactData | null => useAtom(current)
