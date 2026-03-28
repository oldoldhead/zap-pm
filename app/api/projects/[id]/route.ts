import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({ auth: process.env.NOTION_API_TOKEN })

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.USE_NOTION !== 'true') {
    return NextResponse.json({ ok: true, message: '假資料模式，不寫入 Notion' })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { stageName, startDate, endDate } = body as {
      stageName: string
      startDate: string
      endDate: string
    }

    if (!stageName || !startDate || !endDate) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    await notion.pages.update({
      page_id: id,
      properties: {
        [`${stageName}_開始`]: {
          type: 'date',
          date: { start: startDate },
        },
        [`${stageName}_結束`]: {
          type: 'date',
          date: { start: endDate },
        },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Notion update error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
