import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { LibraryScanner, MusicMetadataReader, type TagReader } from './libraryScanner'
import type { ScannedTrack } from '../../shared/library'

// leitor falso: deriva tags triviais do nome do arquivo
const fakeReader: TagReader = {
  async read(path) {
    if (path.includes('corrupt')) throw new Error('ilegível')
    return { artists: ['A'], title: 'T', hasCover: true, format: 'MP3', lossless: false, bitrate: 320, fileSize: 10 } as Omit<ScannedTrack, 'path'>
  }
}

describe('LibraryScanner.scan', () => {
  it('varre recursivamente só áudio, pula _Duplicados/ e coleta ilegíveis', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scan-'))
    await writeFile(join(dir, 'a.mp3'), 'x')
    await writeFile(join(dir, 'nota.txt'), 'x') // ignorado
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub', 'b.flac'), 'x')
    await writeFile(join(dir, 'corrupt.mp3'), 'x')
    await mkdir(join(dir, '_Duplicados'))
    await writeFile(join(dir, '_Duplicados', 'old.mp3'), 'x') // ignorado

    const scanner = new LibraryScanner(fakeReader)
    const { tracks, unreadable } = await scanner.scan(dir)

    const names = tracks.map((t) => t.path.replace(dir, '')).sort()
    expect(names).toEqual(['/a.mp3', '/sub/b.flac'])
    expect(unreadable).toEqual([join(dir, 'corrupt.mp3')])
  })
})

const genMp3 = (out: string) =>
  new Promise<void>((res, rej) => {
    const p = spawn('resources/bin/ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '1',
      '-metadata', 'title=Teste', '-metadata', 'artist=Fulano', '-metadata', 'genre=House', out])
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c))))
  })

describe('MusicMetadataReader (real)', () => {
  it('lê título/artista/gênero e bitrate de um mp3 real', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mm-'))
    const f = join(dir, 'x.mp3')
    await genMp3(f)
    const t = await new MusicMetadataReader().read(f)
    expect(t.title).toBe('Teste')
    expect(t.artists).toEqual(['Fulano'])
    expect(t.genre).toBe('House')
    expect(t.bitrate).toBeGreaterThan(0)
  })
})
