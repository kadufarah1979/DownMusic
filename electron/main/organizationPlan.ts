import { join, extname, basename } from 'node:path'
import { renderTemplate } from './tagger'
import { DUP_DIR, type PlannedInput, type PlanEntry, type OrganizationPlan, type ScannedTrack } from '../../shared/library'
import type { TrackMeta } from '../../shared/types'

interface BuildArgs {
  rootDir: string
  template: string
  inputs: PlannedInput[]
  duplicates: string[] // paths a quarentenar (others de todos os grupos)
}

/** Adapta uma faixa lida para o formato que o renderTemplate espera. */
function metaForTemplate(t: ScannedTrack): TrackMeta {
  return { id: t.path, title: t.title ?? '', artists: t.artists, album: t.album, genre: t.genre, trackNumber: t.trackNumber, sourceId: 'youtube', sourceUrl: '' }
}

/** Calcula os movimentos/renomeações a partir do template. Não toca no disco. */
export function buildPlan({ rootDir, template, inputs, duplicates }: BuildArgs): OrganizationPlan {
  const dup = new Set(duplicates)
  const entries: PlanEntry[] = []
  const collisions: string[] = []
  const takenDest = new Set<string>()

  for (const { track, filled } of inputs) {
    const ext = extname(track.path)
    if (dup.has(track.path)) {
      entries.push({ from: track.path, to: join(rootDir, DUP_DIR, basename(track.path)), needsRetag: false, duplicate: true })
      continue
    }
    const rel = renderTemplate(template, metaForTemplate(track))
    const name = rel || basename(track.path, ext) // fallback quando o template renderiza vazio
    const to = join(rootDir, `${name}${ext}`)
    const needsRetag = Object.keys(filled).length > 0

    if (to === track.path && !needsRetag) continue // já organizado
    if (takenDest.has(to) && to !== track.path) {
      collisions.push(track.path)
      continue
    }
    takenDest.add(to)
    entries.push({ from: track.path, to, needsRetag, ...(needsRetag && { tags: filled }) })
  }

  return { rootDir, entries, collisions }
}
