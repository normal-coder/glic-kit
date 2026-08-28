import { describe, test, expect } from 'bun:test'
import { GLIC_EXPERIMENTS, TARGET_COUNTRY } from '../src/core/constants.ts'

describe('constants', () => {
  test('GLIC_EXPERIMENTS is non-empty', () => {
    expect(GLIC_EXPERIMENTS.length).toBeGreaterThan(0)
  })

  test('GLIC_EXPERIMENTS contains glic@1', () => {
    expect(GLIC_EXPERIMENTS).toContain('glic@1')
  })

  test('TARGET_COUNTRY is us', () => {
    expect(TARGET_COUNTRY).toBe('us')
  })
})
