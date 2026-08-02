/**
 * Reconciliacao do estado de uma lista de faixas (selecao e candidatas
 * extended) quando o array de `tracks` muda de identidade.
 *
 * Existe porque trocar UMA faixa por sua versao extended produz um array novo:
 * o consumidor faz `prev.map(t => t === original ? replacement : t)`. Sem
 * distinguir "lista nova" de "uma faixa trocada", o componente zerava tudo —
 * remarcava todas as faixas e apagava as candidatas ja encontradas das outras.
 *
 * Fica em `shared/` pelo mesmo motivo de `trackFilter.ts`: e logica pura,
 * sem React, e a suite so coleta testes de `electron/` e `shared/`.
 */

/**
 * True quando o proximo conjunto de faixas nao tem NENHUMA em comum com o
 * anterior — ou seja, e outra lista (novo resolve, nova busca), e o estado
 * anterior nao significa mais nada.
 *
 * Uma troca de faixa mantem todas as outras chaves, entao cai no `false`.
 * Lista anterior vazia tambem reseta (primeira carga).
 */
export function isDifferentList(prevKeys: readonly string[], nextKeys: readonly string[]): boolean {
  if (prevKeys.length === 0) return true
  const next = new Set(nextKeys)
  return !prevKeys.some((k) => next.has(k))
}

/** Mantem apenas as chaves que ainda existem na lista. */
export function pruneSelection(selected: ReadonlySet<string>, nextKeys: readonly string[]): Set<string> {
  const next = new Set(nextKeys)
  return new Set([...selected].filter((k) => next.has(k)))
}

/** Descarta as candidatas de faixas que sairam da lista. */
export function pruneCandidates<T>(
  candidates: Readonly<Record<string, T>>,
  nextKeys: readonly string[]
): Record<string, T> {
  const next = new Set(nextKeys)
  return Object.fromEntries(Object.entries(candidates).filter(([k]) => next.has(k)))
}

/**
 * Move o estado de `from` para `to` num conjunto — usado na troca por versao
 * extended, para a faixa nova herdar o "marcado" da original em vez de
 * reaparecer com o default.
 */
export function remapKey(set: ReadonlySet<string>, from: string, to: string): Set<string> {
  const next = new Set(set)
  if (next.delete(from)) next.add(to)
  return next
}
