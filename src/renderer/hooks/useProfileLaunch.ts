import { useState } from 'react'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { isProfileInstalled } from '../lib/profiles'
import { useLauncher } from '../store'
import type { Profile } from '@shared/types'

/**
 * Shared install/launch logic for the instance page and its persistent sidebar,
 * so both controls stay in sync with the global game status.
 */
export function useProfileLaunch(profile: Profile) {
  const { state, busy, gameStatus, setBusy, refresh, pushToast } = useLauncher()
  const [installing, setInstalling] = useState(false)

  const current = state?.profiles.find((item) => item.id === profile.id) ?? profile
  const installed = isProfileInstalled(current, state ?? null)
  const isPlaying = gameStatus === 'running' || gameStatus === 'starting'

  const install = async () => {
    setInstalling(true)
    setBusy(true)
    try {
      await api.installProfile(current.id)
      await refresh()
      pushToast('success', t('{name}: установка завершена', { name: current.name }))
    } finally {
      setInstalling(false)
      setBusy(false)
    }
  }

  const play = async () => {
    if (isPlaying) {
      await api.stopGame()
      return
    }
    if (!installed) {
      await install()
      return
    }
    setBusy(true)
    try {
      await api.launch(current.id)
    } finally {
      setBusy(false)
    }
  }

  return { current, installed, isPlaying, installing, install, play }
}
