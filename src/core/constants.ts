/**
 * Glic-related labs experiments to inject into Chrome's enabled_labs_experiments.
 * These match the reference projects' recommended flags.
 */
export const GLIC_EXPERIMENTS: string[] = [
  'glic@1',
  'glic-side-panel@1',
  'glic-actor@1',
  'glic-pre-warming@1',
  'glic-z-order-changes@1',
  'glic-fre-pre-warming@1',
  'skills@1',
]

/** Country code used to unlock Gemini features */
export const TARGET_COUNTRY = 'us'

/** Default backup root directory */
export const DEFAULT_BACKUP_DIR_NAME = '.glic-kit'

/** Fields to check in Local State */
export const STATE_FIELDS = [
  'variations_country',
  'variations_permanent_consistency_country',
  'is_glic_eligible',
] as const

/** Chrome launch flags for post-repair */
export const CHROME_LAUNCH_FLAGS = ['--variations-override-country=us']
