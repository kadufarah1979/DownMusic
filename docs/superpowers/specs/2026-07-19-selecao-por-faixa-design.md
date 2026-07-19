# Seleção por faixa antes de baixar (Design)

- **Data:** 2026-07-19
- **Contexto:** app DownMusic (Electron + TS). Aba Busca já lista resultados por plataforma; aba Download resolve links e enfileira.
- **Objetivo:** permitir marcar/desmarcar faixas individualmente (todas marcadas por padrão) e enfileirar só as selecionadas — tanto nos resultados de busca quanto nas playlists coladas na aba Download.

## Escopo

- **Somente front-end (renderer).** IPC (`resolve`/`enqueue`), fila e backend **não mudam**.
- Aplica-se a: (a) grupos da aba Busca; (b) faixas resolvidas na aba Download (playlists/álbuns/faixa).
- **Fora de escopo:** enfileirar selecionados de várias plataformas de uma vez; persistir seleção.

## Componente `TrackSelectList` (reutilizável)

Recebe `tracks: TrackMeta[]` e renderiza a lista com seleção:
- **checkbox por faixa**, todas **marcadas por padrão**;
- controle **"marcar/desmarcar todas"**;
- botão **"Enfileirar selecionados (N)"** → `api.enqueue(selecionadas)`;
- seleção mantida por chave `sourceId:id`;
- a seleção **reseta para tudo-marcado quando a lista de `tracks` muda** (nova busca / novo resolve). Implementado com `useEffect` na identidade de `tracks`.
- opcional `onEnqueued?()` — callback após enfileirar (a aba Download usa para limpar a lista).

## Aba Busca (`SearchView`)

- Cada grupo de plataforma renderiza um `TrackSelectList` (seleção independente por grupo).
- **Remove** o `[+]` por linha e o botão "Enfileirar todos"; a ação passa a ser "Enfileirar selecionados (N)".
- Cabeçalho do grupo mantém título + contagem total; grupos com erro/vazio seguem como hoje.

## Aba Download (`UrlBar` + fluxo)

- `UrlBar` ao colar/resolver **não enfileira na hora**: chama `resolve(url)` e entrega as faixas ao estado da aba Download (via callback `onResolved(tracks)`), limpando o campo.
- A aba Download (App) guarda `resolvedTracks` e renderiza um `TrackSelectList` entre o `UrlBar` e a `QueueList`.
- "Enfileirar selecionados (N)" enfileira e, via `onEnqueued`, **limpa** `resolvedTracks` (volta a mostrar só a fila).
- Erros de `resolve` continuam exibidos no `UrlBar`.
- Faixa única (1 item) também passa pela lista (fluxo consistente).

## Estrutura de componentes

```
App (aba Download)
  ├─ UrlBar            (resolve → onResolved(tracks))
  ├─ TrackSelectList   (se há resolvedTracks) → enqueue selecionados → onEnqueued
  └─ QueueList

SearchView
  └─ GroupSection (por plataforma)
       └─ TrackSelectList
```

## Erros / bordas

- Query/URL vazia: sem ação (como hoje).
- `resolve` com erro: mensagem no `UrlBar`; nada é listado.
- Nenhuma faixa marcada: botão "Enfileirar selecionados (0)" desabilitado.
- Reset de seleção ao trocar o conjunto de faixas evita marcar/enfileirar faixa de uma busca anterior.

## Testes

- **Só front-end** → validação **ao vivo** (driver headless + screenshots), padrão do projeto. A lógica de negócio (com testes unitários) não é tocada; a suíte existente deve continuar verde e o build OK.
- Validação ao vivo cobre: (1) busca → desmarcar 1 → "Enfileirar selecionados" enfileira só as marcadas; (2) Download com playlist → lista com checkboxes → enfileirar subconjunto.

## Faseamento

1. Criar `TrackSelectList` (componente).
2. `SearchView` usa `TrackSelectList` por grupo (remove `[+]`/"Enfileirar todos").
3. Aba Download: `UrlBar` vira `onResolved`; `App` guarda `resolvedTracks` e renderiza `TrackSelectList`.
4. Verificação (typecheck/tests/build) + validação ao vivo.
