import { REQUIREMENTS, RESOURCES, type Grants, type ResourceDef } from './catalog'

export interface Requirement {
  level: string
  /** `resource:level` of the grants that need it. */
  by: string[]
}

const byKey = (resources: ResourceDef[]) =>
  new Map(resources.map((r) => [r.key, r]))

/** Position of a level in its resource; -1 for an unknown level. */
export function levelIndex(resource: string, level: string, resources = RESOURCES) {
  return byKey(resources).get(resource)?.levels.indexOf(level) ?? -1
}

/** Does the grant set give at least `needed` on `resource`? */
export function hasLevel(
  grants: Grants,
  resource: string,
  needed: string,
  resources = RESOURCES
): boolean {
  const held = grants[resource] ?? 'none'
  const h = levelIndex(resource, held, resources)
  const n = levelIndex(resource, needed, resources)
  return n >= 0 && h >= n
}

/** The minimum level each resource must keep because other grants need it. */
export function requiredFor(
  grants: Grants,
  requirements = REQUIREMENTS,
  resources = RESOURCES
): Record<string, Requirement> {
  const out: Record<string, Requirement> = {}
  for (const [res, level] of Object.entries(grants)) {
    const needs = requirements[`${res}:${level}`]
    if (!needs) continue
    for (const [target, min] of Object.entries(needs)) {
      const cur = out[target]
      if (!cur) {
        out[target] = { level: min, by: [`${res}:${level}`] }
      } else {
        if (levelIndex(target, min, resources) > levelIndex(target, cur.level, resources)) {
          cur.level = min
        }
        cur.by.push(`${res}:${level}`)
      }
    }
  }
  return out
}

/**
 * Raise grants until every requirement holds. Returns a new object and the
 * resources that were added or raised automatically.
 */
export function applyDependencies(
  input: Grants,
  requirements = REQUIREMENTS,
  resources = RESOURCES
): { grants: Grants; added: string[] } {
  const grants: Grants = { ...input }
  const added = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    const req = requiredFor(grants, requirements, resources)
    for (const [res, r] of Object.entries(req)) {
      if (levelIndex(res, grants[res] ?? 'none', resources) < levelIndex(res, r.level, resources)) {
        grants[res] = r.level
        added.add(res)
        changed = true
      }
    }
  }
  return { grants, added: [...added] }
}

/** Remove `none` entries so a grant set stays minimal. */
export function compact(grants: Grants): Grants {
  return Object.fromEntries(Object.entries(grants).filter(([, v]) => v !== 'none'))
}
