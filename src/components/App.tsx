import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import type { ChannelStatus, PatchResult } from '../types.ts'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const VERSION = require('../../package.json').version
import { getPlatform } from '../core/platform.ts'
import { checkChannelStatus } from '../core/chrome.ts'
import { patchLocalState } from '../core/state.ts'
import { getAllChannels } from '../core/platform.ts'

type View = 'list' | 'confirm' | 'progress' | 'result'

export const App: React.FC = () => {
  const { exit } = useApp()
  const [view, setView] = useState<View>('list')
  const [statuses, setStatuses] = useState<ChannelStatus[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [cursor, setCursor] = useState(0)
  const [results, setResults] = useState<PatchResult[]>([])
  const [loading, setLoading] = useState(true)

  // Progress state: track completed vs current
  const [completedResults, setCompletedResults] = useState<PatchResult[]>([])
  const [currentChannelName, setCurrentChannelName] = useState('')
  const [currentStep, setCurrentStep] = useState('')

  // Load channel statuses on mount
  useEffect(() => {
    const platform = getPlatform()
    const channels = getAllChannels(platform)
    const sts = channels.map((ch) => checkChannelStatus(ch))
    setStatuses(sts)
    setSelected(new Set())
    setLoading(false)
  }, [])

  const installedStatuses = statuses.filter((s) => s.installed)

  const toggleSelect = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    const all = new Set<number>()
    installedStatuses.forEach((_, i) => all.add(i))
    setSelected(all)
  }, [installedStatuses])

  const selectNeedFix = useCallback(() => {
    const needFix = new Set<number>()
    installedStatuses.forEach((s, i) => {
      if (!s.unlocked) needFix.add(i)
    })
    setSelected(needFix)
  }, [installedStatuses])

  const doFix = useCallback(async () => {
    setView('progress')
    const platform = getPlatform()
    const channelStatuses = [...selected].map((i) => installedStatuses[i])

    setCompletedResults([])
    const patchResults: PatchResult[] = []

    for (let i = 0; i < channelStatuses.length; i++) {
      const status = channelStatuses[i]
      setCurrentChannelName(`${status.channel.displayName} (${status.channel.name})`)
      setCurrentStep('准备中...')

      const result = await patchLocalState(status.channel, {
        onProgress: (msg: string) => {
          setCurrentStep(msg)
        },
      })
      patchResults.push(result)
      setCompletedResults([...patchResults])
    }

    // Refresh statuses
    const channels = getAllChannels(platform)
    setStatuses(channels.map((ch) => checkChannelStatus(ch)))
    setResults(patchResults)
    setView('result')
  }, [selected, installedStatuses])

  // Auto-exit 2s after showing result
  useEffect(() => {
    if (view !== 'result') return
    const timer = setTimeout(() => exit(), 2000)
    return () => clearTimeout(timer)
  }, [view])

  // Key handling
  useInput((input, key) => {
    if (loading) return

    if (view === 'list') {
      if (key.upArrow || input === 'k') {
        setCursor((c) => Math.max(0, c - 1))
      } else if (key.downArrow || input === 'j') {
        setCursor((c) => Math.min(installedStatuses.length - 1, c + 1))
      } else if (input === ' ') {
        if (installedStatuses[cursor]) toggleSelect(cursor)
      } else if ((key.return || input === 'f') && selected.size > 0) {
        setView('confirm')
      } else if (input === 'a') {
        selectAll()
      } else if (input === 'd') {
        selectNeedFix()
      } else if (input === 'q' || key.escape) {
        exit()
      }
    } else if (view === 'confirm') {
      if (input === 'y' || key.return) {
        doFix()
      } else if (input === 'n' || key.escape) {
        setView('list')
      }
    } else if (view === 'result') {
      if (input === 'q' || key.escape || key.return) {
        exit()
      }
    }
  })

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ 正在检测 Chrome 安装情况...</Text>
      </Box>
    )
  }

  if (view === 'progress') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>🔧 glic-kit — 修复中</Text>
        <Box marginTop={1} flexDirection="column">
          {/* Completed channels: one-line summary */}
          {completedResults.map((r, i) => (
            <Text key={i}>
              {r.error
                ? <Text color="red">❌ {r.channel}</Text>
                : <Text color="green">✅ {r.channel}</Text>
              }
              {r.backupPath && <Text color="gray">  备份: {r.backupPath}</Text>}
            </Text>
          ))}
        </Box>
        {/* Current channel: show current step */}
        {currentChannelName && (
          <Box marginTop={1} flexDirection="column">
            <Text color="yellow" bold>⏳ {currentChannelName}</Text>
            <Box marginLeft={2}>
              <Text color="white">{currentStep}</Text>
            </Box>
          </Box>
        )}
      </Box>
    )
  }

  if (view === 'confirm') {
    const items = [...selected].map((i) => installedStatuses[i])
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow" bold>⚠️  即将修复以下 Chrome 渠道：</Text>
        <Box flexDirection="column" marginTop={1}>
          {items.map((s, i) => (
            <Text key={i}>  • {s.channel.displayName} ({s.channel.name})</Text>
          ))}
        </Box>

        <Box marginTop={1} borderStyle="round" borderColor="red" padding={1} flexDirection="column">
          <Text color="red" bold>🚨 重要提醒</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color="red">  修复过程会强制关闭上述 Chrome！</Text>
            <Text color="red">  请先保存所有未提交的表单、正在编辑的网页内容。</Text>
            <Text color="red">  未保存的数据将会丢失！</Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text>修改前会自动备份，可随时还原。</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="green" bold>按 Y 确认并关闭 Chrome 开始修复  </Text>
          <Text color="red">按 N 取消</Text>
        </Box>
      </Box>
    )
  }

  if (view === 'result') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>🎉 glic-kit — 修复完成</Text>
        <Box flexDirection="column" marginTop={1}>
          {results.map((r, i) => (
            <Box key={i} flexDirection="column" marginBottom={1}>
              {r.error ? (
                <Text color="red">❌ {r.channel}: {r.error}</Text>
              ) : r.changes.length === 0 ? (
                <Text color="green">✅ {r.channel}: 无需修改</Text>
              ) : (
                <>
                  <Text color="green">✅ {r.channel}: 修复完成</Text>
                  {r.changes.map((c, j) => (
                    <Text key={j} color="gray">   ✓ {c.field}: {c.before} → {c.after}</Text>
                  ))}
                </>
              )}
              {r.backupPath && <Text color="gray" dimColor>   💾 备份: {r.backupPath}</Text>}
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">请在 chrome://settings/ai 验证结果，2 秒后自动退出...</Text>
        </Box>
      </Box>
    )
  }

  // Main list view
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>🔑 glic-kit v{VERSION} — Chrome Gemini AI 一键解锁工具</Text>
      <Box marginTop={1} marginBottom={1}>
        <Text color="gray">已安装的 Chrome 浏览器：</Text>
      </Box>

      {installedStatuses.length === 0 ? (
        <Text color="yellow">⚠ 未检测到任何 Chrome 安装</Text>
      ) : (
        <Box flexDirection="column">
          {installedStatuses.map((status, i) => {
            const isCursor = i === cursor
            const isSelected = selected.has(i)
            const prefix = isCursor ? '❯ ' : '  '
            const check = isSelected ? '● ' : '○ '
            const icon = status.unlocked ? '✅' : '❌'
            const stateLabel = status.unlocked ? '已解锁' : '需要修复'

            return (
              <Box key={i}>
                <Text color={isCursor ? 'cyan' : undefined}>
                  {prefix}{check}{icon} {status.channel.displayName.padEnd(24)}
                </Text>
                <Text color={status.unlocked ? 'green' : 'red'}>
                  {stateLabel}
                </Text>
                {status.version && (
                  <Text color="gray">  ({status.version})</Text>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      {statuses.filter((s) => !s.installed).length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray" dimColor>未安装的渠道：</Text>
          {statuses.filter((s) => !s.installed).map((s, i) => (
            <Text key={i} color="gray" dimColor>  ⏭  {s.channel.displayName}</Text>
          ))}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">────────────────────────────────────────</Text>
        <Text color="gray">
          [↑↓] 移动  [Space] 切换  [A] 全选  [D] 选未解锁  [F/Enter] 执行  [Q] 退出
        </Text>
        {selected.size > 0 && (
          <Text color="green">已选 {selected.size} 个渠道，按 F 开始修复</Text>
        )}
      </Box>
    </Box>
  )
}
