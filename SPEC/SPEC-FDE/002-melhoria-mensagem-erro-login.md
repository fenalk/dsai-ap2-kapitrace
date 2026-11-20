# SPEC-FDE 002 — Melhoria das mensagens de erro no login

- **Prioridade:** P1 — Média
- **Data:** 2026-11-18
- **Status:** proposta (aguardando aprovação; issue #3)
- **Agente:** Claude Code (Claude Opus 5.5)
- **Origem:** diagnóstico FDE (issue #1): "quando errei a senha de propósito, o design da mensagem de erro não é visualmente bom"
- **SPECs relacionadas:** `SPEC/2026-10-06-auth-and-middleware-reactivation.md`, `SPEC/SPEC-FDE/001-consulta-indicadores-seguranca.md` (compartilha a mudança em `lib/api.ts`)

## Contexto

Fluxo atual de autenticação:

- Tela `/login` (`src/frontend/src/app/login/page.tsx`): um único formulário alterna entre "Entrar" e "Criar conta". No login, envia `POST /api/auth/login` via `api()` (`src/frontend/src/lib/api.ts`) e, com sucesso, guarda o JWT só em memória (`lib/session.ts`) e redireciona para `/lookup`.
- Backend `login` (`src/backend/src/modules/auth/auth.controller.ts`):

| Situação | HTTP | Corpo atual |
| --- | --- | --- |
| Email inválido/ausente, senha ausente, email >254 ou senha >1024 caracteres | 400 | `{"error":"Email and password are required"}` |
| Conta inexistente **ou** senha incorreta | 401 | `{"error":"Invalid credentials"}` (mesma mensagem nos dois casos) |
| Falha inesperada (ex.: banco) | 500 | `{"error":"Login failed"}` |

- Frontend, falhas de rede: `api()` já gera "Não foi possível conectar ao servidor. Tente novamente." Para corpo não JSON: "Resposta inválida do servidor. Tente novamente."

O contrato do backend já atende ao requisito de segurança contra enumeração (mesma resposta 401 para conta inexistente e senha errada) e está coberto por `tests/integration/auth.test.ts`. **Esta SPEC não altera o backend.**

## 1. Problema observado

1. **Mensagens do servidor em inglês exibidas cruas.** `login/page.tsx` mostra `failure.message`, que vem de `data.error` do backend: "Invalid credentials", "Email and password are required", "Login failed". O restante da interface está em português.
2. **Alerta sem estilo.** O erro é um `<p role="alert">` sem classe. `src/frontend/src/app/globals.css` não tem regra para ele (as classes `.auth-*` não cobrem alerta), então o texto aparece solto, sem destaque. É o problema visual relatado no diagnóstico.
3. **Mensagens sem orientação.** "Invalid credentials" não diz o que fazer. "Login failed" não diferencia uma falha temporária de um erro do usuário.
4. **Campos obrigatórios dependem só do balão nativo do navegador** (`required`, `type="email"`). Ele aparece no idioma e no estilo do navegador, não fica associado ao campo de forma persistente e some ao perder o foco.
5. **Acessibilidade:** o erro não está ligado aos campos (`aria-describedby`/`aria-invalid` ausentes) e o foco não volta ao campo a corrigir após a falha.
6. **O erro não some quando o usuário corrige o campo.** Ele só é limpo no próximo envio ou ao trocar de modo.
7. **`minLength={8}` no campo de senha também vale no modo login.** O navegador bloqueia o envio e mostra a regra de cadastro ("use pelo menos 8 caracteres") em vez de deixar o servidor responder com a mensagem genérica.

## 2. Resultado esperado

- Toda mensagem de erro do login aparece em português, com estilo de alerta consistente com o tema e uma orientação de próximo passo.
- O texto é escolhido no frontend **pelo tipo de falha** (status HTTP ou falha de rede), não pela mensagem em inglês do servidor.
- Credencial inválida continua sem revelar se o email existe.
- Erros de preenchimento aparecem junto ao campo antes de qualquer requisição.

## 3. Escopo

**E1 — Mapeamento de mensagens** (frontend, `login/page.tsx`, usando o `status` exposto por `lib/api.ts` conforme a SPEC-FDE 001 E2):

| Causa | Mensagem proposta |
| --- | --- |
| Email vazio (cliente) | junto ao campo: "Informe seu email." |
| Email em formato inválido (cliente) | junto ao campo: "Informe um email válido, por exemplo nome@empresa.com." |
| Senha vazia (cliente) | junto ao campo: "Informe sua senha." |
| 400 do servidor | "Verifique o email e a senha informados e tente novamente." |
| 401 | "Email ou senha incorretos. Confira os dados e tente novamente." |
| 429 (se um limite de login vier a existir) | "Muitas tentativas. Aguarde N segundos e tente novamente." (N de `Retry-After`; sem ele, "Aguarde alguns instantes.") |
| Falha de rede | manter "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente." |
| 5xx, resposta inválida ou token inválido | "Não foi possível entrar agora. Tente novamente em alguns instantes. Se o problema continuar, contate o administrador." |

Regras:
- Nunca exibir no login o texto bruto vindo do servidor, nem status HTTP, stack ou detalhes técnicos.
- A mensagem de 401 é a mesma para conta inexistente e senha errada.
- Nenhuma mensagem sugere criar conta só porque houve 401 (não confirmar inexistência). O botão "Criar conta" continua visível como sempre.

**E2 — Validação de campos obrigatórios no cliente:**
- Usar `noValidate` no formulário e validação própria em português antes do envio: email preenchido, formato básico e ≤254 caracteres; senha preenchida e ≤1024 caracteres. São os mesmos limites que o backend já aplica no login.
- Com campo inválido, **nenhuma requisição é enviada**.
- Remover `minLength` do campo de senha **apenas no modo login**. O modo cadastro é tratado na SPEC-FDE 003.

**E3 — Apresentação visual e acessibilidade:**
- Componente/classe de alerta (ex.: `.form-alert` / `.field-error`) em `globals.css`, com cores de erro em tokens já usados no tema, contraste AA e espaçamento dentro do `.auth-card`.
- Erro geral em `role="alert"` acima do botão. Erros de campo com `id` próprio, associados por `aria-describedby`, e o campo com `aria-invalid="true"`.
- Após a falha, o foco vai para o primeiro campo inválido. No caso de 401, vai para a senha, que é limpa; o email é mantido.
- O erro de um campo some quando o usuário o edita. O erro geral some no próximo envio ou ao trocar de modo (comportamento atual).

**E4 — Testes:** atualizar `tests/e2e/browser.test.ts`, que hoje espera o texto `Invalid credentials` no alerta, para a nova mensagem. Adicionar casos e2e de campo vazio sem requisição e de 5xx. Os testes de integração do backend continuam iguais, porque o contrato não muda.

## 4. Fora do escopo

- Alterar o contrato, as mensagens ou os status do backend (`auth.controller.ts`).
- Criar limite de tentativas de login (rate limit/bloqueio). Hoje só `/api/lookup` tem limite. Fica como pendência de segurança.
- Recuperação ou troca de senha, "lembrar-me", sessão persistente, captcha.
- Internacionalização completa (biblioteca de i18n). As mensagens ficam em português no próprio componente.
- Melhorias do modo cadastro (SPEC-FDE 003).

## 5. Critérios de aceite

- **CA1 — Credencial inválida:** Dado um email cadastrado, quando entro com senha errada, então vejo "Email ou senha incorretos. Confira os dados e tente novamente.", continuo em `/login`, o email permanece preenchido e o foco está na senha vazia.
- **CA2 — Sem enumeração:** Dado um email **não** cadastrado, quando tento entrar, então vejo exatamente a mesma mensagem e o mesmo comportamento de CA1.
- **CA3 — Campos obrigatórios:** Dado o formulário vazio, quando clico em "Entrar", então vejo "Informe seu email." e "Informe sua senha." junto aos campos, com `aria-invalid="true"`, e **nenhuma** requisição a `/api/auth/login` é enviada.
- **CA4 — Formato de email:** Dado `nome@` no campo email, quando clico em "Entrar", então vejo a mensagem de email inválido junto ao campo e nenhuma requisição é enviada.
- **CA5 — Conexão:** Dado o backend inacessível (URL bloqueada), quando tento entrar, então vejo a mensagem de conexão e continuo em `/login`.
- **CA6 — Falha inesperada:** Dado que o backend responde 500, quando tento entrar, então vejo a mensagem de falha inesperada e nenhum texto em inglês ou detalhe técnico.
- **CA7 — Sem texto do servidor:** Dado qualquer resposta de erro do login, quando ela é exibida, então o texto vem da tabela de E1, e não de `data.error`/`data.message`.
- **CA8 — Visual:** Dado um erro exibido, quando inspeciono a tela, então o alerta usa a classe de erro definida em `globals.css`, tem contraste AA nos temas claro e escuro e não desloca o layout para fora do card em 360 px de largura.
- **CA9 — Limpeza:** Dado um erro de campo, quando edito esse campo, então a mensagem dele desaparece.
- **CA10 — Regressão:** login com credenciais válidas redireciona para `/lookup`, o token não vai para `sessionStorage`/`localStorage`, e todas as suítes e builds de AGENTS.md §6 passam.

## 6. Dependências

- `lib/api.ts` expondo `status` e `Retry-After` do erro (SPEC-FDE 001, E2). Se a 002 for implementada antes, essa mudança entra aqui com o mesmo desenho.
- Componentes: `src/frontend/src/app/login/page.tsx`, `src/frontend/src/lib/api.ts`, `src/frontend/src/app/globals.css`, `tests/e2e/browser.test.ts`.
- Leitura prévia de `src/frontend/AGENTS.md` (Next.js 16) antes de alterar o frontend.
- Ambiente de testes (Docker para PostgreSQL e Chrome para e2e).

### Pendências de segurança observadas (não tratadas aqui)

- **Diferença de tempo de resposta:** para email inexistente, o backend responde sem executar `bcrypt.compare`, ou seja, mais rápido que para senha errada. Isso permite enumeração por tempo, mesmo com a mensagem idêntica. Sugestão: SPEC própria para comparar com um hash fictício.
- **Sem limite de tentativas** em `/api/auth/login`.
- `console.error('Login error:', error)` registra o erro bruto (possivelmente do Prisma) no log do servidor. Vale revisar à luz da regra de não vazar erro bruto.

## 7. Como validar

1. `npm --prefix src/frontend run lint && npm --prefix src/frontend run build`
2. `npm run test:e2e`: o fluxo do navegador cobre CA1, CA3, CA5, CA6 e CA10 (com `calls.length`/interceptação provando que não há requisição em CA3/CA4).
3. `npm run test:unit && npm run test:integration`: devem passar sem alteração no backend.
4. Manual, com backend e frontend em `npm run dev`:
   - enviar o formulário vazio (CA3);
   - digitar `nome@` (CA4);
   - errar a senha de uma conta existente e de um email inexistente e comparar as telas (CA1/CA2);
   - parar o backend e tentar entrar (CA5);
   - editar um campo com erro (CA9);
   - checar contraste e largura de 360 px no DevTools, nos temas claro e escuro (CA8).
5. Simular 500: com o backend apontando para um banco indisponível, tentar entrar (CA6).
