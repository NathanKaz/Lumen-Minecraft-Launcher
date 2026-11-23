import os from 'node:os'
import { msg } from './i18n'
import { getJavaInfo, requiredJavaMajor } from './java'
import { analyzeMods, listMods } from './mods'
import { listPacks } from './packs'
import { getState } from './store'
import type { CompatibilityIssue, CompatibilityReport, CompatibilitySeverity, ModInfo } from '@shared/types'

const SHADER_LOADERS = ['iris', 'oculus', 'optifine']

function shaderLoaderOf(name: string): string | undefined {
  return SHADER_LOADERS.find((loader) => name.includes(loader))
}

/** Read-only compatibility check; never modifies mods, packs or settings. */
export async function checkCompatibility(profileId: string): Promise<CompatibilityReport> {
  const state = getState()
  const profile = state.profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg('Сборка не найдена'))

  const [issues, mods, shaderPacks, java] = await Promise.all([
    analyzeMods(profileId),
    listMods(profileId),
    listPacks(profileId, 'shader'),
    getJavaInfo()
  ])

  const result: CompatibilityIssue[] = []
  const add = (id: string, severity: CompatibilitySeverity, message: string) => {
    result.push({ id, severity, message })
  }

  issues.forEach((issue, index) => {
    const severity: CompatibilitySeverity = issue.type === 'duplicate' || issue.type === 'loader' ? 'error' : 'warning'
    add(`mod:${index}:${issue.fileName}`, severity, issue.message)
  })

  const shaderLoaderMods: Array<{ mod: ModInfo; loader: string }> = []
  for (const mod of mods) {
    const loader = shaderLoaderOf(`${mod.name} ${mod.fileName} ${mod.projectId ?? ''}`.toLowerCase())
    if (loader) shaderLoaderMods.push({ mod, loader })
  }

  if (shaderPacks.length) {
    const activeLoader = shaderLoaderMods.find(({ mod }) => mod.enabled)
    if (!activeLoader) {
      add('shader:loader', 'warning', shaderLoaderMods.length
        ? msg('Шейдерпаки установлены, но загрузчик шейдеров ({names}) отключён.', {
          names: shaderLoaderMods.map(({ loader }) => loader).join(', ')
        })
        : msg('Шейдерпаки установлены, но загрузчик шейдеров (Iris, Oculus или OptiFine) не найден.'))
    }

    for (const { mod, loader } of shaderLoaderMods) {
      if (loader === 'optifine' && profile.loader === 'fabric') {
        add(`shader:${mod.fileName}`, 'error', msg('OptiFine несовместим с Fabric: используйте Iris.'))
      } else if (loader === 'iris' && (profile.loader === 'forge' || profile.loader === 'neoforge')) {
        add(`shader:${mod.fileName}`, 'warning', msg('Iris не поддерживает {loader}: для шейдеров нужен Oculus.', {
          loader: profile.loader.toUpperCase()
        }))
      } else if (loader === 'oculus' && profile.loader === 'fabric') {
        add(`shader:${mod.fileName}`, 'warning', msg('Oculus рассчитан на Forge: для Fabric используйте Iris.'))
      }
    }
  }

  const requiredJava = requiredJavaMajor(profile.versionId)
  if (!java.valid || java.major < requiredJava) {
    add('java:major', 'error', msg('Для Minecraft {version} нужна Java {required} или новее. Найдена: {found}.', {
      version: profile.versionId,
      required: requiredJava,
      found: java.valid ? java.major : msg('не найдена')
    }))
  }

  const totalMemoryMb = Math.round(os.totalmem() / 1024 / 1024)
  const allocated = profile.memory ?? state.settings.memory
  if (totalMemoryMb > 0 && allocated > totalMemoryMb * 0.75) {
    add('memory:allocation', 'warning', msg('Сборке выделено {allocated} МБ из {total} МБ ОЗУ. Слишком большой объём может замедлить игру и систему.', {
      allocated,
      total: totalMemoryMb
    }))
  }

  return {
    profileId,
    checkedAt: Date.now(),
    ok: result.length === 0,
    issues: result,
    summary: result.length
      ? msg('Найдено замечаний: {count}', { count: result.length })
      : msg('Проблем не найдено')
  }
}
