'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, GanttChartSquare, Users } from 'lucide-react'

const items = [
  { href: '/', label: '儀表板', icon: LayoutDashboard },
  { href: '/gantt', label: '甘特圖', icon: GanttChartSquare },
  { href: '/resources', label: '人力', icon: Users },
]

/** 手機底部導覽（md 以上隱藏，不影響桌機側欄） */
export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 px-1"
      aria-label="主要導覽"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[11px] transition-colors min-h-[44px] min-w-0 ${
              active ? 'text-cyan-400' : 'text-zinc-500 active:text-zinc-300'
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
            <span className="truncate max-w-full px-0.5">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
