# Persistir a fila entre sessões — Design + Plano

- **Data:** 2026-08-02
- **Cards:** TASK-1634 (âncora), TASK-1635, TASK-1636
- **Origem:** relato do proprietário — "quando eu fecho e abro o DownMusic ele volta todo zerado".
- **Objetivo:** a fila (sobretudo os itens que falharam) sobrevive ao fechar o app, e a aba Download deixa de abrir em branco.

## Diagnóstico

O histórico **não** se perde. `~/.config/downmusic/history.json` tinha 13 entradas, gravadas normalmente pelo `HistoryStore`. Playlists e config idem.

O que some é a fila. `QueueManager` mantém tudo em memória (`electron/main/queue.ts:16-19`):

```ts
private items = new Map<string, QueueItem>()
private outputDirs = new Map<string, string>()  // override de pasta por lista
private enriched = new Set<string>()            // já enriquecidos, não repetir no retry
private seq = 0                                 // gera itemId: q1, q2, q3...
```

Nada disso vai para disco. A perda que importa são os itens em `error`: fechar o app apaga a lista do que precisa retentar, e o "↻ Tentar novamente" deixa de funcionar entre sessões.

Isso foi decisão explícita da spec de retry (`2026-07-19-selo-tempo-real-e-retry-erros-design.md`): *"não persistir erros (YAGNI)"*. O relato derruba esse YAGNI — é o caso real que o YAGNI apostou que não apareceria.

## Quatro armadilhas

### 1. `seq` reiniciado colide com itens restaurados

`enqueue` gera `itemId` como `q${++this.seq}`, e `seq` nasce em `0`. Restaurar `q1..q7` sem restaurar o contador faz o próximo `enqueue` produzir `q1` de novo — e `this.items.set('q1', ...)` **sobrescreve silenciosamente** o item restaurado, além de bagunçar `outputDirs` e `enriched`, que são indexados pela mesma chave.

Correção: no boot, `seq = max(número extraído dos ids restaurados)`. Não confiar num `seq` persistido isoladamente — derivar dos ids é robusto a arquivo editado à mão.

### 2. Os mapas auxiliares têm que viajar junto

`outputDirs` guarda o "Baixar em:" escolhido por lista; `fetchOptions` (`queue.ts:70`) faz `this.outputDirs.get(itemId) ?? this.cfg.outputDir`. Persistir só `items` faz o retry após reinício cair no fallback e **gravar na pasta padrão em vez da que o usuário escolheu** — arquivo no lugar errado, sem nenhuma mensagem.

`enriched` evita refazer o enriquecimento no retry. Perdê-lo custa uma ida ao Deezer por item; menos grave, mas é a mesma linha de código persistir.

### 3. `patch()` roda a cada tick de progresso

`patch` é chamado no callback de progresso do `fetchAudio` (`queue.ts:87`). Gravar ali seria escrita em disco dezenas de vezes por segundo por download.

Correção: persistir só em **transição de estado** (`queued`/`running`/`done`/`error`), nunca em mudança de `progress`. O `progress` de um item restaurado não tem valor — nasce em 0.

### 4. `running` restaurado é mentira

O processo morreu no meio do download; o arquivo parcial não existe mais no lugar esperado. Restaurar "baixando 47%" mostra um progresso que não avança.

## Decisões

**Item `running` volta como `queued`.** Não como `error` — não houve falha, houve interrupção, e marcar como erro polui a contagem que o usuário usa para saber o que deu problema de verdade.

**A fila não retoma sozinha ao abrir.** Restaurar `queued` e já chamar `queue.add` faria o app começar a baixar sozinho no launch, consumindo rede sem o usuário pedir. O app é conservador nisso em todo lugar (a sincronização de playlists no boot é opt-in via `syncOnStartup`; a aba Organizar não move nada sem confirmação). Os itens ficam `queued` e parados, com um botão **"Retomar (N)"** no cabeçalho da fila. Quem quiser automático pode ganhar um `resumeOnStartup` depois — não agora.

**`done` é persistido.** A alternativa (descartar, já que vivem no histórico) quebra os contadores: uma fila de 100 itens com 45 concluídos voltaria como "0/55", perdendo a noção do que foi feito. O crescimento indefinido que isso cria é exatamente o que a TASK-1635 resolve. *(Isto substitui a sugestão contrária no texto do card 1634.)*

**Arquivo inválido nunca impede o app de abrir.** `queue.json` corrompido, de versão futura, ou com formato inesperado → começa com fila vazia e segue. Um app que não abre por causa do próprio cache é pior que um app que esqueceu a fila.

## Fronteiras

| Arquivo | Papel |
|---|---|
| `electron/main/queueStore.ts` | **novo** — electron-store `queue.json`, no padrão do `HistoryStore` |
| `shared/queueSnapshot.ts` | **novo** — lógica pura: serializar, normalizar no load, derivar `seq` |
| `electron/main/queue.ts` | carregar no construtor, salvar em transição, `clearDone()` |
| `electron/main/ipc.ts` + `preload` | canais de retomar, limpar concluídos e limpar fila |
| `src/components/QueueList.tsx` | botões "Retomar (N)" e "Limpar concluídos (N)"; estado vazio |
| `src/components/ResetDialog.tsx` | quarta caixa |
| `src/App.tsx` | bloco de últimos downloads na aba Download |

A lógica pura vai para `shared/` pelo motivo já conhecido: o `vitest.config.ts` só coleta `electron/**` e `shared/**`.

---

## Fase 1 — TASK-1634: persistir a fila

### 1.1 `shared/queueSnapshot.ts` (TDD, primeiro)

```ts
export interface QueueSnapshot {
  version: 1
  items: QueueItem[]
  outputDirs: Record<string, string>
  enriched: string[]
}

export function toSnapshot(items, outputDirs, enriched): QueueSnapshot
export function fromSnapshot(raw: unknown): {
  items: QueueItem[]
  outputDirs: Map<string, string>
  enriched: Set<string>
  seq: number
}
export function nextSeq(itemIds: readonly string[]): number
```

`fromSnapshot` faz todo o saneamento: valida a forma, descarta o que não parece `QueueItem`, converte `running` → `queued` com `progress: 0`, e devolve fila vazia diante de qualquer coisa irreconhecível.

Testes: `running` normalizado; `seq` derivado do maior id (`['q3','q10']` → `10`); ids fora do padrão ignorados sem quebrar; round-trip preserva `outputDirs`/`enriched`; `null`, `{}`, `{version:99}` e JSON de outro formato → fila vazia.

### 1.2 `electron/main/queueStore.ts`

Espelha o `HistoryStore`: `new Store({ name: 'queue', defaults: { snapshot: null } })`, com `load()` e `save(snapshot)`.

### 1.3 Integrar no `QueueManager`

- Construtor recebe o store (injetado, para o teste usar um duplo em memória), chama `fromSnapshot` e popula `items`/`outputDirs`/`enriched`/`seq`.
- `persist()` privado, chamado em `enqueue`, `fail`, `retry` e na transição para `done` — **não** em `patch` de progresso. A forma mais simples de garantir: `patch` chama `persist` apenas quando `patch.state !== undefined`.
- `resume()`: re-enfileira no PQueue os itens em `queued` que não estão rodando. É o que o botão "Retomar" aciona.

Teste com store em memória: reiniciar o manager preserva erros; `outputDirs` sobrevive e o retry usa a pasta certa (o ponto da armadilha 2 — verificar via `fetchOptions`); progresso não dispara escrita.

### 1.4 IPC + UI mínima

Canal `queue:resume`; botão **"Retomar (N)"** no cabeçalho da `QueueList` quando houver `queued` parado.

---

## Fase 2 — TASK-1635: limpar concluídos

Só faz sentido depois da Fase 1 — hoje a fila se esvazia sozinha ao fechar.

- `QueueManager.clearDone()`: remove os `done` de `items` **e as entradas correspondentes** em `outputDirs` e `enriched`. Esquecer isso vaza dois mapas indefinidamente — invisível na UI e crescendo no `queue.json`.
- `QueueManager.clearAll()`: zera tudo, para o diálogo de reset.
- Canais `queue:clearDone` e `queue:clear` + preload.
- `QueueList`: botão "Limpar concluídos (N)", visível só quando houver.
- `ResetDialog`: quarta caixa "Fila de downloads". O componente já tem o padrão de três booleanos + `anySelected` + `run()`; é mecânico. O rótulo precisa dizer que limpar a fila **não** apaga histórico nem arquivos — as outras três caixas ali são destrutivas em graus diferentes, e confundir sai caro.

Testes: `clearDone` preserva `queued`/`running`/`error`; não deixa órfãos nos mapas auxiliares; `clearAll` zera os três.

---

## Fase 3 — TASK-1636: estado vazio da aba Download

Independente das outras duas — pode ir primeiro se a prioridade for a percepção.

Hoje `QueueList` retorna `"Fila vazia"` em dois pontos (`QueueList.tsx:31-36`), um para `compact` e outro para a tela cheia. O caso de tela cheia vira: últimos 10 downloads do histórico, mais recentes primeiro, via `api.getHistory` (sem canal novo).

- Bloco visualmente distinto de fila ativa: sem barra de progresso, sem retry, rótulo "Últimos downloads".
- Atalho para a aba Histórico.
- Histórico vazio (instalação nova) → mensagem orientando colar um link, em vez de área em branco.
- `compact` continua com o "Fila vazia" enxuto — ali o espaço é da lista resolvida.

---

## Testes

Puro, por unidade (`shared/queueSnapshot.ts`): normalização, `seq`, round-trip, entradas inválidas.

Integração no `main` (store em memória): sobrevivência dos erros, pasta correta no retry após reinício, ausência de escrita por progresso, `clearDone` sem órfãos.

Validação ao vivo:

1. Enfileirar faixas, forçar um erro (link inválido), fechar e reabrir → o erro está lá e o "↻ Tentar" funciona.
2. Escolher pasta B para uma lista, deixar falhar, reiniciar, retentar → o arquivo cai em **B**, não na pasta padrão.
3. Abrir o app com fila vazia → últimos downloads aparecem, sem barra de progresso.
4. Limpar concluídos → some da fila, permanece no histórico.

## Fora de escopo

- Retomar downloads automaticamente ao abrir (fica atrás de um `resumeOnStartup` futuro).
- Retomada parcial de um arquivo interrompido (byte-range) — o item recomeça do zero.
- Limite automático de tamanho da fila ou expurgo por idade.
- Persistir resultados de busca, lista resolvida ou candidatas extended.
