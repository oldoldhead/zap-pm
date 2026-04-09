/**
 * 以 W110「B大時程」CSV 為版型，填入 Firestore 裡「金寶山」專案的甘特階段。
 *
 * 用法（在 PM project 根目錄）：
 *   node scripts/export-jinbaoshan-w110-b-csv.mjs ^
 *     --key="path/to/firebase-adminsdk.json" ^
 *     --template="C:\Users\seanl\Downloads\W110_2025世壯運_製作大表 - B大時程.csv"
 *
 * 選項：
 *   --match=金寶山     專案名稱子字串
 *   --out=路徑        預設 data/jinbaoshan-w110-B大時程.csv
 *   --title=文字      取代版型第 2 列主標題（預設：專案全名 + 時程大表）
 *   --unit=雜波       「執行單位」欄預設值
 *
 * 需 .env.local：NOTION_API_TOKEN、NOTION_DATABASE_ID
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { Client } from '@notionhq/client'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATE_START_COL = 5

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
  const out = {
    key: null,
    template: null,
    match: '金寶山',
    outPath: join(ROOT, 'data', 'jinbaoshan-w110-B大時程.csv'),
    title: null,
    unit: '雜波',
  }
  for (const a of args) {
    if (a.startsWith('--key=')) out.key = a.slice(6).replace(/^"|"$/g, '')
    else if (a.startsWith('--template=')) out.template = a.slice(11).replace(/^"|"$/g, '')
    else if (a.startsWith('--match=')) out.match = a.slice(8)
    else if (a.startsWith('--out=')) out.outPath = a.slice(6).replace(/^"|"$/g, '')
    else if (a.startsWith('--title=')) out.title = a.slice(8)
    else if (a.startsWith('--unit=')) out.unit = a.slice(7)
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

/** 由「倒數」列建立：欄索引 → Date（本地日），僅保留 M/D 相對形狀 */
function buildColumnDateMapRaw(dateRow) {
  let year = 2024
  let prevMonth = null
  const map = new Map()
  for (let c = DATE_START_COL; c < dateRow.length; c++) {
    const raw = String(dateRow[c] ?? '').trim()
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})$/)
    if (!m) continue
    const mo = parseInt(m[1], 10)
    const d = parseInt(m[2], 10)
    if (prevMonth !== null && prevMonth === 12 && mo === 1) year += 1
    prevMonth = mo
    map.set(c, new Date(year, mo - 1, d))
  }
  return map
}

/** 將版型上的相對日曆平移，使「第一欄日期」對齊專案最早開始日（解決 W110 以 2024/12 起算、專案在 2026+ 的問題） */
function reanchorColDateMap(colDateMap, alignToStart) {
  const dates = [...colDateMap.values()]
  if (dates.length === 0 || !alignToStart) return colDateMap
  const t0 = new Date(Math.min(...dates.map((d) => d.getTime())))
  const offsetMs = alignToStart.getTime() - t0.getTime()
  const out = new Map()
  for (const [c, d] of colDateMap) {
    out.set(c, new Date(d.getTime() + offsetMs))
  }
  return out
}

function parseIsoLocal(iso) {
  if (!iso || typeof iso !== 'string') return null
  const [Y, M, D] = iso.split('-').map((x) => parseInt(x, 10))
  if (!Y || !M || !D) return null
  return new Date(Y, M - 1, D)
}

/** 落在 [start,end]（含）的時間軸欄位 */
function timelineColsForRange(colDateMap, startIso, endIso) {
  const s = parseIsoLocal(startIso)
  const e = parseIsoLocal(endIso)
  if (!s || !e || s > e) return []
  const cols = []
  const sorted = [...colDateMap.entries()].sort((a, b) => a[0] - b[0])
  for (const [col, d] of sorted) {
    if (d >= s && d <= e) cols.push(col)
  }
  return cols
}

function rowWidth(records) {
  let w = 0
  for (const r of records) w = Math.max(w, r.length)
  return w
}

function padRow(row, n) {
  const a = row ? [...row] : []
  while (a.length < n) a.push('')
  return a.slice(0, n)
}

loadEnvLocal()
const { key: keyPath, template: templatePath, match: matchSubstr, outPath, title: titleOpt, unit } = parseArgs()

if (!keyPath || !existsSync(keyPath)) {
  console.error('請提供 --key="...firebase-adminsdk....json"')
  process.exit(1)
}
if (!templatePath || !existsSync(templatePath)) {
  console.error('請提供 --template="...W110...B大時程.csv"')
  process.exit(1)
}

const token = process.env.NOTION_API_TOKEN
const dbId = process.env.NOTION_DATABASE_ID?.replace(/-/g, '')
if (!token || !dbId) {
  console.error('請在 .env.local 設定 NOTION_API_TOKEN 與 NOTION_DATABASE_ID')
  process.exit(1)
}

const templateBuf = readFileSync(templatePath)
const records = parse(templateBuf, {
  relax_column_count: true,
  skip_empty_lines: false,
  bom: true,
})

if (records.length < 7) {
  console.error('版型 CSV 列數不足（至少需要表頭前 7 列）')
  process.exit(1)
}

const dateRow = records[3]
const colDateMapRaw = buildColumnDateMapRaw(dateRow)
if (colDateMapRaw.size === 0) {
  console.error('無法從版型第 4 列解析日期欄位')
  process.exit(1)
}

const headerRowIdx = 6
const prefixRecords = records.slice(0, headerRowIdx + 1)
const W = rowWidth(records)

const sa = JSON.parse(readFileSync(keyPath, 'utf-8'))
if (!getApps().length) initializeApp({ credential: cert(sa) })
const db = getFirestore()
const notion = new Client({ auth: token })

const allPages = []
let cursor = undefined
do {
  const res = await notion.databases.query({
    database_id: dbId,
    start_cursor: cursor,
    page_size: 100,
  })
  allPages.push(...res.results)
  cursor = res.has_more ? res.next_cursor : undefined
} while (cursor)

const hits = allPages
  .map((page) => ({ id: page.id, name: parseTitle(page) }))
  .filter((p) => p.name.includes(matchSubstr))

if (hits.length === 0) {
  console.error(`找不到名稱含「${matchSubstr}」的專案`)
  process.exit(1)
}
if (hits.length > 1) console.warn('多筆符合，使用第一筆：', hits.map((h) => h.name).join(', '))

const project = hits[0]
const doc = await db.collection('stages').doc(project.id).get()
const stages = doc.exists ? (doc.data()?.stages ?? []) : []

if (!Array.isArray(stages) || stages.length === 0) {
  console.warn('Firestore 無階段資料，仍會輸出版型表頭與一列大項（無細項）')
}

function ymdLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const stageStarts = stages
  .map((s) => parseIsoLocal(s.startDate))
  .filter(Boolean)
  .sort((a, b) => a - b)
const stageEnds = stages
  .map((s) => parseIsoLocal(s.endDate))
  .filter(Boolean)
  .sort((a, b) => b - a)
const alignStart = stageStarts[0] ?? null
const colDateMap = reanchorColDateMap(colDateMapRaw, alignStart)

if (alignStart) {
  const rawFirst = new Date(Math.min(...[...colDateMapRaw.values()].map((d) => d.getTime())))
  const rawLast = new Date(Math.max(...[...colDateMapRaw.values()].map((d) => d.getTime())))
  const newFirst = new Date(Math.min(...[...colDateMap.values()].map((d) => d.getTime())))
  const newLast = new Date(Math.max(...[...colDateMap.values()].map((d) => d.getTime())))
  console.log(
    `時間軸已平移對齊專案最早開始日：${ymdLocal(rawFirst)}～${ymdLocal(rawLast)} → ${ymdLocal(newFirst)}～${ymdLocal(newLast)}`,
  )
  if (stageEnds[0] && newLast < stageEnds[0]) {
    console.warn(
      '警告：平移後版型最後一天仍早於部分階段結束日，請在 Google 試算表向右複製／延伸日期列，或換較長版型。',
    )
  }
}

const displayTitle = titleOpt ?? `${project.name} 時程大表`

const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六']

const prefixOut = prefixRecords.map((r, i) => {
  const row = padRow(r, W)
  if (i === 1) row[0] = displayTitle
  if (i === 3) {
    for (const [c, d] of colDateMap) {
      if (c < row.length) row[c] = `${d.getMonth() + 1}/${d.getDate()}`
    }
  }
  if (i === 4) {
    for (const [c, d] of colDateMap) {
      if (c < row.length) row[c] = WEEK_ZH[d.getDay()]
    }
  }
  return row
})

const outRecords = [...prefixOut]
const parentRow = padRow([], W)
parentRow[0] = project.name
outRecords.push(parentRow)

for (const s of stages) {
  if (!s.startDate || !s.endDate) continue
  const cols = timelineColsForRange(colDateMap, s.startDate, s.endDate)
  const row = padRow([], W)
  row[0] = ''
  row[1] = s.name ?? ''
  row[2] = s.assignee ?? ''
  row[3] = unit
  const label = s.name ?? ''
  if (cols.length === 0) {
    console.warn(`階段「${label}」日期 ${s.startDate}~${s.endDate} 仍超出平移後時間軸，已輸出於細項欄備註`)
    row[1] = `${label}（${s.startDate}~${s.endDate}，請手動對齊）`
    outRecords.push(row)
    continue
  }
  for (const c of cols) row[c] = label
  outRecords.push(row)
}

const csv = stringify(outRecords, { quoted: true, quoted_empty: false, eof: true })
const bom = '\uFEFF'
const dir = dirname(outPath)
if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
writeFileSync(outPath, bom + csv, 'utf-8')

console.log('已輸出:', outPath)
console.log('專案:', project.name)
console.log('階段數:', stages.filter((s) => s.startDate && s.endDate).length)
console.log('時間軸欄位數（有日期）:', colDateMap.size)
