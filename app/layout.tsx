import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'ZAP 專案管理',
  description: 'ZAP Creative 專案管理系統',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-Hant">
      <body className="flex min-h-screen bg-[#0f0f0f]">
        <Sidebar />
        <main className="flex-1 overflow-auto min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
