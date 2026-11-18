#!/usr/bin/env node
'use strict'

// Запускает инструменты проекта на Node.js 18+, даже если системный node устарел.
// Совместим с Node.js 10, чтобы сам скрипт мог стартовать в любом окружении.

const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const minMajor = 18
const exe = process.platform === 'win32' ? 'node.exe' : 'node'

const entries = {
  'electron-vite': 'node_modules/electron-vite/bin/electron-vite.js',
  tsc: 'node_modules/typescript/bin/tsc',
  vite: 'node_modules/vite/bin/vite.js',
  'electron-builder': 'node_modules/electron-builder/cli.js'
}

function nodeMajor(binary) {
  try {
    const result = spawnSync(binary, ['-p', 'process.versions.node'], { encoding: 'utf8', timeout: 5000 })
    if (result.status !== 0 || !result.stdout) return 0
    return Number(String(result.stdout).trim().split('.')[0]) || 0
  } catch (error) {
    return 0
  }
}

function candidates() {
  const found = []
  const add = (binary) => {
    if (binary && found.indexOf(binary) === -1) found.push(binary)
  }

  add(process.env.LUMEN_NODE)
  add(process.execPath)

  const home = process.env.HOME || process.env.USERPROFILE || ''
  const nvmRoot = path.join(home, '.nvm', 'versions', 'node')
  if (fs.existsSync(nvmRoot)) {
    fs.readdirSync(nvmRoot)
      .sort()
      .reverse()
      .forEach((version) => add(path.join(nvmRoot, version, 'bin', exe)))
  }

  add(path.join(root, '.tools', 'node', 'bin', exe))
  add('/usr/local/bin/node')
  add('/opt/node/bin/node')
  add(path.join(home, '.local', 'bin', 'node'))
  return found
}

function findModernNode() {
  for (const binary of candidates()) {
    if (nodeMajor(binary) >= minMajor) return binary
  }
  return null
}

function run(node, entry, args) {
  const file = path.join(root, entries[entry])
  if (!fs.existsSync(file)) {
    console.error(`Не найден инструмент: ${entry} (${file}). Выполните npm install.`)
    process.exit(1)
  }
  const env = Object.assign({}, process.env)
  env.PATH = `${path.dirname(node)}${path.delimiter}${env.PATH || ''}`
  const child = spawn(node, [file].concat(args), { cwd: root, stdio: 'inherit', env })
  child.on('error', (error) => {
    console.error(error.message)
    process.exit(1)
  })
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exit(code === null ? 1 : code)
  })
}

function runSequence(node, commands) {
  const next = (index) => {
    if (index >= commands.length) return
    const [entry, args] = commands[index]
    const env = Object.assign({}, process.env)
    env.PATH = `${path.dirname(node)}${path.delimiter}${env.PATH || ''}`
    const file = path.join(root, entries[entry])
    const child = spawn(node, [file].concat(args), { cwd: root, stdio: 'inherit', env })
    child.on('error', (error) => {
      console.error(error.message)
      process.exit(1)
    })
    child.on('exit', (code, signal) => {
      if (signal || code !== 0) process.exit(code === null ? 1 : code)
      next(index + 1)
    })
  }
  next(0)
}

const args = process.argv.slice(2)
const command = args.shift()
const sequences = ['build', 'dist']

if (!command || (!entries[command] && sequences.indexOf(command) === -1)) {
  console.error(`Использование: node scripts/run.js <electron-vite|tsc|vite|electron-builder|build|dist> [аргументы]`)
  process.exit(1)
}

const node = findModernNode()
if (!node) {
  console.error('Для запуска нужен Node.js 18+ (текущий слишком старый).')
  console.error('Установите версию через nvm:  nvm install 20 && nvm use 20')
  console.error('Или укажите путь:  LUMEN_NODE=/path/to/node npm run dev')
  process.exit(1)
}

if (command === 'build') {
  runSequence(node, [['tsc', ['--noEmit']], ['electron-vite', ['build']]])
} else if (command === 'dist') {
  runSequence(node, [
    ['tsc', ['--noEmit']],
    ['electron-vite', ['build']],
    ['electron-builder', args]
  ])
} else {
  run(node, command, args)
}
