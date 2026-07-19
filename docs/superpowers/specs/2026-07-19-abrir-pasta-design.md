# Botão "Abrir pasta" — Design

- **Data:** 2026-07-19
- **Contexto:** app DownMusic (Electron + TS). A pasta de destino fica na config (`outputDir`); hoje só é criada no 1º download.
- **Objetivo:** abrir a pasta de downloads no gerenciador de arquivos do sistema com um clique.

## Comportamento

- Botão **"Abrir pasta"** em dois lugares:
  - **Configuracoes**, ao lado de "Escolher..." (abre a pasta configurada);
  - **Aba Download**, no topo (atalho para ver o que ja baixou).

## Tecnico

- **Main (`ipc.ts`):** handler `shell:openFolder` que:
  1. garante a existencia da pasta (`mkdir -p` da `config.get().outputDir`);
  2. chama `shell.openPath(dir)`.
  Retorna a string de erro do `openPath` (vazia = sucesso).
- **Preload/client:** `api.openFolder(): Promise<string>`.
- **UI:** botao "Abrir pasta" na `SettingsView` (ao lado de "Escolher...") e no topo da aba Download (`App`).

## Bordas

- Pasta inexistente: criada antes de abrir (sempre abre algo).
- `outputDir` vazio: botao desabilitado.
- Falha do `shell.openPath`: mensagem discreta; nao quebra o app.

## Escopo e testes

- Só front-end/IPC; fila e download **inalterados**.
- `shell.openPath` roda no main → **validacao ao vivo** com stub (como no "Escolher..."), confirmando que o handler abre o caminho correto. Suite existente segue verde; typecheck e build OK.
