# Escolher pasta de download (seletor nativo) — Design

- **Data:** 2026-07-19
- **Contexto:** app DownMusic (Electron + TS). Hoje a pasta de destino e um campo de texto na aba Configuracoes (`SettingsView`), preenchido manualmente.
- **Objetivo:** permitir escolher a pasta via dialogo nativo do sistema, alem de continuar aceitando digitacao manual.

## Comportamento

- Na aba Configuracoes, ao lado do campo "Pasta de destino", um botao **"Escolher..."** abre o dialogo nativo de selecao de pasta.
- O caminho escolhido preenche o campo `outputDir` (estado da tela). O campo segue editavel (digitacao manual continua valendo).
- O salvamento continua no botao "Salvar" existente (persistencia via `electron-store`, como hoje).

## Tecnico

- **Main (`ipc.ts`):** novo handler `dialog:pickFolder` que chama
  `dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath })`,
  usando a pasta atual da config como `defaultPath`. Retorna o caminho (`filePaths[0]`) ou `null` se cancelado.
- **Preload/client (`preload/index.ts`, `src/ipc.ts`):** expoe `pickFolder(): Promise<string | null>`.
- **UI (`SettingsView.tsx`):** botao "Escolher..." → `api.pickFolder()` → se retornar caminho, atualiza o campo `outputDir` no estado (nao salva sozinho).

## Bordas

- Cancelar o dialogo: retorna `null`, nada muda.
- Criacao de pasta: `createDirectory` habilita no macOS; Linux/Windows ja permitem criar no proprio dialogo. A pasta e efetivamente criada no primeiro download (o `Tagger` ja faz `mkdir -p`).

## Escopo e testes

- Mudanca pequena e isolada: 1 handler IPC + 1 metodo no preload/client + 1 botao na UI. Fila, tagger e backend de download **inalterados**.
- `dialog` roda no processo main e nao e testavel por unidade sem Electron → **validacao ao vivo** (padrao do projeto): abrir Configuracoes, clicar "Escolher...", confirmar que o campo recebe um caminho. Suite existente segue verde; typecheck e build OK.
