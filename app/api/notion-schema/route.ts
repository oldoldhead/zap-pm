import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({ auth: process.env.NOTION_API_TOKEN })

export async function GET() {
  try {
    const db = await notion.databases.retrieve({
      database_id: process.env.NOTION_DATABASE_ID!,
    })

    const pages = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID!,
      page_size: 5,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = Object.entries((db as any).properties ?? {}).map(([name, prop]: [string, any]) => ({
      name,
      type: prop.type,
      options: prop.select?.options?.map((o: any) => o.name)
        ?? prop.status?.options?.map((o: any) => o.name)
        ?? null,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sampleData = pages.results.slice(0, 5).map((page: any) => {
      const row: Record<string, unknown> = { id: page.id }
      Object.entries(page.properties).forEach(([key, val]: [string, any]) => {
        if (val.type === 'title') row[key] = val.title?.[0]?.plain_text ?? ''
        else if (val.type === 'select') row[key] = val.select?.name ?? null
        else if (val.type === 'status') row[key] = val.status?.name ?? null
        else if (val.type === 'date') row[key] = val.date?.start ?? null
        else if (val.type === 'people') row[key] = val.people?.map((p: any) => p.name) ?? []
        else row[key] = `(${val.type})`
      })
      return row
    })

    return NextResponse.json({ schema, sampleData })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
