/**
 * Runs, their subtasks, and how far along each one is.
 *
 * **It goes through the cloud client** (`client.sessions`), not hand-rolled
 * HTTP: `list`, `tree` and `stream` are all methods there, and a second spelling
 * of a route is how two callers come to disagree about it.
 *
 * ONE FIELD IS DECLARED HERE THAT THE CLIENT LACKS. The wire's `sessionView`
 * carries `progress`, and `@hanzo/ai@0.6.16` — which IS the latest — omits it
 * from `Session`. So the fold reads it through a local widening rather than
 * inventing the value or dropping the feature, and the real fix is upstream in
 * the SDK. Check whether it has landed before copying this pattern.
 *
 * **Bars fill from the STREAM, not from polling.** A `progress` turn appended
 * by a running agent moves the session's progress server-side and pushes the
 * updated row onto `sessions/stream`, so a board follows a run without asking.
 * That is the whole reason the report verb below writes an EVENT rather than
 * patching a field: one write, and every watcher already knows.
 */
import { useEffect } from 'react'

import type { Session } from '@hanzo/ai'

import { keys } from '../data/keys'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { peek, reason, useRead, useSend, write } from '@hanzo/chat/data/query'
import { progressOf, type Node, type Progress, type Run } from './types'

export * from './types'

/** What the SDK's `Session` omits. The wire has carried it all along. */
type Reported = Session & {
  progress?: {
    pct?: number
    phase?: string
    activity?: string
    at?: string
    estimated?: boolean
  }
}

const fold = (one: Reported): Run => ({
  id: one.id,
  title: one.title || one.id,
  agent: one.agent ?? '',
  status:
    one.status === 'paused' || one.status === 'done' || one.status === 'error'
      ? one.status
      : 'running',
  progress: progressOf(one.progress),
  children: one.children ?? 0,
  rootId: one.rootSessionId || one.id,
  parentId: one.parentSessionId ?? '',
  events: one.events ?? 0,
  startedAt: one.startedAt ?? '',
  updatedAt: one.updatedAt ?? '',
})

/** How many runs to read. The route publishes no cursor, so this is the page. */
const page = 60

/**
 * The org's runs — every root, newest first.
 *
 * This IS the global view: with no filter the route answers ROOT sessions, so a
 * board shows one row per flow rather than one per subagent, and a subagent is
 * reached by opening its parent.
 */
export const useRuns = () => {
  const listed = useRead<Run[]>(
    keys.sessions,
    async () => {
      const rows = (await client(ESTATE).sessions.list({}, {})) as Reported[]
      return rows.slice(0, page).map(fold)
    },
    { fresh: 30_000 },
  )
  return {
    runs: listed.data ?? [],
    pending: listed.pending,
    fault: listed.error ? reason(listed.error) : null,
  }
}

/**
 * One run's whole subagent tree.
 *
 * `tree` pulls the flow in ONE indexed read — every node of a flow shares a
 * root id — so a deep fan-out costs one request rather than one per node.
 */
export const useTree = (id: string) => {
  const read = useRead<Node | null>(
    keys.tree(id),
    async () => {
      const walk = (n: { session?: Session; children?: unknown[] }): Node | null => {
        if (!n.session) return null
        return {
          run: fold(n.session as Reported),
          children: ((n.children ?? []) as { session?: Session; children?: unknown[] }[])
            .map(walk)
            .filter((x): x is Node => x !== null),
        }
      }
      return walk(await client(ESTATE).sessions.tree(id))
    },
    { enabled: Boolean(id), fresh: 15_000 },
  )
  return {
    tree: read.data ?? null,
    pending: read.pending,
    fault: read.error ? reason(read.error) : null,
  }
}

/**
 * Reports how far along a run is — the verb an AGENT calls as it works.
 *
 * It appends a `progress` TURN rather than patching a field, and that choice is
 * the feature: the server moves the session's progress from it, marks it the
 * run's OWN word rather than a model's estimate, and pushes the updated row
 * onto the live stream. One write, and every board already knows.
 *
 * `pct` is optional on purpose. A run that knows it is BLOCKED and does not
 * know how far along it is says the half it knows, and the bar stays
 * indeterminate rather than being told a number nobody has.
 *
 * The SDK has no method for this — `sessions` covers list/get/tree/steer/stream
 * and not the append — so it goes through the one transport the client exposes
 * for exactly that. Same route, same envelope.
 */
export const useReport = () =>
  useSend(async (id: string, of: { pct?: number; phase?: string; activity?: string }) => {
    await client(ESTATE).http.json({
      method: 'POST',
      path: `/v1/agents/sessions/${id}/events`,
      body: { kind: 'progress', payload: of },
    })
  }, [keys.sessions])

/**
 * Follows the org's runs live.
 *
 * The stream is the reason a bar moves on its own. Each `session` frame is the
 * same row the list read answers with, so it is written straight into the cache
 * under the key the list already uses — no second store, and every component
 * reading `useRuns` re-renders with no work of its own.
 *
 * A DROP IS ORDINARY and the SDK says so: the generator ends when the server
 * closes the feed, and a subscriber more than 256 frames behind is dropped
 * outright so one stuck window can never back-pressure a session write. So this
 * reconnects, and the GET reads stay the source of truth — a missed frame costs
 * freshness until the next read, never correctness.
 */
export const useLiveRuns = (on = true) => {
  useEffect(() => {
    if (!on) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const follow = async () => {
      while (live) {
        try {
          for await (const frame of client(ESTATE).sessions.stream()) {
            if (!live) return
            if (frame.kind !== 'session') continue
            const moved = fold(frame.session as Reported)
            const held = peek<Run[]>(keys.sessions) ?? []
            const at = held.findIndex((one) => one.id === moved.id)
            // A row this window has never seen goes to the FRONT, which is where
            // the list read would have put it: the route answers newest first.
            const next = at < 0 ? [moved, ...held] : held.map((one, i) => (i === at ? moved : one))
            write(keys.sessions, next)
            // A subagent moving changes its parent's tree, and only that tree.
            if (moved.rootId && moved.rootId !== moved.id) write(keys.tree(moved.rootId), undefined)
          }
        } catch {
          // A dropped feed is expected. The reads remain the source of truth,
          // so this costs freshness until the next one rather than correctness.
        }
        if (!live) return
        // Wait before redialling, so a server refusing the feed is not asked
        // again as fast as the loop can spin.
        await new Promise<void>((wake) => {
          timer = setTimeout(wake, 3_000)
        })
      }
    }
    void follow()

    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [on])
}

export type { Node, Progress, Run }
