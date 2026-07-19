/** Normaliza texto para comparacao: minusculas e sem acentos (NFD + remove marcas combinantes). */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}
