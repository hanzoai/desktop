/**
 * Orgs, projects and people, as IAM has them.
 *
 * `GET /v1/iam/organizations` answers the orgs you can act in; `GET
 * /v1/iam/projects?owner=<org>` answers that org's projects; the org's people
 * come from the SCIM directory the presence rail already reads.
 *
 * FOUR FIELDS ARE GONE BECAUSE NOTHING PUBLISHES THEM: an org's `tier`
 * (free/pro/enterprise — a plan is billing's answer, not IAM's) and its
 * `membersCount`; and a project's `runtimeTarget` and `assignedAgents`. Each was
 * a literal here, and `collaboratorsCount` with them.
 *
 * A person's ROLE is likewise not a four-value enum. IAM answers one bit —
 * whether they administer the org — so that is the one thing said about them.
 */
export interface Organization {
  /** IAM's `name`: the slug every other surface scopes by. It IS the id. */
  id: string
  /** What a person sees, falling back to the slug. */
  name: string
  /** An org minted for one person rather than a company. */
  personal: boolean
  logo: string
}

export interface UserIdentity {
  id: string
  name: string
  email: string
  /** Whether they administer the org. The only role bit on the wire. */
  admin: boolean
}

export interface Project {
  /** IAM's `name`, unique within the org. */
  id: string
  name: string
  description: string
  /** The org that owns it — IAM's `owner`. */
  org: string
  /** The org's default project, which every scope-less read lands in. */
  isDefault: boolean
  tags: string[]
  updatedAt: string
}
