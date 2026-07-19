import { describe, it, expect } from 'vitest'
import { trackStatus } from './trackStatus'

describe('trackStatus', () => {
  it('erro tem prioridade sobre tudo', () => {
    expect(trackStatus({ downloaded: true, queueState: 'error' })).toBe('error')
  })

  it('running/queued vem antes de downloaded', () => {
    expect(trackStatus({ downloaded: true, queueState: 'running' })).toBe('running')
    expect(trackStatus({ downloaded: false, queueState: 'queued' })).toBe('queued')
  })

  it('downloaded quando esta no historico (ou concluido na fila)', () => {
    expect(trackStatus({ downloaded: true, queueState: undefined })).toBe('downloaded')
    expect(trackStatus({ downloaded: false, queueState: 'done' })).toBe('downloaded')
  })

  it('new quando nao ha nada', () => {
    expect(trackStatus({ downloaded: false, queueState: undefined })).toBe('new')
  })
})
