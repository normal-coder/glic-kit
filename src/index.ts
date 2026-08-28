#!/usr/bin/env node

import { createCLI } from './cli.ts'

async function main() {
  const args = process.argv.slice(2)
  const forceTui = args.includes('--tui')

  // If no arguments or only flags (no subcommand), launch TUI
  const hasSubcommand = args.length > 0 && !args[0].startsWith('-')

  if (!hasSubcommand || forceTui) {
    // TUI mode: check if we're in an interactive terminal
    if (!process.stdin.isTTY && !forceTui) {
      // Non-interactive: show help
      const program = createCLI()
      program.help()
      return
    }

    // Launch Ink TUI
    const { render } = await import('ink')
    const { default: React } = await import('react')
    const { App } = await import('./components/App.tsx')

    const { waitUntilExit } = render(React.createElement(App))
    await waitUntilExit()
    process.exit(0)
  }

  // CLI mode
  const program = createCLI()
  await program.parseAsync(process.argv)
}

main().catch((err) => {
  console.error('❌ 发生错误:', err.message || err)
  process.exit(1)
})
