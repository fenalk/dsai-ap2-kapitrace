---
name: registrar-sessao
description: Cria um documento com o diálogo literal da sessão atual do Claude Code em prompts/sessoes/AAAA-MM-DD-HHMM-claude.md. Use quando o usuário pedir para registrar, salvar ou documentar o diálogo/a sessão em prompts/sessoes.
---

# Registrar sessão

Gera `prompts/sessoes/AAAA-MM-DD-HHMM-<ferramenta>.md` a partir do transcript real da sessão
(`~/.claude/projects/<projeto>/<sessão>.jsonl`). O arquivo começa com um cabeçalho e depois
traz as seções `## Usuário` / `## Assistente`:

```markdown
# Diálogo da sessão

- **Assunto:** <assunto principal da sessão>
- **Data:** AAAA-MM-DD
- **Hora:** HH:MM
- **Ferramenta/agente:** Claude Code (<entrypoint>) / <modelo>
- **SPEC:** `SPEC/<arquivo>.md` | nenhuma spec utilizada na sessão
```

- **Data e hora:** a primeira mensagem do usuário, em horário local.
- **Ferramenta e agente:** o entrypoint e o(s) modelo(s) registrados no transcript.
- **Assunto:** por padrão, o título automático da sessão. Costuma ser vago, por isso sempre
  passe `--assunto`.
- **SPEC:** os arquivos de `SPEC/` que foram lidos, criados ou editados por ferramenta na
  sessão. Se não houver nenhum, fica "nenhuma spec utilizada na sessão".

O script mantém apenas o texto das mensagens. Descarta raciocínio interno, chamadas e
resultados de ferramentas e lembretes injetados pelo sistema (AGENTS.md §8).

## Passos

1. Descubra o id da sessão atual: é o UUID que aparece no caminho do scratchpad
   (`/tmp/claude-<uid>/<projeto>/<UUID>/scratchpad`). Se não estiver disponível, omita
   `--session`; o script usa o transcript modificado mais recentemente.
2. Escreva o assunto principal da sessão numa frase curta em português, a partir do que foi
   discutido e feito (ex.: "Criação da skill registrar-sessao"). Se uma SPEC guiou a sessão
   mas não foi aberta por ferramenta, por exemplo porque foi citada pelo usuário, informe-a
   com `--spec`.
3. Na raiz do repositório, rode:

   ```bash
   node .claude/skills/registrar-sessao/export-session.mjs --session <UUID> \
     --assunto "<assunto principal>" [--spec "SPEC/<arquivo>.md"]
   ```

   Outras opções: `--tool <nome>` (padrão `claude`) e `--out <dir>` (padrão `prompts/sessoes`).
   O script nunca sobrescreve: se o arquivo já existir, ele falha.
4. Leia o arquivo gerado e procure JWTs, chaves de API, senhas ou URLs de conexão com
   credenciais. Se encontrar algum, substitua o valor por `[REDACTED]`. Não altere mais nada.
5. Informe ao usuário o caminho do arquivo.

## Restrições

- Não faça commit sem pedido do usuário. Quando ele pedir, siga a convenção do AGENTS.md §8:
  branch `docs/sessao-<assunto>` a partir do `main` e PR própria. Nunca inclua o registro
  numa PR de código.
- Não edite registros que já existem em `prompts/sessoes/`, porque são históricos (AGENTS.md §9).
- A mensagem que pede o registro e a confirmação final não entram no arquivo, pois ainda não
  estavam no transcript quando o script rodou. Isso é esperado.
