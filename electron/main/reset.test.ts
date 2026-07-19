import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, readdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isSafeToClear, clearDir } from './reset'

const HOME = '/home/user'

describe('isSafeToClear', () => {
  it('bloqueia caminhos perigosos ou vazios', () => {
    expect(isSafeToClear('', HOME)).toBe(false)
    expect(isSafeToClear('/', HOME)).toBe(false)
    expect(isSafeToClear('/home/user', HOME)).toBe(false) // a propria home
    expect(isSafeToClear('/home', HOME)).toBe(false)
    expect(isSafeToClear('/usr', HOME)).toBe(false)
  })
  it('permite pastas normais de download', () => {
    expect(isSafeToClear('/home/user/Musica/Downloads', HOME)).toBe(true)
    expect(isSafeToClear('/mnt/hd/musicas', HOME)).toBe(true)
  })
})

describe('clearDir', () => {
  it('esvazia o conteudo (arquivos e subpastas) mas mantem a pasta', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clear-'))
    await writeFile(join(dir, 'a.mp3'), 'x')
    await mkdir(join(dir, 'Artista'))
    await writeFile(join(dir, 'Artista', 'b.mp3'), 'y')

    const removed = await clearDir(dir)
    expect(removed).toBe(2) // a.mp3 + Artista/
    expect(await readdir(dir)).toEqual([]) // pasta vazia
    await access(dir) // pasta ainda existe (nao lanca)
  })
})
