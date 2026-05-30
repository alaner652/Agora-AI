import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'

const navItems = [
  { to: '/schedule', label: '課表', icon: '▦' },
  { to: '/grades',   label: '成績', icon: '◈' },
  { to: '/absence',  label: '缺曠', icon: '◷' },
  { to: '/leaves',   label: '假單', icon: '◻' },
  { to: '/chat',     label: 'AI 助理', icon: '◈' },
  { to: '/settings', label: '設定', icon: '⊙' },
]

export default function Layout() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function logout() {
    clearToken()
    sessionStorage.removeItem('tpcu_chat')
    navigate('/login')
  }

  const sidebarContent = (
    <>
      <div className="px-5 py-5 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-lg font-bold text-orange-500 tracking-wide">TPCU.me</span>
        <button
          className="md:hidden text-zinc-500 hover:text-zinc-300 p-1"
          onClick={() => setOpen(false)}
          aria-label="關閉選單"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-zinc-800">
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
        >
          登出
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-10 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-20 w-48 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0
          transition-transform duration-200
          md:relative md:translate-x-0 md:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center px-4 py-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="text-zinc-400 hover:text-zinc-200 p-1 mr-3"
            aria-label="開啟選單"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-base font-bold text-orange-500">TPCU.me</span>
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
