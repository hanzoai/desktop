/**
 * The orgs you can act in, and one org's projects and people.
 *
 * This held eleven literals — four orgs with invented tiers and member counts,
 * four people including "Alex Vance" and "Sarah Connor", and three projects with
 * invented runtime targets and collaborator counts. `createOrg` and
 * `createProject` prepended to those arrays and called nothing.
 *
 * THE ORG DECIDES THE REST. Projects are read `?owner=<org>` and people are read
 * for that same owner, so switching org re-reads both rather than filtering a
 * list held in memory — a client-side filter over one tenant's rows would be a
 * claim that it had ever seen the others.
 *
 * THERE IS NO ACTIVE-USER SWITCH. `setActiveUser` used to let a person pick
 * whom they were acting as out of a literal roster. Who you are is the validated
 * principal on the token; a picker that changes it changes nothing on the server
 * and everything a reader believes about the screen.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'
import type { Organization, Project, UserIdentity } from './types'

export type { Organization, Project, UserIdentity }

interface WireOrg {
  name: string
  displayName?: string
  logo?: string
  avatar?: string
  isPersonal?: boolean
}

interface WireProject {
  name: string
  displayName?: string
  description?: string
  owner?: string
  organization?: string
  isDefault?: boolean
  tags?: string[]
  updatedAt?: string
}

export interface ProjectsState {
  isOpen: boolean
  activeOrgId: string
  activeProjectId: string
  organizations: Organization[]
  users: UserIdentity[]
  projects: Project[]
  pending: boolean
  fault: string | null
}

let state: ProjectsState = {
  isOpen: false,
  activeOrgId: '',
  activeProjectId: '',
  organizations: [],
  users: [],
  projects: [],
  pending: false,
  fault: null,
}

const listeners = new Set<(s: ProjectsState) => void>()

const put = (next: Partial<ProjectsState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

/** One org's projects and people. Either failing costs only its own list. */
const readOrg = async (org: string) => {
  if (!org) {
    put({ projects: [], users: [] })
    return
  }
  const api = client(ESTATE)
  const [projects, people] = await Promise.all([
    api.http
      .collection<WireProject>('projects', { path: '/v1/iam/projects', query: { owner: org } })
      .catch(() => []),
    api.people.list({ owner: org, service: false }).catch(() => []),
  ])

  // A later switch may have landed while these were in flight.
  if (state.activeOrgId !== org) return

  const seen: Project[] = projects.map((one) => ({
    id: one.name,
    name: one.displayName || one.name,
    description: one.description ?? '',
    org: one.owner || one.organization || org,
    isDefault: one.isDefault ?? false,
    tags: one.tags ?? [],
    updatedAt: one.updatedAt ?? '',
  }))

  put({
    projects: seen,
    users: people.map((person) => ({
      id: person.id,
      name: person.displayName || person.name,
      email: person.email ?? '',
      admin: Boolean(person.admin),
    })),
    // The org's default project is where a scope-less read lands, so it is the
    // honest selection when nothing is chosen — not the first row.
    activeProjectId:
      state.activeProjectId && seen.some((one) => one.id === state.activeProjectId)
        ? state.activeProjectId
        : (seen.find((one) => one.isDefault) ?? seen[0])?.id ?? '',
  })
}

const read = async () => {
  put({ pending: true, fault: null })
  try {
    // The orgs you belong to come first, so the first row is the honest default.
    const orgs = await client(ESTATE).http.collection<WireOrg>('organizations', {
      path: '/v1/iam/organizations',
      query: { limit: 100 },
    })
    const seen: Organization[] = orgs.map((one) => ({
      id: one.name,
      name: one.displayName || one.name,
      personal: one.isPersonal ?? false,
      logo: one.logo || one.avatar || '',
    }))
    const org =
      state.activeOrgId && seen.some((one) => one.id === state.activeOrgId)
        ? state.activeOrgId
        : seen[0]?.id ?? ''
    put({ organizations: seen, activeOrgId: org, pending: false })
    await readOrg(org)
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

export const projectsStore = {
  get: (): ProjectsState => state,
  open: () => {
    put({ isOpen: true })
    void read()
  },
  close: () => put({ isOpen: false }),
  toggle: () => (state.isOpen ? put({ isOpen: false }) : projectsStore.open()),
  refresh: () => void read(),

  /** Switching org re-reads its projects and its people. */
  setActiveOrg: (activeOrgId: string) => {
    if (activeOrgId === state.activeOrgId) return
    put({ activeOrgId, activeProjectId: '', projects: [], users: [] })
    void readOrg(activeOrgId)
  },

  setActiveProject: (activeProjectId: string) => put({ activeProjectId }),

  /**
   * Makes an org.
   *
   * `name` is the slug every other surface scopes by and `displayName` is what
   * a person reads. Nothing else is sent: `CreateOrganizationInput` carries the
   * whole of IAM's org row — password policy, MFA, Kerberos, theme — and a
   * value invented here would be written as that org's policy.
   */
  createOrg: async (name: string, displayName: string) => {
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'POST',
        path: '/v1/iam/organizations',
        body: { name, displayName: displayName || name },
      })
      await read()
    } catch (e) {
      put({ fault: because(e) })
    }
  },

  /** Makes a project in the org currently selected, and never in another. */
  createProject: async (name: string, description: string, tags: string[] = []) => {
    const org = state.activeOrgId
    if (!org) return
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'POST',
        path: '/v1/iam/projects',
        body: { name, displayName: name, description, owner: org, tags },
      })
      await readOrg(org)
    } catch (e) {
      put({ fault: because(e) })
    }
  },
}

export const useProjects = (): ProjectsState => {
  const [current, setCurrent] = useState<ProjectsState>(state)
  useEffect(() => {
    listeners.add(setCurrent)
    return () => {
      listeners.delete(setCurrent)
    }
  }, [])
  return current
}
