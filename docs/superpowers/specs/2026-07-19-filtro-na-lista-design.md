# Filtro dentro da lista de faixas — Design + Plano

- **Data:** 2026-07-19
- **Contexto:** `TrackSelectList` (checkbox por faixa, "marcar/desmarcar todas", "Enfileirar selecionados (N)", ícone ↗) é usado na playlist/álbum resolvido da aba Download e nos grupos da aba Busca.
- **Objetivo:** filtrar/buscar faixas **dentro** da lista já carregada, por texto (título + artista), agindo sobre as faixas visíveis.

## Comportamento

- Campo **"filtrar nesta lista..."** no topo do `TrackSelectList`, com botão **"×"** para limpar.
- Filtra por **título + artista**, **case-insensitive e sem acento** (normalização NFD; "cancao" acha "Canção").
- Ações operam sobre as **visíveis** (opção escolhida):
  - só as faixas que batem o filtro são exibidas;
  - **"Marcar/desmarcar todas"** age nas visíveis;
  - **"Enfileirar selecionados (N)"**: N e o que é enfileirado = **visíveis marcadas**.
- A marcação por faixa **persiste** (esconder não desmarca). Filtro vazio ⇒ visíveis = todas ⇒ **idêntico ao comportamento atual**.
- O texto do filtro **reseta** quando o conjunto de `tracks` muda (nova busca/novo resolve).
- Sem correspondência (há faixas, mas nenhuma bate): mensagem "Nenhuma faixa corresponde ao filtro."

## Fronteiras

- **`shared/trackFilter.ts`** — função pura `trackMatchesQuery(track, query): boolean` (normaliza e faz substring sobre título+artistas). Testável por unidade.
- **`src/components/TrackSelectList.tsx`** — estado `query`, `visibleTracks = tracks.filter(t => trackMatchesQuery(t, query))`; `allChecked`/`toggleAll`/contador/`enqueue` calculados sobre `visibleTracks`; renderiza `visibleTracks`; reset de `query` no `useEffect` de `tracks`.
- Sem IPC/fila/backend novos.

## Plano (TDD onde há lógica pura)

1. **`shared/trackFilter.ts` + teste** — `trackMatchesQuery`: vazio→true; case-insensitive (título/artista); sem acento; parcial; sem match→false. (RED→GREEN)
2. **`TrackSelectList`** — campo de filtro (+×), `visibleTracks`, ações escopadas às visíveis, render das visíveis, mensagem de vazio, reset de `query` ao trocar `tracks`.
3. **Verificação** — typecheck + suíte + build; **validação ao vivo** (filtro reduz a lista; contador reflete visíveis marcadas; enfileirar pega só as visíveis).

## Testes

- Unitário: `trackMatchesQuery` (shared, incluído na suíte do vitest).
- UI: validação ao vivo (driver + screenshot). Suíte existente segue verde; typecheck e build OK.
