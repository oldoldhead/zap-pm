export type ProjectCategory = '0' | 'A' | 'B' | 'C' | 'D' | 'E' | 'X'

// 直接對應 Notion 的狀態值
export type ProjectStatus = '提案中' | '執行中' | '等待結果' | '未開始' | '已結案' | '未通過' | '待結算'

export type StageName = '提案' | '設計' | '打樣' | '量產' | '佈設' | '展期' | '撤場'
export type TeamMember = '瑜芸' | '芷榕'

// 顏色調色盤（依 stageId index 循環使用）
export const STAGE_PALETTE = [
  { bg: '#06b6d4', text: '#083344' },
  { bg: '#3b82f6', text: '#172554' },
  { bg: '#8b5cf6', text: '#2e1065' },
  { bg: '#d946ef', text: '#4a044e' },
  { bg: '#f43f5e', text: '#4c0519' },
  { bg: '#f59e0b', text: '#451a03' },
  { bg: '#10b981', text: '#022c22' },
  { bg: '#ec4899', text: '#500724' },
  { bg: '#14b8a6', text: '#042f2e' },
]

export const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  '0': '內部行政',
  'A': '大型藝術裝置',
  'B': '中小型藝術展覽',
  'C': '藝術產品',
  'D': '委託製作',
  'E': '教育',
  'X': '空間',
}

export const CATEGORY_COLORS: Record<ProjectCategory, string> = {
  '0': 'bg-gray-500',
  'A': 'bg-blue-500',
  'B': 'bg-purple-500',
  'C': 'bg-green-500',
  'D': 'bg-orange-500',
  'E': 'bg-pink-500',
  'X': 'bg-zinc-500',
}

export const CATEGORY_TEXT_COLORS: Record<ProjectCategory, string> = {
  '0': 'text-gray-400',
  'A': 'text-blue-400',
  'B': 'text-purple-400',
  'C': 'text-green-400',
  'D': 'text-orange-400',
  'E': 'text-pink-400',
  'X': 'text-zinc-400',
}

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  '提案中':   'bg-blue-700 text-blue-100',
  '執行中':   'bg-amber-600 text-amber-100',
  '等待結果': 'bg-violet-700 text-violet-100',
  '未開始':   'bg-zinc-600 text-zinc-200',
  '已結案':   'bg-green-700 text-green-100',
  '未通過':   'bg-red-800 text-red-200',
  '待結算':   'bg-teal-700 text-teal-100',
}

export const STAGE_NAMES: StageName[] = ['提案', '設計', '打樣', '量產', '佈設', '展期', '撤場']
export interface ProjectStage {
  stageId: string       // 唯一識別碼（Notion 階段用 stageName，自訂用 UUID）
  name: string          // 自由命名
  startDate: string | null
  endDate: string | null
  assignee: TeamMember | null
  colorIndex?: number   // 對應 STAGE_PALETTE 的索引，未設定則依順序自動分配
}

export interface Project {
  id: string
  name: string
  category: ProjectCategory
  status: ProjectStatus
  responsible: TeamMember | null
  stages: ProjectStage[]
  notionId?: string
}

export interface FilterState {
  statuses: ProjectStatus[]   // 空陣列代表「全部」
  category: ProjectCategory | 'all'
  assignee: TeamMember | 'all'
  search: string
}
