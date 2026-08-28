import { describe, test, expect } from 'bun:test'
import { getPlatform, getChromeChannel, getAllChannels, isChannelSupported } from '../src/core/platform.ts'

describe('platform', () => {
  test('getPlatform returns valid platform', () => {
    const p = getPlatform()
    expect(['darwin', 'win32', 'linux']).toContain(p)
  })

  test('getChromeChannel returns channel metadata', () => {
    const p = getPlatform()
    const ch = getChromeChannel('stable', p)
    expect(ch).not.toBeNull()
    expect(ch!.name).toBe('stable')
    expect(ch!.localStatePath).toContain('Local State')
  })

  test('getChromeChannel returns null for unsupported canary on linux', () => {
    const ch = getChromeChannel('canary', 'linux')
    expect(ch).toBeNull()
  })

  test('isChannelSupported returns correct values', () => {
    expect(isChannelSupported('stable', 'darwin')).toBe(true)
    expect(isChannelSupported('canary', 'linux')).toBe(false)
    expect(isChannelSupported('canary', 'darwin')).toBe(true)
  })

  test('getAllChannels returns correct count', () => {
    const darwin = getAllChannels('darwin')
    expect(darwin.length).toBe(4)

    const linux = getAllChannels('linux')
    expect(linux.length).toBe(3) // No canary on linux
  })
})
