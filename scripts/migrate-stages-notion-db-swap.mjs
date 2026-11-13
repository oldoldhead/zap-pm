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
 *   node scripts/migrate-stages-notion-db-swap.mjs --dry-run
 *   node scripts/migrate-stages-notion-db-swap.mjs
 *   node scripts/migrate-stages-notion-db-swap.mjs --key="path/to/serviceAccountKey.json"
 *
 * 認證（二選一）：
 *   --key=服務帳戶 JSON
 *   或專案根目錄 .env.local 的 FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY
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

/** 舊庫名稱 → 新庫名稱（新庫為準；僅舊庫名稱對不上時用） */
const NAME_ALIASES = {
  '0_財務管理系統': '0_財務',
}

function normName(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function loadEnvLocal() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf-8')
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] == null) process.env[key] = val
  }
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

function initFirestore(keyPath) {
  if (getApps().length) return getFirestore()

  if (keyPath && existsSync(keyPath)) {
    const sa = JSON.parse(readFileSync(keyPath, 'utf-8'))
    initializeApp({ credential: cert(sa) })
    return getFirestore()
  }

  loadEnvLocal()
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      '缺少 Firebase 認證：請用 --key=服務帳戶.json，或在 .env.local 設定 FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY'
    )
    process.exit(1)
  }
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
  return getFirestore()
}

const { key: keyPath, dryRun, deleteOld } = parseArgs()

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

const db = dryRun ? null : initFirestore(keyPath)

/** 新庫名稱 → 舊 id */
const nameToOldId = new Map()
for (const p of oldProjects) {
  const oldName = normName(p.name)
  if (!oldName) continue
  const newName = NAME_ALIASES[oldName] ? normName(NAME_ALIASES[oldName]) : oldName
  if (nameToOldId.has(newName) && nameToOldId.get(newName) !== p.id) {
    console.warn('警告：對應到同一新名稱的舊專案重複，將以最後一筆為準:', newName)
  }
  nameToOldId.set(newName, p.id)
  if (newName !== oldName) {
    console.log(`[別名] 舊「${oldName}」→ 新「${newName}」`)
  }
}

let copied = 0
let skippedNoOld = 0
let skippedNoStages = 0

for (const np of newProjects) {
  const n = normName(np.name)
  const oldId = nameToOldId.get(n)
  if (!oldId) {
    skippedNoOld++
    console.log('[略過] 新專案在舊庫無對應（以新庫為準，可略過）:', np.name)
    continue
  }
  const stages = oldStages[oldId]
  if (!stages || !Array.isArray(stages) || stages.length === 0) {
    skippedNoStages++
    continue
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}對應: "${n}"  old=${oldId.slice(0, 8)}… → new=${np.id.slice(0, 8)}…  (${stages.length} 階段)`
  )

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
console.log('  新專案無舊對應（略過，以新庫為準）:', skippedNoOld)
console.log('  有對應但無自訂階段:', skippedNoStages)
if (dryRun) console.log('\n這是 dry-run，未寫入 Firestore。確認無誤後去掉 --dry-run 再執行。')
