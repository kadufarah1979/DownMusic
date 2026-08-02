import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { ConfigStore, configDefaults } from './config'
import { memoryStore } from '../testSupport/memoryStore'
import { DEFAULT_CONFIG, type AppConfig } from '../../shared/types'

const make = (initial: AppConfig = configDefaults('/musicas/DownMusic')) => {
  const backend = memoryStore(initial)
  return { cfg: new ConfigStore(backend), backend }
}

describe('configDefaults', () => {
  it('parte do DEFAULT_CONFIG e so troca a pasta de saida', () => {
    const d = configDefaults(join('/musicas', 'DownMusic'))
    expect(d.outputDir).toBe(join('/musicas', 'DownMusic'))
    expect({ ...d, outputDir: DEFAULT_CONFIG.outputDir }).toEqual(DEFAULT_CONFIG)
  })

  it('pasta indisponivel (fora do Electron) vira string vazia, sem quebrar', () => {
    expect(configDefaults('').outputDir).toBe('')
  })
})

describe('ConfigStore', () => {
  it('get devolve a config gravada', () => {
    const { cfg } = make()
    expect(cfg.get().outputDir).toBe('/musicas/DownMusic')
    expect(cfg.get().format).toBe(DEFAULT_CONFIG.format)
  })

  it('update faz merge parcial: o que nao foi passado permanece', () => {
    const { cfg } = make()
    const out = cfg.update({ format: 'flac' })

    expect(out.format).toBe('flac')
    expect(out.outputDir).toBe('/musicas/DownMusic') // preservado
    expect(out.concurrency).toBe(DEFAULT_CONFIG.concurrency) // preservado
  })

  it('update devolve o estado ja mesclado, nao o patch', () => {
    const { cfg } = make()
    const out = cfg.update({ concurrency: 5 })
    expect(out).toEqual({ ...cfg.get() })
    expect(Object.keys(out).length).toBeGreaterThan(1)
  })

  it('updates sucessivos acumulam', () => {
    const { cfg } = make()
    cfg.update({ format: 'flac' })
    cfg.update({ quality: 'lossless' })

    expect(cfg.get().format).toBe('flac')
    expect(cfg.get().quality).toBe('lossless')
  })

  it('grava no backend, nao so na memoria da instancia', () => {
    const { cfg, backend } = make()
    cfg.update({ outputDir: '/outra/pasta' })
    expect(backend.store.outputDir).toBe('/outra/pasta')
  })
})
