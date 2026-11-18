import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, UserRound } from 'lucide-react'
import { api } from './lib/api'
import { findProfile, useLauncher } from './store'
import { Titlebar } from './components/Titlebar'
import { Sidebar } from './components/Sidebar'
import { ToastHost } from './components/ToastHost'
import { Button, Modal } from './components/ui'
import { Instances } from './pages/Instances'
import { InstanceDetail } from './pages/InstanceDetail'
import { Modpacks } from './pages/Modpacks'
import { Screenshots } from './pages/Screenshots'
import { Settings } from './pages/Settings'

export default function App(): JSX.Element {
  const { state, page, openedProfileId, init, refresh } = useLauncher()
  const [accountOpen, setAccountOpen] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const openedProfile = findProfile(state, openedProfileId)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (state?.account.name) setPlayerName(state.account.name)
  }, [state?.account.name])

  const saveAccount = async () => {
    await api.setAccount(playerName)
    await refresh()
    setAccountOpen(false)
  }

  return (
    <div className="app-bg relative flex h-full w-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-40" />
      <Titlebar />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar onAccount={() => setAccountOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="min-h-full p-7">
            {!state ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
                <Loader2 size={30} className="animate-spin text-mint-400" />
                <p className="text-sm">Загрузка лаунчера...</p>
              </div>
            ) : (
              <motion.div
                key={openedProfile?.id ?? page}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {openedProfile ? (
                  <InstanceDetail profile={openedProfile} />
                ) : (
                  <>
                    {page === 'home' && <Instances />}
                    {page === 'screenshots' && <Screenshots />}
                    {page === 'modpacks' && <Modpacks />}
                    {page === 'settings' && <Settings />}
                  </>
                )}
              </motion.div>
            )}
          </div>
        </main>
      </div>

      <ToastHost />

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title="Аккаунт">
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-white">
              <UserRound size={22} />
            </div>
            <div>
              <div className="text-sm font-bold text-white">{state?.account.name}</div>
              <div className="text-[11px] text-slate-500">Офлайн-профиль · без лицензии</div>
            </div>
          </div>
          <div>
            <label className="label">Имя игрока</label>
            <input
              className="input"
              value={playerName}
              maxLength={16}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="Steve"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Офлайн-аккаунт подходит для одиночной игры и серверов без проверки лицензии. Вход через Microsoft будет добавлен в следующем обновлении.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAccountOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={() => void saveAccount()} disabled={!playerName.trim()}>Сохранить</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
