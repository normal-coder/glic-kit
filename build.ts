console.log('🔨 Building glic-kit...')

const compile = process.argv.includes('--compile')

if (compile) {
  // Single-file binary for current platform
  const proc = Bun.spawnSync([
    'bun', 'build', '--compile', '--outfile', 'dist/glic-kit',
    './src/index.ts',
  ], { stdout: 'inherit', stderr: 'inherit' })
  process.exit(proc.exitCode)
}

// ESM bundle (needs node/bun at runtime)
const result = await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
  minify: true,
  sourcemap: 'external',
  external: ['react-devtools-core'],
})

if (!result.success) {
  console.error('❌ Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log('✅ Build successful!')
console.log(`   Output: dist/index.js`)
console.log()
console.log('运行方式:')
console.log('   node dist/index.js          # Node.js 运行')
console.log('   bun dist/index.js           # Bun 运行')
console.log('   bun run build -- --compile  # 编译为独立二进制')
console.log('   npx glic-kit                # npm 发布后')
