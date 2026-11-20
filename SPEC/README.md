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
| SPEC-FDE 005 | [SPEC-FDE/005-governanca-specs.md](SPEC-FDE/005-governanca-specs.md) | implementada | — | PR #15 | Só governança; nenhum requisito muda |

"upstream" é o repositório de origem `hug0mgs/dsai-ap1-kapitrace`. Os demais números são issues/PRs deste repositório.

### Divergências conhecidas (sem SPEC que as resolva)

- **Complexidade de senha no cadastro:** a SPEC-2026-10-01 §4.1 pede maiúsculas, minúsculas, números e caracteres especiais. O código (`auth.controller.ts`, `validatePasswordStrength`) exige só 8 caracteres, e nenhuma SPEC posterior revoga a regra. Relacionada à decisão D4 da SPEC-FDE 003.
- **Modificadores do ThreatScore:** a SPEC-2026-10-01 §3.3 define modificadores aditivos, mas a SPEC real-api §11 os deixa inativos sem evidência estruturada. Na prática, nenhum é ativado hoje.

## Ordem de implementação

Recomendação de planejamento ([SPEC-FDE 005](SPEC-FDE/005-governanca-specs.md), E5), seguindo a ordem das notas de FDE. Ela **não aprova** SPECs `proposta` nem resolve decisões pendentes. Ao concluir um item, atualize o status na tabela acima e aqui.

Legenda: ✅ concluída · 🔶 em andamento ou com pendência · ⏳ SPEC existe, falta implementar · ✏️ SPEC nova a escrever · ❓ decisão pendente

### Fase 1 — Fazer funcionar (o sistema serve ao cliente)

| Ordem | Item | Estado | Depende de | Observação |
| --- | --- | --- | --- | --- |
| 1.1 | **D1 da SPEC-FDE 001**: fonte `not_configured` conta como parcial? | ❓ | — | Decidir antes do uso real. Com 2 provedores, toda consulta fica em cache só por 5 min e consome a cota do VirusTotal. A opção B altera a SPEC real-api §7, os testes de `lookup-resilience` e a própria 001. |
| 1.2 | **SPEC-FDE 001**: validação manual com chaves reais | 🔶 | 1.1 | Código mesclado (PR #13). Falta executar "Como validar", parte manual, e passar o status para `validada`. |
| 1.3 | **Deploy** (backend, frontend, Supabase, variáveis, CORS, verificação após subir) | ✏️ | 1.2 | Substitui o stub `2026-09-30-deployment-strategy.md`. Antes de escrever, definir onde hospedar. |
| 1.4 | **Limite de tentativas no login** | ✏️ | — | Pendência de segurança da 002. Obrigatório antes de um deploy público: pode ser parte da SPEC de deploy (1.3) ou uma SPEC própria. A enumeração por tempo de resposta pode entrar junto. |

### Fase 2 — Experiência básica

| Ordem | Item | Estado | Depende de | Observação |
| --- | --- | --- | --- | --- |
| 2.1 | **SPEC-FDE 002**: mensagens de erro no login | ⏳ (`proposta`) | aprovação | `ApiError` de `lib/api.ts` já existe (001). Cria as classes de erro reutilizadas pela 003. |
| 2.2 | **SPEC-FDE 003**: preenchimento do cadastro | ⏳ (`proposta`) | 2.1; decisões D1–D4 | Mesmo componente da 002 (`login/page.tsx`): implementar depois dela para evitar conflito. Resolver junto a divergência da regra de senha (D4). |
| 2.3 | **Sessão persistente** (usar `/api/auth/refresh`) | ✏️ ❓ | confirmação do cliente | Hoje recarregar a página faz logout. A sessão só em memória foi uma regra de segurança do cliente: confirmar com ele antes de especificar. |

### Fase 3 — Medir e dar valor

| Ordem | Item | Estado | Depende de | Observação |
| --- | --- | --- | --- | --- |
| 3.1 | **Histórico de consultas** (gravar em `AuditLog`) | ✏️ | Fase 1 | A tabela já existe nas migrations; nenhum código grava nela. Base para relatórios. |
| 3.2 | **Reconsulta agendada da watchlist** | ✏️ | 1.3 (onde o job roda) | Sem job agendado não há alertas. Respeitar as cotas dos provedores. |
| 3.3 | **Alertas da watchlist** | ✏️ | 3.2 | Substitui o stub `2026-09-30-watchlist-alerts.md`. |
| 3.4 | **Relatório das consultas** | ✏️ | 3.1 | — |

### Fase 4 — Qualidade contínua

| Ordem | Item | Estado | Depende de | Observação |
| --- | --- | --- | --- | --- |
| 4.1 | **SPEC-FDE 004**: CI, revisão por IA e merge automatizado | 🔶 | — | Mesclada (PRs #10/#11). Falta registrar a conferência do Definition of Done (E4 e cenários "PR real"). |
| 4.2 | **docker-compose** (banco, backend e frontend com um comando) | ✏️ | — | Não pode alterar as garantias de `scripts/run-tests.mjs`. |
| 4.3 | **Monitoramento e limpeza de cache vencido** | ✏️ | 1.3 | Hoje só existe `/health`, e linhas de cache vencidas nunca são apagadas. |

### Fase 5 — Expansão

Cada item é uma SPEC nova a escrever (✏️), sem ordem obrigatória entre eles:

- **Consulta de email:** substitui `2026-09-30-email-reputation.md`. Precisa de um provedor definido; `EmailCache` já existe.
- **Perfis de acesso (RBAC):** substitui `2026-09-30-auth-rbac.md`. `authorize()` existe, mas nenhuma rota o usa.
- **Gestão de conta:** troca e recuperação de senha, exclusão de conta, revogação de token.
- **Dashboard de ameaças:** substitui `2026-09-30-threat-dashboard.md`. Depende de 3.1.
- **Demais provedores** (Shodan, GreyNoise, URLScan, OTX, IPInfo) e **modificadores do ThreatScore**: o código já existe e falta ativar com evidência. Mudar o score exige atualizar `threat-score.service.ts`, os testes e a SPEC.
- **Integração com SIEM.**

Os stubs que sobram (`backend-api-design`, `database-schema`, `domain-reputation`, `external-apis-integration`, `frontend-architecture`, `hash-reputation`, `ip-reputation`, `visao-geral`) já estão cobertos pelas SPECs de 2026-10-01/2026-10-06 e pela 001. Não há trabalho previsto para eles; podem ser marcados como `substituída` numa revisão futura.

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
