import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { ChromeChannel, PatchOptions, PatchResult } from '../types.ts'
import { GLIC_EXPERIMENTS, TARGET_COUNTRY, CHROME_LAUNCH_FLAGS } from './constants.ts'
import { getPlatform } from './platform.ts'
import { readLocalState, readLastVersion } from './chrome.ts'
import { createBackup } from './backup.ts'
import { isChromeRunning, quitChrome, launchChrome } from './chrome.ts'

/**
 * Recursively set all is_glic_eligible to true.
 */
function patchGlicEligible(obj: any): number {
  let patched = 0
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    if ('is_glic_eligible' in obj && obj.is_glic_eligible !== true) {
      obj.is_glic_eligible = true
      patched++
    }
    for (const value of Object.values(obj)) {
      patched += patchGlicEligible(value)
    }
  } else if (Array.isArray(obj)) {
    for (const value of obj) {
      patched += patchGlicEligible(value)
    }
  }
  return patched
}

/**
 * Patch Chrome's Local State to unlock Gemini features.
 * This is the core repair function.
 */
export async function patchLocalState(
  channel: ChromeChannel,
  options: PatchOptions = {}
): Promise<PatchResult> {
  const log = options.onProgress ?? (() => {})
  const step = async (msg: string) => {
    if (options.onProgress) await new Promise((r) => setTimeout(r, 180))
    log(msg)
  }
  const result: PatchResult = {
    channel: channel.name,
    success: false,
    changes: [],
  }

  // 1. Check if installed
  await step(`📂 检查 ${channel.displayName} 安装目录...`)
  if (!existsSync(channel.userDataDir)) {
    result.error = `未找到 Chrome ${channel.name} 的用户数据目录: ${channel.userDataDir}`
    return result
  }

  if (!existsSync(channel.localStatePath)) {
    result.error = `未找到 Local State 文件。请先启动一次 Chrome ${channel.displayName} 后重试。`
    return result
  }
  await step(`✓ 找到 ${channel.localStatePath}`)

  // 2. Read current state
  await step('📖 读取 Local State 配置...')
  const data = readLocalState(channel)
  if (!data) {
    result.error = 'Local State 文件无法解析'
    return result
  }

  // Capture before values
  const beforeCountry = data.variations_country ?? 'missing'
  const beforePerm = Array.isArray(data.variations_permanent_consistency_country)
    ? JSON.stringify(data.variations_permanent_consistency_country)
    : 'missing'

  let beforeGlicFalse = 0
  for (const obj of walkObjects(data)) {
    if ('is_glic_eligible' in obj && obj.is_glic_eligible !== true) beforeGlicFalse++
  }
  const beforeExperiments: string[] = Array.isArray(data?.browser?.enabled_labs_experiments)
    ? data.browser.enabled_labs_experiments.map(String)
    : []

  // Pre-compute version for permanent country
  const version = readLastVersion(channel)
  const existing = data.variations_permanent_consistency_country
  const currentVersion = version || (Array.isArray(existing) && existing[0] ? String(existing[0]) : '')

  // 3. If dry run, just report what would change
  if (options.dryRun) {
    result.success = true
    if (beforeCountry !== TARGET_COUNTRY) {
      result.changes.push({ field: 'variations_country', before: beforeCountry, after: TARGET_COUNTRY })
    }
    const permChanged = !Array.isArray(data.variations_permanent_consistency_country) ||
      data.variations_permanent_consistency_country[data.variations_permanent_consistency_country.length - 1] !== TARGET_COUNTRY
    if (permChanged) {
      result.changes.push({ field: 'variations_permanent_consistency_country', before: beforePerm, after: currentVersion ? `["${currentVersion}","${TARGET_COUNTRY}"]` : TARGET_COUNTRY })
    }
    if (beforeGlicFalse > 0) {
      result.changes.push({ field: 'is_glic_eligible', before: `${beforeGlicFalse} 个 false`, after: '全部 true' })
    }
    return result
  }

  // 4. Quit Chrome if running
  await step('🔍 检测 Chrome 是否正在运行...')
  const running = await isChromeRunning(channel)
  if (running) {
    await step('⚠️  Chrome 正在运行，正在关闭...')
    const quitOk = await quitChrome(channel)
    if (!quitOk) {
      result.error = `${channel.displayName} 仍在运行，请手动关闭后重试`
      return result
    }
    await step('✓ Chrome 已关闭')
  } else {
    await step('✓ Chrome 未在运行')
  }

  // 5. Create backup
  await step('💾 创建备份...')
  const backupPath = createBackup(channel, getPlatform(), version)
  result.backupPath = backupPath
  await step(`✓ 备份已保存至 ${backupPath}`)

  // 6. Apply patches
  await step('🔧 开始修改配置...')

  // 6a. Set variations_country
  if (data.variations_country !== TARGET_COUNTRY) {
    result.changes.push({
      field: 'variations_country',
      before: beforeCountry,
      after: TARGET_COUNTRY,
    })
    data.variations_country = TARGET_COUNTRY
    await step(`✓ variations_country: ${beforeCountry} → ${TARGET_COUNTRY}`)
  } else {
    await step('  variations_country 已是 us，跳过')
  }

  // 6b. Set variations_permanent_consistency_country
  const newPerm = currentVersion ? [currentVersion, TARGET_COUNTRY] : [TARGET_COUNTRY]
  const permChanged = !Array.isArray(existing) || existing[existing.length - 1] !== TARGET_COUNTRY
  if (permChanged) {
    result.changes.push({
      field: 'variations_permanent_consistency_country',
      before: beforePerm,
      after: JSON.stringify(newPerm),
    })
    data.variations_permanent_consistency_country = newPerm
    await step(`✓ variations_permanent_consistency_country: ${beforePerm} → ${JSON.stringify(newPerm)}`)
  } else {
    await step('  variations_permanent_consistency_country 已锁定 us，跳过')
  }

  // 6c. Patch is_glic_eligible
  const glicPatched = patchGlicEligible(data)
  if (glicPatched > 0) {
    result.changes.push({
      field: 'is_glic_eligible',
      before: `${glicPatched} 个 false`,
      after: '全部 true',
    })
    await step(`✓ is_glic_eligible: ${glicPatched} 处 false → true`)
  } else {
    await step('  is_glic_eligible 已全部为 true，跳过')
  }

  // 6d. Inject experiments
  if (!options.skipExperiments) {
    const browser = data.browser ?? (data.browser = {})
    const experiments: string[] = Array.isArray(browser.enabled_labs_experiments)
      ? browser.enabled_labs_experiments
      : []

    const seen = new Set(experiments)
    const added: string[] = []
    for (const exp of GLIC_EXPERIMENTS) {
      if (!seen.has(exp)) {
        experiments.push(exp)
        seen.add(exp)
        added.push(exp)
      }
    }
    browser.enabled_labs_experiments = experiments

    if (added.length > 0) {
      result.changes.push({
        field: 'enabled_labs_experiments',
        before: `${beforeExperiments.length} 项`,
        after: `+${added.length} 项 → ${experiments.length} 项`,
      })
      await step(`✓ Glic experiments: 注入 ${added.length} 项 (${added.join(', ')})`)
    } else {
      await step('  Glic experiments 已全部存在，跳过')
    }
  }

  // 7. Atomic write
  await step('📝 写入修改...')
  const tmpPath = channel.localStatePath + '.tmp'
  writeFileSync(tmpPath, JSON.stringify(data), 'utf-8')
  renameSync(tmpPath, channel.localStatePath)
  await step('✓ Local State 已写入')

  // 8. Verify
  await step('🔎 验证写入结果...')
  const verifyData = readLocalState(channel)
  if (!verifyData) {
    result.error = '写入后无法重新读取 Local State'
    return result
  }

  if (verifyData.variations_country !== TARGET_COUNTRY) {
    result.error = `验证失败: variations_country = "${verifyData.variations_country}" (期望 "${TARGET_COUNTRY}")`
    return result
  }
  await step('✓ 验证通过')

  // 9. Optionally modify language in Preferences
  if (!options.keepLanguage) {
    await step('🌐 设置 Chrome 语言为 en-US...')
    const prefsPath = join(channel.userDataDir, 'Default', 'Preferences')
    if (existsSync(prefsPath)) {
      try {
        const prefsData = JSON.parse(readFileSync(prefsPath, 'utf-8'))
        if (!prefsData.intl) prefsData.intl = {}
        prefsData.intl.accept_languages = 'en-US,en,zh-CN,zh'
        const tmpPrefs = prefsPath + '.tmp'
        writeFileSync(tmpPrefs, JSON.stringify(prefsData), 'utf-8')
        renameSync(tmpPrefs, prefsPath)
        await step('✓ 语言设置已更新')
      } catch {
        await step('⚠ 语言设置更新失败（非致命）')
      }
    }
  }

  // 10. Launch Chrome
  if (!options.noLaunch) {
    await step(`🚀 启动 ${channel.displayName}...`)
    const flags = [...CHROME_LAUNCH_FLAGS]
    const lang = options.keepLanguage ? undefined : 'en-US'
    launchChrome(channel, flags, lang)
    await step('✓ Chrome 已启动')
  }

  result.success = true
  return result
}

// Helper generator (same as in chrome.ts)
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
