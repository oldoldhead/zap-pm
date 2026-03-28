'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, GanttChartSquare, Users, Zap } from 'lucide-react'

const navItems = [
  { href: '/', label: '儀表板', icon: LayoutDashboard },
  { href: '/gantt', label: '甘特圖', icon: GanttChartSquare },
  { href: '/resources', label: '人力資源', icon: Users },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 min-h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-zinc-800">
        <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
          <Zap size={16} className="text-black" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none">ZAP</p>
          <p className="text-zinc-500 text-xs mt-0.5">專案管理</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-zinc-800">
        <p className="text-xs text-zinc-600">© 2025 ZAP Creative</p>
      </div>
    </aside>
  )
}
