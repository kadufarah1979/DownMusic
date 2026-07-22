/**
 * Heurística para a barra "omnibox": decide se a entrada é um LINK (resolver)
 * ou TEXTO de busca (pesquisar nos motores).
 *
 * - Espaço em branco ⇒ texto (ex.: "boris brejcha", "artista - faixa").
 * - Começa com http(s):// ⇒ link.
 * - Padrão dominio.tld/caminho (sem esquema) ⇒ link (ex.: "youtu.be/abc").
 * - Caso contrário ⇒ texto.
 */
export function looksLikeUrl(input: string): boolean {
  const t = (input ?? '').trim()
  if (!t || /\s/.test(t)) return false
  if (/^https?:\/\//i.test(t)) return true
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S+/i.test(t)
}
