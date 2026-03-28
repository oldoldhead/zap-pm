import { NextRequest, NextResponse } from 'next/server'
import { ProjectStage } from '@/lib/types'

// ── 根據環境決定使用 Firestore 或本機 JSON ────────────────────────────────────
const USE_FIREBASE = !!(
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
)

// ── Firestore 實作 ────────────────────────────────────────────────────────────
async function firestoreRead(): Promise<Record<string, ProjectStage[]>> {
  const { db } = await import('@/lib/firebase')
  const snapshot = await db.collection('stages').get()
  const result: Record<string, ProjectStage[]> = {}
  snapshot.forEach((doc) => {
    result[doc.id] = doc.data().stages ?? []
  })
  return result
}

async function firestoreGetProject(projectId: string): Promise<ProjectStage[]> {
  const { db } = await import('@/lib/firebase')
  const doc = await db.collection('stages').doc(projectId).get()
  return doc.exists ? (doc.data()?.stages ?? []) : []
}

async function firestoreSetProject(projectId: string, stages: ProjectStage[]) {
  const { db } = await import('@/lib/firebase')
  await db.collection('stages').doc(projectId).set({ stages })
}

// ── 本機 JSON 實作（開發用）──────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const STAGES_FILE = path.join(DATA_DIR, 'stages.json')

function localRead(): Record<string, ProjectStage[]> {
  if (!existsSync(STAGES_FILE)) return {}
  try { return JSON.parse(readFileSync(STAGES_FILE, 'utf-8')) } catch { return {} }
}

function localWrite(data: Record<string, ProjectStage[]>) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(STAGES_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// ── GET：取得全部階段 ─────────────────────────────────────────────────────────
export async function GET() {
  if (USE_FIREBASE) {
    const data = await firestoreRead()
    return NextResponse.json(data)
  }
  return NextResponse.json(localRead())
}

// ── POST：新增階段 ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const { projectId, name, startDate, endDate, colorIndex } = await request.json()
  if (!projectId || !name) {
    return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
  }
  const stageId = crypto.randomUUID()
  const newStage: ProjectStage = {
    stageId,
    name,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    assignee: null,
    ...(colorIndex !== undefined && { colorIndex }),
  }

  if (USE_FIREBASE) {
    const stages = await firestoreGetProject(projectId)
    await firestoreSetProject(projectId, [...stages, newStage])
  } else {
    const data = localRead()
    data[projectId] = [...(data[projectId] ?? []), newStage]
    localWrite(data)
  }
  return NextResponse.json({ stageId })
}

// ── PATCH：更新階段 ───────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const { projectId, stageId, name, startDate, endDate, colorIndex } = await request.json()
  if (!projectId || !stageId) {
    return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
  }

  const applyUpdate = (stages: ProjectStage[]) =>
    stages.map((s) => {
      if (s.stageId !== stageId) return s
      return {
        ...s,
        ...(name !== undefined && { name }),
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(colorIndex !== undefined && { colorIndex }),
      }
    })

  if (USE_FIREBASE) {
    const stages = await firestoreGetProject(projectId)
    await firestoreSetProject(projectId, applyUpdate(stages))
  } else {
    const data = localRead()
    if (!data[projectId]) return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    data[projectId] = applyUpdate(data[projectId])
    localWrite(data)
  }
  return NextResponse.json({ ok: true })
}

// ── DELETE：刪除階段 ──────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const { projectId, stageId } = await request.json()
  if (!projectId || !stageId) {
    return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
  }

  if (USE_FIREBASE) {
    const stages = await firestoreGetProject(projectId)
    await firestoreSetProject(projectId, stages.filter((s) => s.stageId !== stageId))
  } else {
    const data = localRead()
    if (!data[projectId]) return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    data[projectId] = data[projectId].filter((s) => s.stageId !== stageId)
    localWrite(data)
  }
  return NextResponse.json({ ok: true })
}
