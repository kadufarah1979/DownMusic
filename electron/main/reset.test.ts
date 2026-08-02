import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, readdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { isSafeToClear, clearDir } from './reset'

const HOME = '/home/user'

// As duas formas de caminho sao exercitadas pelo `flavor` (`posix`/`win32`),
// nao pelo sistema em que a suite roda: os dois blocos valem em qualquer host.
describe('isSafeToClear (POSIX)', () => {
  it('bloqueia caminhos perigosos ou vazios', () => {
    expect(isSafeToClear('', HOME, posix)).toBe(false)
    expect(isSafeToClear('/', HOME, posix)).toBe(false)
    expect(isSafeToClear('/home/user', HOME, posix)).toBe(false) // a propria home
    expect(isSafeToClear('/home', HOME, posix)).toBe(false)
    expect(isSafeToClear('/usr', HOME, posix)).toBe(false)
  })
  it('permite pastas normais de download', () => {
    expect(isSafeToClear('/home/user/Musica/Downloads', HOME, posix)).toBe(true)
    expect(isSafeToClear('/mnt/hd/musicas', HOME, posix)).toBe(true)
  })
  it('bloqueia tambem o que esta dentro de uma arvore de sistema', () => {
    expect(isSafeToClear('/usr/share/musicas', HOME, posix)).toBe(false)
    expect(isSafeToClear('/var/tmp/musicas', HOME, posix)).toBe(false)
  })
  it('barra sobrando no fim nao muda o veredito', () => {
    expect(isSafeToClear('/home/user/', HOME, posix)).toBe(false)
    expect(isSafeToClear('/home/user/Musica/Downloads/', HOME, posix)).toBe(true)
  })
})

describe('isSafeToClear (Windows)', () => {
  const WIN_HOME = 'C:\\Users\\joao'

  it('permite pasta de download legitima', () => {
    expect(isSafeToClear('C:\\Users\\joao\\Music\\Downloads', WIN_HOME, win32)).toBe(true)
    expect(isSafeToClear('D:\\Musicas\\DownMusic', WIN_HOME, win32)).toBe(true)
  })
  it('bloqueia raiz de unidade, pastas de sistema e a propria home', () => {
    expect(isSafeToClear('C:\\', WIN_HOME, win32)).toBe(false)
    expect(isSafeToClear('C:\\Windows', WIN_HOME, win32)).toBe(false)
    expect(isSafeToClear('C:\\Windows\\System32', WIN_HOME, win32)).toBe(false)
    expect(isSafeToClear('C:\\Users', WIN_HOME, win32)).toBe(false)
    expect(isSafeToClear('C:\\Program Files', WIN_HOME, win32)).toBe(false)
    expect(isSafeToClear('C:\\Users\\joao', WIN_HOME, win32)).toBe(false)
  })
  it('ignora diferenca de maiusculas (o Windows ignora)', () => {
    expect(isSafeToClear('c:\\users\\JOAO', WIN_HOME, win32)).toBe(false)
    expect(isSafeToClear('C:\\WINDOWS', WIN_HOME, win32)).toBe(false)
  })
  it('aceita barra normal como separador', () => {
    expect(isSafeToClear('C:/Users/joao/Music/Downloads', WIN_HOME, win32)).toBe(true)
    expect(isSafeToClear('C:/Users/joao', WIN_HOME, win32)).toBe(false)
  })
  it('bloqueia caminho UNC: nao da para garantir a profundidade num share remoto', () => {
    expect(isSafeToClear('\\\\servidor\\share', WIN_HOME, win32)).toBe(false)
    expect(isSafeToClear('\\\\servidor\\share\\musicas', WIN_HOME, win32)).toBe(false)
  })
  it('exige dois niveis abaixo da raiz, como no POSIX', () => {
    expect(isSafeToClear('D:\\Musicas', WIN_HOME, win32)).toBe(false)
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
