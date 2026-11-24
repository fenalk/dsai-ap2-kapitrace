# SPEC-FDE 007 — Limite de tentativas no login e resposta em tempo constante

- **ID:** SPEC-FDE 007
- **Prioridade:** P0
- **Data:** 2026-11-24
- **Status:** aprovada (2026-11-24, pela responsável pelo repositório, com as recomendações de D1–D3)
- **Agente:** Claude Code (Claude Opus 5.5)
- **Origem:** issue #19 (item 1.4 da ordem de implementação); pendências de segurança da [SPEC-FDE 002](2026-11-18-melhoria-mensagem-erro-login.md) ("Pendências de segurança observadas")
- **SPECs relacionadas:** [`2026-10-06-auth-and-middleware-reactivation.md`](../2026-10-06-auth-and-middleware-reactivation.md), [SPEC-FDE 002](2026-11-18-melhoria-mensagem-erro-login.md) (mensagem do 429 na tela), [`2026-10-06-real-api-integration.md`](../2026-10-06-real-api-integration.md) §6 (padrão de limite e `Retry-After` do lookup)
- **Substitui:** nada

## Contexto

`POST /api/auth/login` (`src/backend/src/modules/auth/auth.controller.ts`, função `login`):

| Situação | HTTP | Corpo | Executa `bcrypt.compare`? |
| --- | --- | --- | --- |
| Email ou senha ausente/inválido, email >254, senha >1024 | 400 | `{"error":"Email and password are required"}` | não |
| Email não cadastrado | 401 | `{"error":"Invalid credentials"}` | **não** |
| Senha errada | 401 | `{"error":"Invalid credentials"}` | sim (custo 10) |
| Sucesso | 200 | `{ token, user }` | sim |
| Erro inesperado | 500 | `{"error":"Login failed"}` | — |

O único limite de requisições do backend é o do lookup (`src/backend/src/middleware/lookup-limit.ts`): janela fixa de 60 s por IP, por processo, 429 com `Retry-After`. `app.ts` já expõe `Retry-After` no CORS. A SPEC-FDE 002 já define o texto do 429 na tela de login ("Muitas tentativas. Aguarde N segundos e tente novamente."), mas hoje o backend nunca o devolve.

## 1. Problema

1. **Força bruta sem freio.** Não há limite de tentativas no login. Um cliente pode testar senhas para um email sem restrição, limitado só pelo custo do bcrypt.
2. **Enumeração por tempo de resposta.** A mensagem 401 é a mesma nos dois casos, mas para email inexistente a resposta volta sem executar o bcrypt (alguns ms) e para senha errada leva o tempo de um `bcrypt.compare` (dezenas de ms). Medindo o tempo, dá para saber se um email está cadastrado.
3. **Log com erro bruto.** `console.error('Login error:', error)` (e o mesmo padrão em `register` e `refreshToken`) registra o objeto de erro inteiro, que pode conter detalhes do Prisma (consulta, host do banco). Isso contraria a regra de não vazar erro bruto.

A issue #20 (deploy) depende desta SPEC: o login não pode ir para um endereço público sem o item 1.

## 2. Resultado esperado

- Depois de várias tentativas falhas, o login responde **429** com `Retry-After`, **antes** de ler o banco ou rodar o bcrypt, inclusive se a senha da tentativa seguinte estiver certa.
- Email inexistente e senha errada levam tempo equivalente e continuam com a mesma resposta 401.
- Logs de erro das rotas de auth registram só a categoria do erro, nunca o objeto bruto.
- Nenhuma dependência nova; o padrão segue o de `lookup-limit.ts`.

## 3. Escopo

### E1 — Limite de tentativas falhas (`src/backend/src/middleware/login-limit.ts`)

Middleware aplicado só em `POST /api/auth/login`, com estado em memória **por processo** (mesma limitação já documentada para o lookup).

- **O que conta:** só respostas **401** (credenciais inválidas). 400 (formato) e 500 não contam. Sucesso (200) apaga o contador do par IP+email.
- **Duas chaves, cada uma com janela fixa:**

| Chave | Limite padrão | Protege contra |
| --- | --- | --- |
| IP + email normalizado (`trim().toLowerCase()`) | 5 falhas em 15 min | força bruta numa conta |
| IP | 20 falhas em 15 min | um IP testando muitos emails (credential stuffing) |

- **Bloqueio:** se qualquer chave atingiu o limite, a requisição recebe 429 sem chegar ao controller:
  - corpo `{"error":"Too many login attempts"}`;
  - header `Retry-After` com os segundos até o fim da janela da chave que bloqueou (mínimo 1; se as duas bloquearem, o maior valor);
  - `Cache-Control: no-store`, como as demais respostas do login.
- **Configuração** (validada em `shared/config.ts` por `setting()`, falha rápida sem imprimir valores, documentada em `src/backend/.env.example`):
  - `LOGIN_MAX_FAILURES_PER_ACCOUNT` = 5 (1–1000);
  - `LOGIN_MAX_FAILURES_PER_IP` = 20 (1–100000);
  - `LOGIN_WINDOW_SECONDS` = 900 (1–86400).
- **Memória limitada:** entradas com janela vencida são removidas a cada requisição. Se, depois disso, o mapa tiver 10.000 chaves, a tentativa nova (chave ainda não rastreada) recebe 503 `{"error":"Login capacity exceeded"}`, igual ao lookup (*fail closed*). Ver D3.
- **IP:** usa `req.ip`, sem confiar em `X-Forwarded-For`. Atrás de proxy, isso exige `trust proxy` configurado no deploy (ver Dependências).

### E2 — Tempo equivalente para email inexistente (`auth.controller.ts`)

- Na carga do módulo, gerar um hash bcrypt fictício com o **mesmo custo** usado no cadastro (10), a partir de bytes aleatórios (`crypto.randomBytes`), nunca de uma senha fixa no código.
- Quando o email não existe, executar `bcrypt.compare(password, dummyHash)` e descartar o resultado antes de responder 401.
- A resposta (status, corpo, headers) continua idêntica à de senha errada.
- O custo do bcrypt passa a ser uma constante única compartilhada por `register` e pelo hash fictício, para não divergirem.

### E3 — Logs sanitizados nas rotas de auth

- Trocar `console.error('<X> error:', error)` em `login`, `register` e `refreshToken` por um helper puro que registra só a rota e a categoria: `error.name` (ex.: `PrismaClientKnownRequestError`) e, se existir, o `code` do Prisma (ex.: `P1001`). Sem `message`, `stack`, `meta` nem o objeto.
- O helper fica em `src/backend/src/shared/` e tem teste unitário.

### E4 — Documentação

- README: seção de autenticação cita o limite, os padrões e a limitação por processo.
- `.env.example` do backend com as três variáveis.

## 4. Fora do escopo

- Frontend: o texto do 429 na tela é da SPEC-FDE 002. Até ela ser implementada, a tela mostra o texto do backend ("Too many login attempts").
- Limite no cadastro (`/api/auth/register`) e no `/api/auth/refresh`.
- Enumeração pelo cadastro (`User already exists`): é a decisão D3 da SPEC-FDE 003.
- Bloqueio global da conta (independente do IP), CAPTCHA, notificação por email, 2FA.
- Estado compartilhado entre instâncias (Redis, banco). Continua por processo, como o lookup.
- Registro das tentativas em `AuditLog` (issue #22).
- Regra de força da senha.

## 5. Decisões

Aprovadas em 2026-11-24 conforme a recomendação entre parênteses.

- **D1 — Limites padrão:** 5 falhas por IP+email e 20 por IP em 15 min (recomendado). Valores menores incomodam quem erra a senha algumas vezes; maiores enfraquecem o freio.
- **D2 — Chave por conta sem IP:** não usar (recomendado). Um limite só por email deixa qualquer um bloquear o login de outra pessoa errando a senha dela de propósito. A chave IP+email freia a força bruta sem esse efeito.
- **D3 — Mapa cheio:** responder 503 a chaves novas, como o lookup (recomendado, *fail closed*). A alternativa (descartar as entradas mais antigas) mantém o serviço, mas deixa um atacante com muitos IPs "lavar" o contador.

## 6. Critérios de aceite

- **CA1 — Bloqueio por conta:** Dado `LOGIN_MAX_FAILURES_PER_ACCOUNT=3`, quando erro a senha de uma conta 3 vezes, então a 4ª tentativa, **mesmo com a senha certa**, responde 429 com `Retry-After` entre 1 e `LOGIN_WINDOW_SECONDS` e `{"error":"Too many login attempts"}`.
- **CA2 — Sem consulta durante o bloqueio:** Dado o bloqueio de CA1, quando tento de novo, então a resposta é 429 sem executar `bcrypt.compare` nem consulta ao banco (verificável por tempo de resposta ou por espião no teste).
- **CA3 — Bloqueio por IP:** Dado `LOGIN_MAX_FAILURES_PER_IP=4`, quando erro a senha de 4 emails diferentes (existentes ou não) a partir do mesmo IP, então a tentativa seguinte com um 5º email responde 429.
- **CA4 — Sucesso zera a conta:** Dado 2 falhas numa conta com limite 3, quando entro com a senha certa, então o contador IP+email volta a zero e posso errar de novo 2 vezes sem 429.
- **CA5 — Janela:** Dado o bloqueio, quando a janela termina (`LOGIN_WINDOW_SECONDS` baixo no teste), então o login volta a funcionar.
- **CA6 — Formato não conta:** Dado um corpo inválido (400), quando envio várias vezes, então nenhuma delas conta para o limite.
- **CA7 — CORS:** Dado um pedido com `Origin`, quando a resposta é 429, então `Access-Control-Expose-Headers` inclui `Retry-After`.
- **CA8 — Tempo equivalente:** Dado um usuário cadastrado, quando meço (mediana de 5 tentativas) o login com email inexistente e com senha errada, então a mediana do email inexistente é pelo menos 50% da de senha errada. Hoje fica bem abaixo disso.
- **CA9 — Mesma resposta:** Email inexistente e senha errada continuam com 401 e corpo `{"error":"Invalid credentials"}` idênticos.
- **CA10 — Log sanitizado:** Dado um erro com `name`, `code`, `message` e `meta`, quando o helper de E3 formata o log, então a saída contém só rota, `name` e `code`.
- **CA11 — Configuração inválida:** Dado `LOGIN_WINDOW_SECONDS=0` ou não numérico, quando o backend inicia, então falha rápido sem imprimir o valor.
- **CA12 — Regressão:** `npm run check:secrets`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm --prefix src/backend run build`, `npm --prefix src/frontend run lint` e `npm --prefix src/frontend run build` passam.

## 7. Dependências

- **Testes:** o estado é por processo e cada arquivo de teste roda em processo próprio. Os limites do CA1–CA5 são baixados por variável de ambiente só no arquivo de teste novo (`tests/integration/login-limit.test.ts`). As suítes atuais têm poucas falhas de login e cabem nos padrões, mas `tests/test-helper.ts` pode subir os limites, como já faz com `LOOKUP_REQUESTS_PER_MINUTE`, se algum teste existente esbarrar.
- **Deploy (#20):** atrás de proxy/CDN, `req.ip` é o IP do proxy e todos os usuários dividiriam a mesma chave de IP. A SPEC de deploy precisa configurar `app.set('trust proxy', ...)` com o número exato de proxies confiáveis, nunca `true`. Isso vale também para o limite do lookup.
- Componentes: `auth.route.ts`, `auth.controller.ts`, `middleware/login-limit.ts` (novo), `shared/config.ts`, `shared/` (helper de log), `src/backend/.env.example`, `README.md`.

## 8. Como validar

**Automatizado:**
1. `npm install` em `src/backend`.
2. `npm run check:secrets`
3. `npm run test:unit` (CA10, CA11) e `npm run test:integration` (CA1–CA9).
4. `npm run test:e2e` e os builds (CA12).

**Manual**, com o backend em `npm run dev`:
1. Errar a senha de uma conta 5 vezes com `curl -i -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"...","password":"errada"}'`; a 6ª, com a senha certa, deve voltar 429 com `Retry-After`.
2. Comparar com `curl -w '%{time_total}'` o tempo de um email inexistente e de uma senha errada: devem ficar na mesma ordem de grandeza.
3. Derrubar o banco e tentar entrar: o log do backend mostra só a rota e a categoria do erro.
