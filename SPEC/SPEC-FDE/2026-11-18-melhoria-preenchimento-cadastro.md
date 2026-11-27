# SPEC-FDE 003 — Melhoria do preenchimento do cadastro

- **Prioridade:** P2 — Média
- **Data:** 2026-11-18
- **Status:** aprovada (2026-11-27, pela responsável pelo repositório, com as recomendações de D1–D4; issue #4)
- **Agente:** Claude Code (Claude Opus 5.5)
- **Origem:** diagnóstico FDE (issue #1, seção "Ajustes na aplicação": melhorar o preenchimento na tela de cadastro)
- **SPECs relacionadas:** `SPEC/2026-10-06-auth-and-middleware-reactivation.md`, `SPEC/SPEC-FDE/2026-11-18-melhoria-mensagem-erro-login.md` (mesmo componente e mesmo padrão de erro)

## Contexto

O cadastro não tem página própria. É o modo "Criar conta" do mesmo formulário de `/login` (`src/frontend/src/app/login/page.tsx`), ativado pelo botão "Criar conta". Ao enviar, o frontend chama `POST /api/auth/register` e, em seguida, `POST /api/auth/login` com as mesmas credenciais.

Campos atuais:

| Campo | HTML atual | Regra no backend (`register`) |
| --- | --- | --- |
| Nome | `id="name"`, sem `required`, sem `maxLength` | opcional; `trim()`; sem limite (`name String?` no schema) |
| Email | `type="email"`, `required` | regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`; `trim().toLowerCase()`; único |
| Senha | `type="password"`, `required`, `minLength={8}`, `autoComplete="new-password"` | ≥8 caracteres; **sem limite máximo** |

Respostas do backend: 400 `Valid email address is required`, 400 `Password must be at least 8 characters long`, 400 `User already exists`, 500 `Registration failed`, 201 em sucesso. Toda conta nova recebe `role: 'analyst'`.

## 1. Problema observado

1. **Campos obrigatórios não identificados.** Nada na tela indica que Nome é opcional e que Email/Senha são obrigatórios.
2. **A regra da senha não aparece antes do erro.** O mínimo de 8 caracteres só aparece no balão nativo do navegador ou na mensagem do servidor em inglês.
3. **Mensagens do servidor em inglês e num único alerta no rodapé** (`<p role="alert">` sem estilo, ver SPEC-FDE 002), longe do campo com problema.
4. **Sem feedback durante o preenchimento.** Não há validação ao sair do campo, indicação de campo válido/inválido nem forma de conferir a senha digitada (sem "mostrar senha").
5. **Falha parcial confusa.** Se o cadastro dá certo e o login automático falha (rede, 5xx), o usuário vê só o erro do login. Se clicar de novo em "Criar conta e entrar", recebe `User already exists`, embora a conta tenha sido criada com sucesso na primeira tentativa.
6. **Limites inconsistentes entre cadastro e login.** O login rejeita email com mais de 254 e senha com mais de 1024 caracteres. O cadastro aceita qualquer tamanho. Uma conta criada com senha de 1025+ caracteres (ou email de 255+) **nunca consegue entrar**.
7. **Nome sem limite** no frontend e no backend.

## 2. Resultado esperado

- O usuário sabe, antes de digitar, o que é obrigatório e qual é a regra da senha.
- Erros aparecem em português, junto ao campo, assim que o campo perde o foco ou no envio. O botão não envia dados sabidamente inválidos.
- Uma falha no login automático não leva o usuário a tentar criar a conta de novo.
- O formulário não permite criar contas que o login rejeitaria, e o backend também não (D1).
- O Nome tem limite oficial de 100 caracteres na tela e no backend (D2).
- No backend, só mudam os limites de tamanho de E7. As demais regras de `register`/`login` continuam iguais.

## 3. Escopo

**E1 — Organização e identificação dos campos (modo cadastro):**
- Ordem mantida: Nome, Email, Senha.
- Rótulos: "Nome (opcional)", "Email *", "Senha *", com legenda "* obrigatório" no topo do formulário.
- Texto de ajuda fixo sob a senha: "Mínimo de 8 caracteres." (`aria-describedby`).
- Manter `autoComplete` (`name`, `email`, `new-password`) e os `id`s `name`/`email`/`password`, que são usados pelo e2e.

**E2 — Validação no cliente, espelhando o backend sem alterá-lo:**
- Email: obrigatório; mesmo formato da regex do backend; `maxLength={254}`.
- Senha: obrigatória; ≥8 caracteres; `maxLength={1024}`.
- Nome: aparar espaços antes do envio; `maxLength={100}`, o mesmo limite do backend (E7, D2).
- Validar ao sair do campo (`blur`) e no envio, com `noValidate` no formulário e mensagens próprias. No `blur`, só valida campo em que o usuário já digitou: passar o foco por um campo vazio não mostra erro, que aparece no envio.
  - "Informe seu email." / "Informe um email válido, por exemplo nome@empresa.com.";
  - "Informe uma senha." / "A senha precisa ter pelo menos 8 caracteres.".
- Com erro de campo, **nenhuma requisição** é enviada, e o foco vai para o primeiro campo inválido.

**E3 — Feedback visual durante o preenchimento:**
- Indicador da regra de senha que muda de estado ao atingir 8 caracteres ("✓ Mínimo de 8 caracteres"). O estado não pode depender só da cor: usar ícone e texto.
- Botão "Mostrar/Ocultar senha" (`type="button"`, `aria-pressed`, `aria-controls="password"`), no lugar de um campo "confirmar senha".
- Campo inválido com `aria-invalid="true"` e borda de erro. Mensagem com `id` própria ligada por `aria-describedby`. Reutilizar as classes de erro da SPEC-FDE 002.
- Durante o envio, manter o botão desabilitado e com o texto "Aguarde…" (já existe), o que evita envio duplo.

**E4 — Mensagens de servidor no cadastro** (mapeadas por status/causa, nunca o texto bruto):

| Resposta | Mensagem proposta |
| --- | --- |
| 400 email inválido | junto ao Email: "Informe um email válido." |
| 400 senha curta | junto à Senha: "A senha precisa ter pelo menos 8 caracteres." |
| 400 conta existente | geral: "Não foi possível criar a conta com este email. Se você já tem cadastro, use a aba 'Entrar' para acessar." |
| 5xx / resposta inválida | geral: "Não foi possível criar a conta agora. Tente novamente em alguns instantes." |
| Falha de rede | geral: mensagem de conexão existente |

A distinção entre os três 400 usa o texto atual do backend **apenas como chave de mapeamento**, isolada numa função. Se o texto do backend mudar, a função cai na mensagem genérica de 400 ("Verifique os dados informados.").

**E5 — Falha parcial (cadastro ok, login automático falhou):** mostrar "Conta criada. Não foi possível entrar automaticamente; entre com seu email e senha.", mudar para o modo "Entrar" com o email preenchido e a senha limpa. Não reenviar `register`.

**E6 — Testes:** e2e para formulário vazio sem requisição, senha curta sem requisição, indicador de regra, mostrar/ocultar senha, conta existente e falha parcial. O fluxo e2e atual (`Criar conta` → `#name`/`#email`/`#password` → `Criar conta e entrar`) continua passando sem mudança de seletores. Testes de integração para os limites de E7.

**E7 — Limites de tamanho no backend (`register`, D1 e D2):**
- Email com mais de 254 caracteres após `trim()`: 400 `Valid email address is required`, a mesma resposta do email inválido (o mapeamento de E4 não muda).
- Senha com mais de 1024 caracteres: 400 `Password must be at most 1024 characters long`. Na tela, cai na mensagem genérica de 400 de E4, já que o `maxLength` de E2 impede o caso.
- Nome com mais de 100 caracteres após `trim()`: 400 `Name must be at most 100 characters long`. Nome ausente ou só com espaços continua sendo gravado como `null`.
- As validações rodam **antes** da consulta ao banco e do `bcrypt.hash`, e nenhuma conta é criada.
- Limites iguais aos do login (`email.trim().length > 254`, `password.length > 1024`), sem migration: a coluna `name` continua `String?`.

### Decisões

Aprovadas em 2026-11-27 conforme a recomendação entre parênteses.

- **D1 — Alinhar os limites do backend:** `register` rejeita email >254 e senha >1024 com 400, como o login já faz (recomendado; ver E7). Sem isso, um cliente que chama a API direto, sem passar pela tela, ainda cria contas que nunca conseguem entrar.
- **D2 — Limite do Nome:** máximo oficial de 100 caracteres, no campo e no backend (recomendado; ver E2 e E7). Cobre nomes compostos longos e impede gravar textos arbitrariamente grandes.
- **D3 — Enumeração no cadastro:** risco aceito por enquanto (recomendado). O backend continua respondendo `User already exists`, o que revela que o email tem conta. Remover isso exige confirmação por email, que o projeto não tem. A tela usa a mensagem neutra de E4, mas ela não esconde a informação de quem chama a API. Revisar se o projeto passar a enviar email.
- **D4 — Força da senha:** fora desta SPEC (recomendado). A 003 mantém a regra atual de 8 caracteres. A escolha entre manter só o tamanho mínimo (revogando a SPEC-2026-10-01 §4.1), exigir classes de caracteres (§4.1) ou recusar senhas conhecidas/vazadas fica para uma SPEC própria. Até lá, a divergência de §4.1 continua registrada em `SPEC/README.md`.

## 4. Fora do escopo

- Alterar regras e respostas do backend (`register`/`login`) além dos limites de E7, ou o schema `User`.
- Força da senha (D4) e remoção da enumeração no cadastro (D3).
- Separar o cadastro numa rota própria (`/register`).
- Campo "confirmar senha", captcha, verificação de email, termos de uso, escolha de perfil/role.
- **Máscaras de entrada:** nenhum campo atual (nome, email, senha) tem formato fixo que justifique máscara. Não adicionar.
- Recuperação de senha e gestão de conta.
- Mensagens do modo login (SPEC-FDE 002).

## 5. Critérios de aceite

- **CA1 — Identificação:** Dado o modo "Criar conta", quando a tela abre, então vejo "Nome (opcional)", "Email *", "Senha *", a legenda "* obrigatório" e o texto "Mínimo de 8 caracteres." sob a senha.
- **CA2 — Envio vazio:** Dado o formulário vazio, quando clico em "Criar conta e entrar", então vejo os erros em português junto a Email e Senha, o foco vai para Email e nenhuma requisição a `/api/auth/register` é enviada.
- **CA3 — Senha curta:** Dada a senha `1234567`, quando saio do campo, então vejo "A senha precisa ter pelo menos 8 caracteres." junto à senha. Ao enviar, nenhuma requisição é feita.
- **CA4 — Indicador:** Dada a senha com 7 caracteres, quando digito o 8º, então o indicador da regra muda para atendido (ícone e texto, não só cor).
- **CA5 — Mostrar senha:** Dada uma senha digitada, quando aciono "Mostrar senha", então o campo passa a `type="text"`, o botão fica com `aria-pressed="true"`, e ao acionar de novo o campo volta a `password`.
- **CA6 — Conta existente:** Dado um email já cadastrado, quando envio o cadastro, então vejo a mensagem geral de E4 em português e nenhum texto em inglês.
- **CA7 — Falha parcial:** Dado que `register` responde 201 e `login` falha por rede ou 5xx, quando o fluxo termina, então vejo "Conta criada. Não foi possível entrar automaticamente…", o formulário está no modo "Entrar" com o email preenchido e `register` não é chamado de novo.
- **CA8 — Limites:** Dado o campo email ou senha, quando tento digitar além de 254 ou 1024 caracteres, então o campo não aceita mais caracteres.
- **CA9 — Erro some ao corrigir:** Dado um erro no campo Email, quando corrijo o valor e saio do campo, então a mensagem desaparece e `aria-invalid` deixa de ser `true`.
- **CA10 — Regressão:** o cadastro válido cria a conta com `role: 'analyst'` e redireciona para `/lookup`, o fluxo e2e atual passa sem trocar seletores, e todas as suítes e builds de AGENTS.md §6 passam.
- **CA11 — Limites no backend:** Dado um `POST /api/auth/register` direto na API com email de 255 caracteres, senha de 1025 caracteres ou nome de 101 caracteres, quando envio, então recebo 400 com a mensagem de E7 e nenhuma conta é criada. Com email de 254, senha de 1024 e nome de 100 caracteres, o cadastro responde 201.

## 6. Dependências

- SPEC-FDE 002: classes visuais de erro e padrão `aria-*`, no mesmo componente. Recomenda-se implementar a 002 antes ou junto.
- SPEC-FDE 001, E2: `lib/api.ts` expondo `status` do erro.
- Componentes: `src/frontend/src/app/login/page.tsx`, `src/frontend/src/lib/api.ts`, `src/frontend/src/app/globals.css`, `tests/e2e/browser.test.ts`, `src/backend/src/modules/auth/auth.controller.ts` (E7), `tests/integration/auth.test.ts` (CA11).
- Atualizar a SPEC-2026-10-06-auth com os limites do cadastro (E7), já que ela descreve os limites do login.
- Leitura prévia de `src/frontend/AGENTS.md` (Next.js 16).

## 7. Como validar

1. `npm --prefix src/frontend run lint && npm --prefix src/frontend run build`
2. `npm run test:e2e`: CA2, CA3, CA5, CA6, CA7 e CA10 automatizados. Para CA7, bloquear apenas `/api/auth/login` via `Network.setBlockedURLs`, como o teste atual já faz.
3. `npm run test:unit && npm run test:integration`: devem passar, com os novos casos de CA11. `npm --prefix src/backend run build`.
4. Manual, com `npm run dev` no backend e no frontend, em `/login` → "Criar conta":
   - conferir rótulos e ajuda (CA1);
   - enviar vazio (CA2);
   - digitar 7 e depois 8 caracteres na senha (CA3/CA4);
   - alternar "Mostrar senha" (CA5);
   - cadastrar um email já existente (CA6);
   - colar texto longo nos campos (CA8);
   - corrigir um campo com erro (CA9);
   - repetir em 360 px e nos temas claro e escuro.
