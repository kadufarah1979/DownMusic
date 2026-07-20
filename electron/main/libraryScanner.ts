import { readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { parseFile } from 'music-metadata'
import { DUP_DIR, type ScannedTrack } from '../../shared/library'

const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.wav', '.ogg', '.opus'])

/** Lê as tags/qualidade de um arquivo. Injetável para teste. */
export interface TagReader {
  read(path: string): Promise<Omit<ScannedTrack, 'path'>>
}

/** Leitor real sobre music-metadata. */
export class MusicMetadataReader implements TagReader {
  async read(path: string): Promise<Omit<ScannedTrack, 'path'>> {
    const { common, format } = await parseFile(path, { duration: false })
    let fileSize = 0
    try {
      fileSize = (await stat(path)).size
    } catch {
      /* tamanho é apenas informativo */
    }
    return {
      title: common.title,
      artists: common.artists?.length ? common.artists : common.artist ? [common.artist] : [],
      album: common.album,
      genre: common.genre?.[0],
      year: common.year != null ? String(common.year) : common.date,
      label: common.label?.[0],
      trackNumber: common.track?.no ?? undefined,
      discNumber: common.disk?.no ?? undefined,
      isrc: common.isrc?.[0],
      hasCover: (common.picture?.length ?? 0) > 0,
      format: (format.container ?? extname(path).slice(1)).toUpperCase(),
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
      lossless: format.lossless ?? false,
      durationSec: format.duration,
      fileSize
    }
  }
}

/** Varre um diretório e lê as tags de cada arquivo de áudio. */
export class LibraryScanner {
  constructor(private readonly reader: TagReader) {}

  async scan(rootDir: string): Promise<{ tracks: ScannedTrack[]; unreadable: string[] }> {
    const paths: string[] = []
    await this.walk(rootDir, paths)

    const tracks: ScannedTrack[] = []
    const unreadable: string[] = []
    for (const path of paths) {
      try {
        tracks.push({ path, ...(await this.reader.read(path)) })
      } catch {
        unreadable.push(path)
      }
    }
    return { tracks, unreadable }
  }

  private async walk(dir: string, out: string[]): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === DUP_DIR) continue // não reprocessa a quarentena
        await this.walk(join(dir, entry.name), out)
      } else if (AUDIO_EXT.has(extname(entry.name).toLowerCase())) {
        out.push(join(dir, entry.name))
      }
    }
  }
}
