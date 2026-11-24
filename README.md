# 🛡️ KapiTrace — Threat Intelligence & IP Reputation

> **Por que este repositório?** Escolhi o KapiTrace para aprofundar meus conhecimentos em cibersegurança, aprendendo na prática a coletar, normalizar e avaliar evidências de ameaças por meio de fontes reais de reputação de IPs, domínios e hashes.

🔗 **Link**: https://dsai-ap1-kapitrace.vercel.app/

> Plataforma de inteligência de ameaças e verificação de reputação de IPs, domínios e hashes. A integração de emails ainda não está disponível.
> Consulta **7 serviços externos**, conforme as chaves e o plano configurados, para produzir um **score de reputação unificado**. Sem evidência disponível, informa dados insuficientes; não fabrica reputação.

---

## 🤖 Ferramentas e Modelos de IA Utilizados

| Ferramenta / Plataforma | Modelo | Função no Projeto |
| ----------------------- | ------ | ----------------- |
| **Codex** | **GPT-6** | SPEC datada, migração de mocks para HTTP nativo, resiliência/cache, segurança, autenticação Bearer/JWT, migração Supabase/PostgreSQL e testes nativos de banco/interface |
| **Antigravity IDE**     | **Gemini 3.8 Flash** | Especificação Formal (SDD), Arquitetura de Software, Implementação do Motor de ThreatScore, Validadores RFC e Automação da Suíte de Testes (Unit, Integration, E2E) |
| **Claude Code**         | Claude 3.5 Sonnet | Prototipação e Scaffolding Inicial |
| **Devin AI**            | Devin Engine | Configurações de Ambiente e Integração Contínua |

---

## 🚀 Stack Tecnológica

| Camada         | Tecnologia                                   |
| -------------- | -------------------------------------------- |
| **Frontend**   | Next.js 16 (React 19) + TypeScript           |
| **Estilização**| Vanilla CSS — Dark Mode Cybersec Theme       |
| **Backend**    | Node.js + Express.js + TypeScript            |
| **Banco**      | PostgreSQL + Prisma ORM (Supabase)                   |
| **Auth**       | JWT + bcrypt + RBAC (admin/analyst/viewer)    |
| **Cache**      | Database-layer cache com TTL (Prisma)        |

## 📡 APIs Integradas

| API              | Dados                         | Cotas |
| ---------------- | ----------------------------- | ------------ |
| AbuseIPDB        | IP reputation, abuse reports  | Conforme plano/conta |
| VirusTotal       | IP, domain, hash analysis     | Conforme plano/conta |
| IPInfo           | Geolocalização, ASN, ISP      | Conforme plano/conta |
| Shodan           | Portas abertas, vulns         | Conforme plano/conta |
| GreyNoise        | IP classification             | Conforme plano/conta |
| URLScan.io       | Domain/URL scanning           | Conforme plano/conta |
| AlienVault OTX   | Threat feeds, IOCs            | Conforme plano/conta |

## 📁 Estrutura do Monorepo

```
dsai-ap1-KapiTrace/
├── README.md
├── TASKS.md
├── plano_ap1_ciberseguranca.md
├── .gitignore
│
├── SPEC/                        # Especificações técnicas e SDD
│   ├── 2026-10-01-threat-analyzer.md
│   ├── 2026-10-06-real-api-integration.md
│   ├── 2026-10-06-auth-and-middleware-reactivation.md
│   └── 2026-10-06-supabase-postgresql-migration.md
│
├── src/
│   ├── frontend/                # Next.js 16 App Router (React 19)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── page.tsx         # Landing com busca inicial
│   │       │   ├── login/page.tsx   # Entrar / Criar conta (abas)
│   │       │   ├── (app)/           # Shell autenticado (sidebar, gaveta no celular)
│   │       │   │   ├── lookup/      # Consulta (/lookup)
│   │       │   │   └── dashboard/   # Watchlist (/dashboard)
│   │       │   └── globals.css      # Tokens e design system
│   │       ├── components/
│   │       │   ├── AppShell.tsx, UserMenu.tsx, RequireSession.tsx
│   │       │   ├── lookup/          # Medidor, cobertura, fontes, skeleton, copiar
│   │       │   └── ui/              # Botão, campo, card, badge, alerta, toast, abas, ícones
│   │       └── lib/                 # Regras puras testáveis + sessão/API em memória
│   │
│   └── backend/                 # Express.js API
│       ├── src/
│       │   ├── server.ts
│       │   ├── middleware/auth.ts
│       │   ├── modules/
│       │   │   ├── auth/            # Register + Login (JWT)
│       │   │   ├── lookup/          # IP, Domain & Hash lookup com cache
│       │   │   ├── watchlist/       # CRUD watchlist
│       │   │   └── threat-analyzer/ # Motor de ThreatScore e validadores estritos
│       │   └── shared/prisma.ts
│       └── prisma/schema.prisma
│
├── tests/
│   ├── unit/                    # Testes unitários do ThreatScore e validadores
│   ├── integration/             # Testes de integração de Auth, Lookup com Cache e Watchlist
│   └── e2e/                     # Testes E2E de fluxos completos
└── prompts/
    └── sessoes/                 # Logs de sessões e prompts brutos
```

## ⚡ Como Rodar

### Backend
```bash
cd src/backend
cp .env.example .env   # Preencha JWT_SECRET, DATABASE_URL e as chaves desejadas
npm install
npm run db:generate    # Gera o cliente Prisma PostgreSQL
npm run db:validate    # Valida schema e configuração
npm run db:deploy      # Aplica migrations versionadas no Supabase
npm run db:check       # Verifica conexão, estrutura e permissões
npm run dev            # Dev server com hot-reload (tsx watch)
```

### Frontend
```bash
cd src/frontend
cp .env.example .env.local # NEXT_PUBLIC_API_BASE_URL
npm install
npm run dev            # http://localhost:3000 (outra porta: npm run dev -- --port 3001)
```

### Telas e percurso do frontend

Especificação: [SPEC-FDE 006](SPEC/SPEC-FDE/2026-11-24-experiencia-frontend.md). O percurso completo funciona no desktop e no celular: landing → cadastro/login → consulta → resultado → watchlist → nova consulta → sair.

| Tela | O que oferece |
| --- | --- |
| `/` | Busca inicial: leva a `/lookup?type=…&q=…`; sem sessão, passa pelo login e volta com o indicador. Mostra "Entrar" ou "Ir para consultas" conforme a sessão. |
| `/login` | Abas "Entrar" / "Criar conta", mostrar/ocultar senha. Após entrar, vai ao destino `next` (somente caminhos internos) ou a `/lookup`. Avisos de "Você saiu" e "Sua sessão expirou". |
| `/lookup` | Campo único com detecção do tipo (IP, domínio, hash), editável. Aceita indicadores "defanged" (`8.8.8[.]8`, `hxxps://…`) e URLs, mostrando "Consultando como: …". Skeleton durante a consulta (até 10 s) e contagem regressiva com `Retry-After`. Resultado com medidor do ThreatScore por faixa (Baixo, Suspeito, Alto, Crítico), cobertura de evidências ("—" sem análise), origem e datas legíveis, fontes agrupadas por estado, avisos de parcial/antigo, copiar e "Na watchlist". Últimas 8 consultas da sessão como atalho. |
| `/dashboard` | Watchlist em tabela (desktop) ou cards (celular), filtro por tipo, busca, "Consultar" e remoção com "Desfazer" por 6 s. |

Layout: sidebar fixa a partir de 1024 px, recolhida só com ícones entre 768 e 1023 px, e gaveta com botão de menu abaixo de 768 px (fecha com Esc, clique fora ou ao navegar). Sem rolagem horizontal em 360, 390, 768 e 1280 px.

Acessibilidade: navegação completa por teclado com foco visível, link "Pular para o conteúdo", ícones SVG ocultos de leitores de tela, abas e radios com papéis ARIA, foco movido para o resultado ou para o erro ao fim da consulta, toasts com `role="status"` e erros com `role="alert"`. Animações desligadas com `prefers-reduced-motion`.

Sessão e dados: o token e as consultas recentes vivem só em memória (nada em `localStorage`/`sessionStorage`); recarregar a página exige novo login. A normalização de indicadores é só no frontend; a validação continua no backend. Email segue como "integração ainda indisponível".

### Configuração segura e chamadas externas

Requer **Node.js 22+**. O backend usa o carregador de `.env` nativo do Node, `fetch`, `AbortController`, `URL` e primitivas próprias de retry/cooldown; nenhuma nova biblioteca foi adicionada. Express, Prisma, React/Next e as bibliotecas de Auth existentes continuam na arquitetura.

Preencha localmente `src/backend/.env` a partir de [`.env.example`](src/backend/.env.example). Gere seu `JWT_SECRET` localmente:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

| Serviço | Variável privada no backend | Documentação |
| --- | --- | --- |
| AbuseIPDB | `ABUSEIPDB_API_KEY` | [API v2](https://docs.abuseipdb.com/) |
| VirusTotal | `VIRUSTOTAL_API_KEY` | [API v3](https://docs.virustotal.com/reference/overview) |
| Shodan | `SHODAN_API_KEY` | [API](https://developer.shodan.io/api) |
| GreyNoise | `GREYNOISE_API_KEY` | [Community](https://docs.greynoise.io/docs/using-the-greynoise-community-api) |
| AlienVault OTX | `OTX_API_KEY` | [API](https://otx.alienvault.com/api) |
| URLScan.io | `URLSCAN_API_KEY` | [API](https://urlscan.io/docs/api/) |
| IPInfo | `IPINFO_TOKEN` | [Legacy/API e planos](https://ipinfo.io/developers) |

Chaves vazias desabilitam a fonte com estado explícito. IPInfo usa o endpoint legado `ipinfo.io/{ip}/json`; confirme a compatibilidade do seu plano. GreyNoise Community consulta somente IPv4. OTX e URLScan enriquecem contexto; pulsos e resultados de busca não comprovam C2/phishing. Não há upload, submissão de URLs ou varredura ativa. Consultas podem integrar os indicadores ao conjunto de dados do fornecedor; use apenas indicadores autorizados para compartilhamento.

Somente a URL do backend fica em `NEXT_PUBLIC_API_BASE_URL`. Todas as variantes `.env.*` estão ignoradas, com exceção dos exemplos sem segredos. Não coloque credenciais no frontend, Git ou registros de sessão. `npm run check:secrets` verifica conteúdo no Git por arquivos de ambiente proibidos e padrões conhecidos de segredos; é uma barreira adicional, não um detector universal. JWT precisa de pelo menos 32 caracteres; cadastro público não concede `admin`.

**Ativando AbuseIPDB e VirusTotal** ([SPEC-FDE 001](SPEC/SPEC-FDE/2026-11-18-consulta-indicadores-seguranca.md)):

1. Local: preencha só `ABUSEIPDB_API_KEY` e `VIRUSTOTAL_API_KEY` em `src/backend/.env` e reinicie o backend. O log de inicialização mostra apenas os **nomes** das fontes habilitadas, por exemplo `Threat intelligence providers configured: ABUSEIPDB, VIRUSTOTAL` (nunca valores).
2. Produção: cadastre as mesmas variáveis como variáveis de ambiente do **host do backend** (painel do provedor de hospedagem), nunca no projeto do frontend nem em `NEXT_PUBLIC_*`. Reimplante o backend e confira o mesmo log.
3. Ajuste `ABUSEIPDB_MIN_INTERVAL_MS` e `VIRUSTOTAL_MIN_INTERVAL_MS` à cota real das contas. Referência pública: AbuseIPDB gratuito ≈ 1.000 checks/dia; VirusTotal Public API ≈ 4 req/min e 500 req/dia, **sem uso comercial** (padrão do projeto: 15 s entre chamadas ao VirusTotal). Confirme no painel de cada conta.

Com só esses dois provedores, AbuseIPDB cobre IP; domínio e hash dependem apenas do VirusTotal. A tela `/lookup` mostra o status de cada fonte (consultada, não configurada, não aplicável, com falha) e, quando nenhuma fonte responde (HTTP 503), explica a causa em português, incluindo o tempo de `Retry-After` no caso de limite de consultas. O backend expõe `Retry-After` via CORS para essa mensagem.

Timeout por fonte: 5s; deadline total: 10s; no máximo um retry para rede/502/503/504. 429 e 503 ativam cooldown conforme `Retry-After`. Intervalos por fornecedor e capacidade global são configuráveis no exemplo; ajuste às cotas da sua conta. O Lookup autenticado limita 30 consultas/minuto por IP, após validar o JWT. Limites e single-flight são locais a cada processo; múltiplas instâncias exigem coordenação compartilhada.

### Supabase/PostgreSQL

A migração está na branch **`stagging`**. O backend mantém Prisma **5.22**, Auth JWT/bcrypt e os mesmos models; não usa Supabase Auth ou SDK e nenhuma biblioteca Node nova foi adicionada. IDs permanecem `text`; os payloads de cache permanecem JSON serializado em `text`.

No painel Supabase, clique em **Connect → Connection String → URI** e copie as conexões para `src/backend/.env` local:

- `DATABASE_URL`: Transaction Pooler (6543), com `pgbouncer=true` e `sslmode=require`.
- `DIRECT_URL`: Session Pooler (5432), ou conexão direta acessível, com `sslmode=require`, para migrations.

Use host/usuário exatos do painel e senha do banco codificada para URL; a publishable/anon key não é a senha PostgreSQL. Campos no exemplo ficam vazios. Cadastre as URLs somente no projeto **backend** da Vercel, junto ao `JWT_SECRET` e às chaves privadas. O frontend precisa somente de `NEXT_PUBLIC_API_BASE_URL` para falar com nossa API. O runtime não possui fallback SQLite e reutiliza Prisma Client por processo.

Para um banco novo:

```bash
npm --prefix src/backend run db:generate
npm --prefix src/backend run db:validate
npm --prefix src/backend run db:deploy
npm --prefix src/backend run db:check
```

Se as **sete tabelas já foram criadas pelo SQL Editor**, o deploy recusa criar novamente antes do baseline. Revise o schema e então use:

```bash
npm --prefix src/backend run db:baseline
npm --prefix src/backend run db:deploy
npm --prefix src/backend run db:check
```

O baseline confere colunas/tipos/nullabilidade, PKs, email único e FKs e registra somente a migration inicial como aplicada. A migration de segurança continua sendo executada pelo deploy. Se houver tabelas incompletas/incompatíveis, o baseline falha; não apaga nem recria dados. Migrations em `src/backend/prisma/migrations/` criam a estrutura, habilitam RLS e revogam acesso de PUBLIC/anon/authenticated, incluindo `_prisma_migrations` para que o histórico/logs do Prisma não fiquem expostos pela Data API. O backend precisa de um role PostgreSQL autorizado a acessar as tabelas e a passar RLS (owner/BYPASSRLS); o JWT do projeto não autentica a Data API Supabase. Os wrappers administrativos não imprimem URLs ou erros brutos de conexão.

Dados do SQLite **não são copiados automaticamente**. O arquivo antigo pode ser mantido para exportação/migração de dados em trabalho separado. Git push publica código no GitHub; aplicar alterações no Supabase depende de `db:deploy` com uma conexão configurada. Depois, cadastro/login/watchlist feitos pela interface usam PostgreSQL.

Documentação: [Prisma no Supabase](https://supabase.com/docs/guides/database/prisma), [Transaction Pooler e prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL).

### Score e cache real

`GET /api/lookup/{ip|domain|hash}/{indicador}` exige `Authorization: Bearer <token>` e aceita IPv4/IPv6 públicos, MD5/SHA-1/SHA-256 e domínios normalizados. Sem token válido, retorna 401 antes de validação, cache ou chamadas externas. Com autenticação válida, tipos não suportados e entradas inválidas retornam 400 antes de consultar fornecedores. O ThreatScore mantém pesos 35/40/15/10 e renormaliza apenas métricas disponíveis; cobertura de evidência acompanha a análise. Sem métrica válida, o score é nulo, nunca zero por indisponibilidade.

Cache completo: 24h. Cache parcial com score: 5min. Uma fonte sem chave (`not_configured`) continua listada e reduz a cobertura de evidências, mas não torna o resultado parcial: com só AbuseIPDB e VirusTotal configurados, a consulta bem-sucedida fica 24h em cache. HIT retorna `source: cache` sem HTTP externo; MISS retorna `source: api`. Caches da simulação antiga são invalidados pela versão `real-api-v1`. Se a avaliação falhar, um último resultado real de até 48h pode ser retornado como `stale: true`, sem renovar a coleta. Sem fontes acessíveis e sem cache adequado, retorna 503; respostas válidas sem registro retornam dados insuficientes. A interface identifica erros, dados parciais e antigos.

Cadastro/login reais ficam em `/login`; busca em `/lookup`; inclusão, listagem e remoção da watchlist em `/dashboard`. O JWT fica em estado global privado **somente em memória**, durante a navegação Next; não é salvo em localStorage, sessionStorage, cookies ou URL. Recarregar a página, fechar a aba ou sair exige novo login. Estatísticas e notificações fictícias foram removidas.

### Login e rotas protegidas

O formulário envia `POST /api/auth/login` com JSON `{ "email": "<email da conta>", "password": "<senha da conta>" }`. Resposta 200: `{ "token": "<JWT>", "user": { "id": "<uuid>", "email": "<email>", "name": "<nome ou null>", "role": "analyst|viewer|admin" } }`. Corpo inválido retorna 400; credenciais incorretas/conta inexistente retornam 401 com a mesma mensagem; falhas operacionais retornam 500. Login e refresh enviam `Cache-Control: no-store`.

Sucesso guarda a sessão em memória e redireciona para o destino `next` (somente caminho interno) ou para `/lookup`. Erros de credenciais, rede e resposta inválida são exibidos no formulário; a submissão fica desabilitada enquanto aguarda. Lookup e watchlist redirecionam ao login quando não há sessão. Tokens do armazenamento legado são removidos ao entrar/sair.

O cliente HTTP injeta Bearer automaticamente em Lookup, Watchlist e refresh. Exemplo de header para um cliente externo: `Authorization: Bearer <JWT recebido no login>`; não coloque o token em query string. Em 401, a sessão correspondente é apagada e a interface exige novo login; falhas temporárias de rede/429/5xx não encerram a sessão. Um 401 atrasado de uma sessão antiga não apaga um novo login.

O middleware aceita apenas HS256 com issuer `kapitrace`, audience `kapitrace-web`, identidade válida e expiração de até 24h. Tokens ausentes, inválidos, expirados, com assinatura/algoritmo/claims incompatíveis retornam 401 e `WWW-Authenticate: Bearer`, incluindo tentativas de ler cache. Login/register e health continuam públicos. A verificação é stateless; excluir uma conta não revoga automaticamente um token já emitido. Memória reduz a persistência do token, mas não impede sua leitura por XSS ativo.

Especificação: [SPEC de Auth e middleware](SPEC/2026-10-06-auth-and-middleware-reactivation.md). Referências: [JWT Best Current Practices — RFC 8725](https://www.rfc-editor.org/info/rfc8725/), [Bearer Token Usage — RFC 6750](https://www.rfc-editor.org/info/rfc6750/).

### Testes sem consumo de cotas

```bash
npm run check:secrets
npm run test:unit
npm run test:integration
CHROME_BIN=/usr/bin/google-chrome npm run test:e2e
npm test
npm --prefix src/backend run build
npm --prefix src/frontend run lint
npm --prefix src/frontend run build
```

Integração/E2E exigem Docker em execução (imagem `postgres:16`) ou `TEST_DATABASE_URL` apontando explicitamente a PostgreSQL de testes. Unitários não exigem banco. Os testes nunca usam `DATABASE_URL` de produção como fallback e recusam endpoints Supabase.

Os testes usam `node:test`/`node:assert`, PostgreSQL 16 real em container Docker temporário e um schema exclusivo por processo. O container publica somente em loopback, não usa volume e tem senha aleatória em memória. O runner aplica as mesmas migrations do deploy e remove somente os schemas/container criados para o teste. A interceptação nativa permanece somente na fronteira HTTP externa. Tráfego externo não interceptado é bloqueado nos testes. Chrome/Chromium instalado é necessário para E2E; `CHROME_BIN` aponta para seu executável. O runner CDP/WebSocket é próprio, sem Playwright/Selenium. O fluxo HTTP anterior foi preservado em `tests/integration/workflow.test.ts`. Testes de Lookup autenticam uma conta real pelo endpoint de login; o helper anônimo permanece disponível para provar 401. A suíte cobre JWT isolado, login, HIT/MISS autenticados e E2E com erros de credenciais/rede, Bearer, 401, logout e recarga. Na validação desta etapa, **85 testes passaram**, além dos builds de backend/frontend e lint.

### CI, revisão por IA e merge automatizado

Especificação: [SPEC de CI com code review por IA](SPEC/SPEC-FDE/2026-11-18-ci-code-review-ia-merge.md).

Todo PR para `main` roda o workflow **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Cada job é um check obrigatório: `secrets`, `unit`, `integration` (PostgreSQL 16 descartável no Docker do runner), `build-backend`, `frontend` (lint + build) e `e2e` (Chrome do runner). Esses jobs executam o código do PR com token somente leitura e sem secrets.

Ao fim do CI, o workflow **AI Review** ([`.github/workflows/ai-review.yml`](.github/workflows/ai-review.yml)) roda a partir da branch `main` (o PR não altera o próprio revisor) e lê o PR apenas como texto pela API:

1. `review` — confirma PR aberto, não-draft, da própria base e com todos os checks verdes no SHA atual; só então envia o diff ao DeepSeek com as regras fixas de [`.github/ai-review/prompt.md`](.github/ai-review/prompt.md). Tem `DEEPSEEK_API_KEY`, sem permissão de escrita.
2. `publish` — sem a chave do DeepSeek: recoleta o estado, aplica a função pura `decide_merge`, atualiza **um único** comentário no PR e, se todos os critérios passarem, faz merge commit **do SHA revisado**.

| Veredito | Significado |
| --- | --- |
| `approve` | IA sem findings `blocker`/`major` (condição necessária, não suficiente) |
| `request_changes` | IA apontou problema; também quando o modelo aprova com finding `blocker`/`major` |
| `needs_human` | exige julgamento humano; inclui diff acima de 100 arquivos / 120.000 bytes (IA não é chamada) |
| `not_run` | pré-condição não atendida (check vermelho, draft, fork, head mudou): IA não é chamada |
| `error` | DeepSeek indisponível, timeout, resposta fora do schema ou falha do job: nunca há merge |

O merge automatizado também exige: autor com permissão `write`/`admin`, ausência da label `no-automerge`, trailers `Agent:`/`Spec:` em todos os commits quando o PR altera `src/**` ou `tests/**`, e nenhum caminho sensível (`.github/**`, `scripts/**`, `SPEC/**`, migrations/schema Prisma, `README.md`, `AGENTS.md`/`CLAUDE.md`, `.env*`, `package*.json`, diretórios de agentes, arquivos existentes em `prompts/sessoes/` e `metrics/`). Qualquer falha ou ambiguidade resulta em **não fazer merge**; os motivos ficam no comentário e no job summary.

- **Bloquear:** adicione a label `no-automerge` ao PR.
- **Reexecutar:** use *Re-run* no run do AI Review ou *Actions → AI Review → Run workflow* (a partir de `main`) informando o número do PR.
- **Configuração (administração do repositório):** proteção de `main` com PR e os seis checks acima obrigatórios; `GITHUB_TOKEN` somente leitura por padrão; secret `DEEPSEEK_API_KEY`; variáveis opcionais `DEEPSEEK_MODEL` (padrão `deepseek-chat`) e `DEEPSEEK_BASE_URL` (padrão `https://api.deepseek.com`); label `no-automerge` criada.
- Merges feitos pelo `GITHUB_TOKEN` não disparam novo CI no `push` em `main`; o SHA mesclado já passou pelo CI no PR.

### Scripts Disponíveis (Backend)
| Script        | Comando                  |
| ------------- | ------------------------ |
| `npm run dev` | `tsx watch src/server.ts`|
| `npm run build` | `tsc`                 |
| `npm run start` | `node dist/server.js` |
| `npm run db:deploy` | Aplica migrations PostgreSQL versionadas |
| `npm run db:push` | Alias compatível de `db:deploy`; não executa reset/diff destrutivo |
| `npm run db:baseline` | Adota tabelas existentes após conferir estrutura |
| `npm run db:validate` | Valida schema/configuração |
| `npm run db:check` | Verifica conexão, tabelas, histórico Prisma, RLS e permissões |
| `npm run db:studio` | `prisma studio`  |
| `npm test`    | Executa suíte de testes unitários, integração e E2E |

## 📊 Linhas de Código

Contagem feita com [cloc](https://github.com/AlDanial/cloc) sobre os arquivos versionados no Git. **Não entram na contagem:** dependências (`node_modules/`), locks (`package-lock.json`, `migration_lock.toml`), saídas de build (`.next/`, `dist/`), dados e evidências geradas (`prompts/sessoes/*.log`/`*.txt`, `metrics/`), imagens (`.svg`, `.ico`) e documentação Markdown (contada à parte).

| Linguagem     | Arquivos | Em branco | Comentários | Código    |
| ------------- | -------: | --------: | ----------: | --------: |
| TypeScript    | 50       | 327       | 181         | 3.382     |
| CSS           | 2        | 193       | 56          | 1.158     |
| JavaScript    | 5        | 2         | 8           | 240       |
| JSON          | 5        | 0         | 0           | 147       |
| SQL           | 3        | 18        | 17          | 104       |
| Prisma Schema | 1        | 13        | 0           | 61        |
| **Total**     | **66**   | **553**   | **262**     | **5.092** |

| Área           | Linhas de código |
| -------------- | ---------------: |
| `src/frontend` | 1.868            |
| `tests/`       | 1.503            |
| `src/backend`  | 1.479            |
| `scripts/`     | 226              |
| `package.json` (raiz) | 16        |

Documentação Markdown (README, SPECs, AGENTS e registros de sessão): 29 arquivos, 1.677 linhas.

## 🎨 Design System

O CSS (vanilla, `globals.css`) segue um design system **dark-mode cybersecurity**:
- **Tokens**: espaçamento, raios, tipografia fluida (`clamp`), cores das quatro faixas de risco e dos quatro estados de fonte; texto com contraste WCAG AA
- **Tipografia**: pilhas de fontes do sistema (`system-ui`… e `ui-monospace`…), sem download de fontes no build
- **Componentes**: botão, campo, card, badge, alerta, skeleton, toast, estado vazio e abas em `components/ui/`; ícones SVG inline
- **Animações**: discretas e desligadas com `prefers-reduced-motion: reduce`
- **Responsivo**: breakpoints em 768 px e 1024 px

## 📜 Licença

Projeto acadêmico — UFPA DSAI AP1 (2026)
