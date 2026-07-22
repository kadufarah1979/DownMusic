import { TrackSelectList } from './TrackSelectList'
import { useDownloadedChecker } from '../lib/downloaded'
import { platformLabel } from '../lib/platforms'
import type { SearchGroup } from '@shared/types'

/** Resultados de busca por texto, agrupados por fonte (reaproveitado no Download). */
export function SearchResults({ groups, outputDir }: { groups: SearchGroup[]; outputDir?: string }) {
  const isDownloaded = useDownloadedChecker()

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.sourceId}>
          <h2 className="mb-2 text-sm font-semibold text-neutral-200">
            {platformLabel(g.sourceId)} <span className="text-neutral-500">({g.tracks.length})</span>
          </h2>
          {g.error ? (
            <p className="text-sm text-red-400">{g.error}</p>
          ) : g.tracks.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhum resultado.</p>
          ) : (
            <TrackSelectList tracks={g.tracks} isDownloaded={isDownloaded} outputDir={outputDir} />
          )}
        </section>
      ))}
    </div>
  )
}
