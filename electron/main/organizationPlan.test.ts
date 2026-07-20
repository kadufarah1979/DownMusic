import { describe, it, expect } from 'vitest'
import { buildPlan } from './organizationPlan'
import type { PlannedInput, ScannedTrack } from '../../shared/library'

const st = (over: Partial<ScannedTrack>): ScannedTrack => ({
  path: '/in/x.mp3', title: 'Song', artists: ['A'], hasCover: true, format: 'MP3', lossless: false, bitrate: 320, fileSize: 1, ...over
})
const inp = (track: ScannedTrack, filled = {}): PlannedInput => ({ track, filled })
const TPL = '%genre%/%artist% - %title%'

describe('buildPlan', () => {
  it('monta destino pelo template, preservando a extensão', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ path: '/in/x.mp3', genre: 'House' }))], duplicates: [] })
    expect(p.entries[0].to).toBe('/root/House/A - Song.mp3')
    expect(p.entries[0].needsRetag).toBe(false)
  })

  it('marca needsRetag e carrega as tags quando houve enriquecimento', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ genre: 'House' }), { year: '2020' })], duplicates: [] })
    expect(p.entries[0].needsRetag).toBe(true)
    expect(p.entries[0].tags).toEqual({ year: '2020' })
  })

  it('gênero DESCOBERTO via enriquecimento define a pasta', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ path: '/in/x.mp3', genre: undefined }), { genre: 'Electro' })], duplicates: [] })
    expect(p.entries[0].to).toBe('/root/Electro/A - Song.mp3')
    expect(p.entries[0].needsRetag).toBe(true)
  })

  it('sem gênero cai na raiz (sem pasta de gênero)', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ genre: undefined }))], duplicates: [] })
    expect(p.entries[0].to).toBe('/root/A - Song.mp3')
  })

  it('duplicado vai para _Duplicados/ com o basename original', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ path: '/in/lo.mp3', genre: 'House' }))], duplicates: ['/in/lo.mp3'] })
    expect(p.entries[0].to).toBe('/root/_Duplicados/lo.mp3')
    expect(p.entries[0].duplicate).toBe(true)
  })

  it('pula quando já está no destino (idempotente)', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ path: '/root/House/A - Song.mp3', genre: 'House' }))], duplicates: [] })
    expect(p.entries).toHaveLength(0)
  })

  it('colisão: mantém o primeiro, sinaliza os demais', () => {
    const p = buildPlan({
      rootDir: '/root', template: TPL, duplicates: [],
      inputs: [inp(st({ path: '/in/1.mp3', genre: 'House' })), inp(st({ path: '/in/2.mp3', genre: 'House' }))]
    })
    expect(p.entries).toHaveLength(1)
    expect(p.collisions).toEqual(['/in/2.mp3'])
  })

  it('sem título nem artista usa o basename original como nome', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ path: '/in/faixa123.mp3', title: undefined, artists: [], genre: undefined }))], duplicates: [] })
    expect(p.entries[0].to).toBe('/root/faixa123.mp3')
  })
})
