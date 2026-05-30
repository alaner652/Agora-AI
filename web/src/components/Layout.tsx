import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'

const navItems = [
  { to: '/schedule', label: '課表' },
  { to: '/grades', label: '成績' },
  { to: '/absence', label: '缺曠' },
  { to: '/leaves', label: '假單' },
  { to: '/chat', label: 'AI 助理' },
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
      <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
        <span className="text-lg font-semibold text-indigo-600">TPCU.me</span>
        <button
          className="md:hidden text-gray-400 hover:text-gray-600 p-1"
          onClick={() => setOpen(false)}
          aria-label="關閉選單"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          登出
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-10 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-20 w-52 bg-white border-r border-gray-200 flex flex-col shrink-0
          transition-transform duration-200
          md:relative md:translate-x-0 md:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="text-gray-500 hover:text-gray-700 p-1 mr-3"
            aria-label="開啟選單"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-base font-semibold text-indigo-600">TPCU.me</span>
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
