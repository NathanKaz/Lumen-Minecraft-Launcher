import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { msg } from './i18n'
import { dirs, versionDir } from './paths'
import { getState } from './store'
import { emitProgress } from './events'
import { downloadMany, type DownloadTask } from './downloader'
import { resolveVersion, ruleAllowed, nativeClassifier, libraryArtifactPath, type VersionJson } from './install'
import type { VerifyReport } from '@shared/types'

function sha1(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1')
    const stream = fs.createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function checkFile(
  dest: string,
  expected: string | undefined,
  missing: string[],
  invalid: string[],
  task?: DownloadTask & { skip?: boolean }
): Promise<void> {
  if (!(await fs.pathExists(dest))) {
    missing.push(dest)
    return
  }
  if (expected && (await sha1(dest)).toLowerCase() !== expected.toLowerCase()) {
    invalid.push(dest)
    return
  }
  if (task) task.skip = true
}

export async function verifyProfile(profileId: string, repair = false): Promise<VerifyReport> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg('Сборка не найдена'))

  const versionId = profile.loaderVersionId ?? profile.versionId
  const version: VersionJson = await resolveVersion(versionId)
  const tasks: DownloadTask[] = []
  const missing: string[] = []
  const invalid: string[] = []
  let checked = 0

  emitProgress({
    phase: 'version', message: msg('Проверка файлов'), percent: 5,
    current: 0, total: 1, bytes: 0, totalBytes: 0, speed: 0
  })

  const client = version.downloads?.client ?? version.client
  if (client) {
    const dest = path.join(versionDir(profile.versionId), `${profile.versionId}.jar`)
    const task: DownloadTask & { skip?: boolean } = {
      url: client.url, dest, sha1: client.sha1, size: client.size, label: `minecraft ${profile.versionId}`
    }
    await checkFile(dest, client.sha1, missing, invalid, task)
    checked++
    tasks.push(task)
  }

  for (const lib of version.libraries ?? []) {
    if (lib.action === 'disallow' || !ruleAllowed(lib.rules)) continue
    const artifact = lib.downloads?.artifact
    const relative = artifact?.path ?? libraryArtifactPath(lib.name)
    const dest = path.join(dirs.libraries, relative)
    const url = artifact?.url ?? libraryUrlFor(lib, relative)
    const task: DownloadTask & { skip?: boolean } = {
      url, dest, sha1: artifact?.sha1, size: artifact?.size, label: lib.name
    }
    await checkFile(dest, artifact?.sha1, missing, invalid, task)
    checked++
    if (!task.skip) tasks.push(task)

    const classifier = nativeClassifier(lib)
    const native = classifier ? lib.downloads?.classifiers?.[classifier] : undefined
    if (classifier && native) {
      const nativeDest = path.join(dirs.libraries, native.path ?? libraryArtifactPath(lib.name, classifier))
      const nativeTask: DownloadTask & { skip?: boolean } = {
        url: native.url, dest: nativeDest, sha1: native.sha1, size: native.size, label: `${lib.name} (${classifier})`
      }
      await checkFile(nativeDest, native.sha1, missing, invalid, nativeTask)
      checked++
      if (!nativeTask.skip) tasks.push(nativeTask)
    }
  }

  if (version.assetIndex) {
    const indexPath = path.join(dirs.assets, 'indexes', `${version.assetIndex.id}.json`)
    const indexTask: DownloadTask & { skip?: boolean } = {
      url: version.assetIndex.url, dest: indexPath, sha1: version.assetIndex.sha1,
      size: version.assetIndex.size, label: msg('индекс ассетов')
    }
    await checkFile(indexPath, version.assetIndex.sha1, missing, invalid, indexTask)
    checked++
    if (!indexTask.skip) tasks.push(indexTask)

    if (await fs.pathExists(indexPath)) {
      const index = await fs.readJson(indexPath) as { objects: Record<string, { hash: string; size: number }> }
      for (const object of Object.values(index.objects)) {
        const dest = path.join(dirs.assets, 'objects', object.hash.slice(0, 2), object.hash)
        const task: DownloadTask & { skip?: boolean } = {
          url: `https://resources.download.minecraft.net/${object.hash.slice(0, 2)}/${object.hash}`,
          dest, sha1: object.hash, size: object.size, label: msg('ассеты')
        }
        await checkFile(dest, object.hash, missing, invalid, task)
        checked++
        if (!task.skip) tasks.push(task)
      }
    }
  }

  const report: VerifyReport = {
    profileId,
    checked,
    missing,
    invalid,
    ok: missing.length === 0 && invalid.length === 0
  }

  if (repair && tasks.length) {
    await downloadMany(tasks, 'version', msg('Восстановление файлов'), 4)
    emitProgress({
      phase: 'version', message: msg('Файлы восстановлены'), percent: 100,
      current: tasks.length, total: tasks.length, bytes: 0, totalBytes: 0, speed: 0
    })
  }

  return report
}

function libraryUrlFor(lib: { name: string; url?: string }, relative: string): string {
  if (lib.url) return `${lib.url.replace(/\/$/, '')}/${relative}`
  return `https://libraries.minecraft.net/${relative}`
}

export async function repairProfile(profileId: string): Promise<VerifyReport> {
  return verifyProfile(profileId, true)
}
