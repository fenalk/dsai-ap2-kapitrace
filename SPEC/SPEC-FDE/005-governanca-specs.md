# SPEC-FDE 005 — Governança das SPECs (índice, status e precedência)

- **ID:** SPEC-FDE 005
- **Prioridade:** P1
- **Data:** 2026-11-19
- **Status:** aprovada (pedido explícito da responsável pelo repositório, sessão de 2026-11-19)
- **Agente:** Claude Code (Claude Opus 5.5)
- **Origem:** revisão do repositório em 2026-11-19, que mostrou SPECs sem status confiável, sem índice e sem registro de precedência
- **SPECs relacionadas:** todas as SPECs de `SPEC/` e `SPEC/SPEC-FDE/`

## Contexto

O projeto é guiado por SPEC (`AGENTS.md`, seção 8), mas os arquivos de `SPEC/` não deixam claro o que está vigente:

- 13 arquivos `SPEC/2026-09-30-*.md` são stubs ("Details will be added here"). Mesmo assim, a SPEC-FDE 003 e a SPEC de CI citam stubs como "SPECs relacionadas".
- Os status estão desatualizados: `2026-10-06-real-api-integration.md` diz "implementação pendente", mas foi implementada em outubro. A SPEC-FDE 001 diz "pendente de aprovação", mas foi mesclada na PR #13 (issue #2 fechada).
- Não há registro de precedência: `2026-10-01-threat-analyzer.md` ainda descreve SQLite, lookup sem autenticação e um formato de resposta que as SPECs de 2026-10-06 substituíram.
- Nomes e cabeçalhos variam entre as levas. A SPEC de CI (`SPEC/SPEC-FDE/2026-11-18-ci-code-review-ia-merge.md`) não tem número, ao contrário das 001–003.
- `AGENTS.md` diz que não há workflow de CI (existe desde a PR #10), não lista `.github/`, `SPEC/SPEC-FDE/` e `FDE/`, e não diz onde criar uma SPEC nova nem como atualizar o status dela.
- Nos commits de novembro, `Agent:`/`Spec:` ficam num parágrafo separado do `Co-Authored-By:` por uma linha em branco. O Git só reconhece trailers no último parágrafo, então `git log --format='%(trailers)'` não os encontra. O CI aceita porque usa uma regex própria.

## Escopo

**E1 — Índice e template (`SPEC/README.md`):**
- Tabela com ID, arquivo, status, issue, PRs/commits de implementação e relações de precedência de cada SPEC.
- Vocabulário fixo de status: `backlog`, `proposta`, `aprovada`, `implementada`, `validada`, `substituída`.
- Template de cabeçalho para SPECs novas, regra de local e nome dos arquivos e formato dos trailers.

**E2 — Status e precedência das SPECs existentes:**
- Acrescentar ou atualizar o status no cabeçalho de cada SPEC com requisitos, com a evidência (PR ou commit).
- Acrescentar avisos de "substituída parcialmente por" em `2026-10-01-threat-analyzer.md` e `2026-10-06-real-api-integration.md`, sem reescrever o corpo.
- Dar à SPEC de CI o ID "SPEC-FDE 004" no cabeçalho e no índice. **Os arquivos não são renomeados**, porque trailers `Spec:` já gravados apontam para os caminhos atuais.

**E3 — Stubs:**
- Marcar os 13 stubs como `backlog` no próprio arquivo, com instrução de não usá-los como requisito.
- Remover as citações a stubs das "SPECs relacionadas" da SPEC-FDE 003 e da SPEC-FDE 004.

**E4 — `AGENTS.md`:**
- §3: incluir `.github/`, `.claude/skills/`, `FDE/`, `SPEC/README.md`, `SPEC/SPEC-FDE/` e `lib/lookup-messages.ts`.
- §8: dizer onde criar SPECs, apontar para o template, exigir atualizar status e índice após o merge, fixar o formato dos trailers (mesmo bloco final que o `Co-Authored-By:`, valor de `Agent:` padronizado) e esclarecer quando um registro de sessão é criado.
- §10: corrigir a afirmação sobre CI e a referência ao stub `visao-geral`.

## Fora do escopo

- Alterar requisitos, critérios de aceite ou decisões pendentes de qualquer SPEC. Só cabeçalhos e avisos de status ou precedência mudam.
- Renomear ou mover SPECs, preencher stubs ou criar SPECs de funcionalidade.
- Reescrever o histórico de commits, mudar a regex de trailers do CI ou editar o `README.md` da raiz, `FDE/`, `prompts/sessoes/` e `metrics/`.
- Prioridades das SPEC-FDE 002/003 e atualização da seção de dependências delas.
- Abrir issues para as decisões pendentes, limpar branches e reorganizar os SVGs da raiz.

## Critérios de aceite

- **CA1:** `SPEC/README.md` lista todas as SPECs de `SPEC/` e `SPEC/SPEC-FDE/`, cada uma com um status do vocabulário de E1.
- **CA2:** cada SPEC com requisitos tem no cabeçalho um status igual ao do índice.
- **CA3:** `2026-10-01-threat-analyzer.md` e `2026-10-06-real-api-integration.md` indicam quais seções foram substituídas e por qual SPEC.
- **CA4:** nenhum stub é citado como "SPEC relacionada" (`grep -rn "2026-09-30" SPEC/SPEC-FDE` só encontra menções que deixam claro que se trata de backlog).
- **CA5:** `AGENTS.md` não afirma mais que falta CI e descreve onde criar SPECs e o formato dos trailers.
- **CA6:** os commits desta entrega têm `Agent:`, `Spec:` e `Co-Authored-By:` no mesmo parágrafo final, e `git log --format='%(trailers:key=Spec)'` os encontra.
- **CA7:** `npm run check:secrets` passa. Nenhum arquivo de `src/`, `tests/`, `scripts/` ou `.github/` é alterado.

## Como validar

1. `npm run check:secrets`
2. `git diff --stat main...` mostra apenas `SPEC/**` e `AGENTS.md`.
3. `grep -rn "2026-09-30" SPEC/SPEC-FDE` (CA4).
4. `git log main.. --format='%h %(trailers:key=Agent,key=Spec,separator=; )'` (CA6).
