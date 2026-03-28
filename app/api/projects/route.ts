import { NextResponse } from 'next/server'
import { getProjects } from '@/lib/notion'

export async function GET() {
  try {
    const projects = await getProjects()
    return NextResponse.json(projects)
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json({ error: '無法取得專案資料' }, { status: 500 })
  }
}
