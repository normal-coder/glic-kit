/** Chrome release channel */
export type ChannelName = 'stable' | 'beta' | 'dev' | 'canary'

/** All channel names */
export const ALL_CHANNELS: ChannelName[] = ['stable', 'beta', 'dev', 'canary']

/** Operating system */
export type Platform = 'darwin' | 'win32' | 'linux'

/** Chrome channel metadata */
export interface ChromeChannel {
  name: ChannelName
  displayName: string
  userDataDir: string
  localStatePath: string
  processNames: string[]
  /** macOS bundle id */
  bundleId?: string
  /** macOS app name for `open -a` */
  appName?: string
}

/** Status of a single Chrome installation */
export interface ChannelStatus {
  channel: ChromeChannel
  installed: boolean
  version?: string
  unlocked: boolean
  country: string
  permanentCountry: string[]
  glicEligible: boolean
  glicEligibleCount: number
  glicEligibleFalseCount: number
  experiments: string[]
  missingExperiments: string[]
  language?: string
  issues: string[]
}

/** Options for patching */
export interface PatchOptions {
  keepLanguage?: boolean
  skipExperiments?: boolean
  dryRun?: boolean
  noLaunch?: boolean
  noOpenSettings?: boolean
  /** Progress callback: called with each step description */
  onProgress?: (msg: string) => void
}

/** Result of a single field change */
export interface FieldChange {
  field: string
  before: string
  after: string
}

/** Result of a patch operation */
export interface PatchResult {
  channel: ChannelName
  success: boolean
  backupPath?: string
  changes: FieldChange[]
  error?: string
}

/** Backup manifest */
export interface BackupManifest {
  timestamp: string
  channel: ChannelName
  platform: Platform
  version?: string
  files: string[]
}
