/**
 * 從 Notion 找到專案（預設名稱含「金寶山」），讀取 Firebase 甘特自訂階段，匯出 CSV
 * 方便貼到 Google 試算表（例如金寶山時程預估表）。
 *
 * 參考製作大表風格可對齊：W110 製作大表「B大時程」等分頁的清單式欄位
 * https://docs.google.com/spreadsheets/d/1eqbZhJgWXF4qai0zt5LWfaYsKCxnHjYsNyFnrRF_1TI/edit
 *
 * 目標試算表（請自行貼上匯出結果）：
 * https://docs.google.com/spreadsheets/d/1p0KiFTuKl6hlbfJ3M9ItNC2bgY5OjOIbjgXINsdJwM4/edit
 *
 * 使用（在 PM project 根目錄）：
 *   node scripts/export-jinbaoshan-gantt-csv.mjs --key="path/to/firebase-adminsdk-xxx.json"
 *
 * 選項：
 *   --match=金寶山   專案名稱子字串（預設：金寶山）
 *   --out=路徑      輸出 CSV（預設：data/jinbaoshan-gantt-export.csv）
 *
 * 會讀取專案根目錄 .env.local 的 NOTION_API_TOKEN、NOTION_DATABASE_ID。
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Client } from '@notionhq/client'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const STAGE_PALETTE = [
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e',
  '#f59e0b', '#10b981', '#ec4899', '#14b8a6',
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEnvLocal() {
  const p = join(ROOT, '.env.local')
  if (!existsSync(p)) return
  const text = readFileSync(p, 'utf-8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { key: null, match: '金寶山', outPath: join(ROOT, 'data', 'jinbaoshan-gantt-export.csv') }
  for (const a of args) {
    if (a.startsWith('--key=')) out.key = a.slice(6).replace(/^"|"$/g, '')
    else if (a.startsWith('--match=')) out.match = a.slice(8)
    else if (a.startsWith('--out=')) out.outPath = a.slice(6).replace(/^"|"$/g, '')
  }
  return out
}

function parseTitle(page) {
  const props = page.properties ?? {}
  for (const k of Object.keys(props)) {
    const p = props[k]
    if (p.type === 'title' && Array.isArray(p.title) && p.title.length)
      return p.title.map((r) => r.plain_text ?? '').join('')
  }
  return ''
}

function csvCell(s) {
  const t = String(s ?? '')
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}

function daysInclusive(startStr, endStr) {
  if (!startStr || !endStr) return ''
  const a = new Date(startStr)
  const b = new Date(endStr)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return ''
  return String(Math.max(0, Math.round((b - a) / 86400000)) + 1)
}

loadEnvLocal()
const { key: keyPath, match: matchSubstr, outPath } = parseArgs()

if (!keyPath || !existsSync(keyPath)) {
  console.error('請提供 Firebase 服務帳戶 JSON：--key="...firebase-adminsdk....json"')
  process.exit(1)
}

const token = process.env.NOTION_API_TOKEN
const dbId = process.env.NOTION_DATABASE_ID?.replace(/-/g, '')
if (!token || !dbId) {
  console.error('請在 .env.local 設定 NOTION_API_TOKEN 與 NOTION_DATABASE_ID')
  process.exit(1)
}

const sa = JSON.parse(readFileSync(keyPath, 'utf-8'))
if (!getApps().length) {
  initializeApp({ credential: cert(sa) })
}
const db = getFirestore()
const notion = new Client({ auth: token })

const results = []
let cursor = undefined
do {
  const res = await notion.databases.query({
    database_id: dbId,
    start_cursor: cursor,
    page_size: 100,
  })
  results.push(...res.results)
  cursor = res.has_more ? res.next_cursor : undefined
} while (cursor)

const hits = results
  .map((page) => ({ id: page.id, name: parseTitle(page) }))
  .filter((p) => p.name.includes(matchSubstr))

if (hits.length === 0) {
  console.error(`找不到名稱含「${matchSubstr}」的專案。請改 --match= 或檢查 Notion 標題。`)
  process.exit(1)
}

if (hits.length > 1) {
  console.warn('多筆符合，將使用第一筆：')
  hits.forEach((h) => console.warn(' ', h.name, h.id))
}

const project = hits[0]
const doc = await db.collection('stages').doc(project.id).get()
const stages = doc.exists ? (doc.data()?.stages ?? []) : []

if (!Array.isArray(stages) || stages.length === 0) {
  console.warn(`專案「${project.name}」在 Firestore 無自訂階段（或尚未建立）。CSV 只會有表頭與專案列。`)
}

const rows = []
rows.push([
  '專案名稱',
  '序號',
  '階段／工作項目',
  '開始日',
  '結束日',
  '工作天數',
  '色票編號',
  '色碼（參考網站甘特）',
].map(csvCell).join(','))

stages.forEach((s, i) => {
  const ci = s.colorIndex != null ? Number(s.colorIndex) : i % STAGE_PALETTE.length
  const hex = STAGE_PALETTE[ci % STAGE_PALETTE.length]
  rows.push([
    project.name,
    String(i + 1),
    s.name ?? '',
    s.startDate ?? '',
    s.endDate ?? '',
    daysInclusive(s.startDate, s.endDate),
    String(ci % STAGE_PALETTE.length),
    hex,
  ].map(csvCell).join(','))
})

const bom = '\uFEFF'
const csv = bom + rows.join('\r\n') + '\r\n'
const dir = dirname(outPath)
if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
writeFileSync(outPath, csv, 'utf-8')

console.log('已匯出:', outPath)
console.log('專案:', project.name, '(' + project.id + ')')
console.log('階段筆數:', stages.length)
console.log('')
console.log('貼到 Google 試算表：檔案 → 匯入 → 上傳 → 替換目前工作表或插入新工作表；')
console.log('欄位格式可再對齊 W110「B大時程」：框線、日期格式、欄寬與標題列底色。')
