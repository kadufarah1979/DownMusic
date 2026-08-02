# Busca de versão extended por faixa — Design + Plano

- **Data:** 2026-08-02
- **Cards:** TASK-1630 (âncora), TASK-1631, TASK-1632
- **Contexto:** a busca de versão extended (v0.1.4) existe só em lote e só numa das três telas que listam faixas.
- **Objetivo:** poder pedir a versão extended de **uma faixa específica**, em qualquer lista de faixas do app.

## Estado atual

O backend já é por faixa. `findExtended(resolver, track)` (`electron/main/extendedFinder.ts`) monta a query `"<artistas> <título> extended mix"`, chama `resolver.searchMany` nos quatro motores (`spotify`, `deezer`, `youtube`, `soundcloud`) e passa por `pickBestPerSource`, que descarta candidatas sem palavra-chave de extended, com título que não bate, ou sem duração maior que a original. Retorna `Partial<Record<SourceId, TrackMeta>>` — no máximo uma candidata por fonte, só as qualificadas.

O que existe na UI é apenas o consumo **em lote**: o botão "⏱ Buscar versões extended" no cabeçalho do `TrackSelectList` roda `findExtendedAll()`, que percorre a lista inteira com três workers concorrentes.

Consequências:

- Numa playlist de 100 faixas são 100 buscas — cada uma com quatro `searchMany` por baixo — para talvez interessar duas.
- Não há como pedir só de uma faixa, nem cancelar no meio.
- O controle só aparece quando o componente recebe `onReplace`, prop que só o `App` passa para a lista resolvida da aba Download. `SearchResults` e `PlaylistTracks` ficam sem nada.

## Dois problemas estruturais (achados na leitura, precisam ser resolvidos antes)

### 1. Trocar uma faixa detona o estado da lista inteira

`swap()` chama `onReplace(original, replacement)`. No `App`, `replaceResolved` faz:

```ts
setResolved((prev) => prev.map((t) => (t === original ? replacement : t)))
```

Isso produz um **novo array**. O `TrackSelectList` tem:

```ts
useEffect(() => {
  setSelected(new Set(tracks.map(keyOf)))
  setQuery('')
  setCandidates({})
}, [tracks])
```

O efeito observa a **identidade** de `tracks`. Logo, trocar uma única faixa hoje: remarca todas as faixas (perdendo a seleção do usuário), limpa o filtro de texto e **apaga as candidatas de todas as outras faixas**.

Em lote isso passa quase despercebido, porque a troca costuma ser a última ação. Com busca por faixa vira o fluxo principal — buscar em três faixas e trocar uma jogaria fora as outras duas. **Corrigir isso é pré-requisito da TASK-1630**, não melhoria opcional.

Correção: o efeito de reset deve disparar quando o **conjunto de faixas muda de verdade**, não a cada nova referência de array. Usar uma chave derivada do conteúdo (ex. `tracks.map(keyOf).join('|')`) como dependência resolve — uma troca altera a chave da faixa trocada, então preservar seleção e candidatas exige reconciliar por chave em vez de resetar. Alternativa mais simples: manter o reset, mas reconciliar `selected` e `candidates` mapeando a chave antiga para a nova.

### 2. `extBusy` é global do componente

`extBusy` e `extProgress` são um par único, usado para desabilitar o botão de lote e exibir "Buscando extended N/M". Se a busca por faixa reusar esse estado, uma busca individual desabilita o botão de lote e o progresso do lote sobrescreve o indicador da faixa.

Correção: estado próprio por faixa — um `Set<string>` de chaves em andamento — independente do `extBusy` do lote.

## Comportamento desejado

- Cada linha de faixa ganha um botão **⏱**, ao lado do "↗" já existente, que busca a versão extended **daquela faixa**.
- Enquanto busca, o indicador aparece **só naquela linha**; o resto da lista segue utilizável, inclusive outras buscas individuais.
- O resultado **mescla** no mapa de candidatas; nada do que já foi encontrado é descartado.
- Faixa sem candidata dá retorno explícito — hoje o lote simplesmente não mostra nada, e o usuário não sabe se buscou e não achou ou se falhou.
- Erro em uma faixa é isolado: mensagem naquela linha, resto intacto.
- O botão de lote **permanece**, como atalho para quem quer a playlist inteira.

## Fronteiras

Nenhuma mudança no `main`, no preload ou em `shared/`. `api.findExtended(track)` já entrega exatamente o necessário. O trabalho é todo no renderer:

| Arquivo | Papel |
|---|---|
| `src/components/TrackSelectList.tsx` | botão por faixa, estado por faixa, reconciliação do reset |
| `src/components/SearchResults.tsx` | repassar `onReplace` aos grupos |
| `src/App.tsx` | `replaceInSearchGroups`, irmão de `replaceResolved` |
| `src/components/PlaylistTracks.tsx` | lista própria — ver TASK-1632 |
| `src/components/PlaylistsView.tsx` | aplicar a troca no `Record<url, TracksState>` |

## Faseamento

### Fase 1 — TASK-1630: botão por faixa (âncora)

Escopo: `TrackSelectList.tsx`.

1. Corrigir o reset destrutivo do `useEffect([tracks])` — reconciliar seleção e candidatas por chave em vez de zerar. **Antes** de qualquer UI nova, para que o resto seja construído sobre base sã.
2. Estado `extPending: Set<string>` (chaves em andamento), separado de `extBusy`.
3. `findExtendedOne(track)`: chama `api.findExtended`, mescla em `candidates`, marca "nenhuma versão encontrada" quando o retorno vem vazio, isola erro por faixa.
4. Botão ⏱ por linha, com estado de carregamento local.
5. `findExtendedAll` para de fazer `setCandidates({})` — passa a mesclar, como a busca individual.

### Fase 2 — TASK-1631: resultados de busca

Escopo: `App.tsx`, `SearchResults.tsx`.

1. `replaceInSearchGroups(original, replacement)` no `App`: troca a faixa dentro do grupo a que pertence, preservando os demais grupos.
2. `SearchResults` aceita e repassa `onReplace` ao `TrackSelectList` de cada grupo.

Com a Fase 1 pronta, isto é quase só encanamento.

### Fase 3 — TASK-1632: aba Playlists

Escopo: `PlaylistTracks.tsx`, `PlaylistsView.tsx`.

`PlaylistTracks` não usa o `TrackSelectList` — renderiza a própria lista, porque mostra status por faixa (baixado / na fila / erro / novo) e um botão de ação por linha. Duas saídas:

1. **Duplicar o bloco** (botão + lista de candidatas + trocar) dentro do `PlaylistTracks`. Mantém os componentes independentes; custa alguma repetição de JSX.
2. **Extrair um componente compartilhado** (`ExtendedCandidates`) consumido pelas duas telas. Menos repetição, mas mexe no `TrackSelectList` já estável.

Decidir **depois** da Fase 1, quando a UI de candidatas estiver na forma final: a opção 2 só se paga se ela ficar mesmo idêntica nas duas telas. A troca precisa subir até a `PlaylistsView`, que guarda as faixas em `tracks: Record<url, TracksState>` — atualizar a URL certa, sem afetar outras playlists expandidas.

## Testes

A lógica pura de extended (`shared/extended.ts`: `isExtendedTitle`, `titleMatches`, `scoreExtendedCandidate`, `pickBestPerSource`) já tem cobertura e **não é tocada**.

O que este trabalho adiciona é estado de componente React, e o projeto não tem infraestrutura de teste de componente (sem `@testing-library`). Duas opções:

- **Seguir a convenção**: validação ao vivo, como nas demais features de UI.
- **Extrair a reconciliação para função pura** — `reconcileSelection(prevKeys, nextKeys)` e `reconcileCandidates(prev, oldKey, newKey)` em `src/lib/` — e testar por unidade. **Recomendado**: é exatamente a parte com risco de regressão silenciosa (Problema 1), e é lógica pura de mapa/conjunto, sem React.

Validação ao vivo mínima, por fase:

1. Buscar extended em duas faixas distintas; conferir que a segunda não apaga a primeira. Trocar uma; conferir que a candidata da outra permanece e que a seleção não foi remarcada.
2. Buscar por texto, pedir extended num resultado, trocar, enfileirar — o download deve ser da versão trocada.
3. Expandir duas playlists, trocar uma faixa em uma delas, conferir que a outra não muda e que o status por faixa segue correto.

## Bordas

- Faixa sem `durationSec`: `scoreExtendedCandidate` exige duração maior que a original — sem duração, nenhuma candidata qualifica. Não é regressão (vale hoje no lote), mas com botão por faixa o usuário vê "nada encontrado" e merece saber o porquê.
- Buscar duas vezes na mesma faixa: a segunda substitui as candidatas daquela faixa, não acumula.
- Trocar uma faixa já trocada: a chave muda de novo; a reconciliação precisa aguentar troca encadeada.
- Faixa enfileirada e depois trocada: a fila já recebeu a original — a troca vale para a próxima vez que for enfileirada, não altera o item na fila.

## Fora de escopo

- Cancelar uma busca em andamento.
- Preferência de motor (hoje mostra a melhor de cada fonte e o usuário escolhe).
- Persistir candidatas entre sessões.
- Troca automática sem confirmação.
