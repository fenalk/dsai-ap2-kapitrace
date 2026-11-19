# AGENTS.md — KapiTrace

Instruções para agentes que trabalham neste repositório. Baseado apenas no conteúdo atual do projeto.

## 1. Visão geral

KapiTrace é uma plataforma acadêmica (UFPA DSAI) de **threat intelligence**: consulta IPs, domínios e hashes em 7 provedores externos (AbuseIPDB, VirusTotal, IPInfo, Shodan, GreyNoise, URLScan, AlienVault OTX), normaliza a evidência e calcula um **ThreatScore** unificado (0–100) com cache em PostgreSQL.

Princípios explícitos na SPEC e no código — não os quebre:
- **Não fabricar reputação**: sem métrica válida o score é `null`, nunca `0`; sem fontes e sem cache → HTTP 503.
- Email segue no escopo do produto (modelo `EmailCache`, `itemType: 'email'` na watchlist) mas **a integração não existe** (UI mostra "integração ainda indisponível").
- A API de lookup é **somente leitura de dados existentes**: não há upload, submissão de URLs ou varredura ativa.

## 2. Tecnologias

- Node.js **≥22** (raiz declara `engines`); TypeScript em todo o código.
- Backend: Express 5, Prisma **5.22**, `jsonwebtoken` (HS256), `bcrypt`, `helmet`, `cors`, `morgan`; `tsx watch` em dev.
- Frontend: Next.js **16** (App Router) + React 19, CSS vanilla (`globals.css`), ESLint flat config com `eslint-config-next`.
- Banco: PostgreSQL 16 (Supabase em `stagging`); cache JSON serializado em `text`.
- Testes: `node:test` + `node:assert`, runner próprio em `scripts/`. **Sem Jest, Playwright ou Selenium.**

## 3. Estrutura

```
package.json              # fachada: delega testes ao backend e roda check:secrets
scripts/
  run-tests.mjs           # orquestra Docker PostgreSQL 16 + Prisma generate + node --test
  database.mjs            # wrapper Prisma (validate/deploy/baseline/check) com erros sanitizados
  database-schema.mjs     # introspecção: tabelas esperadas, RLS, FKs, histórico de migrations
  check-secrets.mjs       # varre conteúdo do Git por segredos/.env
src/backend/src/
  server.ts               # ENTRYPOINT: carrega .env via loadEnvFile, valida config, requer app
  app.ts                  # monta rotas /api/{auth,lookup,watchlist} e /health
  modules/auth/           # register, login, refresh (JWT)
  modules/lookup/         # cache + orquestração + cache stale
  modules/intelligence/   # chamadas HTTP nativas e normalização por provedor
  modules/threat-analyzer/# validadores RFC + função pura calculate_threat_score
  modules/watchlist/      # CRUD por usuário
  middleware/             # authenticate/authorize, rate limit de lookup
  shared/                 # config (env validado), prisma (singleton)
src/backend/prisma/       # schema + 3 migrations (estrutura, RLS, histórico privado)
src/frontend/src/
  app/{login,lookup,dashboard,layout,page}.tsx   # páginas client-side
  lib/session.ts          # token JWT só em memória
  lib/api.ts              # fetch + injeção de Bearer + tratamento de 401
  components/             # RequireSession, Sidebar, Topbar
tests/{unit,integration,e2e}/ + test-helper.ts, postgres-helper.ts, http-fixtures.ts
SPEC/                     # especificações datadas (fonte de requisitos)
prompts/sessoes/          # prompts literais e logs brutos de execução
metrics/                  # relatórios cloc
```

## 4. Arquitetura

Fluxo de um lookup:
1. `router.use(authenticate)` → `limitLookup` (30 req/min por IP, janela fixa, por processo).
2. `lookup.controller.lookupIndicator`: valida/normaliza via `normalizeIndicator` (400 antes de cache/provedores; IPs privados/reservados rejeitados com "Only public IP addresses can be queried").
3. Single-flight em memória (`pending`, máx. 128) → `performLookup`.
4. Cache HIT (TTL 24h completo / 5min parcial) → `source: 'cache'`; senão `collectIntelligence`.
5. `collectIntelligence` dispara os 7 provedores em paralelo com `AbortController` (deadline 10s; 5s por fonte; 1 retry só em rede/502/503/504) e normaliza só evidência documentada.
6. `calculate_threat_score` (função pura): pesos 0.35/0.40/0.15/0.10, renormalizados apenas sobre métricas disponíveis; para `domain`/`hash` só `maliciousDetectionsRatio` é aplicável; modificadores ±só via flags; clamp `[0,100]`; `confidencePercentage` = cobertura de evidência.
7. Falha de avaliação: aceita último cache real até 48h como `stale: true` sem renovar coleta.
8. Persistência: upsert em `IpCache`/`DomainCache`/`HashCache`; `VERSION = 'real-api-v1'` invalida caches antigos.

Frontend: sessão em memória (`lib/session.ts` é `'use client'`), `RequireSession` redireciona sem sessão, `api()` injeta Bearer em `/api/lookup*`, `/api/watchlist*` e `/api/auth/refresh`, limpa a sessão só em 401 (não em rede/429/5xx).

Constraints de conexão: Supabase exige `sslmode=require`; `DATABASE_URL` no pooler 6543 precisa de `pgbouncer=true`; `DIRECT_URL` em sessão/direta (5432). Migrations habilitam RLS e revogam `PUBLIC`/`anon`/`authenticated`, inclusive em `_prisma_migrations` — o backend usa um role owner/BYPASSRLS.

## 5. Execução

```bash
# Backend
cd src/backend && cp .env.example .env   # preencher JWT_SECRET (>=32 chars), DATABASE_URL, DIRECT_URL
npm install                               # postinstall roda prisma generate
npm run db:validate && npm run db:deploy && npm run db:check
npm run dev                               # tsx watch, porta 4000

# Frontend
cd src/frontend && cp .env.example .env.local  # NEXT_PUBLIC_API_BASE_URL
npm install && npm run dev                     # porta 3000
```

- `server.ts` carrega `src/backend/.env` **antes** de importar `app.ts` (Prisma inicializa no import) — preserve essa ordem.
- Config inválida falha rápido e sem imprimir valores (`shared/config.ts`). Chaves de provedor vazias = `not_configured`, não erro.
- Se as 7 tabelas já existirem (criadas via SQL Editor), rodar `db:baseline` antes de `db:deploy`.

## 6. Testes

```bash
npm run check:secrets      # scanner no conteúdo rastreado/staged
npm run test:unit          # não exige Docker
npm run test:integration   # exige Docker OU TEST_DATABASE_URL
npm run test:e2e           # exige Docker + Chrome; CHROME_BIN=/usr/bin/google-chrome
npm test                   # unit + integration + e2e
npm --prefix src/backend run build
npm --prefix src/frontend run lint && npm --prefix src/frontend run build
```

- `scripts/run-tests.mjs` sobe `postgres:16` descartável em loopback, cria os roles `anon`/`authenticated` e passa `TEST_DATABASE_URL`. Pode receber `unit|integration|e2e|all`.
- **`TEST_DATABASE_URL` em host remoto precisa terminar em `_test`; hosts Supabase são recusados.** Testes nunca usam `DATABASE_URL` de produção.
- Cada processo roda em schema próprio (`kapitrace_test_<uuid>`) já com as migrations reais; `test-helper.ts` faz `installHttpFixtures()` **antes** de importar `app`.
- Fronteira HTTP externa é a única interceptada (`tests/http-fixtures.ts`): qualquer host não mockado e não-loopback **lança erro**. Adicione novos provedores ali, nunca desative a interceptação.
- Lookup protegido nos testes autentica de verdade com `loginTestUser(server)` + `withBearer`; `server.fetch` continua anônimo para provar 401.
- E2E sobe `next dev --webpack` e Chrome via CDP/WebSocket puro; `CHROME_BIN` ou `/usr/bin/google-chrome`. Roda com timeout de 180s.

## 7. Padrões de código

- Nomes: funções de domínio em `snake_case` (`calculate_threat_score`), demais funções/variáveis em `camelCase`; arquivos `kebab-case.ts`/`.tsx`, módulos com sufixo `.route.ts`, `.controller.ts`, `.service.ts`.
- Erros HTTP no formato `{ error: "..." }` (lookup com validação usa `{ error: "Validation Error", message }`); nunca vazar token, URL de conexão ou erro bruto de Prisma (ver wrappers em `scripts/`).
- Tudo em TypeScript `strict`; helpers de leitura de payload externo tratam `unknown` (`record()`, `finite()`, `text()` em `intelligence.service.ts`) — não confie em tipos do provedor.
- Comentários e mensagens de UI/README em **português**; comentários de código e identificadores em inglês.
- Frontend usa `@/` para `src/`; páginas são `'use client'`; dados de teste expostos via `data-testid`.

## 8. Regras para agentes

- **Trabalhe guiado por SPEC**: mudanças de comportamento exigem uma SPEC em `SPEC/` (data + escopo) commitada antes do código, como no histórico.
- Commits usam Conventional Commits com trailers `Agent:` e `Spec:` (ver `SPEC/2026-10-06-*`).
- Rode `npm run check:secrets` antes de commitar; nunca imprime valores.
- Registre prompt literal e logs brutos em `prompts/sessoes/` quando a SPEC pedir; não registre JWTs, credenciais ou raciocínio interno.
- **Registros de sessão não entram em PRs de código.** Depois de abrir a PR da SPEC, crie a branch `docs/sessao-<assunto>` a partir do `main`, faça o commit `docs(sessao): registrar sessao de <assunto>` com os trailers `Agent:` e `Spec:` e abra uma PR própria, citando a PR de código na descrição. A PR de registro passa pelo mesmo CI; não envie registros por push direto ao `main`.
- Até essa PR, o registro fica local e não rastreado: não o inclua no `git add` de outras mudanças. Antes do commit, confira que o arquivo não contém JWTs, chaves, senhas ou URLs de conexão com credenciais.
- Sem novas dependências sem justificativa: o projeto tem uma linha consistente de resolver com primitivas nativas (`fetch`, `AbortController`, `node:test`, CDP próprio).
- Ao mudar números do ThreatScore ou status de fonte, atualize `threat-score.service.ts`, testes unitários e SPEC correspondente; o motor deve continuar **puro** (sem I/O).
- Alterações de schema exigem nova migration em `src/backend/prisma/migrations/` (nunca `db push`/reset) e, se afetar tabelas/constraints, também `scripts/database-schema.mjs`.
- Se mexer em `src/frontend`, leia antes `src/frontend/AGENTS.md`: confirma que a versão do Next.js tem mudanças incompatíveis com o conhecimento padrão e que o bloco de regras é gerado por `next dev` (não remova do diff).
- Atualize `README.md` quando comportamento/contrato mudar (o README é referência de execução) e `metrics/` se a SPEC pedir.

## 9. Restrições (não alterar sem autorização)

- `src/frontend/AGENTS.md` (bloco gerado por `next dev`) e `src/frontend/CLAUDE.md`.
- `src/backend/.claude/`, `src/backend/.cursor/`, `src/backend/.agents/`, `src/backend/.devin/` (skills Prisma).
- `src/backend/prisma/migrations/**` já aplicadas e `metrics/cloc-*.txt` (evidências geradas).
- `prompts/sessoes/*.log` são saídas brutas (ver `.gitattributes`): não reformate espaços/quebras. `.md`/`.txt` em `prompts/sessoes/` são registros históricos de sessões — não os reescreva.
- Qualquer `.env*` exceto `.env.example`; nunca preencha credenciais em exemplos.
- `README.md`, `SPEC/`, `.gitignore` e scripts de banco/teste: mudanças só com pedido explícito, elas documentam ou executam garantias de segurança.

## 10. Pontos de atenção

- `README.md` está defasado em detalhes: cita "Next.js 15 App Router" (o `package.json` usa Next 16), mostra a árvore sem `intelligence/`, `middleware/lookup-limit.ts`, `shared/config.ts`, `scripts/` e `tests/*.ts` auxiliares. Confie no `package.json` e no código.
- `SPEC/2026-09-30-visao-geral.md` é apenas um stub ("Details will be added here"); os requisitos efetivos estão em `2026-10-01` e `2026-10-06`.
- Config de deploy (Vercel/Supabase) não está versionada no repo: o README fala em dois projetos, mas não há `vercel.json` nem workflow de CI.
- `AuditLog` existe no schema (e é criado nas migrations) mas **nenhum código grava nele**.
- `authorize()` (RBAC) existe, porém **nenhuma rota usa**: só `authenticate` é aplicado. `EmailCache` também não é lido/escrito por nenhum controller.
- Limite de requisições, cooldown e single-flight são **por processo**: múltiplas instâncias não coordenam estado (README reconhece).
- Middleware é stateless: excluir usuário não revoga token já emitido (até 24h).
- A sessão vive só em memória: recarregar a página ou fechar a aba exige novo login; `src/frontend/src/app/page.tsx` é a landing e não consulta a sessão.
- `postgresql.test.ts` e demais testes referenciam `src/backend/node_modules/@prisma/client` diretamente — rode `npm install` no backend antes de qualquer suíte (o runner já executa `prisma generate`).
- `dotenv`, `node-cache` e `nodemon` estão em `src/backend/package.json` mas não são importados no código: env é carregado por `loadEnvFile` e o cache é `Map` em memória. São resíduos históricos — não os use como base para novas funcionalidades.
