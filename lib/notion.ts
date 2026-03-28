import { Client } from '@notionhq/client'
import { Project, ProjectCategory, ProjectStatus, StageName, TeamMember } from './types'
import { mockProjects } from './mockData'

const notion = new Client({ auth: process.env.NOTION_API_TOKEN })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionProp = any

function parseTitle(prop: NotionProp): string {
  if (!prop) return ''
  if (prop.type === 'title' && Array.isArray(prop.title)) {
    return prop.title.map((r: NotionProp) => r.plain_text ?? '').join('')
  }
  return ''
}

function parseSelect(prop: NotionProp): string | null {
  if (!prop) return null
  if (prop.type === 'select') return prop.select?.name ?? null
  if (prop.type === 'status') return prop.status?.name ?? null
  return null
}

function parseDate(prop: NotionProp): string | null {
  if (!prop) return null
  if (prop.type === 'date') return prop.date?.start ?? null
  return null
}

function parsePerson(prop: NotionProp): TeamMember | null {
  if (!prop) return null
  if (prop.type === 'people' && Array.isArray(prop.people) && prop.people.length > 0) {
    const name = (prop.people[0]?.name as string) ?? ''
    if (name.includes('瑜芸')) return '瑜芸'
    if (name.includes('芷榕')) return '芷榕'
  }
  return null
}

// 從專案名稱前綴判斷類別，例如 "B03_朱銘美術館" → 'B'
function parseCategoryFromName(name: string): ProjectCategory {
  const match = name.match(/^([0ABCDEXabcdex])\d*[_\-]/)
  if (match) {
    const letter = match[1].toUpperCase()
    if (['0', 'A', 'B', 'C', 'D', 'E', 'X'].includes(letter)) {
      return letter as ProjectCategory
    }
  }
  return 'X'
}

const VALID_STATUSES: ProjectStatus[] = ['提案中', '執行中', '等待結果', '未開始', '已結案', '未通過', '待結算']

function mapNotionToProject(page: NotionProp): Project {
  const props = page.properties
  const stageNames: StageName[] = ['提案', '設計', '打樣', '量產', '佈設', '展期', '撤場']

  const titleProp = Object.values(props).find((p: NotionProp) => p.type === 'title')
  const name = parseTitle(titleProp) || '未命名'

  const statusRaw = parseSelect(props['Status']) ?? parseSelect(props['狀態']) ?? '未開始'
  const status: ProjectStatus = VALID_STATUSES.includes(statusRaw as ProjectStatus)
    ? (statusRaw as ProjectStatus)
    : '未開始'

  // 從欄位取類別，若無則從名稱前綴判斷
  const categoryFromField = parseSelect(props['類別']) ?? parseSelect(props['Category'])
  const category: ProjectCategory = categoryFromField
    ? (categoryFromField as ProjectCategory)
    : parseCategoryFromName(name)

  return {
    id: page.id,
    notionId: page.id,
    name,
    category,
    status,
    responsible: parsePerson(props['Owner']) ?? parsePerson(props['負責人']),
    stages: stageNames.map((stageName) => ({
      stageId: stageName,
      name: stageName,
      startDate: parseDate(props[`${stageName}_開始`]),
      endDate: parseDate(props[`${stageName}_結束`]),
      assignee: parsePerson(props[`${stageName}_人員`]),
    })),
  }
}

export async function getProjects(): Promise<Project[]> {
  if (process.env.USE_NOTION !== 'true') {
    return mockProjects
  }

  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID!,
    })
    return response.results.map(mapNotionToProject)
  } catch (error) {
    console.error('Notion API error, falling back to mock data:', error)
    return mockProjects
  }
}
