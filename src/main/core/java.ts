import path from 'node:path'
import { msg } from './i18n'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'fs-extra'
import { getState, setState } from './store'
import type { JavaInfo } from '@shared/types'

const execFileAsync = promisify(execFile)

function javaExecutable(base: string): string {
  return process.platform === 'win32' ? path.join(base, 'bin', 'java.exe') : path.join(base, 'bin', 'java')
}

function candidateBases(): string[] {
  const bases: string[] = []
  const configured = getState().settings.javaPath
  if (configured) bases.push(configured.endsWith('java') || configured.endsWith('java.exe') ? path.dirname(path.dirname(configured)) : configured)

  if (process.env.JAVA_HOME) bases.push(process.env.JAVA_HOME)

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    for (const root of [programFiles, programFilesX86]) {
      const javaRoot = path.join(root, 'Java')
      if (fs.existsSync(javaRoot)) {
        for (const entry of fs.readdirSync(javaRoot)) bases.push(path.join(javaRoot, entry))
      }
      bases.push(path.join(root, 'Eclipse Adoptium'))
    }
  } else if (process.platform === 'darwin') {
    const jvmRoot = '/Library/Java/JavaVirtualMachines'
    if (fs.existsSync(jvmRoot)) {
      for (const entry of fs.readdirSync(jvmRoot)) bases.push(path.join(jvmRoot, entry, 'Contents', 'Home'))
    }
    bases.push('/opt/homebrew/opt/openjdk', '/usr/local/opt/openjdk')
  } else {
    const jvmRoot = '/usr/lib/jvm'
    if (fs.existsSync(jvmRoot)) {
      for (const entry of fs.readdirSync(jvmRoot)) bases.push(path.join(jvmRoot, entry))
    }
    bases.push('/usr/java/default', '/opt/java')
  }
  return [...new Set(bases)]
}

export async function inspectJava(executable: string): Promise<JavaInfo | null> {
  if (!executable || !(await fs.pathExists(executable))) return null
  try {
    const { stderr, stdout } = await execFileAsync(executable, ['-version'], { timeout: 10000 })
    const text = `${stdout}\n${stderr}`
    const match = text.match(/version\s+"(\d+)(?:\.(\d+))?/)
    if (!match) return null
    const first = Number(match[1])
    const second = Number(match[2] ?? 0)
    const major = first === 1 ? second : first
    return { path: executable, version: match[0].includes('"') ? text.match(/version\s+"([^"]+)"/)?.[1] ?? String(major) : String(major), major, valid: true }
  } catch {
    return null
  }
}

export function requiredJavaMajor(gameVersion: string): number {
  const parts = gameVersion.split('.').map((part) => Number(part) || 0)
  const major = parts[0] ?? 1
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  if (major > 1) return major >= 21 ? 21 : 17
  if (minor >= 20 && patch >= 5) return 21
  if (minor >= 18) return 17
  return 8
}

export async function findJava(requiredMajor = 8): Promise<JavaInfo> {
  const candidates: string[] = []
  for (const base of candidateBases()) {
    if (base.endsWith('java.exe') || base.endsWith('java')) candidates.push(base)
    else candidates.push(javaExecutable(base))
  }
  candidates.push(process.platform === 'win32' ? 'java.exe' : 'java')

  let firstValid: JavaInfo | null = null
  for (const candidate of candidates) {
    const info = await inspectJava(candidate)
    if (!info) continue
    if (!firstValid) firstValid = info
    if (info.major >= requiredMajor) return info
  }
  if (firstValid) {
    return { ...firstValid, valid: false }
  }
  return {
    path: '',
    version: msg("не найдена"),
    major: 0,
    valid: false
  }
}

export async function getJavaInfo(): Promise<JavaInfo> {
  return findJava()
}

export async function detectJava(): Promise<JavaInfo> {
  const info = await findJava()
  if (info.valid) setState({ settings: { ...getState().settings, javaPath: info.path } })
  return info
}
