import { describe, expect, it } from 'vitest'
import { applyDependencies, compact, hasLevel, levelIndex, requiredFor } from './dependencies'

describe('access dependencies', () => {
  it('adds the lookups a support agent needs when tickets:edit is granted', () => {
    const { grants, added } = applyDependencies({ tickets: 'edit' })
    expect(grants).toMatchObject({
      tickets: 'edit',
      users: 'lookup',
      kyc: 'status',
      withdrawals: 'status',
      requests: 'status',
      system_health: 'view',
    })
    expect(added.sort()).toEqual(['kyc', 'requests', 'system_health', 'users', 'withdrawals'])
  })

  it('never lowers a level that is already higher than required', () => {
    const { grants } = applyDependencies({ tickets: 'edit', users: 'view' })
    expect(grants.users).toBe('view')
  })

  it('raises a level to the highest requirement of several grants', () => {
    const { grants } = applyDependencies({ withdrawals: 'approve', tickets: 'edit' })
    // tickets:edit wants withdrawals:status, withdrawals:approve is higher and stays.
    expect(grants.withdrawals).toBe('approve')
    expect(grants.kyc).toBe('status')
  })

  it('reports which grants require a level', () => {
    const req = requiredFor({ tickets: 'edit', withdrawals: 'approve' })
    expect(req.users.by.sort()).toEqual(['tickets:edit', 'withdrawals:approve'])
    expect(req.system_health.level).toBe('view')
  })

  it('compares levels by their position in the resource', () => {
    expect(levelIndex('kyc', 'approve')).toBeGreaterThan(levelIndex('kyc', 'status'))
    expect(levelIndex('kyc', 'nope')).toBe(-1)
    expect(hasLevel({ kyc: 'approve' }, 'kyc', 'status')).toBe(true)
    expect(hasLevel({ kyc: 'status' }, 'kyc', 'approve')).toBe(false)
    expect(hasLevel({}, 'kyc', 'status')).toBe(false)
  })

  it('drops none entries', () => {
    expect(compact({ a: 'none', b: 'view' })).toEqual({ b: 'view' })
  })
})
