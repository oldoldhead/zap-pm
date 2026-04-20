import type { Metadata, Viewport } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import MobileNav from '@/components/MobileNav'

export const metadata: Metadata = {
  title: 'ZAP 專案管理',
  description: 'ZAP Creative 專案管理系統',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0f0f0f',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-[100dvh] bg-[#0f0f0f] flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          {children}
        </main>
        <MobileNav />
      </body>
    </html>
  )
}
