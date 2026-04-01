/**
 * 換 Notion 資料庫後，把 Firebase `stages` 從「舊頁面 ID」搬到「新頁面 ID」。
 *
 * 為什麼需要：Firestore 裡每個專案的階段文件 ID = Notion 頁面 ID，
 * 新資料庫的同一專案會有新的 page id，必須依「專案名稱」對應後複製。
 *
 * 事前準備（仍在使用舊資料庫、舊環境變數時）：
 *   1. 瀏覽器開啟網站，F12 → Network，重新整理甘特圖頁
 *   2. 對 /api/projects 的 Response 另存為 data/notion-migration-old-projects.json（陣列）
 *   3. 對 /api/stages 的 Response 另存為 data/notion-migration-old-stages.json（物件：id → stages[]）
 *
 * 切換到新 Notion（Vercel / .env 已更新）後：
 *   4. 另存 /api/projects 為 data/notion-migration-new-projects.json
 *
 * 執行：
 *   node scripts/migrate-stages-notion-db-swap.mjs --key="path/to/serviceAccountKey.json"
 *
 * 選項：
 *   --dry-run     只印出對應關係，不寫入 Firestore
 *   --delete-old  寫入新文件後刪除舊 page id 的文件（確認無誤再用）
 */

import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'data')

function normName(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { key: null, dryRun: false, deleteOld: false }
  for (const a of args) {
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--delete-old') out.deleteOld = true
    else if (a.startsWith('--key=')) out.key = a.slice(6).replace(/^"|"$/g, '')
  }
  return out
}

const { key: keyPath, dryRun, deleteOld } = parseArgs()
if (!keyPath || !existsSync(keyPath)) {
  console.error('請提供服務帳戶 JSON：--key="path/to/serviceAccountKey.json"')
  process.exit(1)
}

const oldProjectsPath = join(DATA, 'notion-migration-old-projects.json')
const oldStagesPath = join(DATA, 'notion-migration-old-stages.json')
const newProjectsPath = join(DATA, 'notion-migration-new-projects.json')

for (const p of [oldProjectsPath, oldStagesPath, newProjectsPath]) {
  if (!existsSync(p)) {
    console.error('缺少檔案:', p)
    process.exit(1)
  }
}

const oldProjects = JSON.parse(readFileSync(oldProjectsPath, 'utf-8'))
const oldStages = JSON.parse(readFileSync(oldStagesPath, 'utf-8'))
const newProjects = JSON.parse(readFileSync(newProjectsPath, 'utf-8'))

if (!Array.isArray(oldProjects) || !Array.isArray(newProjects)) {
  console.error('old/new projects 必須為 JSON 陣列')
  process.exit(1)
}
if (typeof oldStages !== 'object' || oldStages === null) {
  console.error('old stages 必須為 JSON 物件')
  process.exit(1)
}

const sa = JSON.parse(readFileSync(keyPath, 'utf-8'))
if (!getApps().length) {
  initializeApp({ credential: cert(sa) })
}
const db = getFirestore()

/** 多名稱 → 舊 id（偵測重複） */
const nameToOldId = new Map()
for (const p of oldProjects) {
  const n = normName(p.name)
  if (!n) continue
  if (nameToOldId.has(n)) {
    console.warn('警告：舊資料庫有重複專案名稱，將以最後一筆為準:', n)
  }
  nameToOldId.set(n, p.id)
}

let copied = 0
let skippedNoOld = 0
let skippedNoStages = 0

for (const np of newProjects) {
  const n = normName(np.name)
  const oldId = nameToOldId.get(n)
  if (!oldId) {
    skippedNoOld++
    console.log('[略過] 新專案在舊庫無同名對應:', np.name)
    continue
  }
  const stages = oldStages[oldId]
  if (!stages || !Array.isArray(stages) || stages.length === 0) {
    skippedNoStages++
    continue
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}對應: "${n}"  old=${oldId.slice(0, 8)}… → new=${np.id.slice(0, 8)}…  (${stages.length} 階段)`)

  if (!dryRun) {
    await db.collection('stages').doc(np.id).set({ stages })
    copied++
    if (deleteOld && oldId !== np.id) {
      await db.collection('stages').doc(oldId).delete()
    }
  } else {
    copied++
  }
}

console.log('\n完成統計:')
console.log('  已複製（或 dry-run 可複製）:', copied)
console.log('  新專案無舊名稱對應:', skippedNoOld)
console.log('  舊 id 無階段資料:', skippedNoStages)
if (dryRun) console.log('\n這是 dry-run，未寫入 Firestore。確認無誤後去掉 --dry-run 再執行。')
