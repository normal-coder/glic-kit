import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync, spawn } from 'node:child_process'
import { getPlatform } from './platform.ts'
import type { ChromeChannel, ChannelStatus } from '../types.ts'
import { GLIC_EXPERIMENTS, TARGET_COUNTRY } from './constants.ts'

/** Read and parse Local State JSON */
export function readLocalState(channel: ChromeChannel): Record<string, any> | null {
  if (!existsSync(channel.localStatePath)) return null
  try {
    const raw = readFileSync(channel.localStatePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Read Chrome version from "Last Version" file */
export function readLastVersion(channel: ChromeChannel): string | undefined {
  const versionPath = join(channel.userDataDir, 'Last Version')
  if (!existsSync(versionPath)) return undefined
  try {
    return readFileSync(versionPath, 'utf-8').trim()
  } catch {
    return undefined
  }
}

/**
 * Recursively walk a JSON object to find all is_glic_eligible values.
 */
function* walkObjects(obj: any): Generator<Record<string, any>> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    yield obj
    for (const value of Object.values(obj)) {
      yield* walkObjects(value)
    }
  } else if (Array.isArray(obj)) {
    for (const value of obj) {
      yield* walkObjects(value)
    }
  }
}

/** Get enabled_labs_experiments from Local State */
function getExperiments(data: Record<string, any>): string[] {
  const experiments = data?.browser?.enabled_labs_experiments
  return Array.isArray(experiments) ? experiments.map(String) : []
}

/** Check the unlock status of a Chrome channel */
export function checkChannelStatus(channel: ChromeChannel): ChannelStatus {
  const base: ChannelStatus = {
    channel,
    installed: existsSync(channel.userDataDir),
    unlocked: false,
    country: 'unknown',
    permanentCountry: [],
    glicEligible: false,
    glicEligibleCount: 0,
    glicEligibleFalseCount: 0,
    experiments: [],
    missingExperiments: [],
    issues: [],
  }

  if (!base.installed) return base

  const data = readLocalState(channel)
  if (!data) {
    base.issues.push('Local State 文件不存在或无法读取')
    return base
  }

  base.version = readLastVersion(channel)

  // Check country
  base.country = data.variations_country ?? 'missing'

  // Check permanent country
  const perm = data.variations_permanent_consistency_country
  base.permanentCountry = Array.isArray(perm) ? perm.map(String) : []

  // Check is_glic_eligible recursively
  let trueCount = 0
  let falseCount = 0
  for (const obj of walkObjects(data)) {
    if ('is_glic_eligible' in obj) {
      if (obj.is_glic_eligible === true) trueCount++
      else falseCount++
    }
  }
  base.glicEligible = falseCount === 0 && trueCount > 0
  base.glicEligibleCount = trueCount
  base.glicEligibleFalseCount = falseCount

  // Check experiments
  base.experiments = getExperiments(data)
  base.missingExperiments = GLIC_EXPERIMENTS.filter(
    (exp) => !base.experiments.includes(exp)
  )

  // Determine overall unlock status
  const countryOk = base.country === TARGET_COUNTRY
  const permOk = base.permanentCountry.length === 0 || base.permanentCountry[base.permanentCountry.length - 1] === TARGET_COUNTRY
  base.unlocked = countryOk && permOk && base.glicEligible

  // Collect issues
  if (!countryOk) base.issues.push(`variations_country = "${base.country}" (需要 "${TARGET_COUNTRY}")`)
  if (!permOk) base.issues.push(`variations_permanent_consistency_country 末位 = "${base.permanentCountry[base.permanentCountry.length - 1]}"`)
  if (!base.glicEligible) base.issues.push(`is_glic_eligible 存在 ${falseCount} 个 false`)
  if (base.missingExperiments.length > 0) base.issues.push(`缺少 ${base.missingExperiments.length} 个 Glic experiments`)

  return base
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Check if Chrome process is running */
export async function isChromeRunning(channel: ChromeChannel): Promise<boolean> {
  const platform = getPlatform()

  try {
    if (platform === 'darwin') {
      const output = execSync('ps -ax -o pid=,command=', { encoding: 'utf-8', timeout: 5000 })
      const appPath = `/Applications/${channel.appName}.app`
      return output.split('\n').some((line) =>
        line.includes(appPath) &&
        !line.includes('chrome_crashpad_handler') &&
        !line.includes('Helper')
      )
    }

    if (platform === 'win32') {
      const output = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', {
        encoding: 'utf-8', timeout: 5000,
      })
      return output.includes('chrome.exe')
    }

    // Linux
    try {
      execSync('pgrep -x chrome', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  } catch {
    return false
  }
}

/** Quit Chrome gracefully and wait for it to exit */
export async function quitChrome(channel: ChromeChannel): Promise<boolean> {
  const platform = getPlatform()

  try {
    if (platform === 'darwin') {
      spawn('osascript', ['-e', `tell application "${channel.appName}" to quit`], {
        stdio: 'ignore',
      })
    } else if (platform === 'win32') {
      spawn('taskkill', ['/IM', 'chrome.exe'], { stdio: 'ignore' })
    } else {
      spawn('pkill', ['-x', 'chrome'], { stdio: 'ignore' })
    }
  } catch {
    // Ignore errors - process may already be gone
  }

  // Wait up to 10 seconds for Chrome to exit
  for (let i = 0; i < 40; i++) {
    const running = await isChromeRunning(channel)
    if (!running) return true
    await sleep(250)
  }

  return false
}

/** Launch Chrome with optional flags */
export function launchChrome(
  channel: ChromeChannel,
  flags: string[] = [],
  lang?: string
): void {
  const platform = getPlatform()
  const args = [...flags]
  if (lang) args.push(`--lang=${lang}`)

  if (platform === 'darwin') {
    const spawnArgs = ['open', '-n', '-a', channel.appName!]
    if (args.length > 0) {
      spawnArgs.push('--args', ...args)
    }
    spawn(spawnArgs[0], spawnArgs.slice(1), { stdio: 'ignore' })
  } else if (platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files'
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
    const localAppData = process.env.LOCALAPPDATA || ''

    const possiblePaths = [
      join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]

    if (channel.name === 'canary') {
      possiblePaths.unshift(
        join(localAppData, 'Google', 'Chrome SxS', 'Application', 'chrome.exe')
      )
    }

    const chromePath = possiblePaths.find((p) => existsSync(p))
    if (chromePath) {
      spawn(chromePath, args, { detached: true, stdio: 'ignore' })
    }
  } else {
    // Linux
    const commands: Record<string, string> = {
      stable: 'google-chrome',
      beta: 'google-chrome-beta',
      dev: 'google-chrome-unstable',
      canary: 'google-chrome',
    }
    spawn(commands[channel.name], args, { detached: true, stdio: 'ignore' })
  }
}
