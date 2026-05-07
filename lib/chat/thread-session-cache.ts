import type { ChatMessageRow } from '../supabase/message-queries'

export type ThreadSessionSnapshot = {
  messages: ChatMessageRow[]
  hasMoreOlder: boolean
}

const MAX_ENTRIES = 32
const cache = new Map<string, ThreadSessionSnapshot>()

export function getThreadSnapshot(
  opportunityId: string
): ThreadSessionSnapshot | undefined {
  return cache.get(opportunityId)
}

export function setThreadSnapshot(
  opportunityId: string,
  snap: ThreadSessionSnapshot
): void {
  cache.set(opportunityId, snap)
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value as string | undefined
    if (first) cache.delete(first)
    else break
  }
}

export function clearThreadSnapshot(opportunityId: string): void {
  cache.delete(opportunityId)
}
