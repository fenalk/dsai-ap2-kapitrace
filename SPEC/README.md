# Índice de SPECs — KapiTrace

Fonte de requisitos do projeto (SDD). Antes de implementar algo, confira aqui qual SPEC está vigente: um arquivo isolado pode ter trechos substituídos por SPECs posteriores.

Mantido conforme a [SPEC-FDE 005](SPEC-FDE/005-governanca-specs.md). Ao mesclar uma PR que implementa ou altera uma SPEC, atualize o status **no cabeçalho da SPEC e nesta tabela**.

## Status

| Status | Significado |
| --- | --- |
| `backlog` | Arquivo reservado, sem requisitos. **Não é requisito** e não deve ser citado como SPEC relacionada. |
| `proposta` | Requisitos escritos, aguardando aprovação de quem responde pelo repositório. |
| `aprovada` | Aprovada para implementação; código ainda não mesclado. |
| `implementada` | Código mesclado (citar PR ou commits). Pendências declaradas ficam anotadas. |
| `validada` | Implementada e com critérios de aceite conferidos, inclusive os manuais. |
| `substituída` | Todo o conteúdo foi trocado por outra SPEC. Quando só parte foi trocada, o status continua o de origem com a anotação "substituída parcialmente por". |

## SPECs com requisitos

| ID | Arquivo | Status | Issue | Implementação | Precedência |
| --- | --- | --- | --- | --- | --- |
| SPEC-2026-10-01 | [2026-10-01-threat-analyzer.md](2026-10-01-threat-analyzer.md) | implementada | — | `d046996`, `23be8bc` | Substituída parcialmente pelas três SPECs de 2026-10-06 (ver aviso no arquivo) |
| SPEC-2026-10-06-real-api | [2026-10-06-real-api-integration.md](2026-10-06-real-api-integration.md) | implementada | upstream #3 | `8f7c94c`, `da1a7d7`, `798e1d1` | Complementa a 10-01. Trecho sobre SQLite substituído pela SPEC de Supabase |
| SPEC-2026-10-06-auth | [2026-10-06-auth-and-middleware-reactivation.md](2026-10-06-auth-and-middleware-reactivation.md) | implementada | upstream #4 | `45b94f0`, `c8caef2` | Substitui a 10-01 no acesso ao lookup (passa a exigir JWT) |
| SPEC-2026-10-06-supabase | [2026-10-06-supabase-postgresql-migration.md](2026-10-06-supabase-postgresql-migration.md) | implementada | upstream #2 | `5617970`, `f7b6901`, `ab8e372` (upstream PR #8) | Substitui SQLite em todas as SPECs anteriores |
| SPEC-FDE 001 | [SPEC-FDE/001-consulta-indicadores-seguranca.md](SPEC-FDE/001-consulta-indicadores-seguranca.md) | implementada | #2 | PR #13 | Pendentes: decisão D1 e validação manual com chaves reais |
| SPEC-FDE 002 | [SPEC-FDE/002-melhoria-mensagem-erro-login.md](SPEC-FDE/002-melhoria-mensagem-erro-login.md) | proposta | #3 | — | Depende de `ApiError` em `lib/api.ts`, já entregue pela 001 |
| SPEC-FDE 003 | [SPEC-FDE/003-melhoria-preenchimento-cadastro.md](SPEC-FDE/003-melhoria-preenchimento-cadastro.md) | proposta | #4 | — | Depende da 002. Decisões D1–D4 pendentes |
| SPEC-FDE 004 | [SPEC-FDE/2026-11-18-ci-code-review-ia-merge.md](SPEC-FDE/2026-11-18-ci-code-review-ia-merge.md) | implementada | #8 | PRs #9 (SPEC), #10 e #11 | Conferência registrada do Definition of Done (E4, cenários "PR real") pendente |
| SPEC-FDE 005 | [SPEC-FDE/005-governanca-specs.md](SPEC-FDE/005-governanca-specs.md) | aprovada | — | — | Só governança; nenhum requisito muda |

"upstream" é o repositório de origem `hug0mgs/dsai-ap1-kapitrace`. Os demais números são issues/PRs deste repositório.

### Divergências conhecidas (sem SPEC que as resolva)

- **Complexidade de senha no cadastro:** a SPEC-2026-10-01 §4.1 pede maiúsculas, minúsculas, números e caracteres especiais. O código (`auth.controller.ts`, `validatePasswordStrength`) exige só 8 caracteres, e nenhuma SPEC posterior revoga a regra. Relacionada à decisão D4 da SPEC-FDE 003.
- **Modificadores do ThreatScore:** a SPEC-2026-10-01 §3.3 define modificadores aditivos, mas a SPEC real-api §11 os deixa inativos sem evidência estruturada. Na prática, nenhum é ativado hoje.

## Backlog (stubs sem requisitos)

Arquivos criados no scaffolding de 2026-09-30, com status `backlog`: `auth-rbac`, `backend-api-design`, `database-schema`, `deployment-strategy`, `domain-reputation`, `email-reputation`, `external-apis-integration`, `frontend-architecture`, `hash-reputation`, `ip-reputation`, `threat-dashboard`, `visao-geral`, `watchlist-alerts` (todos `2026-09-30-<nome>.md`).

Para trabalhar num desses temas, escreva uma SPEC nova em `SPEC/SPEC-FDE/` (seção abaixo) e marque o stub como `substituída` apontando para ela. Não preencha o stub de 2026-09-30, porque a data do nome não corresponderia à da especificação.

## Como criar uma SPEC nova

- **Local e nome:** `SPEC/SPEC-FDE/NNN-<slug-em-kebab-case>.md`, com `NNN` sequencial (próximo: `006`). A data fica no cabeçalho, não no nome.
- **Ordem:** a SPEC é commitada (e, se possível, mesclada numa PR própria) antes do código que a implementa.
- **Não renomeie SPECs existentes:** trailers `Spec:` já gravados no histórico apontam para os caminhos atuais.

Cabeçalho:

```markdown
# SPEC-FDE NNN — <título>

- **ID:** SPEC-FDE NNN
- **Prioridade:** P0 | P1 | P2
- **Data:** AAAA-MM-DD
- **Status:** proposta
- **Agente:** <ferramenta> (<modelo>)
- **Origem:** <issue, diagnóstico ou pedido>
- **SPECs relacionadas:** <só SPECs com requisitos; nunca stubs de backlog>
- **Substitui:** <SPEC e seções, se houver>
```

Seções esperadas: Contexto, Problema, Resultado esperado, Escopo, Fora do escopo, Decisões pendentes, Critérios de aceite, Dependências, Como validar.

## Trailers dos commits

`Agent:`, `Spec:` e `Co-Authored-By:` ficam **no mesmo parágrafo final**, sem linha em branco entre eles. Se houver linha em branco, o Git não os reconhece como trailers (`git log --format='%(trailers)'` sai vazio).

```text
docs(spec): <resumo>

<corpo>

Agent: Claude-Code-Opus-5.5
Spec: SPEC/SPEC-FDE/NNN-<slug>.md
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

O valor de `Agent:` segue `<Ferramenta>-<Modelo>` sem espaços (ex.: `Claude-Code-Opus-5.5`, `Codex-GPT-6`). Commits só de documentação sem SPEC usam `Spec: none (<motivo>)`.
