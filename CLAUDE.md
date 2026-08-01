# CLAUDE.md — DownMusic

Instruções para agentes de IA trabalhando neste repositório.

## Kanban

Este projeto é gerenciado por um kanban externo, fora deste repositório:

- Raiz do kanban: `/home/carlosfarah/KanbanIA`
- Board deste projeto: `projects/downmusic/board/{backlog,todo,in-progress,review,done}/`
- Protocolo canônico: `AGENTS.md` na raiz do kanban (prevalece em caso de conflito)
- README do projeto no kanban: `projects/downmusic/README.md`

Antes de começar: retomar task em `in-progress/`, senão pegar a de maior prioridade em `todo/`. O board é commitado no repo do kanban, nunca aqui.

## Git

- Branch base é **`master`** (não `main`). Branch de código: `git checkout -b task/TASK-NNNN master`.
- Push liberado para `origin` (`github.com/kadufarah1979/DownMusic`); auth pelo `gh` CLI.
- Commits de código seguem o estilo já praticado no repo — Conventional Commits em português (`feat:`, `fix:`, `refactor:`, `chore:`, `ci:`). Quando o trabalho vier de um card, citar o ID no corpo (`Task: TASK-NNNN`), não no título.
- O CI dispara em push para `master` e em PR. Tag `v*` publica os instaladores num Release.

## Comandos

```bash
npm run dev        # app em modo desenvolvimento (yt-dlp/ffmpeg do PATH)
npm run typecheck  # obrigatório antes de fechar qualquer task
npx vitest run <caminho>   # rodar só os testes do módulo alterado
npm test           # suíte completa (pula o smoke)
npm run dist       # AppImage; dist:win / dist:mac para as outras plataformas
```

O smoke test toca rede + binários reais e só roda sob demanda:
`SMOKE=1 YTDLP_BIN="$HOME/.local/bin/yt-dlp" npx vitest run electron/smoke`

Antes de empacotar: `bash scripts/fetch-binaries.sh` (baixa yt-dlp e ffmpeg estáticos para `resources/bin`).

## Fronteiras de arquitetura

- **`shared/`** — lógica pura, sem I/O. É onde vive o que dá para testar por unidade; escrever teste antes (TDD) é o padrão do projeto.
- **`electron/main/`** — I/O, processos, stores. Dependências externas entram por injeção (runner, `HttpClient`, `TagReader`) para permitir teste sem rede nem disco real.
- **`electron/sources/`** — cada fonte implementa a interface `Source` (`matches`/`search`/`resolve`/`fetchAudio`). Adicionar plataforma = novo plugin, sem tocar no resto.
- **`src/`** — renderer React. Sem lógica de negócio; fala com o main só pelo preload tipado.

Não reimplementar o motor `yt-dlp` dentro de um plugin — ele é injetado.

## Decisões do projeto (não reverter sem pedir)

- **Nunca escrever tags de BPM ou tonalidade.** O Rekordbox calcula na importação; o Spotify descontinuou `audio-features` e o Deezer devolve 0. Escrever esses campos conflita com a análise do Rekordbox.
- **Campo Comment fica livre** — DJs usam para cue points. Não poluir com ISRC.
- **Enriquecimento de metadados é best-effort.** Falha de rede ou ausência de match nunca pode quebrar um download: `try/catch` e segue com o meta original.
- **Duplicados vão para quarentena** (`_Duplicados/`), nunca são apagados.
- **Nada é alterado no disco do usuário sem aprovação explícita** na UI (fluxo da aba Organizar: analisar → revisar → plano → prévia → aplicar).
- **Retag usa ffmpeg `-c copy`** (remux, sem reencode) — não degradar o áudio do usuário.

## Limite legal

O caminho defensável do projeto: APIs oficiais **apenas para metadados**, áudio baixado de **fontes públicas** via `yt-dlp`. Não implementar captura de stream com DRM nem decrypt de catálogo licenciado. Qualquer proposta nessa direção é decisão do proprietário, não do agente.

## Documentação

As specs de design ficam em `docs/superpowers/specs/` — são registros datados de decisões, com o raciocínio por trás. Ler a spec relevante antes de mexer numa feature existente. Não reescrever spec antiga para refletir o presente; se o código divergiu, o lugar de corrigir é o README.
