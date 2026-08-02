import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { findFfmpeg } from './ffmpegBin'

let dir = ''
let binDir = ''
let repo = ''

// Os casos que criam arquivos de verdade precisam falar a lingua do host: num
// runner Windows o diretorio temporario e `C:\...`, e pedir a busca com
// `platform: 'linux'` faria o PATH ser quebrado no `:` do nome da unidade.
const HOST = process.platform
const NAME = HOST === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ffbin-'))
  binDir = join(dir, 'bin')
  await mkdir(binDir)
  await writeFile(join(binDir, 'ffmpeg'), '')
  await writeFile(join(binDir, 'ffmpeg.exe'), '')
  // repo falso com o binario baixado por scripts/fetch-binaries.sh
  repo = join(dir, 'repo')
  await mkdir(join(repo, 'resources', 'bin'), { recursive: true })
  await writeFile(join(repo, 'resources', 'bin', 'ffmpeg'), '')
})

describe('findFfmpeg', () => {
  it('acha o ffmpeg numa entrada do PATH', () => {
    expect(findFfmpeg({ PATH: binDir }, HOST, dir)).toBe(join(binDir, NAME))
  })

  it('prefere FFMPEG_BIN quando o arquivo existe', () => {
    const explicit = join(binDir, 'ffmpeg')
    expect(findFfmpeg({ FFMPEG_BIN: explicit, PATH: '' }, HOST, dir)).toBe(explicit)
  })

  it('FFMPEG_BIN apontando para arquivo inexistente cai para as opcoes seguintes', () => {
    expect(findFfmpeg({ FFMPEG_BIN: join(dir, 'nao-existe'), PATH: binDir }, HOST, dir)).toBe(
      join(binDir, NAME)
    )
  })

  it('prefere o binario baixado em resources/bin ao do PATH', () => {
    expect(findFfmpeg({ PATH: binDir }, 'linux', repo)).toBe(join(repo, 'resources', 'bin', 'ffmpeg'))
    // (o binario de resources/bin do fixture so existe com nome POSIX)
  })

  it('no Windows procura ffmpeg.exe e separa o PATH por ponto-e-virgula', () => {
    expect(findFfmpeg({ PATH: `${join(dir, 'vazio')};${binDir}` }, 'win32', dir)).toBe(
      join(binDir, 'ffmpeg.exe')
    )
  })

  it('sem PATH e sem binario local devolve null', () => {
    expect(findFfmpeg({}, 'linux', dir)).toBeNull()
  })

  it('entrada de PATH inexistente nao quebra a procura', () => {
    expect(findFfmpeg({ PATH: `${join(dir, 'nao-existe')}${delimiter}${binDir}` }, HOST, dir)).toBe(
      join(binDir, NAME)
    )
  })
})
