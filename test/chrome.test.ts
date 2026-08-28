import { describe, test, expect } from 'bun:test'
import { getPlatform, getChromeChannel } from '../src/core/platform.ts'
import { checkChannelStatus } from '../src/core/chrome.ts'

describe('chrome detection', () => {
  test('checkChannelStatus returns valid status for stable', () => {
    const p = getPlatform()
    const ch = getChromeChannel('stable', p)
    if (!ch) return // Skip if not available

    const status = checkChannelStatus(ch)
    expect(status.channel.name).toBe('stable')
    expect(typeof status.installed).toBe('boolean')
    expect(typeof status.unlocked).toBe('boolean')
    expect(typeof status.country).toBe('string')
    expect(Array.isArray(status.experiments)).toBe(true)
    expect(Array.isArray(status.issues)).toBe(true)
  })

  test('checkChannelStatus returns installed=false for non-existent channel', () => {
    // canary on linux should not exist
    const ch = getChromeChannel('canary', 'linux')
    if (ch) {
      const status = checkChannelStatus(ch)
      expect(status.installed).toBe(false)
    }
  })
})
