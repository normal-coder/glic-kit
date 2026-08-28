import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { ChromeChannel, BackupManifest, Platform, ChannelName } from '../types.ts'

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** Get the default backup root directory: ~/.glic-kit/backups/ */
export function getBackupRoot(customDir?: string): string {
  if (customDir) return customDir
  return join(homedir(), '.glic-kit', 'backups')
}

/**
 * Create a backup of Chrome's Local State and Preferences before patching.
 * Returns the backup directory path.
 */
export function createBackup(
  channel: ChromeChannel,
  platform: Platform,
  version?: string,
  customBackupDir?: string
): string {
  const backupRoot = getBackupRoot(customBackupDir)
  const backupDir = join(backupRoot, timestamp(), channel.name)

  mkdirSync(backupDir, { recursive: true })

  const files: string[] = []

  // Backup Local State
  const localStatePath = channel.localStatePath
  if (existsSync(localStatePath)) {
    const dest = join(backupDir, 'Local_State.before.json')
    copyFileSync(localStatePath, dest)
    files.push('Local_State.before.json')
  }

  // Backup Default/Preferences (profile-level prefs)
  const prefsPath = join(channel.userDataDir, 'Default', 'Preferences')
  if (existsSync(prefsPath)) {
    const dest = join(backupDir, 'Default_Preferences.before.json')
    copyFileSync(prefsPath, dest)
    files.push('Default_Preferences.before.json')
  }

  // Write manifest
  const manifest: BackupManifest = {
    timestamp: timestamp(),
    channel: channel.name,
    platform,
    version,
    files,
  }
  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

  return backupDir
}

/**
 * Restore a backup: Local State + Preferences (if backed up).
 */
export function restoreBackup(backupDir: string, channel: ChromeChannel): boolean {
  const localStateSource = join(backupDir, 'Local_State.before.json')
  if (!existsSync(localStateSource)) return false

  // Restore Local State (atomic write)
  const tmpPath = channel.localStatePath + '.tmp'
  copyFileSync(localStateSource, tmpPath)
  renameSync(tmpPath, channel.localStatePath)

  // Restore Default/Preferences if backed up
  const prefsSource = join(backupDir, 'Default_Preferences.before.json')
  const prefsTarget = join(channel.userDataDir, 'Default', 'Preferences')
  if (existsSync(prefsSource) && existsSync(prefsTarget)) {
    const tmpPrefs = prefsTarget + '.tmp'
    copyFileSync(prefsSource, tmpPrefs)
    renameSync(tmpPrefs, prefsTarget)
  }

  return true
}

/**
 * List available backups for a channel.
 */
export function listBackups(channel: ChannelName, customBackupDir?: string): string[] {
  const backupRoot = getBackupRoot(customBackupDir)
  if (!existsSync(backupRoot)) return []

  const backups: string[] = []

  try {
    for (const tsDir of readdirSync(backupRoot)) {
      const channelDir = join(backupRoot, tsDir, channel)
      if (existsSync(join(channelDir, 'Local_State.before.json'))) {
        backups.push(channelDir)
      }
    }
  } catch {
    // Ignore errors
  }

  return backups.sort().reverse() // Newest first
}
