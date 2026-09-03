/**
 * The orgs you can act in, and one org's projects and people.
 *
 * THE ORG IS PART OF THE KEY. Projects and people are read `?owner=<org>`, so
 * each org's answer is its own cache entry — switching org is a different key
 * rather than a re-read of one, which is what makes going back free and what
 * stops one tenant's rows ever being filtered out of another's list.
 *
 * THERE IS NO ACTIVE-USER SWITCH. `setActiveUser` used to let a person pick
 * whom they were acting as out of a literal roster. Who you are is the
 * validated principal on the token; a picker that changes it changes nothing on
 * the server and everything a reader believes about the screen.
 */
import { atom, useAtom } from '@hanzo/chat/data/store'
import { keys } from '~/data/keys'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { reason, useRead, useSend } from '@hanzo/chat/data/query'
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

/** Whether the panel is showing, and which org and project are selected. */
export const open = atom(false)
export const org = atom('')
export const project = atom('')

const readOrgs = async (): Promise<Organization[]> => {
  // The orgs you belong to come first, so the first row is the honest default.
  const listed = await client(ESTATE).http.collection<WireOrg>('organizations', {
    path: '/v1/iam/organizations',
    query: { limit: 100 },
  })
  return listed.map((one) => ({
    id: one.name,
    name: one.displayName || one.name,
    personal: one.isPersonal ?? false,
    logo: one.logo || one.avatar || '',
  }))
}

const readProjects = async (owner: string): Promise<Project[]> => {
  const listed = await client(ESTATE).http.collection<WireProject>('projects', {
    path: '/v1/iam/projects',
    query: { owner },
  })
  return listed.map((one) => ({
    id: one.name,
    name: one.displayName || one.name,
    description: one.description ?? '',
    org: one.owner || one.organization || owner,
    isDefault: one.isDefault ?? false,
    tags: one.tags ?? [],
    updatedAt: one.updatedAt ?? '',
  }))
}

const readPeople = async (owner: string): Promise<UserIdentity[]> => {
  const people = await client(ESTATE).people.list({ owner, service: false })
  return people.map((person) => ({
    id: person.id,
    name: person.displayName || person.name,
    email: person.email ?? '',
    admin: Boolean(person.admin),
  }))
}

export const projectsStore = {
  open: () => open.set(true),
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),
  setActiveOrg: (id: string) => {
    if (id === org.get()) return
    org.set(id)
    // The project belonged to the org being left, so it is not carried over.
    project.set('')
  },
  setActiveProject: (id: string) => project.set(id),
}

/**
 * THREE TABS, THREE HOOKS, and one shared answer: WHICH ORG.
 *
 * They were one hook reading orgs, projects and people together, so the org
 * switcher waited on the directory and a project list re-rendered when people
 * landed. The org is genuinely shared — it selects the other two — so it is its
 * own hook that the other two read, rather than a field passed around.
 */

/** The orgs you can act in, and which one is selected. */
export const useOrgs = () => {
  const isOpen = useAtom(open)
  const orgs = useRead(keys.orgs, readOrgs, { enabled: isOpen, fresh: 300_000 })
  const organizations = orgs.data ?? []
  const chosen = useAtom(org)
  return {
    isOpen,
    organizations,
    // The org must be one that EXISTS; the first is a fallback, never an
    // override of a choice already made.
    activeOrgId:
      chosen && organizations.some((one) => one.id === chosen)
        ? chosen
        : (organizations[0]?.id ?? ''),
    pending: orgs.pending,
    fault: orgs.error ? reason(orgs.error) : null,
  }
}

/** One org's projects. */
export const useOrgProjects = () => {
  const { isOpen, activeOrgId: owner } = useOrgs()
  const projects = useRead(keys.projects(owner), () => readProjects(owner), {
    enabled: isOpen && Boolean(owner),
  })
  const rows = projects.data ?? []
  const held = useAtom(project)
  return {
    projects: rows,
    // The org's DEFAULT project is where a scope-less read lands, so it is the
    // honest selection when nothing is chosen — not the first row.
    activeProjectId:
      held && rows.some((one) => one.id === held)
        ? held
        : ((rows.find((one) => one.isDefault) ?? rows[0])?.id ?? ''),
    pending: projects.pending,
    fault: projects.error ? reason(projects.error) : null,
  }
}

/** One org's people. */
export const useOrgPeople = () => {
  const { isOpen, activeOrgId: owner } = useOrgs()
  const people = useRead(keys.people(owner), () => readPeople(owner), {
    enabled: isOpen && Boolean(owner),
    fresh: 300_000,
  })
  return { users: people.data ?? [], pending: people.pending }
}


/**
 * Makes an org.
 *
 * `name` is the slug every other surface scopes by and `displayName` is what a
 * person reads. Nothing else is sent: `CreateOrganizationInput` carries the
 * whole of IAM's org row — password policy, MFA, Kerberos, theme — and a value
 * invented here would be written as that org's policy.
 */
export const useMakeOrg = () =>
  useSend(async (name: string, displayName: string) => {
    await client(ESTATE).http.json({
      method: 'POST',
      path: '/v1/iam/organizations',
      body: { name, displayName: displayName || name },
    })
  }, [keys.orgs])

/** Makes a project in the org currently selected, and never in another. */
export const useMakeProject = () => {
  const owner = useAtom(org)
  return useSend(
    async (name: string, description: string, tags: string[] = []) => {
      if (!owner) return
      await client(ESTATE).http.json({
        method: 'POST',
        path: '/v1/iam/projects',
        body: { name, displayName: name, description, owner, tags },
      })
    },
    [keys.projects(owner)],
  )
}
