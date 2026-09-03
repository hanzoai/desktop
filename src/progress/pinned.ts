/**
 * The runs a person is watching.
 *
 * A PIN IS THIS WINDOW'S, not the org's. Nothing on the wire records that
 * somebody is watching a run — there is no route for it — so pinning is an atom
 * kept on this machine, and it says so wherever it is drawn. Inventing a shared
 * "pinned" flag would be a claim that a teammate sees the same board.
 *
 * It holds IDS and never rows. A pinned run's progress comes from the same
 * cache every other reader uses, so a bar on the board and the same bar in the
 * queue cannot disagree — and a pin to a run that has since ended resolves to
 * nothing rather than to a stale copy of how it looked when it was pinned.
 */
import { atom, useAtom } from '@hanzo/chat/data/store'
import type { Run } from './types.ts'
import { useRuns } from './store.ts'

const vault = 'hanzo.desktop.pinned'

const held = (): string[] => {
  try {
    const raw = localStorage.getItem(vault)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export const pinned = atom<string[]>(held())

pinned.watch(() => {
  try {
    localStorage.setItem(vault, JSON.stringify(pinned.get()))
  } catch {
    // A window with no storage watches for this session only. Losing a pin is
    // not losing work, so this one genuinely is a shrug.
  }
})

export const pin = {
  add: (id: string) => pinned.set((ids) => (ids.includes(id) ? ids : [...ids, id])),
  drop: (id: string) => pinned.set((ids) => ids.filter((one) => one !== id)),
  toggle: (id: string) =>
    pinned.set((ids) => (ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id])),
  has: (id: string): boolean => pinned.get().includes(id),
}

/**
 * The pinned runs, resolved against the live list.
 *
 * A pin naming a run the list no longer carries yields NOTHING rather than a
 * remembered row: the id is all that was kept, deliberately, so there is no
 * stale copy to fall back to.
 */
export const usePinned = (): { runs: Run[]; ids: string[] } => {
  const ids = useAtom(pinned)
  const { runs } = useRuns()
  const byId = new Map(runs.map((one) => [one.id, one]))
  return {
    ids,
    runs: ids.map((id) => byId.get(id)).filter((one): one is Run => one !== undefined),
  }
}
