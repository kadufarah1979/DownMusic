import { describe, it, expect } from 'vitest'
import { execa } from 'execa'
import { readFile, mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { YtDlpEngine } from '../engines/ytdlp'
import { FfmpegEngine } from '../engines/ffmpeg'
import { Tagger } from '../main/tagger'
import { ytdlpInfoToTrack } from '../sources/ytdlpMap'
import type { FetchOptions, TrackMeta } from '../../shared/types'

/**
 * Smoke test REAL de ponta a ponta (resolve -> download -> convert/tag).
 * Requer rede + yt-dlp + ffmpeg. Rodar com: SMOKE=1 npx vitest run electron/smoke
 * Usa um MP3 de amostra livre (samplelib) para nao violar direitos autorais.
 */
const FREE_MP3 = 'https://download.samplelib.com/mp3/sample-3s.mp3'

describe.skipIf(!process.env.SMOKE)('pipeline real (yt-dlp + ffmpeg)', () => {
  const ytdlp = new YtDlpEngine(process.env.YTDLP_BIN || 'yt-dlp')
  const ffmpeg = new FfmpegEngine(process.env.FFMPEG_BIN || 'ffmpeg')
  const tagger = new Tagger(ffmpeg)

  it('resolve metadados, baixa e converte+tagueia para mp3', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'downmusic-smoke-'))

    // 1) resolve (metadados via --dump-json + mapeador real)
    const infos = await ytdlp.dumpJson(FREE_MP3)
    expect(infos.length).toBeGreaterThan(0)
    const meta: TrackMeta = {
      ...ytdlpInfoToTrack(infos[0], 'youtube'),
      // forcamos tags conhecidas para validar o tagging determinicamente
      title: 'Smoke Track',
      artists: ['DownMusic'],
      album: 'Smoke Album',
      coverUrl: undefined
    }

    // 2) download (motor real)
    let lastProgress = 0
    const raw = await ytdlp.downloadAudio(FREE_MP3, join(outDir, `${meta.id}.%(ext)s`), (p) => {
      lastProgress = p
    })
    const rawStat = await stat(raw)
    expect(rawStat.size).toBeGreaterThan(0)

    // 3) convert + tag (motor real, via Tagger)
    const opts: FetchOptions = {
      format: 'mp3',
      quality: '320',
      outputDir: outDir,
      nameTemplate: '%artist% - %title%'
    }
    const outPath = await tagger.finalize(meta, { rawPath: raw }, opts)
    expect(outPath.endsWith('.mp3')).toBe(true)

    const outStat = await stat(outPath)
    expect(outStat.size).toBeGreaterThan(0)

    // valida assinatura do MP3 e as tags gravadas via ffprobe
    const head = await readFile(outPath)
    expect(head.subarray(0, 3).toString('latin1')).toBe('ID3')

    const { stdout } = await execa(process.env.FFMPEG_BIN?.replace('ffmpeg', 'ffprobe') || 'ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_format', outPath
    ])
    const tags = JSON.parse(stdout).format.tags
    expect(tags.title).toBe('Smoke Track')
    expect(tags.artist).toBe('DownMusic')
    expect(tags.album).toBe('Smoke Album')
    expect(lastProgress).toBeGreaterThanOrEqual(0)
  }, 120_000)
})
