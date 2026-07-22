import { clipboard } from 'electron'

/**
 * Decide se um texto recem-lido da area de transferencia e um link que vale
 * sugerir: precisa ser http(s), diferente do ultimo visto, e reconhecido por
 * alguma fonte. Funcao pura para facilitar o teste.
 */
export function detectLink(
  text: string,
  last: string,
  isSupported: (url: string) => boolean
): string | null {
  const t = (text ?? '').trim()
  if (!t || t === last) return null
  if (!/^https?:\/\/\S+$/i.test(t)) return null
  // ignora textos multi-linha (colagens de blocos), so URL "limpa"
  if (/\s/.test(t)) return null
  return isSupported(t) ? t : null
}

/**
 * Vigia a area de transferencia em intervalo fixo e, ao detectar um link novo e
 * suportado, chama `onLink` (sugestao discreta na UI). Respeita `enabled()` a cada
 * tick, entao ligar/desligar nas Configuracoes tem efeito imediato, sem reiniciar.
 */
export class ClipboardWatcher {
  private last = ''
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly enabled: () => boolean,
    private readonly isSupported: (url: string) => boolean,
    private readonly onLink: (url: string) => void,
    private readonly readText: () => string = () => clipboard.readText()
  ) {}

  start(intervalMs = 1500): void {
    if (this.timer) return
    this.last = (this.readText() ?? '').trim() // ignora o que ja estava copiado ao abrir
    this.timer = setInterval(() => this.tick(), intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick(): void {
    if (!this.enabled()) return
    const link = detectLink(this.readText(), this.last, this.isSupported)
    const current = (this.readText() ?? '').trim()
    if (current) this.last = current
    if (link) this.onLink(link)
  }
}
