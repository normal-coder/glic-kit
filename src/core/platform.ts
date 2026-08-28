import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ChannelName, ChromeChannel, Platform } from '../types.ts'

/** Detect current platform */
export function getPlatform(): Platform {
  const p = process.platform
  if (p === 'darwin') return 'darwin'
  if (p === 'win32') return 'win32'
  return 'linux'
}

/** Get the base user data directory for Chrome on this platform */
function getBaseUserDataDir(platform: Platform): string {
  const home = homedir()
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Google')
    case 'win32': {
      const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
      return join(localAppData, 'Google')
    }
    case 'linux':
      return join(home, '.config')
  }
}

/** Get the channel-specific subdirectory name under the base dir */
function getChannelSubdir(channel: ChannelName, platform: Platform): string {
  switch (platform) {
    case 'darwin':
      switch (channel) {
        case 'stable': return 'Chrome'
        case 'beta': return 'Chrome Beta'
        case 'dev': return 'Chrome Dev'
        case 'canary': return 'Chrome Canary'
      }
      break
    case 'win32':
      switch (channel) {
        case 'stable': return join('Chrome', 'User Data')
        case 'beta': return join('Chrome Beta', 'User Data')
        case 'dev': return join('Chrome Dev', 'User Data')
        case 'canary': return join('Chrome SxS', 'User Data')
      }
      break
    case 'linux':
      switch (channel) {
        case 'stable': return 'google-chrome'
        case 'beta': return 'google-chrome-beta'
        case 'dev': return 'google-chrome-unstable'
        case 'canary': return '' // Not supported on Linux
      }
      break
  }
  return ''
}

/** macOS app names for `open -a` */
function getAppName(channel: ChannelName): string {
  switch (channel) {
    case 'stable': return 'Google Chrome'
    case 'beta': return 'Google Chrome Beta'
    case 'dev': return 'Google Chrome Dev'
    case 'canary': return 'Google Chrome Canary'
  }
}

/** macOS bundle identifiers */
function getBundleId(channel: ChannelName): string {
  switch (channel) {
    case 'stable': return 'com.google.Chrome'
    case 'beta': return 'com.google.Chrome.beta'
    case 'dev': return 'com.google.Chrome.dev'
    case 'canary': return 'com.google.Chrome.canary'
  }
}

/** Process names used to detect if Chrome is running */
function getProcessNames(channel: ChannelName, platform: Platform): string[] {
  if (platform === 'darwin') {
    return [getAppName(channel)]
  }
  // Windows and Linux use 'chrome' or 'chrome.exe'
  const names = ['chrome', 'chrome.exe']
  if (channel === 'canary') {
    names.push('chrome canary', 'GoogleUpdate')
  }
  return names
}

/** Check if a channel is supported on this platform */
export function isChannelSupported(channel: ChannelName, platform: Platform): boolean {
  if (channel === 'canary' && platform === 'linux') return false
  return true
}

/** Build ChromeChannel metadata for a given channel and platform */
export function getChromeChannel(channel: ChannelName, platform: Platform): ChromeChannel | null {
  if (!isChannelSupported(channel, platform)) return null

  const base = getBaseUserDataDir(platform)
  const subdir = getChannelSubdir(channel, platform)
  if (!subdir) return null

  const userDataDir = join(base, subdir)

  return {
    name: channel,
    displayName: getAppName(channel),
    userDataDir,
    localStatePath: join(userDataDir, 'Local State'),
    processNames: getProcessNames(channel, platform),
    bundleId: platform === 'darwin' ? getBundleId(channel) : undefined,
    appName: platform === 'darwin' ? getAppName(channel) : undefined,
  }
}

/** Get all supported channels for this platform */
export function getAllChannels(platform: Platform): ChromeChannel[] {
  const channels: ChromeChannel[] = []
  for (const name of ['stable', 'beta', 'dev', 'canary'] as ChannelName[]) {
    const ch = getChromeChannel(name, platform)
    if (ch) channels.push(ch)
  }
  return channels
}
