import { Command } from 'commander'
import { getPlatform, getAllChannels, getChromeChannel, isChannelSupported } from './core/platform.ts'
import { checkChannelStatus } from './core/chrome.ts'
import { patchLocalState } from './core/state.ts'
import { listBackups, restoreBackup } from './core/backup.ts'
import type { ChannelName, ChannelStatus, PatchOptions, PatchResult } from './types.ts'
import { ALL_CHANNELS } from './types.ts'

function parseChannels(inputs: string[]): ChannelName[] {
  const platform = getPlatform()
  const channels: ChannelName[] = []

  for (const input of inputs) {
    if (input === 'all') {
      return ALL_CHANNELS.filter((c) => isChannelSupported(c, platform))
    }
    if (!ALL_CHANNELS.includes(input as ChannelName)) {
      console.error(`未知渠道: ${input}。可选: ${ALL_CHANNELS.join(', ')}`)
      process.exit(1)
    }
    if (!isChannelSupported(input as ChannelName, platform)) {
      console.warn(`⚠ ${input} 在当前平台不受支持，已跳过`)
      continue
    }
    channels.push(input as ChannelName)
  }

  return [...new Set(channels)]
}

function printStatus(status: ChannelStatus, verbose: boolean): void {
  const icon = status.unlocked ? '✅' : '❌'
  const label = status.installed ? `${status.channel.displayName}` : `${status.channel.displayName} (未安装)`

  if (!status.installed) {
    console.log(`⏭  ${label}`)
    return
  }

  console.log(`${icon} ${label}`)
  if (status.version) console.log(`   版本: ${status.version}`)
  console.log(`   路径: ${status.channel.userDataDir}`)

  if (status.unlocked) {
    console.log(`   状态: 已解锁 ✨`)
  } else {
    console.log(`   状态: 需要修复`)
    for (const issue of status.issues) {
      console.log(`   • ${issue}`)
    }
  }

  if (verbose) {
    console.log(`   variations_country: ${status.country}`)
    console.log(`   variations_permanent_consistency_country: ${JSON.stringify(status.permanentCountry)}`)
    console.log(`   is_glic_eligible: ${status.glicEligible ? 'true' : `false (${status.glicEligibleFalseCount} 处)`}`)
    console.log(`   experiments: ${status.experiments.length} 项`)
    if (status.missingExperiments.length > 0) {
      console.log(`   缺少 experiments: ${status.missingExperiments.join(', ')}`)
    }
  }
}

function printPatchResult(result: PatchResult): void {
  if (result.error) {
    console.error(`❌ ${result.channel}: ${result.error}`)
    return
  }

  if (result.changes.length === 0) {
    console.log(`✅ ${result.channel}: 无需修改，已处于解锁状态`)
    return
  }

  console.log(`🔧 ${result.channel}: 修复完成`)
  for (const change of result.changes) {
    console.log(`   ✓ ${change.field}: ${change.before} → ${change.after}`)
  }
  if (result.backupPath) {
    console.log(`   💾 备份: ${result.backupPath}`)
  }
}

export function createCLI(): Command {
  const program = new Command()

  program
    .name('glic-kit')
    .description('Chrome Gemini AI 一键解锁工具')
    .version('1.0.0')

  // Default: TUI mode (handled in index.ts)
  // If any subcommand is given, we go CLI mode

  program
    .command('check')
    .description('检查 Chrome 各渠道的解锁状态')
    .option('-c, --channel <name...>', '指定渠道 (stable|beta|dev|canary|all)', ['all'])
    .option('--json', '以 JSON 格式输出')
    .option('-v, --verbose', '详细输出')
    .action(async (opts) => {
      const platform = getPlatform()
      const channelNames = parseChannels(opts.channel)
      const channels = channelNames
        .map((name) => getChromeChannel(name, platform))
        .filter(Boolean)

      if (channels.length === 0) {
        console.error('未找到任何 Chrome 渠道')
        process.exit(1)
      }

      const statuses = channels.map((ch) => checkChannelStatus(ch!))

      if (opts.json) {
        console.log(JSON.stringify(statuses, null, 2))
      } else {
        console.log(`\n🔑 glic-kit — Chrome Gemini AI 状态检查\n`)
        for (const status of statuses) {
          printStatus(status, opts.verbose)
          console.log()
        }

        const unlocked = statuses.filter((s) => s.unlocked).length
        const total = statuses.filter((s) => s.installed).length
        console.log(`📊 ${unlocked}/${total} 个已安装渠道已解锁`)
      }
    })

  program
    .command('fix')
    .description('修复 Chrome Gemini AI 功能')
    .option('-c, --channel <name...>', '指定渠道 (stable|beta|dev|canary|all)', ['all'])
    .option('--keep-language', '保留 Chrome 语言设置')
    .option('--skip-experiments', '跳过 labs experiments 注入')
    .option('--no-launch', '修复后不自动启动 Chrome')
    .option('--no-open-settings', '启动后不打开 chrome://settings/ai')
    .option('--dry-run', '仅模拟，不实际修改')
    .option('--json', '以 JSON 格式输出')
    .option('-v, --verbose', '详细输出')
    .action(async (opts) => {
      const platform = getPlatform()
      const channelNames = parseChannels(opts.channel)
      const channels = channelNames
        .map((name) => getChromeChannel(name, platform))
        .filter(Boolean)

      if (channels.length === 0) {
        console.error('未找到任何 Chrome 渠道')
        process.exit(1)
      }

      const patchOptions: PatchOptions = {
        keepLanguage: opts.keepLanguage,
        skipExperiments: opts.skipExperiments,
        noLaunch: opts.noLaunch === false ? true : undefined, // Commander inverts --no- flags
        dryRun: opts.dryRun,
      }

      console.log(`\n🔑 glic-kit — Chrome Gemini AI 修复\n`)

      const results: PatchResult[] = []
      for (const ch of channels) {
        if (!ch) continue

        if (!opts.json) {
          console.log(`── ${ch.displayName} (${ch.name}) ──`)
        }

        const result = await patchLocalState(ch, {
          ...patchOptions,
          onProgress: opts.json ? undefined : (msg: string) => {
            console.log(`  ${msg}`)
          },
        })
        results.push(result)
        if (opts.json) continue
        printPatchResult(result)
        console.log()
      }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2))
      } else {
        const success = results.filter((r) => r.success).length
        const failed = results.filter((r) => !r.success).length
        if (failed > 0) {
          console.log(`⚠️  ${success} 个成功，${failed} 个失败`)
        } else if (opts.dryRun) {
          console.log(`✅ 模拟完成，${success} 个渠道检查通过`)
        } else {
          console.log(`🎉 全部完成！请在 chrome://settings/ai 验证`)
        }
      }
    })

  program
    .command('restore')
    .description('还原 Chrome 配置备份')
    .option('-c, --channel <name>', '指定渠道 (stable|beta|dev|canary)', 'stable')
    .action((opts) => {
      const platform = getPlatform()
      const channelName = opts.channel as ChannelName
      if (!ALL_CHANNELS.includes(channelName)) {
        console.error(`未知渠道: ${channelName}`)
        process.exit(1)
      }

      const channel = getChromeChannel(channelName, platform)
      if (!channel) {
        console.error(`渠道 ${channelName} 在当前平台不受支持`)
        process.exit(1)
      }

      const backups = listBackups(channelName)
      if (backups.length === 0) {
        console.error(`未找到 ${channelName} 的备份`)
        process.exit(1)
      }

      console.log(`\n找到 ${backups.length} 个备份:`)
      backups.forEach((b, i) => console.log(`  ${i + 1}. ${b}`))

      // Use the latest backup
      const latest = backups[0]
      const ok = restoreBackup(latest, channel)
      if (ok) {
        console.log(`\n✅ 已还原: ${latest} → ${channel.localStatePath}`)
      } else {
        console.error('\n❌ 还原失败')
        process.exit(1)
      }
    })

  return program
}
