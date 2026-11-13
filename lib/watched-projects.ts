/** 關注專案 ID 列表（存在本機瀏覽器） */
export const WATCHED_PROJECTS_STORAGE_KEY = 'zap-watched-project-ids'

export function loadWatchedProjectIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(WATCHED_PROJECTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function saveWatchedProjectIds(ids: string[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(WATCHED_PROJECTS_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore quota / private mode */
  }
}
