import { describe, it, expect, vi } from 'vitest'
import {
  parseProgress,
  buildDownloadArgs,
  buildSearchArgs,
  buildInfoArgs,
  parseLastLine,
  YtDlpEngine,
  type ProcRunner
} from './ytdlp'

describe('parseProgress', () => {
  it('extrai o percentual de uma linha de download do yt-dlp', () => {
    expect(parseProgress('[download]  23.4% of 3.50MiB at 1.00MiB/s ETA 00:03')).toBe(23.4)
  })

  it('reconhece 100%', () => {
    expect(parseProgress('[download] 100% of 3.50MiB in 00:02')).toBe(100)
  })

  it('retorna null para linhas sem progresso', () => {
    expect(parseProgress('[info] Downloading 1 format(s): 251')).toBeNull()
    expect(parseProgress('')).toBeNull()
  })
})

describe('buildDownloadArgs', () => {
  const args = buildDownloadArgs('https://youtu.be/abc', '/music/1.%(ext)s')

  it('pede o melhor audio', () => {
    const i = args.indexOf('-f')
    expect(args[i + 1]).toBe('bestaudio/best')
  })

  it('usa o template de saida dado', () => {
    const i = args.indexOf('-o')
    expect(args[i + 1]).toBe('/music/1.%(ext)s')
  })

  it('nao expande playlist e imprime o caminho final', () => {
    expect(args).toContain('--no-playlist')
    expect(args).toContain('--newline')
    const i = args.indexOf('--print')
    expect(args[i + 1]).toBe('after_move:filepath')
  })

  it('passa a URL por ultimo', () => {
    expect(args[args.length - 1]).toBe('https://youtu.be/abc')
  })
})

describe('buildSearchArgs', () => {
  const args = buildSearchArgs('Daft Punk Get Lucky')

  it('usa ytsearch1 com a query', () => {
    expect(args[0]).toBe('ytsearch1:Daft Punk Get Lucky')
  })

  it('imprime a webpage_url sem baixar', () => {
    const i = args.indexOf('--print')
    expect(args[i + 1]).toBe('webpage_url')
    expect(args).toContain('--no-download')
  })
})

describe('parseLastLine', () => {
  it('retorna a ultima linha nao vazia, sem espacos', () => {
    expect(parseLastLine('linha1\n/music/1.webm\n')).toBe('/music/1.webm')
  })

  it('retorna null para saida vazia', () => {
    expect(parseLastLine('   \n')).toBeNull()
  })
})

describe('buildInfoArgs', () => {
  const args = buildInfoArgs('https://youtu.be/abc')

  it('extrai metadados em JSON sem baixar', () => {
    expect(args).toContain('--dump-json')
    expect(args).toContain('--no-download')
    expect(args[args.length - 1]).toBe('https://youtu.be/abc')
  })
})

/** Runner falso: emite linhas pre-definidas e devolve stdout/exitCode controlados. */
function fakeRunner(opts: { lines?: string[]; stdout?: string; throws?: boolean }): ProcRunner {
  return {
    async run(_bin, _args, onLine) {
      if (opts.throws) throw new Error('binario ausente')
      for (const l of opts.lines ?? []) onLine(l)
      return { stdout: opts.stdout ?? '', exitCode: 0 }
    }
  }
}

describe('YtDlpEngine.downloadAudio', () => {
  it('encaminha o progresso e retorna o caminho final impresso', async () => {
    const runner = fakeRunner({
      lines: ['[download]  10.0% of 1MiB', '[download] 100% of 1MiB'],
      stdout: '/music/1.webm\n'
    })
    const engine = new YtDlpEngine('yt-dlp', runner)
    const onProgress = vi.fn()

    const path = await engine.downloadAudio('https://youtu.be/abc', '/music/1.%(ext)s', onProgress)

    expect(path).toBe('/music/1.webm')
    expect(onProgress).toHaveBeenCalledWith(10)
    expect(onProgress).toHaveBeenCalledWith(100)
  })

  it('lanca erro se o caminho final nao for impresso', async () => {
    const runner = fakeRunner({ stdout: '' })
    const engine = new YtDlpEngine('yt-dlp', runner)
    await expect(
      engine.downloadAudio('https://youtu.be/abc', '/music/1.%(ext)s', () => {})
    ).rejects.toThrow(/caminho/i)
  })
})

describe('YtDlpEngine.searchBest', () => {
  it('retorna a URL do melhor resultado', async () => {
    const runner = fakeRunner({ stdout: 'https://www.youtube.com/watch?v=xyz\n' })
    const engine = new YtDlpEngine('yt-dlp', runner)
    expect(await engine.searchBest('Daft Punk')).toBe('https://www.youtube.com/watch?v=xyz')
  })

  it('retorna null quando nao ha resultado', async () => {
    const runner = fakeRunner({ stdout: '' })
    const engine = new YtDlpEngine('yt-dlp', runner)
    expect(await engine.searchBest('asdkjhaskjdh')).toBeNull()
  })
})

describe('YtDlpEngine.dumpJson', () => {
  it('faz parse de multiplas linhas JSON (playlist)', async () => {
    const runner = fakeRunner({
      stdout: '{"id":"a","title":"A"}\n{"id":"b","title":"B"}\n'
    })
    const engine = new YtDlpEngine('yt-dlp', runner)
    const infos = await engine.dumpJson('https://youtube.com/playlist?list=1')
    expect(infos).toHaveLength(2)
    expect(infos[0]).toMatchObject({ id: 'a' })
    expect(infos[1]).toMatchObject({ id: 'b' })
  })

  it('ignora linhas em branco', async () => {
    const runner = fakeRunner({ stdout: '\n{"id":"a"}\n\n' })
    const engine = new YtDlpEngine('yt-dlp', runner)
    expect(await engine.dumpJson('x')).toHaveLength(1)
  })
})

describe('YtDlpEngine.available', () => {
  it('true quando o runner executa', async () => {
    const engine = new YtDlpEngine('yt-dlp', fakeRunner({ stdout: '2024.01.01' }))
    expect(await engine.available()).toBe(true)
  })

  it('false quando o runner falha', async () => {
    const engine = new YtDlpEngine('yt-dlp', fakeRunner({ throws: true }))
    expect(await engine.available()).toBe(false)
  })
})
