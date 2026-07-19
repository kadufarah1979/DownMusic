import { describe, it, expect, vi } from 'vitest'
import { qualityToBitrate, buildConvertArgs, FfmpegEngine, type ProcRunner } from './ffmpeg'
import type { TrackMeta } from '../../shared/types'

const meta: TrackMeta = {
  id: '1',
  title: 'Minha Musica',
  artists: ['Artista A', 'Artista B'],
  album: 'Album',
  coverUrl: 'https://img/cover.jpg',
  sourceId: 'youtube',
  sourceUrl: 'x'
}

describe('qualityToBitrate', () => {
  it('mapeia qualidades com bitrate', () => {
    expect(qualityToBitrate('320')).toBe('320k')
    expect(qualityToBitrate('128')).toBe('128k')
  })
  it('retorna null para lossless/best', () => {
    expect(qualityToBitrate('lossless')).toBeNull()
    expect(qualityToBitrate('best')).toBeNull()
  })
})

describe('buildConvertArgs', () => {
  it('mp3 320: usa libmp3lame com bitrate e grava metadata', () => {
    const args = buildConvertArgs('/in.webm', '/out.mp3', 'mp3', '320', meta)
    expect(args).toContain('-c:a')
    expect(args[args.indexOf('-c:a') + 1]).toBe('libmp3lame')
    expect(args[args.indexOf('-b:a') + 1]).toBe('320k')
    expect(args).toContain('title=Minha Musica')
    expect(args).toContain('artist=Artista A, Artista B')
    expect(args).toContain('album=Album')
    expect(args[args.length - 1]).toBe('/out.mp3')
    expect(args[0]).toBe('-y')
  })

  it('flac lossless: usa codec flac e nao inclui bitrate', () => {
    const args = buildConvertArgs('/in.webm', '/out.flac', 'flac', 'lossless', meta)
    expect(args[args.indexOf('-c:a') + 1]).toBe('flac')
    expect(args).not.toContain('-b:a')
  })

  it('embute a capa de um ARQUIVO LOCAL (segundo input + attached_pic)', () => {
    const args = buildConvertArgs('/in.webm', '/out.mp3', 'mp3', '320', meta, '/tmp/cover.jpg')
    // dois inputs: audio e capa (arquivo local, nao URL)
    expect(args.filter((a) => a === '-i')).toHaveLength(2)
    expect(args).toContain('/tmp/cover.jpg')
    expect(args).not.toContain('https://img/cover.jpg')
    expect(args).toContain('attached_pic')
  })

  it('nao embute capa em opus (nao suportado) nem quando nao ha coverPath', () => {
    const opus = buildConvertArgs('/in.webm', '/out.opus', 'opus', '256', meta, '/tmp/cover.jpg')
    expect(opus.filter((a) => a === '-i')).toHaveLength(1)
    expect(opus).not.toContain('attached_pic')

    const noCover = buildConvertArgs('/in.webm', '/out.mp3', 'mp3', '320', meta)
    expect(noCover.filter((a) => a === '-i')).toHaveLength(1)
  })

  it("best: copia o audio sem reencode (-c:a copy)", () => {
    const args = buildConvertArgs('/in.webm', '/out.webm', 'best', 'best', meta)
    expect(args[args.indexOf('-c:a') + 1]).toBe('copy')
  })
})

function fakeRunner(spy?: (bin: string, args: string[]) => void): ProcRunner {
  return {
    async run(bin, args) {
      spy?.(bin, args)
      return { exitCode: 0 }
    }
  }
}

describe('FfmpegEngine.convertAndTag', () => {
  it('chama o binario com os args montados e retorna o outPath', async () => {
    const seen: string[] = []
    const engine = new FfmpegEngine('ffmpeg', fakeRunner((_b, a) => seen.push(...a)))
    const out = await engine.convertAndTag('/in.webm', '/out.mp3', 'mp3', '320', meta)
    expect(out).toBe('/out.mp3')
    expect(seen).toContain('libmp3lame')
  })

  it('available() reflete o runner', async () => {
    expect(await new FfmpegEngine('ffmpeg', fakeRunner()).available()).toBe(true)
    const failing: ProcRunner = { async run() { throw new Error('no ffmpeg') } }
    expect(await new FfmpegEngine('ffmpeg', failing).available()).toBe(false)
  })
})
