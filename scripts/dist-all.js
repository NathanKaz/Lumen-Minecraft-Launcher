#!/usr/bin/env node
'use strict'

// Builds every distributable format that can be produced on the current host.
// macOS DMG packaging needs macOS, so CI covers it for non-macOS developers.

const { spawnSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(script, output) {
  console.log(`\n=== ${script} -> ${output} ===`)
  const result = spawnSync(
    npm,
    ['run', script, '--', `--config.directories.output=${output}`],
    {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    }
  )

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status || 1)
}

if (process.platform === 'darwin') {
  run('dist:mac', 'release/mac')
} else {
  console.log('Skipping dist:mac: macOS DMG packaging requires macOS.')
  console.log('Use .github/workflows/build.yml (macos-latest) to produce the DMG.')
  run('dist:linux', 'release/linux')
  run('dist:win', 'release/win')
}
