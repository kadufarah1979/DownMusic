import PQueue from 'p-queue'
import { REKORDBOX_FIELDS, type ScannedTrack, type PlannedInput, type AnalysisReport, type OrganizationPlan } from '../../shared/library'
import { analyzeLibrary } from '../../shared/libraryAnalysis'
import { buildPlan } from './organizationPlan'
import type { LibraryScanner } from './libraryScanner'
import type { OrganizationExecutor, ApplyResult } from './organizationExecutor'
import type { MetadataEnricher } from './metadataEnricher'
import type { TrackMeta } from '../../shared/types'

/** Retorna só as tags que estavam faltando na faixa (não sobrescreve o que existe). */
export function mergeMissing(track: ScannedTrack, tags: Partial<TrackMeta>): Partial<TrackMeta> {
  const out: Partial<TrackMeta> = {}
  if (!track.genre && tags.genre) out.genre = tags.genre
  if (!track.year && tags.year) out.year = tags.year
  if (!track.label && tags.label) out.label = tags.label
  if (track.trackNumber == null && tags.trackNumber != null) out.trackNumber = tags.trackNumber
  if (track.discNumber == null && tags.discNumber != null) out.discNumber = tags.discNumber
  if (!track.hasCover && tags.coverUrl) out.coverUrl = tags.coverUrl
  return out
}

/** True se a faixa tem algum campo relevante do Rekordbox faltando. */
function hasGaps(t: ScannedTrack): boolean {
  return REKORDBOX_FIELDS.some(
    (f) =>
      (f === 'genre' && !t.genre) ||
      (f === 'year' && !t.year) ||
      (f === 'label' && !t.label) ||
      (f === 'track' && t.trackNumber == null) ||
      (f === 'cover' && !t.hasCover)
  )
}

/** Orquestra scan → analyze → enrich → plan → apply. */
export class LibraryService {
  constructor(
    private readonly scanner: LibraryScanner,
    private readonly _executor: OrganizationExecutor,
    private readonly enricher: MetadataEnricher,
    private readonly deps: { home: string }
  ) {}

  /** Exposto para o IPC encaminhar os eventos de progresso ao renderer. */
  get executor(): OrganizationExecutor {
    return this._executor
  }

  private lastTracks: ScannedTrack[] = []

  async scanAndAnalyze(dir: string): Promise<{ report: AnalysisReport; unreadable: string[] }> {
    const { tracks, unreadable } = await this.scanner.scan(dir)
    this.lastTracks = tracks
    return { report: analyzeLibrary(tracks), unreadable }
  }

  /** Enriquece (Deezer) as faixas com buracos, com concorrência limitada. */
  async enrichInputs(tracks: ScannedTrack[]): Promise<PlannedInput[]> {
    const q = new PQueue({ concurrency: 4 })
    const inputs: PlannedInput[] = tracks.map((track) => ({ track, filled: {} }))
    await Promise.all(
      inputs.map((input) =>
        hasGaps(input.track)
          ? q.add(async () => {
              const meta = {
                id: input.track.path,
                title: input.track.title ?? '',
                artists: input.track.artists,
                isrc: input.track.isrc,
                sourceId: 'youtube',
                sourceUrl: ''
              } as TrackMeta
              const tags = await this.enricher.enrich(meta)
              input.filled = mergeMissing(input.track, tags)
            })
          : Promise.resolve()
      )
    )
    return inputs
  }

  async plan(dir: string, template: string): Promise<OrganizationPlan> {
    const inputs = await this.enrichInputs(this.lastTracks)
    const duplicates = analyzeLibrary(this.lastTracks).duplicates.flatMap((g) => g.others)
    return buildPlan({ rootDir: dir, template, inputs, duplicates })
  }

  apply(plan: OrganizationPlan): Promise<ApplyResult> {
    return this._executor.apply(plan, this.deps.home)
  }
}
