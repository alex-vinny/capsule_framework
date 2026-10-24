import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import NativeTab from './tabs/NativeTab'
import NetworkTab from './tabs/NetworkTab'
import SplashTab from './tabs/SplashTab'
import ServerTab from './tabs/ServerTab'

const STARTUP_SPLASH_MS = 3000

function StartupSplash({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-5">
      <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="#e5e7eb" strokeWidth="3" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-xl font-semibold tracking-tight text-gray-900">Capsule</p>
      <p className="text-xs text-gray-400">Starting up…</p>
    </div>
  )
}

function TabBar() {
  const base =
    'flex flex-col items-center gap-0.5 text-[10px] font-medium px-6 py-2 transition-colors'
  const active = 'text-blue-600'
  const inactive = 'text-gray-400'

  return (
    <nav className="shrink-0 flex border-t border-gray-200 bg-white safe-area-bottom">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `${base} ${isActive ? active : inactive} flex-1`}
      >
        {({ isActive }) => (
          <>
            <IconNative active={isActive} />
            Native
          </>
        )}
      </NavLink>
      <NavLink
        to="/network"
        className={({ isActive }) => `${base} ${isActive ? active : inactive} flex-1`}
      >
        {({ isActive }) => (
          <>
            <IconNetwork active={isActive} />
            Network
          </>
        )}
      </NavLink>
      <NavLink
        to="/splash"
        className={({ isActive }) => `${base} ${isActive ? active : inactive} flex-1`}
      >
        {({ isActive }) => (
          <>
            <IconSplash active={isActive} />
            Splash
          </>
        )}
      </NavLink>
      <NavLink
        to="/server"
        className={({ isActive }) => `${base} ${isActive ? active : inactive} flex-1`}
      >
        {({ isActive }) => (
          <>
            <IconServer active={isActive} />
            Server
          </>
        )}
      </NavLink>
    </nav>
  )
}

function IconServer({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#2563eb' : '#9ca3af'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <rect x="2" y="10" width="20" height="5" rx="1" />
      <rect x="2" y="17" width="20" height="5" rx="1" />
      <circle cx="6" cy="5.5" r="0.5" fill={active ? '#2563eb' : '#9ca3af'} />
      <circle cx="6" cy="12.5" r="0.5" fill={active ? '#2563eb' : '#9ca3af'} />
      <circle cx="6" cy="19.5" r="0.5" fill={active ? '#2563eb' : '#9ca3af'} />
    </svg>
  )
}

function IconNative({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#2563eb' : '#9ca3af'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
    </svg>
  )
}

function IconNetwork({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#2563eb' : '#9ca3af'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill={active ? '#2563eb' : '#9ca3af'} />
    </svg>
  )
}

function IconSplash({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#2563eb' : '#9ca3af'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export default function App() {
  const [splashVisible, setSplashVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setSplashVisible(false), STARTUP_SPLASH_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <HashRouter>
      <StartupSplash visible={splashVisible} />
      <div className="h-screen flex flex-col bg-gray-100 font-sans text-sm text-gray-900 overflow-hidden">
        <header className="shrink-0 bg-white border-b border-gray-200 px-5 py-4">
          <h1 className="text-base font-semibold">Capsule Showcase</h1>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<NativeTab />} />
            <Route path="/network" element={<NetworkTab />} />
            <Route path="/splash" element={<SplashTab />} />
            <Route path="/server" element={<ServerTab />} />
          </Routes>
        </main>

        <TabBar />
      </div>
    </HashRouter>
  )
}
